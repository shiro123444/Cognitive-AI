import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_MAX_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
  MAX_REQUEST_TIMEOUT_MS,
  MIN_MAX_RESPONSE_BYTES,
  MIN_REQUEST_TIMEOUT_MS,
  isEduFishOperationName,
  type EduFishOperationName,
} from '../constants.js';
import {
  EduFishPluginError,
  isServerErrorCode,
  sanitizeErrorMessage,
} from '../errors.js';
import {
  abortedError,
  disposedError,
  raceWithAbort,
  timeoutError,
} from '../failures.js';
import {
  assertTrustedInvocation,
  isPlainObject,
  resolveRequestId,
} from '../guards.js';
import type { EduFishInvocation, EduFishTransport } from '../types.js';
import {
  attachOperationContext,
  validateOperationInput,
  validateOperationOutput,
} from '../validation.js';

export interface EduFishStreamReadResult {
  readonly done: boolean;
  readonly value?: unknown;
}

export interface EduFishStreamReader {
  read(): Promise<EduFishStreamReadResult>;
  cancel?(): Promise<unknown> | void;
  releaseLock?(): void;
}

export interface EduFishReadableStream {
  getReader(): EduFishStreamReader;
}

/** Minimal structural view of a fetch Response, for injectable test doubles. */
export interface EduFishFetchResponse {
  readonly status: number;
  readonly ok?: boolean;
  readonly body?: EduFishReadableStream | null;
  readonly text?: () => Promise<string>;
}

export interface EduFishFetchInit {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
  readonly redirect: 'error';
  readonly cache: 'no-store';
  readonly credentials: 'omit';
}

export type EduFishFetch = (
  url: string,
  init: EduFishFetchInit,
) => Promise<EduFishFetchResponse>;

export interface CreateHttpTransportOptions {
  /** Origin (and optional base path) of the authenticated EduFish backend. */
  readonly baseUrl: string;
  /**
   * Server-owned callback returning the real user JWT for this invocation.
   * The token is never cached, logged or placed in operation arguments.
   */
  readonly getAccessToken: (
    invocation: EduFishInvocation,
  ) => string | Promise<string>;
  /** Optional fetch implementation (defaults to the global fetch). */
  readonly fetch?: EduFishFetch;
  /** Alias for `fetch`, for hosts that name it explicitly. */
  readonly fetchImpl?: EduFishFetch;
  /** Total budget for token lookup, request and response body. */
  readonly timeoutMs?: number;
  /** Alias for `timeoutMs`. */
  readonly timeout?: number;
  /** Maximum accepted response body size. */
  readonly maxResponseBytes?: number;
}

export interface EduFishHttpTransport extends EduFishTransport {
  readonly disposed: boolean;
  dispose(): void;
}

const INVOKE_PATH = '/api/v1/plugin/invoke';
const MAX_TOKEN_LENGTH = 16_384;

function invalidArgument(message: string): EduFishPluginError {
  return new EduFishPluginError('INVALID_ARGUMENT', message);
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidArgument('baseUrl must be a non-empty absolute URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidArgument('baseUrl must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw invalidArgument('baseUrl must use http or https.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw invalidArgument('baseUrl must not contain credentials.');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw invalidArgument('baseUrl must not contain a query string or fragment.');
  }

  return value.replace(/\/+$/, '');
}

function normalizeTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_REQUEST_TIMEOUT_MS ||
    value > MAX_REQUEST_TIMEOUT_MS
  ) {
    throw invalidArgument(
      `timeoutMs must be an integer between ${MIN_REQUEST_TIMEOUT_MS} and ${MAX_REQUEST_TIMEOUT_MS}.`,
    );
  }
  return value;
}

function normalizeMaxResponseBytes(value: unknown): number {
  if (value === undefined) return DEFAULT_MAX_RESPONSE_BYTES;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_MAX_RESPONSE_BYTES ||
    value > MAX_MAX_RESPONSE_BYTES
  ) {
    throw invalidArgument(
      `maxResponseBytes must be an integer between ${MIN_MAX_RESPONSE_BYTES} and ${MAX_MAX_RESPONSE_BYTES}.`,
    );
  }
  return value;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function containsWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function errorForHttpStatus(
  status: number,
  operation: EduFishOperationName,
  requestId: string | undefined,
): EduFishPluginError {
  const code =
    status === 400
      ? 'INVALID_ARGUMENT'
      : status === 401
        ? 'UNAUTHORIZED'
        : status === 403
          ? 'FORBIDDEN'
          : status === 404
            ? 'NOT_FOUND'
            : status === 409
              ? 'IDEMPOTENCY_CONFLICT'
              : 'UNAVAILABLE';

  return new EduFishPluginError(
    code,
    `EduFish endpoint returned HTTP ${status} without a valid error envelope.`,
    { status, operation, requestId, retriable: code === 'UNAVAILABLE' },
  );
}

