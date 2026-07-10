/**
 * Agent Loop — drives a single Run through LLM calls and tool execution.
 *
 * Design follows pi's agent-loop pattern:
 * - Outer loop processes turns until no more tool calls or stop condition
 * - Each turn: stream LLM response → extract tool calls → execute → emit events
 * - FSM transitions are emitted as events into the EventStore
 * - Tools are resolved via CapabilityClient (Python bridge) and scoped by agent catalog
 * - Built-in `runtime.delegate` fans out child runs (P1.5 multi-agent)
 */

import type { CapabilityClient, CapabilityDescriptor } from './capability-client.js';
import type { EventBus } from '../core/event-bus.js';
import type { EventStore } from '../persistence/event-store.js';
import type { RunAction, RunState } from '../core/runtime-types.js';
import { nextRunState } from '../core/run-service.js';
import { mergeChildResults, planDelegations } from './supervisor.js';
import type { ChildResultInput } from './supervisor.js';
import {
  agentMayDelegate,
  canDelegateTo,
  defaultSystemPrompt,
  filterToolsByAllowlist,
  resolveToolAllowlist,
  toolAllowlistFromGrants,
} from './agent-catalog.js';

// --- Types ---

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool_result';
  content: string;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmProvider {
  /**
   * Stream or complete an LLM call. Returns the assistant message.
   * Must not throw for model errors — encode them in the response.
   */
  complete(messages: LlmMessage[], tools: LlmToolDef[], signal?: AbortSignal): Promise<LlmMessage>;
}

export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Events emitted during the agent loop lifecycle. */
export type AgentLoopEvent =
  | { type: 'run.state_changed'; run_id: string; from: RunState; to: RunState; action: RunAction }
  | { type: 'turn.start'; run_id: string; turn: number }
  | { type: 'turn.end'; run_id: string; turn: number }
  | { type: 'llm.response'; run_id: string; message: LlmMessage }
  | { type: 'tool.start'; run_id: string; tool_call_id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool.end'; run_id: string; tool_call_id: string; name: string; status: 'completed' | 'failed'; result: Record<string, unknown> }
  | { type: 'delegation.start'; run_id: string; delegation_id: string; to_agent_id: string; goal: string; child_run_id?: string }
  | { type: 'delegation.end'; run_id: string; delegation_id: string; child_run_id: string; status: 'completed' | 'failed' }
  | { type: 'agent.end'; run_id: string; reason: 'completed' | 'failed' | 'cancelled' | 'max_turns' };

export interface AgentLoopConfig {
  sessionId: string;
  runId: string;
  agentId: string;
  /** System prompt for the agent. */
  systemPrompt: string;
  /** Initial user message to kick off the run. */
  userMessage: string;
  /** Maximum turns before forced stop. */
  maxTurns?: number;
  /** Nesting depth (0 = root). Used to enforce maxDepth. */
  depth?: number;
  /** Parent run id when this is a child run. */
  parentRunId?: string | null;
  /**
   * Optional tool allowlist. When set, only these capability tools are offered
   * (plus runtime.delegate when enabled). When omitted, resolved from agent catalog.
   */
  toolAllowlist?: string[] | null;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  state: RunState;
  summary: string;
  runId: string;
}

export interface ChildRunRequest {
  sessionId: string;
  parentRunId: string;
  agentId: string;
  systemPrompt: string;
  userMessage: string;
  grantIds?: string[];
  /** Explicit tool allowlist for the child (from grants and/or parent). */
  toolAllowlist?: string[] | null;
  depth: number;
  signal?: AbortSignal;
}

export interface ChildRunResult {
  runId: string;
  finalState: RunState;
  summary: string;
  artifactRef: string;
}

export type StartChildRunFn = (req: ChildRunRequest) => Promise<ChildRunResult>;

export interface AgentLoopDeps {
  provider: LlmProvider;
  capabilities: CapabilityClient;
  eventStore: EventStore;
  eventBus: EventBus<AgentLoopEvent>;
  /** When set, enables the built-in `runtime.delegate` tool (P1.5). */
  startChildRun?: StartChildRunFn;
  /** Max nesting depth for child runs (default 3). Root is depth 0. */
  maxDepth?: number;
}

export const DELEGATE_TOOL_NAME = 'runtime.delegate';

export const DELEGATE_TOOL_DEF: LlmToolDef = {
  name: DELEGATE_TOOL_NAME,
  description:
    'Delegate one or more sub-tasks to child agents. Runs them in parallel (fan-out), ' +
    'merges their results (fan-in), and returns artifact refs for the parent to use.',
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Sub-tasks to delegate to child agents',
        items: {
          type: 'object',
          properties: {
            to_agent_id: {
              type: 'string',
              description: 'Target child agent id (e.g. document-analyst, graph-explorer)',
            },
            goal: {
              type: 'string',
              description: 'What the child agent should accomplish',
            },
            system_prompt: {
              type: 'string',
              description: 'Optional system prompt override for the child',
            },
            grant_ids: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Context grant ids. Use tool:<capability_id> (or bare capability ids) to further restrict child tools.',
            },
            constraints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Hard constraints for the child',
            },
          },
          required: ['to_agent_id', 'goal'],
        },
      },
    },
    required: ['tasks'],
  },
};

