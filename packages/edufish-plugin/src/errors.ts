import type { EduFishOperationName } from './constants.js';

/**
 * Error codes emitted by the server contract. Any other code received over
 * the wire is mapped to UNAVAILABLE before it can reach the caller.
 */
export const EDUFISH_SERVER_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'UNKNOWN_OPERATION',
  'IDEMPOTENCY_CONFLICT',
  'UNAVAILABLE',
] as const;

export type EduFishServerErrorCode =
  (typeof EDUFISH_SERVER_ERROR_CODES)[number];

/** Errors produced locally by the plugin or its transports. */
export const EDUFISH_CLIENT_ERROR_CODES = [
  'INVALID_OUTPUT',
  'INVALID_RESPONSE',
  'TIMEOUT',
  'ABORTED',
  'DISPOSED',
  'REQUEST_ID_REQUIRED',
  'TRANSPORT_ERROR',
] as const;

export type EduFishClientErrorCode =
  (typeof EDUFISH_CLIENT_ERROR_CODES)[number];

export type EduFishErrorCode =
  | EduFishServerErrorCode
  | EduFishClientErrorCode;

export interface EduFishPluginErrorOptions {
  readonly status?: number;
  readonly operation?: EduFishOperationName | string;
  readonly requestId?: string;
  readonly retriable?: boolean;
}

/**
 * A redacted, serialisable plugin error.
 *
 * The class deliberately does not retain a `cause`. Transport failures can
 * contain request headers, token fragments or filesystem paths; callers only
 * receive a stable code, a scrubbed message and operation context.
 */
export class EduFishPluginError extends Error {
  readonly code: EduFishErrorCode;
  readonly status: number | undefined;
  readonly operation: string | undefined;
  readonly requestId: string | undefined;
  readonly retriable: boolean;

  constructor(
    code: EduFishErrorCode,
    message: string,
    options: EduFishPluginErrorOptions = {},
  ) {
    super(message);
    this.name = 'EduFishPluginError';
    this.code = code;
    this.status = options.status;
    this.operation = options.operation;
    this.requestId = options.requestId;
    this.retriable =
      options.retriable ??
      (code === 'UNAVAILABLE' ||
        code === 'TIMEOUT' ||
        code === 'TRANSPORT_ERROR');
  }

  /** JSON-safe view. Never includes stacks, causes, credentials or arguments. */
  toJSON(): Record<string, unknown> {
    const value: Record<string, unknown> = {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
    };
    if (this.status !== undefined) value.status = this.status;
    if (this.operation !== undefined) value.operation = this.operation;
    if (this.requestId !== undefined) value.request_id = this.requestId;
    return value;
  }
}

export function isEduFishPluginError(
  value: unknown,
): value is EduFishPluginError {
  return value instanceof EduFishPluginError;
}

export function isServerErrorCode(
  value: unknown,
): value is EduFishServerErrorCode {
  return (
    typeof value === 'string' &&
    (EDUFISH_SERVER_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Bound and scrub a server/transport message before it is surfaced.
 *
 * Control characters are replaced, common bearer credentials are redacted,
 * whitespace is collapsed and the result is capped. This is defence in depth;
 * the Python service is still responsible for never emitting secrets.
 */
export function sanitizeErrorMessage(
  value: unknown,
  fallback = 'The EduFish request failed.',
  maxLength = 500,
): string {
  if (typeof value !== 'string') return fallback;

  const controlCharacters = new RegExp('[\\x00-\\x1F\\x7F]+', 'g');

  const scrubbed = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /\b(access[_-]?token|token|password|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/\b[A-Za-z]:\\[^\s"']+/g, '[path]')
    .replace(/\/(?:etc|home|var|tmp|root|Users)\/[^\s"']+/g, '[path]')
    .replace(controlCharacters, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (scrubbed.length === 0) return fallback;
  return scrubbed.length > maxLength
    ? `${scrubbed.slice(0, maxLength - 1)}…`
    : scrubbed;
}
