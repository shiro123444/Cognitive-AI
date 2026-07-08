import type { Session } from '../protocol/types.js';
import type { RuntimeDb } from './db.js';

export class SessionStore {
  constructor(private readonly db: RuntimeDb) {}

  async createSession(session: Session) {
    await this.db.query(
      'INSERT INTO sessions (session_id, protocol_version, payload_json) VALUES ($1, $2, $3::jsonb)',
      [session.session_id, session.protocol_version, JSON.stringify(session)]
    );
  }
}
