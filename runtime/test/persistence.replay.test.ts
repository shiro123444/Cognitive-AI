import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createRuntimeDb } from '../src/persistence/db.js';
import { EventStore } from '../src/persistence/event-store.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { SessionStore } from '../src/persistence/session-store.js';

describe('runtime persistence', () => {
  it('appends sessions and sequential events', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });

    await migrateRuntimeDb(db);

    const sessions = new SessionStore(db);
    const events = new EventStore(db);

    await sessions.createSession({
      protocol_version: 'v1alpha1',
      session_id: 'session-1',
      participants: ['user:ada'],
      branch_heads: { main: 'entry-1' },
      policy_refs: [],
      shared_resource_refs: [],
      audit_settings: { enabled: true }
    });

    await events.append({
      session_id: 'session-1',
      run_id: 'run-1',
      type: 'run.started',
      payload: { state: 'running' }
    });
    await events.append({
      session_id: 'session-1',
      run_id: 'run-1',
      type: 'run.completed',
      payload: { state: 'completed' }
    });

    const stored = await events.listSince('session-1', 0);
    expect(stored.map((item) => item.session_seq)).toEqual([1, 2]);

    await pool.end();
  });
});
