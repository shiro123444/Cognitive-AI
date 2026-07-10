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
 * OpenAI-compatible providers (DeepSeek, some gateways) require tool names to
 * match `^[a-zA-Z0-9_-]+$`. Our catalog uses dotted ids (`runtime.echo`,
 * `runtime.delegate`). Encode dots for the wire format and restore them on
 * the response so the agent loop keeps stable internal names.
 */
export function toWireToolName(name: string): string {
  return name.replace(/\./g, '__');
}

export function fromWireToolName(wire: string, known?: ReadonlyMap<string, string>): string {
  if (known?.has(wire)) return known.get(wire)!;
  // Fallback for models that echo our encoding without a map hit.
  return wire.includes('__') ? wire.replace(/__/g, '.') : wire;
}

function buildWireNameMap(tools: LlmToolDef[], messages: LlmMessage[]): Map<string, string> {
  const wireToOriginal = new Map<string, string>();
  const register = (name: string) => {
    const wire = toWireToolName(name);
    wireToOriginal.set(wire, name);
  };
  for (const t of tools) register(t.name);
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) register(tc.name);
    }
  }
  return wireToOriginal;
}

/**
 * OpenAI-compatible LLM provider. Works with OpenAI, NVIDIA NIM, Xiaomi MiMo,
 * Ollama /v1, DeepSeek, etc. Uses native fetch — no SDK dependency.
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
    const wireMap = buildWireNameMap(tools, messages);
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => toOpenAIMessage(m, wireMap)),
    };
    if (tools.length > 0) {
      body.tools = tools.map((t) => toOpenAITool(t, wireMap));
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
      ? choice.tool_calls.map((raw) => parseToolCall(raw, wireMap))
      : undefined;

    return {
      role: 'assistant',
      content: typeof choice.content === 'string' ? choice.content : '',
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

function toOpenAIMessage(msg: LlmMessage, wireMap: ReadonlyMap<string, string>): OpenAIChatMessage {
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
        function: {
          name: toWireToolName(tc.name),
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}

function toOpenAITool(
  tool: LlmToolDef,
  _wireMap: ReadonlyMap<string, string>,
): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: toWireToolName(tool.name),
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function parseToolCall(
  raw: OpenAIToolCall,
  wireMap: ReadonlyMap<string, string>,
): { id: string; name: string; arguments: Record<string, unknown> } {
  let parsedArgs: Record<string, unknown> = {};
  const rawArgs = raw.function.arguments;
  try {
    parsedArgs =
      typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs as Record<string, unknown>);
  } catch {
    parsedArgs = {};
  }
  return {
    id: raw.id,
    name: fromWireToolName(raw.function.name, wireMap),
    arguments: parsedArgs,
  };
}

function errorMessage(text: string): LlmMessage {
  return { role: 'assistant', content: `[runtime llm error] ${text}` };
}
