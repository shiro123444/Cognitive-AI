/**
 * Agent Loop — drives a single Run through LLM calls and tool execution.
 *
 * Design follows pi's agent-loop pattern:
 * - Outer loop processes turns until no more tool calls or stop condition
 * - Each turn: stream LLM response → extract tool calls → execute → emit events
 * - FSM transitions are emitted as events into the EventStore
 * - Tools are resolved via CapabilityClient (Python bridge)
 */

import { randomUUID } from 'node:crypto';

import type { CapabilityClient, CapabilityDescriptor } from './capability-client.js';
import type { EventBus } from '../core/event-bus.js';
import type { EventStore } from '../persistence/event-store.js';
import type { RunAction, RunState } from '../core/runtime-types.js';
import { nextRunState } from '../core/run-service.js';

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
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface AgentLoopDeps {
  provider: LlmProvider;
  capabilities: CapabilityClient;
  eventStore: EventStore;
  eventBus: EventBus<AgentLoopEvent>;
}

// --- Implementation ---

export class AgentLoop {
  private readonly provider: LlmProvider;
  private readonly capabilities: CapabilityClient;
  private readonly eventStore: EventStore;
  private readonly eventBus: EventBus<AgentLoopEvent>;

  constructor(deps: AgentLoopDeps) {
    this.provider = deps.provider;
    this.capabilities = deps.capabilities;
    this.eventStore = deps.eventStore;
    this.eventBus = deps.eventBus;
  }

  /**
   * Execute a full agent run. Drives the FSM from 'queued' through to terminal state.
   */
  async execute(config: AgentLoopConfig): Promise<RunState> {
    const { sessionId, runId, signal, maxTurns = 20 } = config;

    let state: RunState = 'queued';

    const transition = async (action: RunAction): Promise<RunState> => {
      const from = state;
      state = nextRunState(state, action);
      const event: AgentLoopEvent = { type: 'run.state_changed', run_id: runId, from, to: state, action };
      this.eventBus.emit(event);
      await this.eventStore.append({
        session_id: sessionId,
        run_id: runId,
        type: 'run.state_changed',
        payload: { from, to: state, action },
      });
      return state;
    };

    // Start the run
    await transition('start');

    // Discover available tools
    let toolDefs: LlmToolDef[];
    let capabilityMap: Map<string, CapabilityDescriptor>;
    try {
      const capabilities = await this.capabilities.discover();
      capabilityMap = new Map(capabilities.map((c) => [c.capability_id, c]));
      toolDefs = capabilities.map((c) => ({
        name: c.capability_id,
        description: c.description,
        parameters: c.input_schema,
      }));
    } catch (err) {
      await transition('fail');
      this.eventBus.emit({ type: 'agent.end', run_id: runId, reason: 'failed' });
      return state;
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
        await transition('cancel');
        this.eventBus.emit({ type: 'agent.end', run_id: runId, reason: 'cancelled' });
        return state;
      }

      turn++;
      this.eventBus.emit({ type: 'turn.start', run_id: runId, turn });

      // LLM call
      const assistantMessage = await this.provider.complete(messages, toolDefs, signal);
      messages.push(assistantMessage);

      await this.eventStore.append({
        session_id: sessionId,
        run_id: runId,
        type: 'llm.response',
        payload: { role: assistantMessage.role, content: assistantMessage.content, tool_calls: assistantMessage.tool_calls ?? null },
      });
      this.eventBus.emit({ type: 'llm.response', run_id: runId, message: assistantMessage });

      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls — agent is done
        this.eventBus.emit({ type: 'turn.end', run_id: runId, turn });
        await transition('complete');
        this.eventBus.emit({ type: 'agent.end', run_id: runId, reason: 'completed' });
        return state;
      }

      // Execute tool calls
      await transition('wait_tool');

      for (const toolCall of toolCalls) {
        if (signal?.aborted) break;

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
          const capResult = await this.capabilities.invoke(toolCall.name, toolCall.arguments);
          result = capResult.result;
          status = capResult.status;
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

        // Add tool result to message history
        messages.push({
          role: 'tool_result',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }

      // Tool execution complete, back to running
      if (signal?.aborted) {
        await transition('cancel');
        this.eventBus.emit({ type: 'agent.end', run_id: runId, reason: 'cancelled' });
        return state;
      }

      await transition('tool_complete');
      this.eventBus.emit({ type: 'turn.end', run_id: runId, turn });
    }

    // Max turns reached
    await transition('complete');
    this.eventBus.emit({ type: 'agent.end', run_id: runId, reason: 'max_turns' });
    return state;
  }
}
