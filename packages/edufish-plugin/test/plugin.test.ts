import { describe, expect, it, vi } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_OPERATION,
  type EduFishInvocation,
  type EduFishOperationEvent,
  type EduFishOperationName,
  type EduFishTransport,
} from '../src/index.js';
import {
  expectPluginError,
  labOutput,
  makeInvocation,
  operationOutputs,
} from './helpers.js';

interface RecordedCall {
  operation: EduFishOperationName;
  args: Readonly<Record<string, unknown>>;
  invocation: EduFishInvocation;
}

function pluginWith(
  responder: (
    operation: EduFishOperationName,
    args: Readonly<Record<string, unknown>>,
    invocation: EduFishInvocation,
  ) => Promise<unknown>,
): {
  plugin: ReturnType<typeof createEduFishPlugin>;
  calls: RecordedCall[];
  dispose: ReturnType<typeof vi.fn>;
} {
  const calls: RecordedCall[] = [];
  const dispose = vi.fn();
  const transport: EduFishTransport = {
    async invoke(operation, args, invocation) {
      calls.push({ operation, args, invocation });
      return responder(operation, args, invocation);
    },
    dispose,
  };
  const plugin = createEduFishPlugin({ transport });
  return { plugin, calls, dispose };
}

const writeInvocation = (requestId = 'request-1'): EduFishInvocation =>
  makeInvocation({ requestId });