interface DelegateTaskArg {
  to_agent_id: string;
  goal: string;
  system_prompt?: string;
  grant_ids?: string[];
  constraints?: string[];
}

// --- Implementation ---

export class AgentLoop {
  private readonly provider: LlmProvider;
  private readonly capabilities: CapabilityClient;
  private readonly eventStore: EventStore;
  private readonly eventBus: EventBus<AgentLoopEvent>;
  private readonly startChildRun?: StartChildRunFn;
  private readonly maxDepth: number;

  constructor(deps: AgentLoopDeps) {
    this.provider = deps.provider;
    this.capabilities = deps.capabilities;
    this.eventStore = deps.eventStore;
    this.eventBus = deps.eventBus;
    this.startChildRun = deps.startChildRun;
    this.maxDepth = deps.maxDepth ?? 3;
  }

  /**
   * Execute a full agent run. Drives the FSM from 'queued' through to terminal state.
   */
  async execute(config: AgentLoopConfig): Promise<AgentLoopResult> {
    const { sessionId, runId, signal, maxTurns = 20 } = config;
    const depth = config.depth ?? 0;

    // Keep as RunState (not a literal) so TS control-flow stays open across transitions.
    let state: RunState = 'queued' as RunState;
    let lastSummary = '';

    const allowlist = resolveToolAllowlist(config.agentId, config.toolAllowlist);
    // For enforcement on invoke: concrete set when restricted, null when unrestricted
    const allowedToolSet: Set<string> | null =
      allowlist === undefined || allowlist === '*' ? null : new Set(allowlist);

    const mayDelegate =
      Boolean(this.startChildRun) && depth + 1 < this.maxDepth && agentMayDelegate(config.agentId);

    const transition = async (action: RunAction): Promise<RunState> => {
      const from = state;
      const to = nextRunState(from, action);
      state = to;
      const event: AgentLoopEvent = { type: 'run.state_changed', run_id: runId, from, to, action };
      this.eventBus.emit(event);
      await this.eventStore.append({
        session_id: sessionId,
        run_id: runId,
        type: 'run.state_changed',
        payload: {
          from,
          to,
          action,
          parent_run_id: config.parentRunId ?? null,
          depth,
          agent_id: config.agentId,
        },
      });
      return to;
    };

    const end = (reason: 'completed' | 'failed' | 'cancelled' | 'max_turns'): AgentLoopResult => {
      this.eventBus.emit({ type: 'agent.end', run_id: runId, reason });
      return { state, summary: lastSummary, runId };
    };

    // Start the run
    state = await transition('start');

    // Discover available tools, then scope by agent catalog / grants
    let toolDefs: LlmToolDef[];
    try {
      const capabilities = await this.capabilities.discover();
      const all = capabilities.map((c: CapabilityDescriptor) => ({
        name: c.capability_id,
        description: c.description,
        parameters: c.input_schema,
      }));
      toolDefs = filterToolsByAllowlist(all, allowlist);
    } catch {
      state = await transition('fail');
      return end('failed');
    }

    if (mayDelegate) {
      toolDefs = [...toolDefs, DELEGATE_TOOL_DEF];
    }

    // Build initial message history
    const messages: LlmMessage[] = [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.userMessage },
    ];

