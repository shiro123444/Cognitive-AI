import type { LlmMessage, LlmProvider, LlmToolDef } from './agent-loop.js';

/**
 * Faux LLM provider for testing. Returns canned responses in sequence.
 */
export class FauxProvider implements LlmProvider {
  private responses: LlmMessage[];
  private index = 0;

  constructor(responses: LlmMessage[]) {
    this.responses = responses;
  }

  async complete(_messages: LlmMessage[], _tools: LlmToolDef[]): Promise<LlmMessage> {
    const response = this.responses[this.index];
    if (!response) {
      return { role: 'assistant', content: 'No more canned responses.' };
    }
    this.index++;
    return response;
  }

  /** Create a provider that always returns a text response (no tool calls). */
  static text(content: string): FauxProvider {
    return new FauxProvider([{ role: 'assistant', content }]);
  }

  /** Create a provider that calls a tool on first turn, then returns text. */
  static withToolCall(toolName: string, args: Record<string, unknown>, finalText: string): FauxProvider {
    return new FauxProvider([
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc-faux', name: toolName, arguments: args }] },
      { role: 'assistant', content: finalText },
    ]);
  }
}