function invalidResponse(
  message: string,
  status: number,
  operation: EduFishOperationName,
  requestId: string | undefined,
): EduFishPluginError {
  return new EduFishPluginError('INVALID_RESPONSE', message, {
    status,
    operation,
    requestId,
  });
}

/**
 * Parse and validate one wire envelope.
 *
 * Malformed JSON on a non-2xx response is mapped from the HTTP status. Valid
 * JSON with an invalid envelope shape is always INVALID_RESPONSE so callers
 * can distinguish a broken backend from a domain error.
 */
function interpretEnvelopeText(
  text: string,
  status: number,
  operation: EduFishOperationName,
  requestId: string | undefined,
): unknown {
  if (text.trim().length === 0) {
    if (!isSuccessStatus(status)) {
      throw errorForHttpStatus(status, operation, requestId);
    }
    throw invalidResponse(
      'EduFish endpoint returned an empty response body.',
      status,
      operation,
      requestId,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (!isSuccessStatus(status)) {
      throw errorForHttpStatus(status, operation, requestId);
    }
    throw invalidResponse(
      'EduFish endpoint returned a non-JSON response.',
      status,
      operation,
      requestId,
    );
  }

  if (!isPlainObject(parsed)) {
    throw invalidResponse(
      'EduFish endpoint returned an invalid response envelope.',
      status,
      operation,
      requestId,
    );
  }

  const keys = Object.keys(parsed);

  if (parsed.success === false) {
    if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(parsed, 'error')) {
      throw invalidResponse(
        'EduFish endpoint returned an invalid error envelope.',
        status,
        operation,
        requestId,
      );
    }

    const detail = parsed.error;
    if (
      !isPlainObject(detail) ||
      typeof detail.code !== 'string' ||
      detail.code.length === 0 ||
      detail.code.length > 200 ||
      typeof detail.message !== 'string' ||
      Object.keys(detail).some(
        (key) => key !== 'code' && key !== 'message',
      )
    ) {
      throw invalidResponse(
        'EduFish endpoint returned an invalid error envelope.',
        status,
        operation,
        requestId,
      );
    }

    const code = isServerErrorCode(detail.code) ? detail.code : 'UNAVAILABLE';
    const message = sanitizeErrorMessage(
      detail.message,
      'The EduFish request failed.',
    );

    throw new EduFishPluginError(code, message, {
      status,
      operation,
      requestId,
      retriable: code === 'UNAVAILABLE',
    });
  }

  if (parsed.success === true) {
    if (
      !isSuccessStatus(status) ||
      keys.length !== 2 ||
      !Object.prototype.hasOwnProperty.call(parsed, 'data')
    ) {
      throw invalidResponse(
        'EduFish endpoint returned an invalid success envelope.',
        status,
        operation,
        requestId,
      );
    }

    try {
      return validateOperationOutput(operation, parsed.data);
    } catch (error) {
      throw attachOperationContext(error, operation, requestId);
    }
  }

  throw invalidResponse(
    'EduFish endpoint returned an invalid response envelope.',
    status,
    operation,
    requestId,
  );
}

