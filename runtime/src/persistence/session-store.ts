import type { Session } from '../protocol/types.js';
import type { RuntimeDb } from './db.js';

interface SessionRow {
  session_id: string;
  protocol_version: string;
  payload_json: Session | Record<string, unknown>;
}

export class SessionStore {
  constructor(private readonly db: RuntimeDb) {}

  async createSession(session: Session) {
    await this.db.query(
      'INSERT INTO sessions (session_id, protocol_version, payload_json) VALUES ($1, $2, $3::jsonb)',
      [session.session_id, session.protocol_version, JSON.stringify(session)]
    );
  }

  /** Load a persisted session by id. Returns null when not found. */
  async getSession(sessionId: string): Promise<Session | null> {
    const result = await this.db.query<SessionRow>(
      'SELECT session_id, protocol_version, payload_json FROM sessions WHERE session_id = $1',
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    // payload_json was inserted with the full Session shape — but pg-mem and
    // some drivers return it as a string, so normalise before validating.
    const payload =
      typeof row.payload_json === 'string'
        ? JSON.parse(row.payload_json)
        : row.payload_json;
    return payload as Session;
  }

  /** List sessions in insertion order (oldest first). Optional limit. */
  async listSessions(limit = 50): Promise<Session[]> {
    const result = await this.db.query<SessionRow>(
      'SELECT session_id, protocol_version, payload_json FROM sessions ORDER BY created_at ASC LIMIT $1',
      [limit]
    );
    return result.rows.map((row) => {
      const payload =
        typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json;
      return payload as Session;
    });
  }

  /**
   * Update branch_heads / shared_resource_refs / audit_settings after a session
   * has been mutated in memory (e.g. a new child run advanced a branch). Only
   * the JSON payload is rewritten; session_id + protocol_version are immutable.
   */
  async updateSession(session: Session) {
    await this.db.query(
      'UPDATE sessions SET payload_json = $1::jsonb WHERE session_id = $2',
      [JSON.stringify(session), session.session_id]
    );
  }
}
