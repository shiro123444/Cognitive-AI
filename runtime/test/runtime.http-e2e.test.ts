import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';

import { buildServer } from '../src/server.js';
import { createRuntimeDb } from '../src/persistence/db.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RuntimeService } from '../src/core/runtime-service.js';
import type { LlmMessage, LlmProvider, LlmToolDef } from '../src/agent/agent-loop.js';

describe('runtime HTTP e2e', () => {
  let app: ReturnType<typeof buildServer>;
  let originalFetch: typeof globalThis.fetch;
  let pool: any;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;

    const mem = newDb();
    const adapter = mem.adapters.createPg();
    pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    // Faux provider: first call uses tool, second returns text
    let callCount = 0;
    const provider: LlmProvider = {
      async complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmMessage> {
        callCount++;
        if (callCount === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'tc-1', name: 'runtime.echo', arguments: { text: 'ping' } }],
          };
        }
        callCount = 0; // reset for next run
        return { role: 'assistant', content: 'pong received' };
      },
    };

    // Mock fetch for capability bridge
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/runtime/capabilities/invoke')) {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({
          status: 'completed',
          result: { text: body.arguments.text },
          events: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/runtime/capabilities')) {
        return new Response(JSON.stringify({
          capabilities: [{
            capability_id: 'runtime.echo',
            kind: 'tool',
            description: 'Echo',
            input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };

    const runtime = new RuntimeService({
      db,
      capabilityBaseUrl: 'http://faux',
      provider,
    });

    app = buildServer({ runtime });
    await app.ready();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
    await pool.end();
  });

  it('POST /runtime/sessions creates a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: { participants: ['user:alice'] },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.session_id).toBeDefined();
    expect(body.protocol_version).toBe('v1alpha1');
    expect(body.participants).toEqual(['user:alice']);
  });

  it('POST /runtime/runs executes a full agent run', async () => {
    // Create session
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: { participants: ['user:bob'] },
    });
    const session = sessionRes.json();

    // Start run
    const runRes = await app.inject({
      method: 'POST',
      url: '/runtime/runs',
      payload: {
        session_id: session.session_id,
        agent_id: 'tutor',
        system_prompt: 'You are a tutor.',
        user_message: 'Echo ping for me.',
      },
    });

    expect(runRes.statusCode).toBe(201);
    const run = runRes.json();
    expect(run.run_id).toBeDefined();
    expect(run.final_state).toBe('completed');
  });

  it('GET /runtime/events/:sessionId returns persisted events', async () => {
    // Create session + run
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: { participants: ['user:carol'] },
    });
    const session = sessionRes.json();

    await app.inject({
      method: 'POST',
      url: '/runtime/runs',
      payload: {
        session_id: session.session_id,
        agent_id: 'tutor',
        system_prompt: 'Tutor.',
        user_message: 'Hello.',
      },
    });

    // Fetch events
    const eventsRes = await app.inject({
      method: 'GET',
      url: `/runtime/events/${session.session_id}?last_seen_seq=0`,
    });

    expect(eventsRes.statusCode).toBe(200);
    const body = eventsRes.json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0].type).toBe('run.state_changed');
  });

  it('POST /runtime/runs returns 400 for missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/runtime/runs',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
