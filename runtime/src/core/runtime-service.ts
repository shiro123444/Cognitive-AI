/**
 * RuntimeService — top-level lifecycle coordinator.
 *
 * Owns the AgentLoop, SessionService, and wires them to the persistence layer.
 * Provides the public API surface that routes call into.
 *
 * P1.5: also owns startChildRun for multi-agent fan-out/fan-in via
 * the built-in `runtime.delegate` tool (does not go through Python capabilities).
 */

import { randomUUID } from 'node:crypto';

import { AgentLoop } from '../agent/agent-loop.js';
import type {
  AgentLoopConfig,
  AgentLoopEvent,
  ChildRunRequest,
  ChildRunResult,
  LlmProvider,
} from '../agent/agent-loop.js';
import { CapabilityClient } from '../agent/capability-client.js';
import { defaultSystemPrompt } from '../agent/agent-catalog.js';
import { RuntimeTokenProvider } from '../agent/runtime-token-provider.js';
import { EventBus } from './event-bus.js';
import { EventStore } from '../persistence/event-store.js';
import { SessionStore } from '../persistence/session-store.js';
import { RunStore } from '../persistence/run-store.js';
import { SessionService } from './session-service.js';
import type { RuntimeDb } from '../persistence/db.js';
import type { RunState } from './runtime-types.js';

export interface RuntimeServiceOptions {
  db: RuntimeDb;
  capabilityBaseUrl: string;
  capabilityTimeoutMs?: number;
  provider: LlmProvider;
  /** Max nesting depth for child runs (default 3). Root is depth 0. */
  maxDepth?: number;
  /** Compaction thresholds forwarded to the agent loop. */
  compaction?: {
    maxMessages?: number;
    maxChars?: number;
    keepTail?: number;
    useLlmSummariser?: boolean;
  };
  /**
   * SSO integration — when set, the runtime mints a service JWT from the
   * backend and attaches it to every capability call. ``engineApiKey`` is
   * forwarded as ``X-API-Key`` when minting.
   */
  sso?: {
    /** Shared engine key. Optional in dev. */
    engineApiKey?: string;
    /**
     * User the runtime is acting on behalf of. Required when SSO is
     * enabled — capability calls fail without a known user context.
     */
    userContext: { id: string; role: string };
    /** Lead time (ms) before token expiry to refresh. Default 60_000. */
    refreshLeadMs?: number;
  };
}

export interface StartRunInput {
  sessionId: string;
  agentId: string;
  systemPrompt: string;
  userMessage: string;
  maxTurns?: number;
  /** Optional tool allowlist override (otherwise agent catalog). */
  toolAllowlist?: string[] | null;
  /**
   * Override the SSO user context for this run only. Useful when the
   * runtime is shared across multiple users — each run picks up the
   * correct attribution. Falls back to the runtime-wide sso.userContext.
   */
  userContext?: { id: string; role: string };
}

export interface StartRunResult {
  runId: string;
  finalState: RunState;
  summary: string;
}

export class RuntimeService {
  readonly sessions: SessionService;
  readonly eventBus: EventBus<AgentLoopEvent>;
  readonly eventStore: EventStore;
  readonly runStore: RunStore;
  readonly tokenProvider?: RuntimeTokenProvider;
  readonly defaultUserContext?: { id: string; role: string };
  private readonly capabilities: CapabilityClient;
  private readonly capabilityBaseUrl: string;
  private readonly capabilityTimeoutMs: number | undefined;
  private readonly provider: LlmProvider;
  private readonly maxDepth: number;
  private readonly compaction: RuntimeServiceOptions['compaction'];

