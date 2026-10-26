import { describe, expect, it, vi } from 'vitest';

import {
  createHttpTransport,
  EDUFISH_OPERATION,
  type EduFishFetchInit,
  type EduFishFetchResponse,
  type EduFishInvocation,
} from '../src/index.js';
import {
  courseOutput,
  deferred,
  expectPluginError,
  failureResponse,
  jsonResponse,
  labOutput,
  makeInvocation,
  recordingFetch,
  successResponse,
} from './helpers.js';

const BASE_URL = 'http://127.0.0.1:5099';

function setup(options: {
  respond: (url: string, init: EduFishFetchInit) => Promise<EduFishFetchResponse>;
  token?: string | (() => string | Promise<string>);
  timeoutMs?: number;
  maxResponseBytes?: number;
}): {
  transport: ReturnType<typeof createHttpTransport>;
  calls: Array<{ url: string; init: EduFishFetchInit }>;
  tokenInvocations: EduFishInvocation[];
  tokenProvider: ReturnType<typeof vi.fn>;
} {
  const recorded = recordingFetch(options.respond);
  const tokenInvocations: EduFishInvocation[] = [];
  const tokenProvider = vi.fn(async (invocation: EduFishInvocation) => {
    tokenInvocations.push(invocation);
    if (typeof options.token === 'function') return options.token();
    return options.token ?? 'user-jwt-token';
  });

  const transport = createHttpTransport({
    baseUrl: BASE_URL,
    getAccessToken: tokenProvider,
    fetch: recorded.fetch,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
  });

  return {
    transport,
    calls: recorded.calls,
    tokenInvocations,
    tokenProvider,
  };
}

function bodyOf(call: { init: EduFishFetchInit }): Record<string, unknown> {
  return JSON.parse(call.init.body) as Record<string, unknown>;
}

describe('HTTP transport success path', () => {
  it('forwards the user bearer token and exact wire envelope', async () => {
    const { transport, calls, tokenInvocations } = setup({
      respond: async () => successResponse(courseOutput),
    });

    const result = await transport.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({ requestId: 'req-read' }),
    );

    expect(result).toEqual(courseOutput);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe(`${BASE_URL}/api/v1/plugin/invoke`);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    expect(call?.init.cache).toBe('no-store');
    expect(call?.init.credentials).toBe('omit');
    expect(call?.init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: 'Bearer user-jwt-token',
    });
    expect(Object.keys(call?.init.headers ?? {})).not.toContain('x-user-id');
    expect(Object.keys(call?.init.headers ?? {})).not.toContain('x-role');
    expect(bodyOf(call!)).toEqual({
      operation: 'edufish.course.read',
      arguments: { course_id: 'course-1' },
      request_id: 'req-read',
    });
    expect(JSON.stringify(bodyOf(call!))).not.toContain('user-1');
    expect(JSON.stringify(bodyOf(call!))).not.toContain('session-1');

    expect(tokenInvocations[0]?.scope).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(tokenInvocations[0]?.requestId).toBe('req-read');
    expect(tokenInvocations[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('preserves a write request ID on the wire', async () => {
    const { transport, calls } = setup({
      respond: async () => successResponse(labOutput),
    });

    const result = await transport.invoke(
      EDUFISH_OPERATION.labStart,
      {
        course_id: 'course-1',
        template_id: 'template-1',
        params: { seed: 7 },
      },
      makeInvocation({ requestId: 'req-lab-42' }),
    );

    expect(result).toEqual(labOutput);
    expect(bodyOf(calls[0]!)).toEqual({
      operation: 'edufish.lab.start',
      arguments: {
        course_id: 'course-1',
        template_id: 'template-1',
        params: { seed: 7 },
      },
      request_id: 'req-lab-42',
    });
  });

  it('reads a streamed response body and validates output', async () => {
    const encoded = new TextEncoder().encode(
      JSON.stringify({ success: true, data: courseOutput }),
    );
    let offset = 0;
    const response: EduFishFetchResponse = {
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (offset >= encoded.length) return { done: true };
            const chunk = encoded.slice(offset, offset + 7);
            offset += chunk.length;
            return { done: false, value: chunk };
          },
          cancel: async () => undefined,
          releaseLock: () => undefined,
        }),
      },
    };

    const { transport } = setup({ respond: async () => response });
    await expect(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
    ).resolves.toEqual(courseOutput);
  });
});

