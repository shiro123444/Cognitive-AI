/**
 * Session lifecycle management — create, resume, list events, compact.
 */

import { randomUUID } from 'node:crypto';

import type { Session } from '../protocol/types.js';
import type { EventStore } from '../persistence/event-store.js';
import type { SessionStore } from '../persistence/session-store.js';
import type { RunStore } from '../persistence/run-store.js';
import { RUNTIME_PROTOCOL_VERSION } from '../index.js';

export interface CreateSessionInput {
  participants: string[];
  policyRefs?: string[];
  sharedResourceRefs?: string[];
  auditEnabled?: boolean;
}

export interface ResumeSessionResult {
  session: Session;
  /** Highest event seq currently persisted for this session (0 = empty). */
  last_event_seq: number;
  /** Most recent events in chronological order, capped at ``recentEventLimit``. */
  recent_events: Awaited<ReturnType<EventStore['listSince']>>;
  /** Run records (from the run ledger) currently associated with this session. */
  runs: Awaited<ReturnType<RunStore['listForSession']>>;
  /** Runs whose state is not yet terminal. */
  active_runs: Awaited<ReturnType<RunStore['listActive']>>;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionStore,
    private readonly events: EventStore,
    private readonly runs: RunStore,
  ) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const session: Session = {
      protocol_version: RUNTIME_PROTOCOL_VERSION,
      session_id: randomUUID(),
      participants: input.participants,
      branch_heads: {},
      policy_refs: input.policyRefs ?? [],
      shared_resource_refs: input.sharedResourceRefs ?? [],
      audit_settings: { enabled: input.auditEnabled ?? true },
    };
    await this.sessions.createSession(session);
    return session;
  }

  async getEvents(sessionId: string, afterSeq: number) {
    return this.events.listSince(sessionId, afterSeq);
  }

  /**
   * Re-hydrate a persisted session after a runtime restart.
   *
   * Returns the canonical Session row, the most recent event seq (so callers
   * can resume their SSE stream), the recent event tail (for UI rehydration),
   * and the run ledger snapshot. Returns null when the session is unknown.
   */
  async resume(
    sessionId: string,
    options: { recentEventLimit?: number } = {},
  ): Promise<ResumeSessionResult | null> {
    const session = await this.sessions.getSession(sessionId);
    if (!session) return null;

    const recentLimit = options.recentEventLimit ?? 50;
    const lastSeq = await this.events.latestSeq(sessionId);
    // We can't ask for the last N via SQL without OFFSET, so fetch everything
    // since 0 and trim. For typical session sizes this is fine — events are
    // append-only and cheap to scan.
    const all = lastSeq > 0 ? await this.events.listAll(sessionId) : [];
    const recent = all.slice(Math.max(0, all.length - recentLimit));
    const [runs, active] = await Promise.all([
      this.runs.listForSession(sessionId),
      this.runs.listActive(sessionId),
    ]);
    return {
      session,
      last_event_seq: lastSeq,
      recent_events: recent,
      runs,
      active_runs: active,
    };
  }

  async listSessions(limit = 50) {
    return this.sessions.listSessions(limit);
  }
}
