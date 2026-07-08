import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createRuntimeDb } from '../src/persistence/db.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RuntimeService } from '../src/core/runtime-service.js';
import type { LlmMessage, LlmProvider, LlmToolDef, AgentLoopEvent } from '../src/agent/agent-loop.js';

/**
 * Faux LLM provider that simulates tool-calling behavior.
 * First call: requests a tool call. Second call: returns final text.
 */
function createFauxProvider(toolName: string, toolArgs: Record<string, unknown>): LlmProvider {
  let callCount = 0;
  return {
    async complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmMessage> {
      callCount++;
      if (callCount === 1) {
        // First turn: call a tool
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc-1', name: toolName, arguments: toolArgs }],
        };
      }
      // Second turn: produce final answer
      return { role: 'assistant', content: 'Done. The echo returned the text.' };
    },
  };
}

/** Faux provider that never calls tools — just responds. */
function createDirectProvider(response: string): LlmProvider {
  return {
    async complete(): Promise<LlmMessage> {
      return { role: 'assistant', content: response };
    },
  };
}

/** Faux capability server for testing without real HTTP. */
function createFauxCapabilityServer() {
  const calls: Array<{ capability_id: string; arguments: Record<string, unknown> }> = [];

  return {
    calls,
    baseUrl: 'http://faux-capability-server',
    // We'll mock fetch globally for this test
  };
}

describe('agent loop integration', () => {
  it('executes a full run: LLM → tool call → LLM → complete', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const provider = createFauxProvider('runtime.echo', { text: 'hello' });

    // Mock fetch for capability client
    const originalFetch = globalThis.fetch;
    const invokedCalls: Array<{ capability_id: string; arguments: Record<string, unknown> }> = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/runtime/capabilities/invoke')) {
        const body = JSON.parse(init?.body as string);
        invokedCalls.push(body);
        return new Response(JSON.stringify({
          status: 'completed',
          result: { text: body.arguments.text },
          events: [
            { type: 'tool.started', message: 'Echo started' },
            { type: 'tool.completed', message: 'Echo completed' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/runtime/capabilities')) {
        return new Response(JSON.stringify({
          capabilities: [{
            capability_id: 'runtime.echo',
            kind: 'tool',
            description: 'Echo text back',
            input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return originalFetch(input, init);
    };

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux-capability-server',
        provider,
      });

      // Create a session first
      const session = await runtime.sessions.create({ participants: ['user:test'] });

      // Collect events
      const events: AgentLoopEvent[] = [];
      runtime.eventBus.subscribe((e) => events.push(e));

      // Start a run
      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'tutor',
        systemPrompt: 'You are a helpful tutor.',
        userMessage: 'Echo hello for me.',
      });

      expect(result.finalState).toBe('completed');

      // Verify tool was invoked
      expect(invokedCalls).toHaveLength(1);
      expect(invokedCalls[0].capability_id).toBe('runtime.echo');
      expect(invokedCalls[0].arguments).toEqual({ text: 'hello' });

      // Verify event sequence
      const stateChanges = events.filter((e) => e.type === 'run.state_changed');
      const states = stateChanges.map((e) => (e as any).to);
      expect(states).toEqual(['running', 'waiting_tool', 'running', 'completed']);

      // Verify events were persisted
      const stored = await runtime.sessions.getEvents(session.session_id, 0);
      expect(stored.length).toBeGreaterThanOrEqual(4); // state changes + llm + tool events
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('completes immediately when LLM returns no tool calls', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const provider = createDirectProvider('The answer is 42.');

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/runtime/capabilities')) {
        return new Response(JSON.stringify({ capabilities: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const originalFetch = globalThis.fetch;
    try {
      const runtime = new RuntimeService({ db, capabilityBaseUrl: 'http://faux', provider });
      const session = await runtime.sessions.create({ participants: ['user:test'] });

      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'tutor',
        systemPrompt: 'You are a tutor.',
        userMessage: 'What is the meaning of life?',
      });

      expect(result.finalState).toBe('completed');
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('respects abort signal and transitions to cancelled', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const controller = new AbortController();
    // Abort before the run starts
    controller.abort();

    const provider: LlmProvider = {
      async complete(): Promise<LlmMessage> {
        return { role: 'assistant', content: 'should not reach here' };
      },
    };

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/runtime/capabilities')) {
        return new Response(JSON.stringify({ capabilities: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const originalFetch = globalThis.fetch;
    try {
      const runtime = new RuntimeService({ db, capabilityBaseUrl: 'http://faux', provider });
      const session = await runtime.sessions.create({ participants: ['user:test'] });

      const result = await runtime.startRun(
        {
          sessionId: session.session_id,
          agentId: 'tutor',
          systemPrompt: 'You are a tutor.',
          userMessage: 'Hello',
        },
        controller.signal,
      );

      expect(result.finalState).toBe('cancelled');
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });
});
