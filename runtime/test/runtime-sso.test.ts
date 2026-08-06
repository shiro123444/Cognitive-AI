import { describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';

import { CapabilityClient } from '../src/agent/capability-client.js';
import { RuntimeTokenProvider } from '../src/agent/runtime-token-provider.js';
import { createRuntimeDb } from '../src/persistence/db.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RuntimeService } from '../src/core/runtime-service.js';
import type { LlmProvider } from '../src/agent/agent-loop.js';

class FakeFetch {
  calls: Array<{ url: string; init: RequestInit }> = [];
  private handler: (url: string, init: RequestInit) => Promise<Response>;

  constructor(handler: (url: string, init: RequestInit) => Promise<Response>) {
    this.handler = handler;
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    this.calls.push({ url, init });
    return this.handler(url, init);
  };
}

function mintResponse(token = 'jwt-abc', expiresAt = Math.floor(Date.now() / 1000) + 3600): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: { token, expires_at: expiresAt, role: 'runtime', ttl_hours: 12 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('RuntimeTokenProvider', () => {
  it('mints a token on first call and caches it', async () => {
    const fake = new FakeFetch(async () => mintResponse('token-1'));
    const provider = new RuntimeTokenProvider({
      backendBaseUrl: 'http://backend.test',
      fetchImpl: fake.fetch as unknown as typeof fetch,
    });

    const t1 = await provider.currentToken();
    expect(t1).toBe('token-1');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe('http://backend.test/api/v1/runtime/sessions/runtime-token');

    const t2 = await provider.currentToken();
    expect(t2).toBe('token-1');
    expect(fake.calls).toHaveLength(1);
  });

  it('refreshes when the cached token is within the lead window', async () => {
    let nowMs = 1_000_000;
    const fake = new FakeFetch(async () => {
      const expiresAt = nowMs / 1000 + 30; // 30s in the future
      return mintResponse(`token-${expiresAt}`, expiresAt);
    });
    const provider = new RuntimeTokenProvider({
      backendBaseUrl: 'http://backend.test',
      fetchImpl: fake.fetch as unknown as typeof fetch,
      refreshLeadMs: 60_000,
      now: () => nowMs,
    });

    const t1 = await provider.currentToken();
    expect(t1).toBe(`token-${nowMs / 1000 + 30}`);
    expect(fake.calls).toHaveLength(1);

    // Advance past the refresh lead → next call must mint again.
    nowMs += 90_000;
    const t2 = await provider.currentToken();
    expect(t2).not.toBe(t1);
    expect(fake.calls).toHaveLength(2);
  });

  it('deduplicates concurrent mint requests', async () => {
    let resolveMint: (r: Response) => void = () => {};
    const fake = new FakeFetch(async () => new Promise<Response>((r) => {
      resolveMint = r;
    }));
    const provider = new RuntimeTokenProvider({
      backendBaseUrl: 'http://backend.test',
      fetchImpl: fake.fetch as unknown as typeof fetch,
    });

    const promises = [
      provider.currentToken(),
      provider.currentToken(),
      provider.currentToken(),
    ];
    // Allow all three to enqueue on the in-flight mint before we resolve it.
    await Promise.resolve();
    await Promise.resolve();
    resolveMint(mintResponse('shared-token'));
    const [a, b, c] = await Promise.all(promises);
    expect(a).toBe('shared-token');
    expect(b).toBe('shared-token');
    expect(c).toBe('shared-token');
    expect(fake.calls).toHaveLength(1);
  });

  it('forwards the engine API key when minting', async () => {
    const fake = new FakeFetch(async () => mintResponse('k-token'));
    const provider = new RuntimeTokenProvider({
      backendBaseUrl: 'http://backend.test',
      engineApiKey: 'shared-secret',
      fetchImpl: fake.fetch as unknown as typeof fetch,
    });

    await provider.currentToken();
    const headers = fake.calls[0].init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('shared-secret');
  });
});

describe('CapabilityClient with RuntimeTokenProvider', () => {
  function buildClient(fetchImpl: FakeFetch) {
    const provider = new RuntimeTokenProvider({
      backendBaseUrl: 'http://backend.test',
      engineApiKey: 'shared',
      fetchImpl: fetchImpl.fetch as unknown as typeof fetch,
    });
    const client = new CapabilityClient({
      baseUrl: 'http://backend.test',
      tokenProvider: provider,
      userContext: { id: 'student-ada', role: 'student' },
      fetchImpl: fetchImpl.fetch as unknown as typeof fetch,
    });
    return { provider, client, fetch: fetchImpl };
  }

  it('attaches Authorization + user headers on discover()', async () => {
    const fake = new FakeFetch(async (url) => {
      if (url.endsWith('/runtime/sessions/runtime-token')) return mintResponse('jwt-x');
      if (url.endsWith('/runtime/capabilities')) {
        return jsonResponse({ capabilities: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const { client } = buildClient(fake);

    await client.discover();

    const discoverCall = fake.calls.find((c) => c.url.endsWith('/runtime/capabilities'));
    const headers = discoverCall?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-x');
    expect(headers['X-Runtime-User-Id']).toBe('student-ada');
    expect(headers['X-Runtime-User-Role']).toBe('student');
  });

  it('attaches Authorization + user headers on invoke()', async () => {
    const fake = new FakeFetch(async (url) => {
      if (url.endsWith('/runtime/sessions/runtime-token')) return mintResponse('jwt-y');
      if (url.endsWith('/runtime/capabilities/invoke')) {
        return jsonResponse({ status: 'completed', result: { text: 'hi' }, events: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const { client } = buildClient(fake);

    const result = await client.invoke('runtime.echo', { text: 'hi' });
    expect(result.result.text).toBe('hi');

    const invokeCall = fake.calls.find((c) => c.url.endsWith('/runtime/capabilities/invoke'));
    const headers = invokeCall?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-y');
    expect(headers['X-Runtime-User-Id']).toBe('student-ada');
  });

  it('reuses a fresh token across many calls without re-minting', async () => {
    const fake = new FakeFetch(async (url) => {
      if (url.endsWith('/runtime/sessions/runtime-token')) return mintResponse('jwt-z');
      if (url.endsWith('/runtime/capabilities')) return jsonResponse({ capabilities: [] });
      if (url.endsWith('/runtime/capabilities/invoke')) {
        return jsonResponse({ status: 'completed', result: {}, events: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const { client } = buildClient(fake);

    await client.discover();
    await client.invoke('runtime.echo', { text: 'a' });
    await client.invoke('runtime.echo', { text: 'b' });

    const mintCalls = fake.calls.filter((c) => c.url.endsWith('/runtime/sessions/runtime-token'));
    expect(mintCalls).toHaveLength(1);
  });

  it('works without a tokenProvider (legacy unauthenticated mode)', async () => {
    const fake = new FakeFetch(async (url) => {
      if (url.endsWith('/runtime/capabilities')) return jsonResponse({ capabilities: [] });
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CapabilityClient({
      baseUrl: 'http://backend.test',
      fetchImpl: fake.fetch as unknown as typeof fetch,
    });
    await client.discover();
    const headers = fake.calls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('RuntimeService SSO integration', () => {
  it('wires the token provider into the capabilities client', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const provider: LlmProvider = {
      async complete() {
        return { role: 'assistant', content: 'noop' };
      }
    };

    const runtime = new RuntimeService({
      db,
      capabilityBaseUrl: 'http://backend.test',
      provider,
      sso: { engineApiKey: 'k', userContext: { id: 'student-ada', role: 'student' } },
    });

    expect(runtime.tokenProvider).toBeTruthy();
    expect(runtime.defaultUserContext).toEqual({ id: 'student-ada', role: 'student' });

    await pool.end();
  });

  it('omits the token provider when SSO is not configured', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const provider: LlmProvider = {
      async complete() {
        return { role: 'assistant', content: 'noop' };
      }
    };

    const runtime = new RuntimeService({
      db,
      capabilityBaseUrl: 'http://backend.test',
      provider,
    });
    expect(runtime.tokenProvider).toBeUndefined();
    expect(runtime.defaultUserContext).toBeUndefined();

    await pool.end();
  });
});
