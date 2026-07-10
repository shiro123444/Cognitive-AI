import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createRuntimeDb } from '../src/persistence/db.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { RuntimeService } from '../src/core/runtime-service.js';
import type { AgentLoopEvent, LlmMessage, LlmProvider, LlmToolDef } from '../src/agent/agent-loop.js';
import { DELEGATE_TOOL_NAME } from '../src/agent/agent-loop.js';

/**
 * Provider that behaves differently per agent role.
 *
 * Supervisor: first complete() → runtime.delegate with 2 tasks;
 *             second complete() → final text after merge.
 * Child agents: complete() → final text (no tools).
 */
function createSupervisorProvider(): LlmProvider {
  const callCounts = new Map<string, number>();

  return {
    async complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmMessage> {
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const user = messages.find((m) => m.role === 'user')?.content ?? '';
      const key = `${system}::${user}`;
      const n = (callCounts.get(key) ?? 0) + 1;
      callCounts.set(key, n);

      const canDelegate = tools.some((t) => t.name === DELEGATE_TOOL_NAME);

      if (canDelegate && n === 1 && system.toLowerCase().includes('supervisor')) {
        return {
          role: 'assistant',
          content: 'I will split this into two sub-tasks.',
          tool_calls: [
            {
              id: 'tc-delegate-1',
              name: DELEGATE_TOOL_NAME,
              arguments: {
                tasks: [
                  {
                    to_agent_id: 'document-analyst',
                    goal: 'Summarize the course materials on EEG alpha waves',
                    grant_ids: ['tool:search_materials', 'tool:search_concept_graph'],
                  },
                  {
                    to_agent_id: 'graph-explorer',
                    goal: 'Map concept relations for alpha band power',
                    grant_ids: ['tool:search_concept_graph'],
                  },
                ],
              },
            },
          ],
        };
      }

      if (canDelegate && n >= 2) {
        const toolResults = messages.filter((m) => m.role === 'tool_result');
        const lastTool = toolResults[toolResults.length - 1]?.content ?? '{}';
        return {
          role: 'assistant',
          content: `Supervisor merged child results: ${lastTool.slice(0, 200)}`,
        };
      }

      // Child agents: answer the goal directly
      const role = system.includes('document-analyst')
        ? 'document-analyst'
        : system.includes('graph-explorer')
          ? 'graph-explorer'
          : 'agent';
      return {
        role: 'assistant',
        content: `Child[${role}] done: ${user}`,
      };
    },
  };
}

