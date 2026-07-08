import { randomUUID } from 'node:crypto';

import type { RuntimeDb } from './db.js';

interface AppendEventInput {
  session_id: string;
  run_id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface EventRow {
  event_id: string;
  session_id: string;
  run_id: string;
  session_seq: number | string;
  type: string;
  payload_json: Record<string, unknown>;
  timestamp: string | Date;
}

export class EventStore {
  constructor(private readonly db: RuntimeDb) {}

  async append(input: AppendEventInput) {
    const next = await this.db.query<{ next_seq: number | string }>(
      'SELECT COALESCE(MAX(session_seq), 0) + 1 AS next_seq FROM events WHERE session_id = $1',
      [input.session_id]
    );

    const event = {
      event_id: randomUUID(),
      session_id: input.session_id,
      run_id: input.run_id,
      session_seq: Number(next.rows[0].next_seq),
      type: input.type,
      payload: input.payload,
      timestamp: new Date().toISOString()
    };

    await this.db.query(
      `
        INSERT INTO events (session_id, session_seq, event_id, run_id, type, payload_json, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        event.session_id,
        event.session_seq,
        event.event_id,
        event.run_id,
        event.type,
        JSON.stringify(event.payload),
        event.timestamp
      ]
    );

    return event;
  }

  async listSince(sessionId: string, lastSeenSeq: number) {
    const result = await this.db.query<EventRow>(
      `
        SELECT event_id, session_id, run_id, session_seq, type, payload_json, timestamp
        FROM events
        WHERE session_id = $1 AND session_seq > $2
        ORDER BY session_seq ASC
      `,
      [sessionId, lastSeenSeq]
    );

    return result.rows.map((row) => ({
      event_id: row.event_id,
      session_id: row.session_id,
      run_id: row.run_id,
      session_seq: Number(row.session_seq),
      type: row.type,
      payload: row.payload_json,
      timestamp: new Date(row.timestamp).toISOString()
    }));
  }
}
