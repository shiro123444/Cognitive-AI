import { describe, expect, it } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_OPERATION,
  type EduFishInvocation,
  type EduFishOperationName,
  type EduFishTransport,
} from '../src/index.js';
import {
  expectPluginError,
  makeInvocation,
  operationOutputs,
} from './helpers.js';

const baseArgs: Record<EduFishOperationName, Record<string, unknown>> = {
  [EDUFISH_OPERATION.courseRead]: { course_id: 'course-1' },
  [EDUFISH_OPERATION.materialSearch]: {
    course_id: 'course-1',
    query: 'memory',
  },
  [EDUFISH_OPERATION.graphNeighborhood]: { course_id: 'course-1' },
  [EDUFISH_OPERATION.quizRead]: {
    course_id: 'course-1',
    chapter_id: 'chapter-1',
  },
  [EDUFISH_OPERATION.quizSubmit]: {
    course_id: 'course-1',
    chapter_id: 'chapter-1',
    answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
  },
  [EDUFISH_OPERATION.progressRead]: { course_id: 'course-1' },
  [EDUFISH_OPERATION.labStart]: {
    course_id: 'course-1',
    template_id: 'template-1',
  },
  [EDUFISH_OPERATION.labStatus]: {
    course_id: 'course-1',
    run_id: 'run-1',
  },
};

describe('identity and authorization argument rejection', () => {
  it('rejects top-level identity and role overrides for every operation', async () => {
    for (const operation of Object.keys(baseArgs) as EduFishOperationName[]) {
      for (const key of [
        'user_id',
        'userId',
        'student_id',
        'owner_id',
        'role',
        'tenant_id',
        'access_token',
        'authorization',
      ]) {
        let calls = 0;
        const transport: EduFishTransport = {
          async invoke(operationName) {
            calls += 1;
            return operationOutputs[operationName];
          },
        };
        const plugin = createEduFishPlugin({ transport });
        const invocation: EduFishInvocation =
          operation === EDUFISH_OPERATION.quizSubmit ||
          operation === EDUFISH_OPERATION.labStart
            ? makeInvocation({ requestId: 'request-1' })
            : makeInvocation();

        const error = await expectPluginError(
          plugin.invoke(
            operation,
            { ...baseArgs[operation], [key]: 'attacker-controlled' },
            invocation,
          ),
          'INVALID_ARGUMENT',
        );

        expect(error.operation).toBe(operation);
        expect(error.message).toContain(key);
        expect(error.message).not.toContain('attacker-controlled');
        expect(calls).toBe(0);
      }
    }
  });

  it('rejects identity keys nested inside opaque lab params', async () => {
    let calls = 0;
    const transport: EduFishTransport = {
      async invoke(operation) {
        calls += 1;
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    for (const params of [
      { user_id: 'attacker' },
      { nested: { student_id: 'attacker' } },
      { nested: { deeper: { role: 'admin' } } },
      { access_token: 'leaked' },
    ]) {
      await expectPluginError(
        plugin.invoke(
          EDUFISH_OPERATION.labStart,
          {
            course_id: 'course-1',
            template_id: 'template-1',
            params,
          },
          makeInvocation({ requestId: 'request-1' }),
        ),
        'INVALID_ARGUMENT',
      );
    }

    expect(calls).toBe(0);
  });

  it('rejects prototype-pollution keys in opaque params', async () => {
    const transport: EduFishTransport = {
      async invoke(operation) {
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const params = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;

    await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.labStart,
        {
          course_id: 'course-1',
          template_id: 'template-1',
          params,
        },
        makeInvocation({ requestId: 'request-1' }),
      ),
      'INVALID_ARGUMENT',
    );

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects oversized or excessively nested lab params', async () => {
    let calls = 0;
    const transport: EduFishTransport = {
      async invoke(operation) {
        calls += 1;
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const deeplyNested: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deeplyNested;
    for (let depth = 0; depth < 10; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    for (const params of [
      deeplyNested,
      { text: 'x'.repeat(20_000) },
    ]) {
      await expectPluginError(
        plugin.invoke(
          EDUFISH_OPERATION.labStart,
          {
            course_id: 'course-1',
            template_id: 'template-1',
            params,
          },
          makeInvocation({ requestId: 'request-1' }),
        ),
        'INVALID_ARGUMENT',
      );
    }

    expect(calls).toBe(0);
  });

  it('validates the trusted invocation scope', async () => {
    const transport: EduFishTransport = {
      async invoke(operation) {
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const invalidInvocations: unknown[] = [
      undefined,
      null,
      {},
      { scope: null },
      { scope: {} },
      { scope: { userId: '', sessionId: 'session-1' } },
      { scope: { userId: 'user-1' } },
      { scope: { userId: 'user-1', sessionId: 3 } },
      {
        scope: { userId: 'user-1', sessionId: 'session-1' },
        requestId: 42,
      },
      {
        scope: { userId: 'user-1', sessionId: 'session-1' },
        signal: { aborted: false },
      },
      {
        scope: { userId: 'user-1', sessionId: 'session-1' },
        onEvent: 'not-a-function',
      },
    ];

    for (const invocation of invalidInvocations) {
      await expectPluginError(
        plugin.invoke(
          EDUFISH_OPERATION.courseRead,
          { course_id: 'course-1' },
          invocation as EduFishInvocation,
        ),
        'INVALID_ARGUMENT',
      );
    }
  });

  it('forwards only the scope-derived identity to the transport', async () => {
    const seen: EduFishInvocation[] = [];
    const transport: EduFishTransport = {
      async invoke(operation, _args, invocation) {
        seen.push(invocation);
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    await plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({
        requestId: 'read-request',
        onEvent: () => undefined,
      }),
    );

    expect(seen[0]?.scope).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(seen[0]?.requestId).toBe('read-request');
    expect(seen[0]?.onEvent).toBeUndefined();
  });
});
