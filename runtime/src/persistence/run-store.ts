/**
 * Run ledger — durable record of each agent run inside a session.
 *
 * Backed by the ``runs`` table created in migrations.ts. Used by the
 * SessionService.resume() flow to list what is currently in flight in a
 * session, and by AgentLoop to upsert run state on every FSM transition.
 */

import type { RuntimeDb } from './db.js';
import type { RunState } from '../core/runtime-types.js';

export interface RunRecord {
  run_id: string;
  session_id: string;
  agent_id: string;
  parent_run_id: string | null;
  state: RunState;
  depth: number;
  summary: string;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface RunRow {
  run_id: string;
  session_id: string;
  agent_id: string;
  parent_run_id: string | null;
  state: string;
  depth: number | string;
  summary: string;
  started_at: string | Date;
  updated_at: string | Date;
  ended_at: string | Date | null;
}

function rowToRecord(row: RunRow): RunRecord {
  return {
    run_id: row.run_id,
    session_id: row.session_id,
    agent_id: row.agent_id,
    parent_run_id: row.parent_run_id,
    state: row.state as RunState,
    depth: Number(row.depth ?? 0),
    summary: row.summary ?? '',
    started_at:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : String(row.started_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
    ended_at:
      row.ended_at == null
        ? null
        : row.ended_at instanceof Date
          ? row.ended_at.toISOString()
          : String(row.ended_at),
  };
}

export class RunStore {
  constructor(private readonly db: RuntimeDb) {}

  /**
   * Create-or-update a run row. Terminal states set ended_at; intermediate
   * states only bump updated_at + summary.
   */
  async upsert(record: RunRecord) {
    await this.db.query(
      `
        INSERT INTO runs (
          run_id, session_id, agent_id, parent_run_id, state, depth,
          summary, started_at, updated_at, ended_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (run_id) DO UPDATE SET
          state = EXCLUDED.state,
          summary = EXCLUDED.summary,
          updated_at = EXCLUDED.updated_at,
          ended_at = EXCLUDED.ended_at
      `,
      [
        record.run_id,
        record.session_id,
        record.agent_id,
        record.parent_run_id,
        record.state,
        record.depth,
        record.summary,
        record.started_at,
        record.updated_at,
        record.ended_at,
      ]
    );
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const result = await this.db.query<RunRow>(
      `SELECT run_id, session_id, agent_id, parent_run_id, state, depth,
              summary, started_at, updated_at, ended_at
         FROM runs WHERE run_id = $1`,
      [runId]
    );
    if (result.rows.length === 0) return null;
    return rowToRecord(result.rows[0]);
  }

  async listForSession(sessionId: string): Promise<RunRecord[]> {
    const result = await this.db.query<RunRow>(
      `SELECT run_id, session_id, agent_id, parent_run_id, state, depth,
              summary, started_at, updated_at, ended_at
         FROM runs
        WHERE session_id = $1
        ORDER BY started_at ASC`,
      [sessionId]
    );
    return result.rows.map(rowToRecord);
  }

  async listActive(sessionId: string): Promise<RunRecord[]> {
    const result = await this.db.query<RunRow>(
      `SELECT run_id, session_id, agent_id, parent_run_id, state, depth,
              summary, started_at, updated_at, ended_at
         FROM runs
        WHERE session_id = $1
          AND state NOT IN ('completed', 'failed', 'cancelled')
        ORDER BY started_at ASC`,
      [sessionId]
    );
    return result.rows.map(rowToRecord);
  }
}