describe('plugin operation execution', () => {
  it('executes all eight operations through the injected transport', async () => {
    const { plugin, calls } = pluginWith(async (operation) => {
      return operationOutputs[operation];
    });

    const cases: Array<{
      operation: EduFishOperationName;
      args: Record<string, unknown>;
      invocation: EduFishInvocation;
    }> = [
      {
        operation: EDUFISH_OPERATION.courseRead,
        args: { course_id: 'course-1' },
        invocation: makeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.materialSearch,
        args: { course_id: 'course-1', query: 'memory', limit: 3 },
        invocation: makeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.graphNeighborhood,
        args: { course_id: 'course-1', depth: 2, limit: 10 },
        invocation: makeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.quizRead,
        args: { course_id: 'course-1', chapter_id: 'chapter-1', limit: 5 },
        invocation: makeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.quizSubmit,
        args: {
          course_id: 'course-1',
          chapter_id: 'chapter-1',
          answers: [{ quiz_id: 'quiz-1', answer: 'working memory' }],
        },
        invocation: writeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.progressRead,
        args: { course_id: 'course-1' },
        invocation: makeInvocation(),
      },
      {
        operation: EDUFISH_OPERATION.labStart,
        args: {
          course_id: 'course-1',
          template_id: 'template-1',
          params: { seed: 42 },
        },
        invocation: writeInvocation('request-2'),
      },
      {
        operation: EDUFISH_OPERATION.labStatus,
        args: { course_id: 'course-1', run_id: 'run-1' },
        invocation: makeInvocation(),
      },
    ];

    for (const testCase of cases) {
      const result = await plugin.invoke(
        testCase.operation,
        testCase.args,
        testCase.invocation,
      );
      expect(result).toEqual(operationOutputs[testCase.operation]);
    }

    expect(calls.map((call) => call.operation)).toEqual(
      cases.map((testCase) => testCase.operation),
    );
    expect(calls[1]?.args).toEqual({
      course_id: 'course-1',
      query: 'memory',
      limit: 3,
    });
    expect(calls[6]?.invocation.requestId).toBe('request-2');
    expect(calls[6]?.invocation.scope).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('applies documented defaults before invoking the transport', async () => {
    const { plugin, calls } = pluginWith(
      async (operation) => operationOutputs[operation],
    );

    await plugin.invoke(
      EDUFISH_OPERATION.materialSearch,
      { course_id: 'course-1', query: 'attention' },
      makeInvocation(),
    );
    await plugin.invoke(
      EDUFISH_OPERATION.graphNeighborhood,
      { course_id: 'course-1' },
      makeInvocation(),
    );
    await plugin.invoke(
      EDUFISH_OPERATION.quizRead,
      { course_id: 'course-1', chapter_id: 'chapter-1' },
      makeInvocation(),
    );

    expect(calls[0]?.args.limit).toBe(20);
    expect(calls[1]?.args.depth).toBe(1);
    expect(calls[1]?.args.limit).toBe(50);
    expect(calls[2]?.args.limit).toBe(20);
  });

  it('emits redacted started/completed events', async () => {
    const events: EduFishOperationEvent[] = [];
    let clock = Date.parse('2026-10-26T10:00:00Z');
    const transport: EduFishTransport = {
      async invoke() {
        clock += 25;
        return operationOutputs['edufish.quiz.submit'];
      },
    };
    const plugin = createEduFishPlugin({
      transport,
      now: () => clock,
    });

    await plugin.invoke(
      EDUFISH_OPERATION.quizSubmit,
      {
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'TOP-SECRET-ANSWER' }],
      },
      makeInvocation({
        requestId: 'request-events',
        onEvent: (event) => {
          events.push(event);
        },
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'completed',
    ]);
    expect(events[0]).toMatchObject({
      operation: EDUFISH_OPERATION.quizSubmit,
      requestId: 'request-events',
      sessionId: 'session-1',
      timestamp: '2026-10-26T10:00:00.000Z',
    });
    expect(events[1]).toMatchObject({
      operation: EDUFISH_OPERATION.quizSubmit,
      requestId: 'request-events',
      durationMs: 25,
    });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('TOP-SECRET-ANSWER');
    expect(serialized).not.toContain('user-1');
    expect(serialized).not.toContain('Bearer');
  });

  it('emits a failed event with only an error code', async () => {
    const events: EduFishOperationEvent[] = [];
    const { plugin } = pluginWith(async () => {
      throw new Error('token=RAW-SECRET /etc/passwd');
    });

    const error = await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation({
          requestId: 'request-failed',
          onEvent: (event) => {
            events.push(event);
          },
        }),
      ),
      'TRANSPORT_ERROR',
    );

    expect(error.message).not.toContain('RAW-SECRET');
    expect(error.message).toBe(
      'Transport failed while invoking edufish.course.read.',
    );
    expect(events.map((event) => event.type)).toEqual([
      'started',
      'failed',
    ]);
    expect(events[1]).toMatchObject({
      type: 'failed',
      errorCode: 'TRANSPORT_ERROR',
      requestId: 'request-failed',
    });
    expect(JSON.stringify(events)).not.toContain('RAW-SECRET');
  });

  it('rejects malformed operation outputs without echoing values', async () => {
    const { plugin } = pluginWith(async () => ({
      items: [
        {
          id: 'quiz-1',
          prompt: 'Question?',
          answer: 'LEAKED-ANSWER',
        },
      ],
    }));

    const error = await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.quizRead,
        { course_id: 'course-1', chapter_id: 'chapter-1' },
        makeInvocation(),
      ),
      'INVALID_OUTPUT',
    );

    expect(error.operation).toBe(EDUFISH_OPERATION.quizRead);
    expect(error.message).not.toContain('LEAKED-ANSWER');
  });

  it('rejects unknown operations without calling the transport', async () => {
    const { plugin, calls } = pluginWith(
      async () => operationOutputs['edufish.course.read'],
    );
    await expectPluginError(
      plugin.invoke('edufish.unknown', {}, makeInvocation()),
      'UNKNOWN_OPERATION',
    );
    expect(calls).toHaveLength(0);
  });

  it('shields operation results from a throwing event sink', async () => {
    const { plugin } = pluginWith(
      async () => operationOutputs['edufish.course.read'],
    );

    await expect(
      plugin.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation({
          onEvent: () => {
            throw new Error('sink failure');
          },
        }),
      ),
    ).resolves.toEqual(operationOutputs['edufish.course.read']);

    await expect(
      plugin.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation({
          onEvent: async () => {
            throw new Error('async sink failure');
          },
        }),
      ),
    ).resolves.toEqual(operationOutputs['edufish.course.read']);
  });
});

describe('lab output validation', () => {
  it('accepts the serialized run shape', async () => {
    const { plugin } = pluginWith(async () => labOutput);
    await expect(
      plugin.invoke(
        EDUFISH_OPERATION.labStatus,
        { course_id: 'course-1', run_id: 'run-1' },
        makeInvocation(),
      ),
    ).resolves.toEqual(labOutput);
  });
});
