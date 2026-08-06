import type { RuntimeDb } from './db.js';

export async function migrateRuntimeDb(db: RuntimeDb) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      protocol_version TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Older deployments may have created the sessions table before ``created_at``
  // was tracked. Add it idempotently so listSessions can return rows in
  // insertion order across upgrades.
  await db.query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      session_id TEXT NOT NULL,
      session_seq BIGINT NOT NULL,
      event_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (session_id, session_seq)
    );
  `);

  // Run ledger — used for session restore: when a runtime restarts, callers
  // can list runs in a session to know what is resumable.
  await db.query(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      parent_run_id TEXT,
      state TEXT NOT NULL,
      depth INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_runs_session_state
      ON runs (session_id, state);
  `);
}
