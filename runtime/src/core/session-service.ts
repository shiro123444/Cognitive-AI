/**
 * Session lifecycle management — create, resume, list events, compact.
 */

import { randomUUID } from 'node:crypto';

import type { Session } from '../protocol/types.js';
import type { EventStore } from '../persistence/event-store.js';
import type { SessionStore } from '../persistence/session-store.js';
import { RUNTIME_PROTOCOL_VERSION } from '../index.js';

export interface CreateSessionInput {
  participants: string[];
  policyRefs?: string[];
  sharedResourceRefs?: string[];
  auditEnabled?: boolean;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionStore,
    private readonly events: EventStore,
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
}
