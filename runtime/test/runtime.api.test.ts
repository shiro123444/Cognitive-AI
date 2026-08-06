import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createRuntimeDb } from '../src/persistence/db.js';
import { EventStore } from '../src/persistence/event-store.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RunStore } from '../src/persistence/run-store.js';
import { SessionStore } from '../src/persistence/session-store.js';
import { SessionService } from '../src/core/session-service.js';
import { RuntimeService } from '../src/core/runtime-service.js';
import { buildServer } from '../src/server.js';
import type { LlmProvider } from '../src/agent/agent-loop.js';

describe('runtime api', () => {
  it('creates a session through the HTTP API', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: {
        protocol_version: 'v1alpha1',
        session_id: 'session-http-1',
        participants: ['user:ada'],
        branch_heads: { main: 'entry-1' },
        policy_refs: [],
        shared_resource_refs: [],
        audit_settings: { enabled: true }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().session_id).toBe('session-http-1');
  });

  it('lists runtime events since a sequence number', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/runtime/events/session-http-1?last_seen_seq=5'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session_id: 'session-http-1',
      last_seen_seq: 5,
      events: []
    });
  });

  it('exposes /runtime/sessions/:id/resume for post-restart rehydration', async () => {
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
      capabilityBaseUrl: 'http://127.0.0.1:65535',
      provider,
    });

    const session = await runtime.sessions.create({ participants: ['user:ada'] });
    await runtime.eventStore.append({
      session_id: session.session_id,
      run_id: 'run-restore-1',
      type: 'llm.response',
      payload: { content: 'hello' }
    });
    await runtime.runStore.upsert({
      run_id: 'run-restore-1',
      session_id: session.session_id,
      agent_id: 'tutor',
      parent_run_id: null,
      state: 'running',
      depth: 0,
      summary: 'in-flight',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ended_at: null,
    });

    const app = buildServer({ runtime });
    const response = await app.inject({
      method: 'GET',
      url: `/runtime/sessions/${session.session_id}/resume?recent_event_limit=10`
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.session.session_id).toBe(session.session_id);
    expect(body.last_event_seq).toBe(1);
    expect(body.recent_events).toHaveLength(1);
    expect(body.recent_events[0].type).toBe('llm.response');
    expect(body.runs.map((r) => r.run_id)).toEqual(['run-restore-1']);
    expect(body.active_runs.map((r) => r.run_id)).toEqual(['run-restore-1']);

    await pool.end();
  });

  it('returns 404 when resuming an unknown session', async () => {
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
      capabilityBaseUrl: 'http://127.0.0.1:65535',
      provider,
    });
    const app = buildServer({ runtime });

    const response = await app.inject({
      method: 'GET',
      url: '/runtime/sessions/does-not-exist/resume'
    });
    expect(response.statusCode).toBe(404);

    await pool.end();
  });
});