  constructor(options: RuntimeServiceOptions) {
    this.eventStore = new EventStore(options.db);
    const sessionStore = new SessionStore(options.db);
    this.runStore = new RunStore(options.db);
    this.sessions = new SessionService(sessionStore, this.eventStore, this.runStore);
    this.eventBus = new EventBus<AgentLoopEvent>();
    this.capabilityBaseUrl = options.capabilityBaseUrl;
    this.capabilityTimeoutMs = options.capabilityTimeoutMs;

    if (options.sso) {
      this.tokenProvider = new RuntimeTokenProvider({
        backendBaseUrl: options.capabilityBaseUrl,
        engineApiKey: options.sso.engineApiKey,
        refreshLeadMs: options.sso.refreshLeadMs,
      });
      this.defaultUserContext = options.sso.userContext;
      this.capabilities = new CapabilityClient({
        baseUrl: options.capabilityBaseUrl,
        timeoutMs: options.capabilityTimeoutMs,
        tokenProvider: this.tokenProvider,
        userContext: options.sso.userContext,
      });
    } else {
      this.capabilities = new CapabilityClient({
        baseUrl: options.capabilityBaseUrl,
        timeoutMs: options.capabilityTimeoutMs,
      });
    }
    this.provider = options.provider;
    this.maxDepth = options.maxDepth ?? 3;
    this.compaction = options.compaction;
  }

  /**
   * Start a new root agent run within an existing session.
   * Blocks until the run reaches a terminal state.
   */
  async startRun(input: StartRunInput, signal?: AbortSignal): Promise<StartRunResult> {
    const runId = randomUUID();
    const userContext = input.userContext ?? this.defaultUserContext;
    const loop = this.createLoop(userContext);

    const systemPrompt =
      input.systemPrompt && input.systemPrompt.trim().length > 0
        ? input.systemPrompt
        : defaultSystemPrompt(input.agentId);

    const config: AgentLoopConfig = {
      sessionId: input.sessionId,
      runId,
      agentId: input.agentId,
      systemPrompt,
      userMessage: input.userMessage,
      maxTurns: input.maxTurns,
      depth: 0,
      parentRunId: null,
      toolAllowlist: input.toolAllowlist,
      signal,
    };

    const result = await loop.execute(config);
    return {
      runId: result.runId,
      finalState: result.state,
      summary: result.summary,
    };
  }

  /**
   * Start a child run under a parent (P1.5 multi-agent).
   *
   * Called by AgentLoop when the parent invokes `runtime.delegate`.
   * Enforces maxDepth and reuses the same provider / event bus / session.
   */
  async startChildRun(req: ChildRunRequest): Promise<ChildRunResult> {
    if (req.depth >= this.maxDepth) {
      const blockedId = `blocked-${randomUUID()}`;
      await this.eventStore.append({
        session_id: req.sessionId,
        run_id: req.parentRunId,
        type: 'delegation.blocked',
        payload: {
          reason: 'max_depth',
          max_depth: this.maxDepth,
          requested_depth: req.depth,
          to_agent_id: req.agentId,
          goal: req.userMessage,
        },
      });
      return {
        runId: blockedId,
        finalState: 'failed',
        summary: `max delegation depth ${this.maxDepth} exceeded (requested depth ${req.depth})`,
        artifactRef: `run:${blockedId}`,
      };
    }

    const runId = randomUUID();
    const loop = this.createLoop();

    const result = await loop.execute({
      sessionId: req.sessionId,
      runId,
      agentId: req.agentId,
      systemPrompt: req.systemPrompt || defaultSystemPrompt(req.agentId),
      userMessage: req.userMessage,
      depth: req.depth,
      parentRunId: req.parentRunId,
      toolAllowlist: req.toolAllowlist,
      signal: req.signal,
    });

    return {
      runId: result.runId,
      finalState: result.state,
      summary: result.summary,
      artifactRef: `run:${result.runId}`,
    };
  }

  private createLoop(userContext?: { id: string; role: string }): AgentLoop {
    let capabilities = this.capabilities;
    if (userContext && userContext !== this.defaultUserContext && this.tokenProvider) {
      capabilities = new CapabilityClient({
        baseUrl: this.capabilityBaseUrl,
        timeoutMs: this.capabilityTimeoutMs,
        tokenProvider: this.tokenProvider,
        userContext,
      });
    }
    return new AgentLoop({
      provider: this.provider,
      capabilities,
      eventStore: this.eventStore,
      runStore: this.runStore,
      eventBus: this.eventBus,
      startChildRun: (r) => this.startChildRun(r),
      maxDepth: this.maxDepth,
      compaction: this.compaction,
    });
  }
}
