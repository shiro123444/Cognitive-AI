import { describe, expect, it, vi } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_OPERATION,
  type EduFishInvocation,
  type EduFishOperationEvent,
  type EduFishTransport,
} from '../src/index.js';
import {
  deferred,
  expectPluginError,
  makeInvocation,
  operationOutputs,
} from './helpers.js';

describe('plugin lifecycle and cancellation', () => {
  it('dispose during an in-flight call cancels it and disables future calls', async () => {
    const transportStarted = deferred<EduFishInvocation>();
    const response = deferred<unknown>();
    let invocations = 0;
    const dispose = vi.fn();

    const transport: EduFishTransport = {
      invoke(_operation, _args, invocation) {
        invocations += 1;
        transportStarted.resolve(invocation);
        return response.promise;
      },
      dispose,
    };
    const plugin = createEduFishPlugin({ transport });

    const call = plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation(),
    );

    const transportInvocation = await transportStarted.promise;
    expect(transportInvocation.signal?.aborted).toBe(false);

    plugin.dispose();
    expect(plugin.disposed).toBe(true);
    expect(transportInvocation.signal?.aborted).toBe(true);

    await expectPluginError(call, 'DISPOSED');

    response.resolve(operationOutputs['edufish.course.read']);

    await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'DISPOSED',
    );

    expect(invocations).toBe(1);
    expect(dispose).toHaveBeenCalledTimes(1);

    plugin.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('emits a DISPOSED failure event for an in-flight call', async () => {
    const started = deferred<undefined>();
    const events: EduFishOperationEvent[] = [];
    const transport: EduFishTransport = {
      invoke() {
        started.resolve(undefined);
        return new Promise(() => undefined);
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const call = plugin.invoke(
      EDUFISH_OPERATION.quizRead,
      { course_id: 'course-1', chapter_id: 'chapter-1' },
      makeInvocation({
        onEvent: (event) => {
          events.push(event);
        },
      }),
    );

    await started.promise;
    plugin.dispose();
    await expectPluginError(call, 'DISPOSED');

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'failed',
    ]);
    expect(events[1]).toMatchObject({
      type: 'failed',
      errorCode: 'DISPOSED',
    });
  });

  it('rejects an already-aborted invocation without calling the transport', async () => {
    let invocations = 0;
    const transport: EduFishTransport = {
      async invoke(operation) {
        invocations += 1;
        return operationOutputs[operation];
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const controller = new AbortController();
    controller.abort();

    await expectPluginError(
      plugin.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation({ signal: controller.signal }),
      ),
      'ABORTED',
    );

    expect(invocations).toBe(0);
  });

  it('cancels an in-flight call when the caller aborts', async () => {
    const started = deferred<AbortSignal | undefined>();
    const events: EduFishOperationEvent[] = [];
    const transport: EduFishTransport = {
      invoke(_operation, _args, invocation) {
        started.resolve(invocation.signal);
        return new Promise(() => undefined);
      },
    };
    const plugin = createEduFishPlugin({ transport });
    const controller = new AbortController();

    const call = plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({
        signal: controller.signal,
        onEvent: (event) => {
          events.push(event);
        },
      }),
    );

    const transportSignal = await started.promise;
    controller.abort();

    await expectPluginError(call, 'ABORTED');
    expect(transportSignal?.aborted).toBe(true);
    expect(events[1]).toMatchObject({
      type: 'failed',
      errorCode: 'ABORTED',
    });
  });

  it('does not let a late transport rejection become an unhandled rejection', async () => {
    const started = deferred<undefined>();
    const late = deferred<unknown>();
    const transport: EduFishTransport = {
      invoke() {
        started.resolve(undefined);
        return late.promise;
      },
    };
    const plugin = createEduFishPlugin({ transport });

    const call = plugin.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation(),
    );

    await started.promise;
    plugin.dispose();
    await expectPluginError(call, 'DISPOSED');

    // A transport that ignored the abort signal rejects after disposal.
    late.reject(new Error('late failure with secret token'));
    await Promise.resolve();
    await Promise.resolve();
  });
});
