/**
 * RuntimeService — top-level lifecycle coordinator.
 *
 * Owns the AgentLoop, SessionService, and wires them to the persistence layer.
 * Provides the public API surface that routes call into.
 */

import { randomUUID } from 'node:crypto';

import { AgentLoop } from '../agent/agent-loop.js';
import type { AgentLoopConfig, AgentLoopEvent, LlmProvider } from '../agent/agent-loop.js';
import { CapabilityClient } from '../agent/capability-client.js';
import type { CapabilityClientOptions } from '../agent/capability-client.js';
import { EventBus } from './event-bus.js';
import { EventStore } from '../persistence/event-store.js';
import { SessionStore } from '../persistence/session-store.js';
import { SessionService } from './session-service.js';
import type { RuntimeDb } from '../persistence/db.js';
import type { RunState } from './runtime-types.js';

export interface RuntimeServiceOptions {
  db: RuntimeDb;
  capabilityBaseUrl: string;
  capabilityTimeoutMs?: number;
  provider: LlmProvider;
}

export interface StartRunInput {
  sessionId: string;
  agentId: string;
  systemPrompt: string;
  userMessage: string;
  maxTurns?: number;
}

export interface StartRunResult {
  runId: string;
  finalState: RunState;
}

export class RuntimeService {
  readonly sessions: SessionService;
  readonly eventBus: EventBus<AgentLoopEvent>;
  private readonly eventStore: EventStore;
  private readonly capabilities: CapabilityClient;
  private readonly provider: LlmProvider;

  constructor(options: RuntimeServiceOptions) {
    this.eventStore = new EventStore(options.db);
    const sessionStore = new SessionStore(options.db);
    this.sessions = new SessionService(sessionStore, this.eventStore);
    this.eventBus = new EventBus<AgentLoopEvent>();
    this.capabilities = new CapabilityClient({
      baseUrl: options.capabilityBaseUrl,
      timeoutMs: options.capabilityTimeoutMs,
    });
    this.provider = options.provider;
  }

  /**
   * Start a new agent run within an existing session.
   * Blocks until the run reaches a terminal state.
   */
  async startRun(input: StartRunInput, signal?: AbortSignal): Promise<StartRunResult> {
    const runId = randomUUID();

    const loop = new AgentLoop({
      provider: this.provider,
      capabilities: this.capabilities,
      eventStore: this.eventStore,
      eventBus: this.eventBus,
    });

    const config: AgentLoopConfig = {
      sessionId: input.sessionId,
      runId,
      agentId: input.agentId,
      systemPrompt: input.systemPrompt,
      userMessage: input.userMessage,
      maxTurns: input.maxTurns,
      signal,
    };

    const finalState = await loop.execute(config);
    return { runId, finalState };
  }
}