async function readResponseText(
  response: EduFishFetchResponse,
  signal: AbortSignal,
  maxBytes: number,
  failure: () => EduFishPluginError,
  operation: EduFishOperationName,
  requestId: string | undefined,
): Promise<string> {
  if (signal.aborted) throw failure();

  const tooLarge = (): EduFishPluginError =>
    invalidResponse(
      `EduFish response body exceeded ${maxBytes} bytes.`,
      response.status,
      operation,
      requestId,
    );

  if (response.body !== undefined && response.body !== null) {
    if (typeof response.body.getReader !== 'function') {
      throw invalidResponse(
        'EduFish response body is not readable.',
        response.status,
        operation,
        requestId,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let output = '';

    try {
      for (;;) {
        const step = await raceWithAbort(
          Promise.resolve(reader.read()),
          signal,
          failure,
        );
        if (step.done) break;

        const value = step.value;
        if (value === undefined || value === null) continue;

        if (typeof value === 'string') {
          receivedBytes += utf8ByteLength(value);
          output += value;
        } else if (value instanceof Uint8Array) {
          receivedBytes += value.byteLength;
          output += decoder.decode(value, { stream: true });
        } else if (value instanceof ArrayBuffer) {
          const bytes = new Uint8Array(value);
          receivedBytes += bytes.byteLength;
          output += decoder.decode(bytes, { stream: true });
        } else {
          throw invalidResponse(
            'EduFish response body contained an unsupported chunk.',
            response.status,
            operation,
            requestId,
          );
        }

        if (receivedBytes > maxBytes) throw tooLarge();
      }

      output += decoder.decode();
      if (receivedBytes > maxBytes) throw tooLarge();
      return output;
    } catch (error) {
      try {
        await reader.cancel?.();
      } catch {
        // Ignore cancellation failures; the original error is authoritative.
      }
      throw error;
    } finally {
      try {
        reader.releaseLock?.();
      } catch {
        // Best effort only.
      }
    }
  }

  if (typeof response.text === 'function') {
    const text = await raceWithAbort(
      Promise.resolve(response.text()),
      signal,
      failure,
    );
    if (typeof text !== 'string') {
      throw invalidResponse(
        'EduFish response body was not a string.',
        response.status,
        operation,
        requestId,
      );
    }
    if (utf8ByteLength(text) > maxBytes) throw tooLarge();
    return text;
  }

  throw invalidResponse(
    'EduFish response did not contain a readable body.',
    response.status,
    operation,
    requestId,
  );
}

/**
 * Create an HTTP transport for the authenticated EduFish plugin endpoints.
 *
 * The transport owns no identity. It asks `getAccessToken` for the actual user
 * JWT, sends no scope/identity fields in the body or additional headers, and
 * never returns raw network errors to the caller.
 */
export function createHttpTransport(
  options: CreateHttpTransportOptions,
): EduFishHttpTransport {
  if (typeof options !== 'object' || options === null) {
    throw invalidArgument('createHttpTransport requires an options object.');
  }

  if (typeof options.getAccessToken !== 'function') {
    throw invalidArgument('getAccessToken must be a function.');
  }

  if (options.fetch !== undefined && typeof options.fetch !== 'function') {
    throw invalidArgument('fetch must be a function when provided.');
  }

  if (
    options.fetchImpl !== undefined &&
    typeof options.fetchImpl !== 'function'
  ) {
    throw invalidArgument('fetchImpl must be a function when provided.');
  }

  if (options.fetch !== undefined && options.fetchImpl !== undefined) {
    throw invalidArgument('Specify only one of fetch or fetchImpl.');
  }

  if (
    options.timeoutMs !== undefined &&
    options.timeout !== undefined &&
    options.timeoutMs !== options.timeout
  ) {
    throw invalidArgument('Specify only one of timeoutMs or timeout.');
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = normalizeTimeout(options.timeoutMs ?? options.timeout);
  const maxResponseBytes = normalizeMaxResponseBytes(
    options.maxResponseBytes,
  );
  const fetchImpl =
    options.fetch ??
    options.fetchImpl ??
    (globalThis.fetch as unknown as EduFishFetch | undefined);

  if (typeof fetchImpl !== 'function') {
    throw new EduFishPluginError(
      'UNAVAILABLE',
      'No fetch implementation is available in this environment.',
    );
  }

  const getAccessToken = options.getAccessToken;
  const activeControllers = new Set<AbortController>();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    const controllers = [...activeControllers];
    activeControllers.clear();
    for (const controller of controllers) {
      if (!controller.signal.aborted) controller.abort();
    }
  };

  const invoke = async (
    operation: EduFishOperationName,
    rawArguments: Readonly<Record<string, unknown>>,
    invocation: EduFishInvocation,
  ): Promise<unknown> => {
    if (disposed) {
      throw new EduFishPluginError(
        'DISPOSED',
        'The EduFish HTTP transport has been disposed.',
        { operation, requestId: readRequestId(invocation) },
      );
    }

    assertTrustedInvocation(invocation);

    if (!isEduFishOperationName(operation)) {
      throw new EduFishPluginError(
        'UNKNOWN_OPERATION',
        `Unknown EduFish operation: ${String(operation)}`,
      );
    }

    const args = validateOperationInput(operation, rawArguments);
    const requestId = resolveRequestId(operation, invocation);

    if (invocation.signal?.aborted === true) {
      throw abortedError(operation, requestId);
    }

    const controller = new AbortController();
    activeControllers.add(controller);

    let timedOut = false;
    let externallyAborted = false;

    const onExternalAbort = (): void => {
      externallyAborted = true;
      if (!controller.signal.aborted) controller.abort();
    };

    if (invocation.signal !== undefined) {
      invocation.signal.addEventListener('abort', onExternalAbort, {
        once: true,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (!controller.signal.aborted) controller.abort();
    }, timeoutMs);
    const unref = (timer as { unref?: () => void }).unref;
    if (typeof unref === 'function') unref.call(timer);

    const failure = (): EduFishPluginError => {
      if (disposed) return disposedError(operation, requestId);
      if (timedOut) return timeoutError(operation, timeoutMs, requestId);
      // `externallyAborted` and an already-aborted internal signal both mean
      // caller cancellation. Keeping this check last avoids masking disposal
      // or the timeout deadline.
      return abortedError(operation, requestId);
    };

    try {
      const tokenInvocation: EduFishInvocation = {
        scope: {
          userId: invocation.scope.userId,
          sessionId: invocation.scope.sessionId,
        },
        signal: controller.signal,
        ...(requestId === undefined ? {} : { requestId }),
      };

      let token: unknown;
      try {
        token = await raceWithAbort(
          Promise.resolve().then(() => getAccessToken(tokenInvocation)),
          controller.signal,
          failure,
        );
      } catch {
        if (controller.signal.aborted || disposed || timedOut) {
          throw failure();
        }
        throw new EduFishPluginError(
          'UNAUTHORIZED',
          'Could not obtain an access token for the EduFish request.',
          { operation, requestId },
        );
      }

      if (disposed) throw disposedError(operation, requestId);
      if (controller.signal.aborted) throw failure();

      if (
        typeof token !== 'string' ||
        token.trim().length === 0 ||
        token.length > MAX_TOKEN_LENGTH ||
        containsWhitespace(token) ||
        containsControlCharacters(token)
      ) {
        throw new EduFishPluginError(
          'UNAUTHORIZED',
          'The access token provider returned no usable token.',
          { operation, requestId },
        );
      }

      const envelope: Record<string, unknown> = {
        operation,
        arguments: args,
      };
      if (requestId !== undefined) envelope.request_id = requestId;

      let body: string;
      try {
        body = JSON.stringify(envelope);
      } catch {
        throw new EduFishPluginError(
          'INVALID_ARGUMENT',
          'Operation arguments could not be serialised as JSON.',
          { operation, requestId },
        );
      }

      if (utf8ByteLength(body) > MAX_REQUEST_BODY_BYTES) {
        throw new EduFishPluginError(
          'INVALID_ARGUMENT',
          `Serialised request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`,
          { operation, requestId },
        );
      }

      let response: EduFishFetchResponse;
      try {
        response = await raceWithAbort(
          Promise.resolve().then(() =>
            fetchImpl(`${baseUrl}${INVOKE_PATH}`, {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
              },
              body,
              signal: controller.signal,
              redirect: 'error',
              cache: 'no-store',
              credentials: 'omit',
            }),
          ),
          controller.signal,
          failure,
        );
      } catch (error) {
        if (controller.signal.aborted || disposed || timedOut) {
          throw failure();
        }
        if (error instanceof EduFishPluginError) {
          throw attachOperationContext(error, operation, requestId);
        }
        throw new EduFishPluginError(
          'UNAVAILABLE',
          'HTTP transport request failed.',
          { operation, requestId, retriable: true },
        );
      }

      if (disposed) throw disposedError(operation, requestId);
      if (controller.signal.aborted) throw failure();

      if (
        typeof response !== 'object' ||
        response === null ||
        typeof response.status !== 'number' ||
        !Number.isFinite(response.status)
      ) {
        throw new EduFishPluginError(
          'INVALID_RESPONSE',
          'EduFish fetch returned an invalid response object.',
          { operation, requestId },
        );
      }

      let text: string;
      try {
        text = await readResponseText(
          response,
          controller.signal,
          maxResponseBytes,
          failure,
          operation,
          requestId,
        );
      } catch (error) {
        if (controller.signal.aborted || disposed || timedOut) {
          throw failure();
        }
        if (error instanceof EduFishPluginError) {
          throw attachOperationContext(error, operation, requestId);
        }
        throw new EduFishPluginError(
          'UNAVAILABLE',
          'Failed to read the EduFish response body.',
          { operation, requestId, retriable: true },
        );
      }

      if (disposed) throw disposedError(operation, requestId);
      if (controller.signal.aborted) throw failure();

      const result = interpretEnvelopeText(
        text,
        response.status,
        operation,
        requestId,
      );

      if (externallyAborted) throw abortedError(operation, requestId);
      return result;
    } catch (error) {
      throw attachOperationContext(error, operation, requestId);
    } finally {
      clearTimeout(timer);
      if (invocation.signal !== undefined) {
        invocation.signal.removeEventListener('abort', onExternalAbort);
      }
      activeControllers.delete(controller);
    }
  };

  return {
    get disposed(): boolean {
      return disposed;
    },
    invoke,
    dispose,
  };
}

function readRequestId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' ? requestId : undefined;
}
