import {
  MAX_ID_LENGTH,
  MAX_JSON_ARRAY_ITEMS,
  MAX_JSON_DEPTH,
  MAX_JSON_KEY_LENGTH,
  MAX_JSON_KEYS,
  MAX_PARAMS_BYTES,
  MAX_REQUEST_BODY_BYTES,
  MAX_REQUEST_ID_LENGTH,
  isWriteOperation,
  type EduFishOperationName,
} from './constants.js';
import { EduFishPluginError } from './errors.js';
import type { EduFishInvocation } from './types.js';

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasOwn(
  value: object,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function invalidArgument(
  message: string,
  operation?: EduFishOperationName | string,
): EduFishPluginError {
  return new EduFishPluginError('INVALID_ARGUMENT', message, {
    operation,
  });
}

/**
 * Validate the trusted invocation object. Extra host-level fields are
 * tolerated, but identity must come from `scope` and be well-formed.
 */
export function assertTrustedInvocation(
  invocation: unknown,
): asserts invocation is EduFishInvocation {
  if (typeof invocation !== 'object' || invocation === null) {
    throw invalidArgument('invocation must be an object');
  }

  const candidate = invocation as {
    scope?: unknown;
    signal?: unknown;
    requestId?: unknown;
    onEvent?: unknown;
  };

  if (!isPlainObject(candidate.scope)) {
    throw invalidArgument('invocation.scope must be an object');
  }

  const scope = candidate.scope as {
    userId?: unknown;
    sessionId?: unknown;
  };

  if (
    typeof scope.userId !== 'string' ||
    scope.userId.trim().length === 0 ||
    scope.userId.length > MAX_ID_LENGTH
  ) {
    throw invalidArgument(
      'invocation.scope.userId must be a non-empty string of at most 200 characters',
    );
  }

  if (
    typeof scope.sessionId !== 'string' ||
    scope.sessionId.length > MAX_ID_LENGTH
  ) {
    throw invalidArgument(
      'invocation.scope.sessionId must be a string of at most 200 characters',
    );
  }

  if (candidate.requestId !== undefined) {
    if (
      typeof candidate.requestId !== 'string' ||
      candidate.requestId.length === 0 ||
      candidate.requestId.length > MAX_REQUEST_ID_LENGTH ||
      candidate.requestId.trim().length === 0 ||
      containsControlCharacters(candidate.requestId)
    ) {
      throw invalidArgument(
        'invocation.requestId must be a non-empty, control-free string of at most 200 characters',
      );
    }
  }

  if (candidate.signal !== undefined) {
    const signal = candidate.signal as {
      aborted?: unknown;
      addEventListener?: unknown;
      removeEventListener?: unknown;
    };
    if (
      typeof candidate.signal !== 'object' ||
      candidate.signal === null ||
      typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function'
    ) {
      throw invalidArgument('invocation.signal must be an AbortSignal');
    }
  }

  if (
    candidate.onEvent !== undefined &&
    typeof candidate.onEvent !== 'function'
  ) {
    throw invalidArgument('invocation.onEvent must be a function');
  }
}

/**
 * Resolve and validate the idempotency key. Write operations require one.
 */
export function resolveRequestId(
  operation: EduFishOperationName,
  invocation: EduFishInvocation,
): string | undefined {
  const requestId = invocation.requestId;

  if (requestId === undefined) {
    if (isWriteOperation(operation)) {
      throw new EduFishPluginError(
        'REQUEST_ID_REQUIRED',
        `Operation ${operation} requires invocation.requestId; retries must reuse the same key.`,
        { operation },
      );
    }
    return undefined;
  }

  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    requestId.length > MAX_REQUEST_ID_LENGTH ||
    requestId.trim().length === 0 ||
    containsControlCharacters(requestId)
  ) {
    throw invalidArgument(
      'invocation.requestId must be a non-empty, control-free string of at most 200 characters',
      operation,
    );
  }

  return requestId;
}

const RESERVED_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  'userid',
  'studentid',
  'ownerid',
  'actorid',
  'tenantid',
  'sessionid',
  'scope',
  'identity',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'bearertoken',
  'jwt',
  'role',
  'roles',
  'isadmin',
  'admin',
  'principal',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Reject identity/role override arguments at any nesting level.
 *
 * Top-level unknown keys are already rejected by the strict Zod schemas. This
 * guard additionally protects opaque payloads such as lab `params`, where a
 * caller might otherwise smuggle `student_id`, `role` or an access token.
 */
