import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createRuntimeDb } from '../src/persistence/db.js';
import { EventStore } from '../src/persistence/event-store.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RunStore } from '../src/persistence/run-store.js';
import { SessionStore } from '../src/persistence/session-store.js';
import { SessionService } from '../src/core/session-service.js';

function buildDb() {
  const mem = newDb();
  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();
  const db = createRuntimeDb({ pool });
  return { db, pool };
}

describe('session restore', () => {
  it('creates, persists, and rehydrates a session via SessionService.resume', async () => {
    const { db, pool } = buildDb();
    await migrateRuntimeDb(db);

    const sessions = new SessionStore(db);
    const events = new EventStore(db);
    const runs = new RunStore(db);
    const service = new SessionService(sessions, events, runs);

    const session = await service.create({ participants: ['user:ada'] });
    expect(session.session_id).toMatch(/-/);

    // Re-load via the store directly
    const loaded = await sessions.getSession(session.session_id);
    expect(loaded?.session_id).toBe(session.session_id);
    expect(loaded?.participants).toEqual(['user:ada']);

    // Empty session: resume should return zero events but valid structure.
    const empty = await service.resume(session.session_id);
    expect(empty).not.toBeNull();
    expect(empty?.last_event_seq).toBe(0);
    expect(empty?.recent_events).toEqual([]);
    expect(empty?.runs).toEqual([]);
    expect(empty?.active_runs).toEqual([]);

    // Append some events + a run record, then resume again.
    await events.append({
      session_id: session.session_id,
      run_id: 'run-a',
      type: 'llm.response',
      payload: { content: 'first' }
    });
    await events.append({
      session_id: session.session_id,
      run_id: 'run-a',
      type: 'tool.start',
      payload: { name: 'search_materials' }
    });
    await runs.upsert({
      run_id: 'run-a',
      session_id: session.session_id,
      agent_id: 'tutor',
      parent_run_id: null,
      state: 'running',
      depth: 0,
      summary: 'in-flight',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ended_at: null
    });

    const restored = await service.resume(session.session_id, { recentEventLimit: 5 });
    expect(restored?.last_event_seq).toBe(2);
    expect(restored?.recent_events.map((e) => e.type)).toEqual(['llm.response', 'tool.start']);
    expect(restored?.runs).toHaveLength(1);
    expect(restored?.active_runs.map((r) => r.run_id)).toEqual(['run-a']);

    await pool.end();
  });

  it('returns null when resuming an unknown session', async () => {
    const { db, pool } = buildDb();
    await migrateRuntimeDb(db);

    const service = new SessionService(
      new SessionStore(db),
      new EventStore(db),
      new RunStore(db),
    );

    const result = await service.resume('session-does-not-exist');
    expect(result).toBeNull();

    await pool.end();
  });

  it('listSessions returns the most recent N sessions', async () => {
    const { db, pool } = buildDb();
    await migrateRuntimeDb(db);

    const service = new SessionService(
      new SessionStore(db),
      new EventStore(db),
      new RunStore(db),
    );

    await service.create({ participants: ['user:ada'] });
    await service.create({ participants: ['user:bob'] });
    await service.create({ participants: ['user:carol'] });

    const all = await service.listSessions(10);
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.participants[0])).toEqual([
      'user:ada',
      'user:bob',
      'user:carol'
    ]);

    const limited = await service.listSessions(2);
    expect(limited).toHaveLength(2);

    await pool.end();
  });

  it('RunStore distinguishes active vs terminal runs', async () => {
    const { db, pool } = buildDb();
    await migrateRuntimeDb(db);
    const runs = new RunStore(db);

    const now = new Date().toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    await runs.upsert({
      run_id: 'r-active', session_id: 's1', agent_id: 'tutor', parent_run_id: null,
      state: 'running', depth: 0, summary: '', started_at: now, updated_at: now, ended_at: null
    });
    await runs.upsert({
      run_id: 'r-done', session_id: 's1', agent_id: 'tutor', parent_run_id: null,
      state: 'completed', depth: 0, summary: 'finished', started_at: now, updated_at: later, ended_at: later
    });
    await runs.upsert({
      run_id: 'r-failed', session_id: 's1', agent_id: 'tutor', parent_run_id: null,
      state: 'failed', depth: 0, summary: 'crashed', started_at: now, updated_at: later, ended_at: later
    });

    const active = await runs.listActive('s1');
    expect(active.map((r) => r.run_id)).toEqual(['r-active']);

    const all = await runs.listForSession('s1');
    expect(all.map((r) => r.run_id).sort()).toEqual(['r-active', 'r-done', 'r-failed']);

    await pool.end();
  });

  it('EventStore.latestSeq returns 0 for empty sessions and the max seq otherwise', async () => {
    const { db, pool } = buildDb();
    await migrateRuntimeDb(db);
    const events = new EventStore(db);

    expect(await events.latestSeq('s-empty')).toBe(0);

    await events.append({ session_id: 's1', run_id: 'r1', type: 'a', payload: {} });
    await events.append({ session_id: 's1', run_id: 'r1', type: 'b', payload: {} });
    await events.append({ session_id: 's1', run_id: 'r1', type: 'c', payload: {} });

    expect(await events.latestSeq('s1')).toBe(3);
    expect(await events.countForSession('s1')).toBe(3);

    await pool.end();
  });
});
