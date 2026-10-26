import {
  EduFishPluginError,
  type EduFishInvocation,
  type EduFishOperationName,
} from '@edufish/plugin';
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useEduFishAction } from '../src/actions.js';
import type { EduFishUIClient } from '../src/contracts.js';
import { EduFishUIProvider } from '../src/provider.js';

const courseOutput = {
  course: {
    id: 'course-1',
    title: 'Algorithms',
    summary: 'An introduction to algorithms.',
    status: 'active',
  },
  chapters: [
    {
      id: 'chapter-1',
      title: 'Sorting',
      order: 1,
      objectives: 'Understand comparison sorts.',
    },
  ],
};

const quizInput = {
  course_id: 'course-1',
  chapter_id: 'chapter-1',
  answers: [{ quiz_id: 'quiz-1', answer: 'Quick sort' }],
};

const quizOutput = {
  submission_id: 'submission-1',
  score: 1,
  total: 1,
  results: [
    { quiz_id: 'quiz-1', correct: true, feedback: 'Correct.' },
  ],
};

interface HarnessScope {
  client: EduFishUIClient;
  identityKey: string;
  createRequestId: (() => string) | undefined;
  getInvocation: (() => EduFishInvocation) | undefined;
}

function renderAction(options: {
  client?: EduFishUIClient;
  identityKey?: string;
  createRequestId?: () => string;
  getInvocation?: () => EduFishInvocation;
  operation?: EduFishOperationName;
  strictMode?: boolean;
} = {}) {
  const scope: HarnessScope = {
    client: options.client ?? { invoke: vi.fn() },
    identityKey: options.identityKey ?? 'user-a',
    createRequestId: options.createRequestId,
    getInvocation: options.getInvocation,
  };

  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = (
      <EduFishUIProvider
        client={scope.client}
        identityKey={scope.identityKey}
        createRequestId={scope.createRequestId}
        getInvocation={
          scope.getInvocation ??
          (() => ({
            scope: {
              userId: `trusted-${scope.identityKey}`,
              sessionId: 'session-1',
            },
          }))
        }
      >
        {children}
      </EduFishUIProvider>
    );
    return options.strictMode === true ? <StrictMode>{tree}</StrictMode> : tree;
  };

  const view = renderHook(
    () => useEduFishAction(options.operation ?? 'edufish.course.read'),
    { wrapper },
  );

  return {
    ...view,
    update(next: Partial<HarnessScope>) {
      Object.assign(scope, next);
      view.rerender();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useEduFishAction lifecycle', () => {
  it('performs no API call on mount, rerender or StrictMode replay', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockResolvedValue(courseOutput);
    const client: EduFishUIClient = { invoke };

    const { result } = renderHook(
      () => useEduFishAction('edufish.course.read'),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>
            <EduFishUIProvider
              client={client}
              identityKey="user-a"
              getInvocation={() => ({
                scope: { userId: 'trusted-user-a', sessionId: 's-1' },
              })}
            >
              {children}
            </EduFishUIProvider>
          </StrictMode>
        ),
      },
    );

    await act(async () => undefined);

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('never calls the invocation factory on mount, rerender or StrictMode replay', async () => {
    const getInvocation = vi.fn(() => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    }));

    const view = renderAction({
      client: { invoke: vi.fn() },
      getInvocation,
      strictMode: true,
    });

    await act(async () => undefined);
    expect(getInvocation).not.toHaveBeenCalled();

    act(() => {
      view.update({});
    });
    await act(async () => undefined);

    expect(getInvocation).not.toHaveBeenCalled();
    expect(view.result.current.pending).toBe(false);
    expect(view.result.current.data).toBeUndefined();

    act(() => {
      view.update({ identityKey: 'user-b' });
    });
    await act(async () => undefined);

    expect(getInvocation).not.toHaveBeenCalled();
    expect(view.result.current.data).toBeUndefined();
  });

  it('runs only on explicit run and validates/freezes the output', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockResolvedValue(courseOutput);
    const { result } = renderAction({ client: { invoke } });

    expect(invoke).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.run({ course_id: 'course-1' });
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [operation, input, invocation] = invoke.mock.calls[0];
    expect(operation).toBe('edufish.course.read');
    expect(input).toEqual({ course_id: 'course-1' });
    expect(invocation.scope).toEqual({
      userId: 'trusted-user-a',
      sessionId: 'session-1',
    });
    expect(invocation.requestId).toBeUndefined();
    expect(invocation.signal).toBeInstanceOf(AbortSignal);

    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toEqual(courseOutput);
    expect(Object.isFrozen(result.current.data)).toBe(true);
    expect(Object.isFrozen(result.current.data?.chapters)).toBe(true);
    expect(Object.isFrozen(result.current.data?.course)).toBe(true);
  });

  it('rejects invalid input locally without invoking the client', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    const { result } = renderAction({ client: { invoke } });

    await act(async () => {
      await result.current.run({} as never);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe('INVALID_ARGUMENT');
    expect(result.current.data).toBeUndefined();
  });

  it('rejects malformed output without exposing the payload', async () => {
    const secret = 'do-not-render-this';
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockResolvedValue({ ...courseOutput, leaked: secret });
    const { result } = renderAction({ client: { invoke } });

    await act(async () => {
      await result.current.run({ course_id: 'course-1' });
    });

    expect(result.current.error?.code).toBe('INVALID_OUTPUT');
    expect(result.current.data).toBeUndefined();
    expect(JSON.stringify(result.current.error)).not.toContain(secret);
  });

  it('suppresses concurrent double submissions', async () => {
    const pending = deferred<unknown>();
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockReturnValue(pending.promise);
    const { result } = renderAction({
      client: { invoke },
      operation: 'edufish.quiz.submit',
    });

    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;

    act(() => {
      first = result.current.run(quizInput);
      second = result.current.run(quizInput);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      pending.resolve(quizOutput);
      await first;
    });

    expect(result.current.data).toEqual(quizOutput);
  });

  it('reuses the same request id for a failed retry and changes it with payload', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockRejectedValueOnce(
      new EduFishPluginError('UNAVAILABLE', 'temporarily unavailable'),
    );
    invoke.mockResolvedValueOnce(quizOutput);
    invoke.mockResolvedValueOnce(quizOutput);

    let sequence = 0;
    const { result } = renderAction({
      client: { invoke },
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    await act(async () => {
      await result.current.run(quizInput);
    });
    expect(result.current.error?.code).toBe('UNAVAILABLE');
    const firstRequestId = invoke.mock.calls[0][2].requestId;
    expect(firstRequestId).toBe('request-1');

    await act(async () => {
      await result.current.run(quizInput);
    });
    expect(result.current.error).toBeUndefined();
    const retryRequestId = invoke.mock.calls[1][2].requestId;
    expect(retryRequestId).toBe(firstRequestId);

    const changedInput = {
      ...quizInput,
      answers: [{ quiz_id: 'quiz-1', answer: 'Merge sort' }],
    };
    await act(async () => {
      await result.current.run(changedInput);
    });
    const changedRequestId = invoke.mock.calls[2][2].requestId;
    expect(changedRequestId).toBeDefined();
    expect(changedRequestId).not.toBe(firstRequestId);
  });

  it('suppresses a successful repeat until reset creates a new write id', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockResolvedValue(quizOutput);

    let sequence = 0;
    const { result } = renderAction({
      client: { invoke },
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    await act(async () => {
      await result.current.run(quizInput);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const firstRequestId = invoke.mock.calls[0][2].requestId;

    await act(async () => {
      await result.current.run(quizInput);
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.requestId).toBeUndefined();

    await act(async () => {
      await result.current.run(quizInput);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][2].requestId).toBeDefined();
    expect(invoke.mock.calls[1][2].requestId).not.toBe(firstRequestId);
  });

  it('hides the old user state immediately and rekeys writes on identity change', async () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockResolvedValue(quizOutput);

    let sequence = 0;
    const view = renderAction({
      client: { invoke },
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    await act(async () => {
      await view.result.current.run(quizInput);
    });
    expect(view.result.current.data).toEqual(quizOutput);
    const firstRequestId = invoke.mock.calls[0][2].requestId;

    act(() => {
      view.update({ identityKey: 'user-b' });
    });

    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.requestId).toBeUndefined();
    expect(view.result.current.pending).toBe(false);

    await act(async () => {
      await view.result.current.run(quizInput);
    });

    const secondInvocation = invoke.mock.calls[1][2];
    expect(secondInvocation.scope.userId).toBe('trusted-user-b');
    expect(secondInvocation.requestId).toBeDefined();
    expect(secondInvocation.requestId).not.toBe(firstRequestId);
  });

  it('suppresses a late result from a replaced client', async () => {
    const late = deferred<unknown>();
    const oldInvoke = vi.fn<EduFishUIClient['invoke']>();
    oldInvoke.mockReturnValue(late.promise);
    const newOutput = {
      ...courseOutput,
      course: { ...courseOutput.course, title: 'New client course' },
    };
    const newInvoke = vi.fn<EduFishUIClient['invoke']>();
    newInvoke.mockResolvedValue(newOutput);

    const view = renderAction({ client: { invoke: oldInvoke } });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run({ course_id: 'course-1' });
    });
    expect(view.result.current.pending).toBe(true);

    act(() => {
      view.update({ client: { invoke: newInvoke } });
    });
    expect(view.result.current.pending).toBe(false);

    await act(async () => {
      late.resolve(courseOutput);
      await pendingRun;
    });
    expect(view.result.current.data).toBeUndefined();

    await act(async () => {
      await view.result.current.run({ course_id: 'course-1' });
    });
    expect(view.result.current.data).toEqual(newOutput);
  });

  it('aborts and suppresses a result when the invocation callback is replaced', async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementationOnce((_operation, _input, invocation) => {
      signal = invocation.signal;
      return pending.promise;
    });
    invoke.mockResolvedValue(courseOutput);

    const firstFactory = () => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    });
    const replacementFactory = () => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    });

    const view = renderAction({ client: { invoke }, getInvocation: firstFactory });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run({ course_id: 'course-1' });
    });
    expect(view.result.current.pending).toBe(true);

    // Client and identityKey are unchanged; the callback identity is the
    // only signal that the trusted invocation source was replaced.
    act(() => {
      view.update({ getInvocation: replacementFactory });
    });

    expect(signal?.aborted).toBe(true);
    expect(view.result.current.pending).toBe(false);

    await act(async () => {
      pending.resolve(courseOutput);
      await pendingRun;
    });
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.error).toBeUndefined();

    await act(async () => {
      await view.result.current.run({ course_id: 'course-1' });
    });
    expect(view.result.current.data).toEqual(courseOutput);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('preserves a write request id across client replacement for the same scope', async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const oldInvoke = vi.fn<EduFishUIClient['invoke']>();
    oldInvoke.mockImplementationOnce((_operation, _input, invocation) => {
      signal = invocation.signal;
      return pending.promise;
    });
    const newInvoke = vi.fn<EduFishUIClient['invoke']>();
    newInvoke.mockResolvedValue(quizOutput);

    let sequence = 0;
    const view = renderAction({
      client: { invoke: oldInvoke },
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run(quizInput);
    });
    const firstRequestId = oldInvoke.mock.calls[0][2].requestId;
    expect(firstRequestId).toBe('request-1');

    act(() => {
      view.update({ client: { invoke: newInvoke } });
    });
    expect(signal?.aborted).toBe(true);
    expect(view.result.current.pending).toBe(false);

    await act(async () => {
      pending.resolve(quizOutput);
      await pendingRun;
    });
    expect(view.result.current.data).toBeUndefined();

    // Retrying under the same actual user/session/operation/payload must use
    // the previously issued key so a backend write that committed before the
    // local abort is deduplicated.
    await act(async () => {
      await view.result.current.run(quizInput);
    });
    expect(newInvoke.mock.calls[0][2].requestId).toBe(firstRequestId);

    const changedInput = {
      ...quizInput,
      answers: [{ quiz_id: 'quiz-1', answer: 'Merge sort' }],
    };
    await act(async () => {
      await view.result.current.run(changedInput);
    });
    expect(newInvoke.mock.calls[1][2].requestId).toBeDefined();
    expect(newInvoke.mock.calls[1][2].requestId).not.toBe(firstRequestId);
  });

  it('preserves a write request id across invocation-factory replacement for the same scope', async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementationOnce((_operation, _input, invocation) => {
      signal = invocation.signal;
      return pending.promise;
    });
    invoke.mockResolvedValue(quizOutput);

    const firstFactory = () => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    });
    const sameScopeFactory = () => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    });

    let sequence = 0;
    const view = renderAction({
      client: { invoke },
      getInvocation: firstFactory,
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run(quizInput);
    });
    const firstRequestId = invoke.mock.calls[0][2].requestId;
    expect(firstRequestId).toBe('request-1');

    act(() => {
      view.update({ getInvocation: sameScopeFactory });
    });
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      pending.resolve(quizOutput);
      await pendingRun;
    });
    expect(view.result.current.data).toBeUndefined();

    await act(async () => {
      await view.result.current.run(quizInput);
    });
    expect(invoke.mock.calls[1][2].requestId).toBe(firstRequestId);
  });

  it('rekeys a write retry when the invocation scope changes under the same identity key', async () => {
    const pending = deferred<unknown>();
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementationOnce(() => pending.promise);
    invoke.mockResolvedValue(quizOutput);

    const firstFactory = () => ({
      scope: { userId: 'trusted-user-a', sessionId: 'session-1' },
    });
    const changedScopeFactory = () => ({
      scope: { userId: 'trusted-user-b', sessionId: 'session-2' },
    });

    let sequence = 0;
    const view = renderAction({
      client: { invoke },
      getInvocation: firstFactory,
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run(quizInput);
    });
    const firstRequestId = invoke.mock.calls[0][2].requestId;
    expect(firstRequestId).toBe('request-1');

    act(() => {
      view.update({ getInvocation: changedScopeFactory });
    });

    await act(async () => {
      pending.resolve(quizOutput);
      await pendingRun;
    });

    await act(async () => {
      await view.result.current.run(quizInput);
    });

    const retryInvocation = invoke.mock.calls[1][2];
    expect(retryInvocation.requestId).toBeDefined();
    expect(retryInvocation.requestId).not.toBe(firstRequestId);
    expect(retryInvocation.scope).toEqual({
      userId: 'trusted-user-b',
      sessionId: 'session-2',
    });
  });

  it('reuses a write request id after an explicit local cancel', async () => {
    const pending = deferred<unknown>();
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementationOnce(() => pending.promise);
    invoke.mockResolvedValue(quizOutput);

    let sequence = 0;
    const view = renderAction({
      client: { invoke },
      operation: 'edufish.quiz.submit',
      createRequestId: () => `request-${++sequence}`,
    });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = view.result.current.run(quizInput);
    });
    const firstRequestId = invoke.mock.calls[0][2].requestId;
    expect(firstRequestId).toBe('request-1');

    act(() => {
      view.result.current.cancel();
    });

    await act(async () => {
      pending.resolve(quizOutput);
      await pendingRun;
    });
    expect(view.result.current.data).toBeUndefined();

    await act(async () => {
      await view.result.current.run(quizInput);
    });
    expect(invoke.mock.calls[1][2].requestId).toBe(firstRequestId);
    expect(sequence).toBe(1);
  });

  it('cancel aborts the local wait and suppresses the late result', async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementation((_operation, _input, invocation) => {
      signal = invocation.signal;
      return pending.promise;
    });

    const { result } = renderAction({ client: { invoke } });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = result.current.run({ course_id: 'course-1' });
    });
    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(signal?.aborted).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeUndefined();

    await act(async () => {
      pending.resolve(courseOutput);
      await pendingRun;
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('unmount aborts the request and performs no further state update', async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    invoke.mockImplementation((_operation, _input, invocation) => {
      signal = invocation.signal;
      return pending.promise;
    });

    const { result, unmount } = renderAction({ client: { invoke } });

    let pendingRun: Promise<unknown> | undefined;
    act(() => {
      pendingRun = result.current.run({ course_id: 'course-1' });
    });

    unmount();
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      pending.resolve(courseOutput);
      await pendingRun;
    });
  });
});