export function assertNoIdentityOverrides(
  value: unknown,
  operation: EduFishOperationName,
): void {
  if (typeof value !== 'object' || value === null) return;

  const seen = new WeakSet<object>();
  const stack: Array<{ value: object; path: string; depth: number }> = [
    { value: value as object, path: 'arguments', depth: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    if (current.depth > MAX_JSON_DEPTH + 2) continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);

    let keys: string[];
    try {
      keys = Object.keys(current.value);
    } catch {
      throw invalidArgument('arguments must be a plain JSON value', operation);
    }

    for (const key of keys) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      ) {
        throw invalidArgument(
          `Prototype-related argument key "${key}" is not allowed at ${current.path}.`,
          operation,
        );
      }

      const normalized = normalizeKey(key);
      if (RESERVED_IDENTITY_KEYS.has(normalized)) {
        throw new EduFishPluginError(
          'INVALID_ARGUMENT',
          `Identity or authorization override argument "${key}" is not allowed at ${current.path}. Identity is resolved from the trusted invocation scope.`,
          { operation },
        );
      }

      let child: unknown;
      try {
        child = (current.value as Record<string, unknown>)[key];
      } catch {
        throw invalidArgument(
          'arguments must be a plain JSON value',
          operation,
        );
      }

      if (typeof child === 'object' && child !== null) {
        stack.push({
          value: child,
          path: `${current.path}.${key}`,
          depth: current.depth + 1,
        });
      }
    }
  }
}

export interface JsonBounds {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxKeys: number;
  readonly maxArrayItems: number;
}

const DEFAULT_JSON_BOUNDS: JsonBounds = {
  maxBytes: MAX_REQUEST_BODY_BYTES,
  maxDepth: MAX_JSON_DEPTH,
  maxKeys: MAX_JSON_KEYS,
  maxArrayItems: MAX_JSON_ARRAY_ITEMS,
};

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Ensure a value is plain JSON, finite, acyclic, prototype-safe and bounded.
 * Error messages never include the offending value.
 */
export function assertJsonSafe(
  value: unknown,
  label: string,
  operation: EduFishOperationName,
  overrides: Partial<JsonBounds> = {},
): void {
  const bounds: JsonBounds = { ...DEFAULT_JSON_BOUNDS, ...overrides };
  const seen = new WeakSet<object>();
  let approximateCharacters = 0;

  function fail(reason: string): never {
    throw invalidArgument(`${label} ${reason}`, operation);
  }

  const walk = (node: unknown, depth: number): void => {
    if (depth > bounds.maxDepth) {
      fail(`must not exceed ${bounds.maxDepth} levels of nesting`);
    }

    if (node === null) return;

    switch (typeof node) {
      case 'string':
        approximateCharacters += node.length;
        break;
      case 'number':
        if (!Number.isFinite(node)) {
          fail('must contain only finite numbers');
        }
        break;
      case 'boolean':
        break;
      case 'object': {
        if (seen.has(node)) {
          fail('must not contain circular references');
        }
        seen.add(node);

        if (Array.isArray(node)) {
          if (node.length > bounds.maxArrayItems) {
            fail(
              `must not contain arrays longer than ${bounds.maxArrayItems} items`,
            );
          }
          for (const item of node) walk(item, depth + 1);
          seen.delete(node);
          break;
        }

        if (!isPlainObject(node)) {
          fail('must contain only plain JSON objects');
        }

        const keys = Object.keys(node);
        if (keys.length > bounds.maxKeys) {
          fail(`must not contain objects with more than ${bounds.maxKeys} keys`);
        }

        for (const key of keys) {
          if (key.length > MAX_JSON_KEY_LENGTH) {
            fail(
              `must not contain object keys longer than ${MAX_JSON_KEY_LENGTH} characters`,
            );
          }
          if (
            key === '__proto__' ||
            key === 'constructor' ||
            key === 'prototype'
          ) {
            fail('must not contain prototype-related object keys');
          }
          approximateCharacters += key.length;
          let child: unknown;
          try {
            child = (node as Record<string, unknown>)[key];
          } catch {
            fail('must be a readable plain JSON value');
          }
          walk(child, depth + 1);
        }
        seen.delete(node);
        break;
      }
      default:
        fail(
          `must contain only JSON values (received ${typeof node})`,
        );
    }

    if (approximateCharacters > bounds.maxBytes) {
      fail(`must be at most ${bounds.maxBytes} bytes when serialised`);
    }
  };

  try {
    walk(value, 0);
  } catch (error) {
    if (error instanceof EduFishPluginError) throw error;
    fail('must be a plain JSON value');
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail('must be a plain JSON value');
  }

  if (serialized === undefined) {
    fail('must be a plain JSON value');
  }

  if (utf8ByteLength(serialized) > bounds.maxBytes) {
    fail(`must be at most ${bounds.maxBytes} bytes when serialised`);
  }
}

/** Tighter bound for the opaque `params` object of `edufish.lab.start`. */
export function assertLabParamsSafe(
  value: unknown,
  operation: EduFishOperationName,
): void {
  assertJsonSafe(value, 'params', operation, {
    maxBytes: MAX_PARAMS_BYTES,
    maxDepth: 8,
  });
}