describe('HTTP transport request guarding', () => {
  it('requires a request ID for writes before obtaining a token or fetching', async () => {
    const { transport, calls, tokenProvider } = setup({
      respond: async () => successResponse(labOutput),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.labStart,
        { course_id: 'course-1', template_id: 'template-1' },
        makeInvocation(),
      ),
      'REQUEST_ID_REQUIRED',
    );

    expect(tokenProvider).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('rejects identity override arguments before any network work', async () => {
    const { transport, calls, tokenProvider } = setup({
      respond: async () => successResponse(courseOutput),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1', user_id: 'attacker' } as unknown as Record<
          string,
          unknown
        >,
        makeInvocation(),
      ),
      'INVALID_ARGUMENT',
    );

    expect(tokenProvider).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown operations before any network work', async () => {
    const { transport, calls } = setup({
      respond: async () => successResponse(courseOutput),
    });

    await expectPluginError(
      transport.invoke(
        'edufish.unknown' as never,
        {},
        makeInvocation(),
      ),
      'UNKNOWN_OPERATION',
    );

    expect(calls).toHaveLength(0);
  });
});

describe('HTTP transport error envelopes', () => {
  it('propagates a valid server error and scrubs credentials/paths', async () => {
    const { transport } = setup({
      respond: async () =>
        failureResponse(
          'IDEMPOTENCY_CONFLICT',
          'Same key with different payload; token=SUPERSECRET at C:\\secret\\file.txt',
          409,
        ),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.quizSubmit,
        {
          course_id: 'course-1',
          chapter_id: 'chapter-1',
          answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
        },
        makeInvocation({ requestId: 'req-1' }),
      ),
      'IDEMPOTENCY_CONFLICT',
    );

    expect(error.status).toBe(409);
    expect(error.requestId).toBe('req-1');
    expect(error.message).not.toContain('SUPERSECRET');
    expect(error.message).not.toContain('C:\\secret\\file.txt');
  });

  it('maps an unknown server code to UNAVAILABLE', async () => {
    const { transport } = setup({
      respond: async () => failureResponse('INTERNAL_PANIC', 'boom', 500),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'UNAVAILABLE',
    );
  });

  it('rejects a malformed error envelope', async () => {
    const { transport } = setup({
      respond: async () => jsonResponse({ success: false, error: {} }, 500),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'INVALID_RESPONSE',
    );
  });

  it('maps a non-JSON 401 response without leaking the body', async () => {
    const { transport } = setup({
      respond: async () => ({
        status: 401,
        text: async () => '<html>secret token=LEAKY</html>',
      }),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'UNAUTHORIZED',
    );

    expect(error.status).toBe(401);
    expect(error.message).not.toContain('LEAKY');
  });

  it('rejects extra keys in a success envelope', async () => {
    const { transport } = setup({
      respond: async () =>
        jsonResponse({
          success: true,
          data: courseOutput,
          extra: 'not-allowed',
        }),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'INVALID_RESPONSE',
    );
  });

  it('validates operation output and refuses leaked quiz answers', async () => {
    const { transport } = setup({
      respond: async () =>
        successResponse({
          items: [{ id: 'quiz-1', prompt: 'Q?', answer: 'LEAKED' }],
        }),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.quizRead,
        { course_id: 'course-1', chapter_id: 'chapter-1' },
        makeInvocation(),
      ),
      'INVALID_OUTPUT',
    );

    expect(error.message).not.toContain('LEAKED');
  });

  it('rejects an oversized response body', async () => {
    const { transport } = setup({
      maxResponseBytes: 1_024,
      respond: async () => ({
        status: 200,
        text: async () => 'x'.repeat(2_048),
      }),
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'INVALID_RESPONSE',
    );
  });

  it('rejects an invalid response object', async () => {
    const { transport } = setup({
      respond: async () => ({}) as EduFishFetchResponse,
    });

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'INVALID_RESPONSE',
    );
  });
});

describe('HTTP transport cancellation, timeout and disposal', () => {
  it('cancels a pending token lookup without fetching', async () => {
    const token = deferred<string>();
    const tokenStarted = deferred<undefined>();
    const { transport, calls } = setup({
      token: () => {
        tokenStarted.resolve(undefined);
        return token.promise;
      },
      respond: async () => successResponse(courseOutput),
    });
    const controller = new AbortController();

    const call = transport.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({ signal: controller.signal }),
    );

    await tokenStarted.promise;
    controller.abort();

    await expectPluginError(call, 'ABORTED');
    expect(calls).toHaveLength(0);

    token.resolve('user-jwt-token');
    await Promise.resolve();
  });

  it('times out a token lookup that never resolves', async () => {
    const token = deferred<string>();
    const { transport, calls } = setup({
      timeoutMs: 20,
      token: () => token.promise,
      respond: async () => successResponse(courseOutput),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'TIMEOUT',
    );

    expect(error.retriable).toBe(true);
    expect(calls).toHaveLength(0);

    token.resolve('user-jwt-token');
    await Promise.resolve();
  });

  it('cancels while the response body is being read', async () => {
    const readStarted = deferred<undefined>();
    const cancel = vi.fn(async () => undefined);
    const { transport } = setup({
      respond: async () => ({
        status: 200,
        body: {
          getReader: () => ({
            read: () => {
              readStarted.resolve(undefined);
              return new Promise<never>(() => undefined);
            },
            cancel,
            releaseLock: () => undefined,
          }),
        },
      }),
    });
    const controller = new AbortController();

    const call = transport.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation({ signal: controller.signal }),
    );

    await readStarted.promise;
    controller.abort();

    await expectPluginError(call, 'ABORTED');
    await Promise.resolve();
    expect(cancel).toHaveBeenCalled();
  });

  it('times out while the response body is being read', async () => {
    const readStarted = deferred<undefined>();
    const { transport } = setup({
      timeoutMs: 20,
      respond: async () => ({
        status: 200,
        body: {
          getReader: () => ({
            read: () => {
              readStarted.resolve(undefined);
              return new Promise<never>(() => undefined);
            },
            cancel: async () => undefined,
          }),
        },
      }),
    });

    const call = transport.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation(),
    );

    await readStarted.promise;
    await expectPluginError(call, 'TIMEOUT');
  });

  it('disposes an in-flight request and rejects later calls', async () => {
    const fetchStarted = deferred<undefined>();
    const response = deferred<EduFishFetchResponse>();
    const { transport } = setup({
      respond: () => {
        fetchStarted.resolve(undefined);
        return response.promise;
      },
    });

    const call = transport.invoke(
      EDUFISH_OPERATION.courseRead,
      { course_id: 'course-1' },
      makeInvocation(),
    );

    await fetchStarted.promise;
    transport.dispose();
    expect(transport.disposed).toBe(true);

    await expectPluginError(call, 'DISPOSED');

    response.resolve(successResponse(courseOutput));
    await Promise.resolve();

    await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'DISPOSED',
    );
  });

  it('redacts token-provider failures', async () => {
    const { transport, calls } = setup({
      token: () => {
        throw new Error('provider exploded with token=PROVIDER-SECRET');
      },
      respond: async () => successResponse(courseOutput),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'UNAUTHORIZED',
    );

    expect(error.message).not.toContain('PROVIDER-SECRET');
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed access token without leaking it', async () => {
    const { transport } = setup({
      token: 'bad token\nwith-space',
      respond: async () => successResponse(courseOutput),
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'UNAUTHORIZED',
    );

    expect(error.message).not.toContain('with-space');
  });

  it('redacts fetch failures', async () => {
    const { transport } = setup({
      respond: async () => {
        throw new Error('socket failed with token=FETCH-SECRET at C:\\x');
      },
    });

    const error = await expectPluginError(
      transport.invoke(
        EDUFISH_OPERATION.courseRead,
        { course_id: 'course-1' },
        makeInvocation(),
      ),
      'UNAVAILABLE',
    );

    expect(error.message).toBe('HTTP transport request failed.');
    expect(error.message).not.toContain('FETCH-SECRET');
  });
});
