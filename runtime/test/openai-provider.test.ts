import { describe, expect, it, vi } from 'vitest';

import { OpenAICompatibleProvider } from '../src/agent/openai-provider.js';

function makeProvider(fetchImpl: typeof fetch): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    baseUrl: 'https://llm.example.com/v1/',
    apiKey: 'sk-test',
    model: 'test-model',
    fetchImpl,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAICompatibleProvider', () => {
  it('converts tool_result → tool and assistant tool_calls to the OpenAI wire shape', async () => {
    let captured: { messages: unknown[]; tools: unknown[] };
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse({
        choices: [
          {
            message: {
              content: 'done',
              tool_calls: [
                { id: 'tc-1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } },
              ],
            },
          },
        ],
      });
    });

    const provider = makeProvider(fetchImpl);
    const res = await provider.complete(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc-0', name: 'search', arguments: { q: 'a' } }] },
        { role: 'tool_result', content: '{"results":[]}', tool_call_id: 'tc-0' },
      ],
      [{ name: 'search', description: 'd', parameters: { type: 'object' } }]
    );

    // Request translation
    expect(captured.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc-0', type: 'function', function: { name: 'search', arguments: '{"q":"a"}' } }],
    });
    expect(captured.messages[3]).toEqual({ role: 'tool', content: '{"results":[]}', tool_call_id: 'tc-0' });
    expect(captured.tools[0]).toEqual({
      type: 'function',
      function: { name: 'search', description: 'd', parameters: { type: 'object' } },
    });

    // Response parsed back to the internal flat shape
    expect(res.role).toBe('assistant');
    expect(res.content).toBe('done');
    expect(res.tool_calls).toEqual([{ id: 'tc-1', name: 'search', arguments: { q: 'x' } }]);
  });

  it('encodes HTTP errors into the message instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'rate limited' } }, 429));
    const provider = makeProvider(fetchImpl);
    const res = await provider.complete([{ role: 'user', content: 'hi' }], []);
    expect(res.role).toBe('assistant');
    expect(res.content).toContain('rate limited');
    expect(res.tool_calls).toBeUndefined();
  });

  it('encodes network errors instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = makeProvider(fetchImpl);
    const res = await provider.complete([{ role: 'user', content: 'hi' }], []);
    expect(res.content).toContain('ECONNREFUSED');
  });

  it('handles an empty-choices response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [] }));
    const provider = makeProvider(fetchImpl);
    const res = await provider.complete([{ role: 'user', content: 'hi' }], []);
    expect(res.content).toContain('no choices');
  });
});