    let turn = 0;

    // Main loop
    while (turn < maxTurns) {
      if (signal?.aborted) {
        state = await transition('cancel');
        return end('cancelled');
      }

      turn++;
      this.eventBus.emit({ type: 'turn.start', run_id: runId, turn });

      // LLM call
      const assistantMessage = await this.provider.complete(messages, toolDefs, signal);
      messages.push(assistantMessage);
      if (assistantMessage.content) {
        lastSummary = assistantMessage.content;
      }

      await this.eventStore.append({
        session_id: sessionId,
        run_id: runId,
        type: 'llm.response',
        payload: {
          role: assistantMessage.role,
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls ?? null,
        },
      });
      this.eventBus.emit({ type: 'llm.response', run_id: runId, message: assistantMessage });

      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        this.eventBus.emit({ type: 'turn.end', run_id: runId, turn });
        state = await transition('complete');
        return end('completed');
      }

      // Execute tool calls (capability tools and/or runtime.delegate)
      for (const toolCall of toolCalls) {
        if (signal?.aborted) break;

        const isDelegate = toolCall.name === DELEGATE_TOOL_NAME;

        // Switch FSM lane when tool kind changes mid-batch
        if (isDelegate) {
          if (state === 'waiting_tool') state = await transition('tool_complete');
          if (state === 'running') state = await transition('delegate');
        } else {
          if (state === 'waiting_child') state = await transition('child_complete');
          if (state === 'running') state = await transition('wait_tool');
        }

        this.eventBus.emit({
          type: 'tool.start',
          run_id: runId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        });

        await this.eventStore.append({
          session_id: sessionId,
          run_id: runId,
          type: 'tool.start',
          payload: { tool_call_id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
        });

        let result: Record<string, unknown>;
        let status: 'completed' | 'failed';

        try {
          if (isDelegate) {
            if (!mayDelegate) {
              result = { error: `agent ${config.agentId} is not allowed to delegate` };
              status = 'failed';
            } else {
              const del = await this.handleDelegate(config, toolCall.arguments, depth);
              result = del.result;
              status = del.status;
            }
          } else if (allowedToolSet && !allowedToolSet.has(toolCall.name)) {
            result = {
              error: `tool ${toolCall.name} is not in the allowlist for agent ${config.agentId}`,
            };
            status = 'failed';
          } else {
            const capResult = await this.capabilities.invoke(toolCall.name, toolCall.arguments);
            result = capResult.result;
            status = capResult.status;
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'unknown error' };
          status = 'failed';
        }

        this.eventBus.emit({
          type: 'tool.end',
          run_id: runId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          status,
          result,
        });

        await this.eventStore.append({
          session_id: sessionId,
          run_id: runId,
          type: 'tool.end',
          payload: { tool_call_id: toolCall.id, name: toolCall.name, status, result },
        });

        messages.push({
          role: 'tool_result',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }

      if (signal?.aborted) {
        state = await transition('cancel');
        return end('cancelled');
      }

      // Return to running from whichever waiting state we are in
      if (state === 'waiting_child') {
        state = await transition('child_complete');
      } else if (state === 'waiting_tool') {
        state = await transition('tool_complete');
      }

      this.eventBus.emit({ type: 'turn.end', run_id: runId, turn });
    }

    // Max turns reached
    state = await transition('complete');
    return end('max_turns');
  }

  /**
   * Built-in runtime.delegate: plan → fan-out child runs → merge.
   * Does NOT go through the Python capability bridge.
   */
  private async handleDelegate(
    config: AgentLoopConfig,
    args: Record<string, unknown>,
    parentDepth: number,
  ): Promise<{ status: 'completed' | 'failed'; result: Record<string, unknown> }> {
    if (!this.startChildRun) {
      return {
        status: 'failed',
        result: { error: 'runtime.delegate is not enabled on this runtime' },
      };
    }

    const rawTasks = args.tasks;
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
      return {
        status: 'failed',
        result: { error: 'runtime.delegate requires a non-empty tasks array' },
      };
    }

    const tasks: DelegateTaskArg[] = rawTasks.map((t) => {
      const item = t as Record<string, unknown>;
      return {
        to_agent_id: String(item.to_agent_id ?? item.toAgentId ?? ''),
        goal: String(item.goal ?? ''),
        system_prompt: item.system_prompt != null ? String(item.system_prompt) : undefined,
        grant_ids: Array.isArray(item.grant_ids)
          ? item.grant_ids.map(String)
          : Array.isArray(item.grantIds)
            ? item.grantIds.map(String)
            : [],
        constraints: Array.isArray(item.constraints) ? item.constraints.map(String) : [],
      };
    });

    for (const t of tasks) {
      if (!t.to_agent_id || !t.goal) {
        return {
          status: 'failed',
          result: { error: 'each task requires to_agent_id and goal' },
        };
      }
      if (!canDelegateTo(config.agentId, t.to_agent_id)) {
        return {
          status: 'failed',
          result: {
            error: `agent ${config.agentId} is not allowed to delegate to ${t.to_agent_id}`,
          },
        };
      }
    }

    const plans = planDelegations({
      fromRunId: config.runId,
      tasks: tasks.map((t) => ({
        toAgentId: t.to_agent_id,
        goal: t.goal,
        grantIds: t.grant_ids ?? [],
        constraints: t.constraints,
      })),
    });

    await this.eventStore.append({
      session_id: config.sessionId,
      run_id: config.runId,
      type: 'delegation.planned',
      payload: {
        parent_run_id: config.runId,
        count: plans.length,
        plans,
      },
    });

    // Fan-out: run all children in parallel
    const childResults = await Promise.all(
      tasks.map(async (task, i) => {
        const plan = plans[i];

        this.eventBus.emit({
          type: 'delegation.start',
          run_id: config.runId,
          delegation_id: plan.delegation_id,
          to_agent_id: task.to_agent_id,
          goal: task.goal,
        });

        await this.eventStore.append({
          session_id: config.sessionId,
          run_id: config.runId,
          type: 'delegation.start',
          payload: {
            delegation_id: plan.delegation_id,
            to_agent_id: task.to_agent_id,
            goal: task.goal,
            context_grants: plan.context_grants,
          },
        });

        // Grants can further restrict child tools (intersection with catalog)
        const grantTools = toolAllowlistFromGrants(task.grant_ids);
        const childCatalog = resolveToolAllowlist(task.to_agent_id);
        let childAllow: string[] | null = null;
        if (grantTools && childCatalog && childCatalog !== '*') {
          const catalogSet = new Set(childCatalog);
          childAllow = grantTools.filter((t) => catalogSet.has(t));
        } else if (grantTools) {
          childAllow = grantTools;
        }

        const child = await this.startChildRun!({
          sessionId: config.sessionId,
          parentRunId: config.runId,
          agentId: task.to_agent_id,
          systemPrompt: task.system_prompt ?? defaultSystemPrompt(task.to_agent_id),
          userMessage: task.goal,
          grantIds: task.grant_ids ?? [],
          toolAllowlist: childAllow,
          depth: parentDepth + 1,
          signal: config.signal,
        });

        const childStatus: 'completed' | 'failed' =
          child.finalState === 'completed' ? 'completed' : 'failed';

        this.eventBus.emit({
          type: 'delegation.end',
          run_id: config.runId,
          delegation_id: plan.delegation_id,
          child_run_id: child.runId,
          status: childStatus,
        });

        await this.eventStore.append({
          session_id: config.sessionId,
          run_id: config.runId,
          type: 'delegation.end',
          payload: {
            delegation_id: plan.delegation_id,
            child_run_id: child.runId,
            status: childStatus,
            summary: child.summary,
            artifact_ref: child.artifactRef,
          },
        });

        return {
          run_id: child.runId,
          artifact_ref: child.artifactRef,
          status: childStatus,
          summary: child.summary,
          agent_id: task.to_agent_id,
          delegation_id: plan.delegation_id,
        };
      }),
    );

    const mergeInputs: ChildResultInput[] = childResults.map((c) => ({
      run_id: c.run_id,
      artifact_ref: c.artifact_ref,
      status: c.status,
    }));
    const merged = mergeChildResults(mergeInputs);

    const status: 'completed' | 'failed' =
      merged.failed === merged.child_count && merged.child_count > 0 ? 'failed' : 'completed';

    return {
      status,
      result: {
        ...merged,
        children: childResults,
      },
    };
  }
}
