import type { LlmMessage, LlmProvider, LlmToolDef } from './agent-loop.js';

export interface OpenAIProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional fetch override (for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: OpenAIToolCall[] };
  }>;
  error?: { message?: string };
}

/**
 * OpenAI-compatible LLM provider. Works with OpenAI, NVIDIA NIM, Xiaomi MiMo,
 * Ollama /v1, etc. Uses native fetch — no SDK dependency.
 *
 * Adapts the runtime's internal LlmMessage shape (role 'tool_result', flat
 * tool_calls) to the OpenAI wire format (role 'tool', nested function calls).
 * Per the LlmProvider contract, model/request errors are encoded into the
 * returned message rather than thrown, so the agent loop never crashes on a
 * provider failure.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async complete(messages: LlmMessage[], tools: LlmToolDef[], signal?: AbortSignal): Promise<LlmMessage> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toOpenAIMessage),
    };
    if (tools.length > 0) {
      body.tools = tools.map(toOpenAITool);
      body.tool_choice = 'auto';
    }

    let data: OpenAIChatResponse;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      data = (await res.json()) as OpenAIChatResponse;
      if (!res.ok) {
        return errorMessage(data?.error?.message || `LLM HTTP ${res.status}`);
      }
    } catch (err) {
      const text = signal?.aborted
        ? 'request aborted'
        : err instanceof Error
          ? err.message
          : 'LLM request failed';
      return errorMessage(text);
    }

    const choice = data.choices?.[0]?.message;
    if (!choice) {
      return errorMessage('LLM returned no choices');
    }

    const toolCalls = Array.isArray(choice.tool_calls)
      ? choice.tool_calls.map(parseToolCall)
      : undefined;

    return {
      role: 'assistant',
      content: typeof choice.content === 'string' ? choice.content : '',
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

function toOpenAIMessage(msg: LlmMessage): OpenAIChatMessage {
  if (msg.role === 'tool_result') {
    return { role: 'tool', content: msg.content, tool_call_id: msg.tool_call_id };
  }
  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}

function toOpenAITool(tool: LlmToolDef): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

function parseToolCall(raw: OpenAIToolCall): { id: string; name: string; arguments: Record<string, unknown> } {
  let parsedArgs: Record<string, unknown> = {};
  const rawArgs = raw.function.arguments;
  try {
    parsedArgs =
      typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs as Record<string, unknown>);
  } catch {
    parsedArgs = {};
  }
  return { id: raw.id, name: raw.function.name, arguments: parsedArgs };
}

function errorMessage(text: string): LlmMessage {
  return { role: 'assistant', content: `[runtime llm error] ${text}` };
}
