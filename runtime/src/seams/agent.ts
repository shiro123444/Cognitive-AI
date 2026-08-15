import type { Context } from '../cordis/context.js';
import type { LLMMessage } from './llm.js';

export interface AgentRunOptions {
  sessionId: string;
  userInput: string;
  presetId?: string;
  maxSteps?: number;
  onChunk?: (text: string) => void;
  onEvent?: (event: any) => void;
}

export class AgentLoopService {
  constructor(private ctx: Context) {}

  async runTurn(options: AgentRunOptions) {
    const { sessionId, userInput, maxSteps = 5, onChunk, onEvent } = options;
    const sessions = (this.ctx as any).sessions;
    const tools = (this.ctx as any).tools;
    const llmRegistry = (this.ctx as any).llm;
    const promptService = (this.ctx as any).systemPrompt;

    if (!sessions || !tools || !llmRegistry) {
      throw new Error('Core runtime services missing.');
    }

    // 1. turn/start
    sessions.append(sessionId, 'turn/start', { sessionId, timestamp: Date.now() });

    // 2. append user/message
    sessions.append(sessionId, 'user/message', { content: userInput });

    let stepCount = 0;
    let oweAnotherRequest = true;

    // Load full history
    const session = sessions.get(sessionId);
    const messages: LLMMessage[] = [];

    // System prompt
    const systemPrompt = await promptService.assemble(this.ctx);
    messages.push({ role: 'system', content: systemPrompt });

    // Reconstruct message history from session log
    for (const evt of session.events) {
      if (evt.type === 'user/message') {
        messages.push({ role: 'user', content: evt.payload.content });
      } else if (evt.type === 'assistant/message') {
        messages.push({
          role: 'assistant',
          content: evt.payload.content,
          tool_calls: evt.payload.tool_calls,
        });
      } else if (evt.type === 'tool/result') {
        messages.push({
          role: 'tool',
          tool_call_id: evt.payload.toolCallId,
          content: JSON.stringify(evt.payload.result),
        });
      }
    }

    // Autonomous Step Loop
    while (oweAnotherRequest && stepCount < maxSteps) {
      stepCount++;
      oweAnotherRequest = false;

      sessions.append(sessionId, 'step/start', { step: stepCount });

      const adapter = llmRegistry.get();
      const toolSchemas = tools.list().map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      // Stream LLM Request
      let assistantContent = '';
      const toolCallsMap: Record<number, { id: string; name: string; args: string }> = {};

      const stream = adapter.chatStream(messages, toolSchemas);

      for await (const chunk of stream) {
        if (chunk.delta?.content) {
          assistantContent += chunk.delta.content;
          sessions.append(sessionId, 'assistant/chunk', { delta: chunk.delta.content });
          onChunk?.(chunk.delta.content);
        }

        if (chunk.delta?.tool_calls) {
          for (const tc of chunk.delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = {
                id: tc.id || `call_${Date.now()}_${idx}`,
                name: tc.function?.name || '',
                args: '',
              };
            }
            if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].args += tc.function.arguments;
          }
        }
      }

      const finalToolCalls = Object.values(toolCallsMap).map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.args,
        },
      }));

      // Record assistant message
      sessions.append(sessionId, 'assistant/message', {
        content: assistantContent,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      });

      messages.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      });

      // Execute Tool Calls if any
      if (finalToolCalls.length > 0) {
        for (const tc of finalToolCalls) {
          let parsedArgs = {};
          try {
            parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }

          sessions.append(sessionId, 'tool/call', {
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: parsedArgs,
          });

          // Execute tool
          const result = await tools.execute(tc.function.name, parsedArgs, {
            sessionId,
            agentCtx: this.ctx,
          });

          sessions.append(sessionId, 'tool/result', {
            toolCallId: tc.id,
            toolName: tc.function.name,
            result,
          });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }

        // Autonomous chaining: tools owe another request to let model synthesize results
        oweAnotherRequest = true;
      }

      sessions.append(sessionId, 'step/end', { step: stepCount });
    }

    sessions.append(sessionId, 'turn/end', { sessionId, timestamp: Date.now() });
    return session;
  }
}

export function applyAgentLoopPlugin(ctx: Context) {
  const agentLoop = new AgentLoopService(ctx);
  return ctx.provide('agentLoop', agentLoop);
}