function installCapabilityMock(extraCaps: Array<{ capability_id: string }> = []) {
  const originalFetch = globalThis.fetch;
  const baseCaps = [
    {
      capability_id: 'runtime.echo',
      kind: 'tool',
      description: 'Echo',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    {
      capability_id: 'search_materials',
      kind: 'tool',
      description: 'Search materials',
      input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    },
    {
      capability_id: 'search_concept_graph',
      kind: 'tool',
      description: 'Search concept graph',
      input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    },
    {
      capability_id: 'collect_edu_data',
      kind: 'tool',
      description: 'Collect edu data',
      input_schema: { type: 'object', properties: {} },
    },
    ...extraCaps.map((c) => ({
      capability_id: c.capability_id,
      kind: 'tool',
      description: c.capability_id,
      input_schema: { type: 'object', properties: {} },
    })),
  ];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/runtime/capabilities/invoke')) {
      const body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          status: 'completed',
          result: { ok: true, capability_id: body.capability_id },
          events: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/runtime/capabilities')) {
      return new Response(JSON.stringify({ capabilities: baseCaps }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return originalFetch;
}

describe('P1.5 multi-agent auto scheduling', () => {
  it('supervisor fans out 2 child runs via runtime.delegate and merges results', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const originalFetch = installCapabilityMock();

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux',
        provider: createSupervisorProvider(),
      });

      const session = await runtime.sessions.create({ participants: ['user:test'] });
      const events: AgentLoopEvent[] = [];
      runtime.eventBus.subscribe((e) => events.push(e));

      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'supervisor',
        systemPrompt: 'You are a supervisor agent. Split work across specialists.',
        userMessage: 'Prepare an EEG alpha-wave teaching brief.',
      });

      expect(result.finalState).toBe('completed');
      expect(result.summary).toMatch(/Supervisor merged child results/);

      // FSM: parent must pass through waiting_child
      const parentStateChanges = events.filter(
        (e) => e.type === 'run.state_changed' && e.run_id === result.runId,
      );
      const parentStates = parentStateChanges.map(
        (e) => (e as Extract<AgentLoopEvent, { type: 'run.state_changed' }>).to,
      );
      expect(parentStates).toContain('waiting_child');
      expect(parentStates[parentStates.length - 1]).toBe('completed');

      // Delegation events
      const delStarts = events.filter((e) => e.type === 'delegation.start');
      const delEnds = events.filter((e) => e.type === 'delegation.end');
      expect(delStarts).toHaveLength(2);
      expect(delEnds).toHaveLength(2);
      expect(
        delStarts
          .map((e) => (e as Extract<AgentLoopEvent, { type: 'delegation.start' }>).to_agent_id)
          .sort(),
      ).toEqual(['document-analyst', 'graph-explorer']);
      expect(
        delEnds.every(
          (e) => (e as Extract<AgentLoopEvent, { type: 'delegation.end' }>).status === 'completed',
        ),
      ).toBe(true);

      // Three agent.end events: 2 children + 1 parent
      const ends = events.filter((e) => e.type === 'agent.end');
      expect(ends).toHaveLength(3);

      // Child run ids must differ from parent and each other
      const childRunIds = delEnds.map(
        (e) => (e as Extract<AgentLoopEvent, { type: 'delegation.end' }>).child_run_id,
      );
      expect(new Set(childRunIds)).toHaveLength(2);
      expect(childRunIds.every((id) => id !== result.runId)).toBe(true);

      // Persisted events include delegation.planned + start/end
      const stored = await runtime.sessions.getEvents(session.session_id, 0);
      const types = stored.map((e) => e.type);
      expect(types).toContain('delegation.planned');
      expect(types.filter((t) => t === 'delegation.start')).toHaveLength(2);
      expect(types.filter((t) => t === 'delegation.end')).toHaveLength(2);

      // Parent tool.end result should carry merged output_refs
      const parentToolEnds = stored.filter(
        (e) => e.run_id === result.runId && e.type === 'tool.end',
      );
      expect(parentToolEnds.length).toBeGreaterThanOrEqual(1);
      const mergePayload = parentToolEnds[0].payload as {
        result: { completed: number; failed: number; output_refs: string[]; child_count: number };
      };
      expect(mergePayload.result.child_count).toBe(2);
      expect(mergePayload.result.completed).toBe(2);
      expect(mergePayload.result.failed).toBe(0);
      expect(mergePayload.result.output_refs).toHaveLength(2);
      expect(mergePayload.result.output_refs.every((r) => r.startsWith('run:'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('does not offer runtime.delegate when maxDepth blocks children', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const originalFetch = installCapabilityMock();

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux',
        maxDepth: 1,
        provider: {
          async complete(_messages, tools): Promise<LlmMessage> {
            const canDelegate = tools.some((t) => t.name === DELEGATE_TOOL_NAME);
            if (canDelegate) {
              return {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'tc-d',
                    name: DELEGATE_TOOL_NAME,
                    arguments: {
                      tasks: [{ to_agent_id: 'document-analyst', goal: 'should not run' }],
                    },
                  },
                ],
              };
            }
            return { role: 'assistant', content: 'root done without delegate tool' };
          },
        },
      });

      const session = await runtime.sessions.create({ participants: ['user:test'] });
      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'supervisor',
        systemPrompt: 'You are a supervisor agent.',
        userMessage: 'try to go deep',
      });

      expect(result.finalState).toBe('completed');
      expect(result.summary).toMatch(/without delegate/);
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('startChildRun records parent_run_id in state change payload', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const originalFetch = installCapabilityMock();

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux',
        provider: createSupervisorProvider(),
      });

      const session = await runtime.sessions.create({ participants: ['user:test'] });
      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'supervisor',
        systemPrompt: 'You are a supervisor agent.',
        userMessage: 'split work',
      });

      const stored = await runtime.sessions.getEvents(session.session_id, 0);
      const childStateStarts = stored.filter(
        (e) =>
          e.type === 'run.state_changed' &&
          e.run_id !== result.runId &&
          (e.payload as { action?: string }).action === 'start',
      );
      expect(childStateStarts.length).toBeGreaterThanOrEqual(2);
      for (const ev of childStateStarts) {
        expect((ev.payload as { parent_run_id: string }).parent_run_id).toBe(result.runId);
        expect((ev.payload as { depth: number }).depth).toBe(1);
      }
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('scopes child tools by agent catalog (tutor cannot call collect_edu_data)', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const originalFetch = installCapabilityMock();
    const seenTools: string[][] = [];

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux',
        provider: {
          async complete(messages, tools): Promise<LlmMessage> {
            const system = messages.find((m) => m.role === 'system')?.content ?? '';
            seenTools.push(tools.map((t) => t.name).sort());

            if (system.toLowerCase().includes('supervisor') && tools.some((t) => t.name === DELEGATE_TOOL_NAME)) {
              // Only first supervisor turn delegates
              const alreadyDelegated = messages.some((m) => m.role === 'tool_result');
              if (!alreadyDelegated) {
                return {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'tc-d',
                      name: DELEGATE_TOOL_NAME,
                      arguments: {
                        tasks: [{ to_agent_id: 'tutor', goal: 'answer a student question' }],
                      },
                    },
                  ],
                };
              }
              return { role: 'assistant', content: 'supervisor done' };
            }

            // Child tutor: try a forbidden tool then finish
            if (system.includes('tutor') || system.includes('course tutor')) {
              const tried = messages.some((m) => m.role === 'tool_result');
              if (!tried && tools.some((t) => t.name === 'collect_edu_data')) {
                // Should not happen — catalog must hide this tool
                return {
                  role: 'assistant',
                  content: '',
                  tool_calls: [{ id: 'tc-bad', name: 'collect_edu_data', arguments: {} }],
                };
              }
              return { role: 'assistant', content: 'tutor answer' };
            }

            return { role: 'assistant', content: 'ok' };
          },
        },
      });

      const session = await runtime.sessions.create({ participants: ['user:test'] });
      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'supervisor',
        systemPrompt: 'You are a supervisor agent.',
        userMessage: 'help a student',
      });

      expect(result.finalState).toBe('completed');

      // At least one complete() saw tutor-scoped tools without collect_edu_data
      const tutorToolsets = seenTools.filter(
        (names) => names.includes('search_materials') && !names.includes(DELEGATE_TOOL_NAME),
      );
      expect(tutorToolsets.length).toBeGreaterThanOrEqual(1);
      for (const names of tutorToolsets) {
        expect(names).not.toContain('collect_edu_data');
        expect(names).toContain('search_materials');
      }
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });

  it('rejects specialist agents that try to call runtime.delegate', async () => {
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    const pool = new adapter.Pool();
    const db = createRuntimeDb({ pool });
    await migrateRuntimeDb(db);

    const originalFetch = installCapabilityMock();

    try {
      const runtime = new RuntimeService({
        db,
        capabilityBaseUrl: 'http://faux',
        provider: {
          async complete(_messages, tools): Promise<LlmMessage> {
            // Tutor must not see delegate; if it somehow calls it, loop rejects
            if (tools.some((t) => t.name === DELEGATE_TOOL_NAME)) {
              return {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'tc',
                    name: DELEGATE_TOOL_NAME,
                    arguments: { tasks: [{ to_agent_id: 'graph-explorer', goal: 'x' }] },
                  },
                ],
              };
            }
            return { role: 'assistant', content: 'tutor without delegate' };
          },
        },
      });

      const session = await runtime.sessions.create({ participants: ['user:test'] });
      const result = await runtime.startRun({
        sessionId: session.session_id,
        agentId: 'tutor',
        systemPrompt: 'You are a course tutor.',
        userMessage: 'hi',
      });

      expect(result.finalState).toBe('completed');
      expect(result.summary).toMatch(/without delegate|tutor/);
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
    }
  });
});
