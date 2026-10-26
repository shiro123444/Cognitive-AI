import { describe, expect, it } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_OPERATION,
  type EduFishOperationName,
  type EduFishTransport,
} from '../src/index.js';
import {
  expectPluginError,
  makeInvocation,
  operationOutputs,
} from './helpers.js';

function capturePlugin(): {
  plugin: ReturnType<typeof createEduFishPlugin>;
  calls: Array<{ operation: EduFishOperationName; args: Readonly<Record<string, unknown>>; requestId: string | undefined }>;
} {
  const calls: Array<{
    operation: EduFishOperationName;
    args: Readonly<Record<string, unknown>>;
    requestId: string | undefined;
  }> = [];
  const transport: EduFishTransport = {
    async invoke(operation, args, invocation) {
      calls.push({ operation, args, requestId: invocation.requestId });
      return operationOutputs[operation];
    },
  };
  return { plugin: createEduFishPlugin({ transport }), calls };
}

describe('request ID / idempotency key handling', () => {
  it('requires invocation.requestId for both write operations', async () => {
    const cases: Array<{
      operation: EduFishOperationName;
      args: Record<string, unknown>;
    }> = [
      {
        operation: EDUFISH_OPERATION.quizSubmit,
        args: {
          course_id: 'course-1',
          chapter_id: 'chapter-1',
          answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
        },
      },
      {
        operation: EDUFISH_OPERATION.labStart,
        args: { course_id: 'course-1', template_id: 'template-1' },
      },
    ];

    for (const testCase of cases) {
      const { plugin, calls } = capturePlugin();
      const error = await expectPluginError(
        plugin.invoke(testCase.operation, testCase.args, makeInvocation()),
        'REQUEST_ID_REQUIRED',
      );
      expect(error.operation).toBe(testCase.operation);
      expect(calls).toHaveLength(0);
    }
  });

  it('allows reads without a request ID', async () => {
    const { plugin, calls } = capturePlugin();
    await plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation(),
    );
    expect(calls[0]?.requestId).toBeUndefined();
  });

  it('preserves the exact request ID for reads and writes', async () => {
    const { plugin, calls } = capturePlugin();
    const requestId = '  req-ABC_123.é  ';

    await plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({ requestId }),
    );
    await plugin.invoke(
      EDUFISH_OPERATION.quizSubmit,
      {
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
      },
      makeInvocation({ requestId }),
    );

    expect(calls[0]?.requestId).toBe(requestId);
    expect(calls[1]?.requestId).toBe(requestId);
    expect(Object.keys(calls[1]?.args ?? {})).not.toContain('request_id');
    expect(Object.keys(calls[1]?.args ?? {})).not.toContain('requestId');
  });

  it('accepts the 200-character boundary and rejects 201 characters', async () => {
    const { plugin } = capturePlugin();

    await expect(
      plugin.invoke(
        EDUFISH_OPERATION.labStart,
        { course_id: 'course-1', template_id: 'template-1' },
        makeInvocation({ requestId: 'r'.repeat(200) }),
      ),
    ).resolves.toEqual(operationOutputs[EDUFISH_OPERATION.labStart]);

    await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.labStart,
        { course_id: 'course-1', template_id: 'template-1' },
        makeInvocation({ requestId: 'r'.repeat(201) }),
      ),
      'INVALID_ARGUMENT',
    );
  });

  it('rejects empty, whitespace-only and control-containing request IDs', async () => {
    const { plugin, calls } = capturePlugin();
    const invalidIds = ['', '   ', 'bad\nid', 'bad' + String.fromCharCode(0) + 'id', 'x'.repeat(201)];

    for (const requestId of invalidIds) {
      await expectPluginError(
        plugin.invoke(
          EDUFISH_OPERATION.labStart,
          { course_id: 'course-1', template_id: 'template-1' },
          makeInvocation({ requestId }),
        ),
        'INVALID_ARGUMENT',
      );
    }

    expect(calls).toHaveLength(0);
  });

  it('does not deduplicate inside the client; the backend owns replay', async () => {
    const { plugin, calls } = capturePlugin();
    const requestId = 'request-replay';
    const invocation = makeInvocation({ requestId });

    await plugin.invoke(
      EDUFISH_OPERATION.quizSubmit,
      {
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
      },
      invocation,
    );
    await plugin.invoke(
      EDUFISH_OPERATION.quizSubmit,
      {
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
      },
      invocation,
    );

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.requestId)).toEqual([
      requestId,
      requestId,
    ]);
  });
});
