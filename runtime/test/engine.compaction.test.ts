import { describe, expect, it } from 'vitest';

import {
  compactMessages,
  digestMessages,
  estimateChars,
  shouldCompact,
} from '../src/engine/compaction.js';
import type { LlmMessage, LlmProvider } from '../src/agent/agent-loop.js';

function makeHistory(turnCount: number): LlmMessage[] {
  const msgs: LlmMessage[] = [
    { role: 'system', content: 'You are a helpful tutor.' },
    { role: 'user', content: 'Teach me about neural networks.' }
  ];
  for (let i = 0; i < turnCount; i += 1) {
    msgs.push({
      role: 'assistant',
      content: `Assistant turn ${i + 1}: explanation about topic ${i + 1}.`,
      tool_calls: [{ id: `tc-${i}`, name: 'search_materials', arguments: { q: 'topic' } }]
    });
    msgs.push({
      role: 'tool_result',
      content: `Material ${i + 1} result text — ${'x'.repeat(40)}`,
      tool_call_id: `tc-${i}`
    });
  }
  return msgs;
}

describe('engine/compaction', () => {
  it('shouldCompact returns false when history is small', () => {
    expect(shouldCompact(makeHistory(2))).toBe(false);
  });

  it('shouldCompact triggers on message count threshold', () => {
    expect(shouldCompact(makeHistory(20), { maxMessages: 30 })).toBe(true);
  });

  it('shouldCompact triggers on character budget', () => {
    const long = makeHistory(5).map((m) => ({
      ...m,
      content: m.content + 'x'.repeat(20_000)
    }));
    expect(shouldCompact(long, { maxChars: 5_000 })).toBe(true);
  });

  it('estimateChars counts content + tool calls', () => {
    const chars = estimateChars([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', tool_calls: [{ id: 'a', name: 'foo', arguments: { x: 1 } }] }
    ]);
    expect(chars).toBeGreaterThan(2 + 'hello'.length);
  });

  it('digestMessages preserves role + snippet per message', () => {
    const digest = digestMessages([
      { role: 'user', content: 'Tell me about transformers.' },
      { role: 'assistant', content: 'Transformers use self-attention.' }
    ]);
    expect(digest).toContain('[user] Tell me about transformers.');
    expect(digest).toContain('[assistant] Transformers use self-attention.');
  });

  it('compactMessages with no provider falls back to a digest summary', async () => {
    const messages = makeHistory(20);
    const result = await compactMessages(messages, null, { keepTail: 6, useLlmSummariser: false });

    expect(result.compacted).toBe(true);
    expect(result.tailCount).toBe(6);
    expect(result.summarizedCount).toBe(messages.length - 6 - 2);
    expect(result.summariser).toBe('digest');
    expect(result.messages.length).toBe(2 + 1 + 6); // head + summary + tail
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[2].role).toBe('system');
    expect(result.messages[2].content).toMatch(/compacted:/);
    expect(result.resultingChars).toBeLessThan(estimateChars(messages));
  });

  it('compactMessages returns the original messages when below the tail threshold', async () => {
    const messages = makeHistory(2);
    const result = await compactMessages(messages, null, { keepTail: 6 });

    expect(result.compacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  it('compactMessages calls the LLM provider for the summary when one is supplied', async () => {
    const messages = makeHistory(20);
    let callCount = 0;
    const provider: LlmProvider = {
      async complete(prompt) {
        callCount += 1;
        // Sanity: the summariser request uses our system prompt + user prompt
        expect(prompt[0].role).toBe('system');
        expect(prompt[0].content).toContain('compactor');
        expect(prompt[1].role).toBe('user');
        return { role: 'assistant', content: '- decision A\n- decision B\n- open question C' };
      }
    };

    const result = await compactMessages(messages, provider, { keepTail: 4 });
    expect(callCount).toBe(1);
    expect(result.summariser).toBe('llm');
    expect(result.summary).toContain('decision A');
    expect(result.tailCount).toBe(4);
    expect(result.messages[2].content).toContain('decision A');
  });

  it('compactMessages falls back to digest when the LLM provider throws', async () => {
    const messages = makeHistory(20);
    const provider: LlmProvider = {
      async complete() {
        throw new Error('rate limited');
      }
    };

    const result = await compactMessages(messages, provider, { keepTail: 4 });
    expect(result.compacted).toBe(true);
    expect(result.summariser).toBe('digest');
    expect(result.messages[2].content).toMatch(/compacted:/);
  });
});
