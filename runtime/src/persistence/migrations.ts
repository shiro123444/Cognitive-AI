import type { RuntimeDb } from './db.js';

export async function migrateRuntimeDb(db: RuntimeDb) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      protocol_version TEXT NOT NULL,
      payload_json JSONB NOT NULL
    );
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
}
