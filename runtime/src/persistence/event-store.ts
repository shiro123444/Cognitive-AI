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

/**
 * Append-only event store.
 *
 * session_seq is allocated with SELECT max+1. Parallel child runs (P1.5 fan-out)
 * share a session, so appends are serialized via an in-process mutex to avoid
 * primary-key collisions. A multi-instance deployment would need a DB sequence
 * or advisory lock instead.
 */
export class EventStore {
  /** Chains appends so concurrent writers cannot race on session_seq. */
  private appendTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: RuntimeDb) {}

  async append(input: AppendEventInput) {
    // Serialize: wait for previous append, hold the chain until we finish.
    let release!: () => void;
    const prev = this.appendTail;
    this.appendTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;

    try {
      return await this.appendUnlocked(input);
    } finally {
      release();
    }
  }

  private async appendUnlocked(input: AppendEventInput) {
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

  /** Return the most recent event seq for a session, or 0 if none. */
  async latestSeq(sessionId: string): Promise<number> {
    const result = await this.db.query<{ max_seq: number | string | null }>(
      'SELECT MAX(session_seq) AS max_seq FROM events WHERE session_id = $1',
      [sessionId]
    );
    const raw = result.rows[0]?.max_seq;
    return raw == null ? 0 : Number(raw);
  }

  /** Count events stored for a session. Used by compaction telemetry. */
  async countForSession(sessionId: string): Promise<number> {
    const result = await this.db.query<{ total: number | string }>(
      'SELECT COUNT(*) AS total FROM events WHERE session_id = $1',
      [sessionId]
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /**
   * Return the full ordered event stream for a session. Used by replay /
   * resume flows that need every event from the beginning (no offset).
   */
  async listAll(sessionId: string) {
    return this.listSince(sessionId, 0);
  }
}
