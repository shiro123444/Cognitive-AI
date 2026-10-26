import type { z } from 'zod';

import type { EduFishOperationName } from './constants.js';
import { EduFishPluginError } from './errors.js';
import {
  assertJsonSafe,
  assertLabParamsSafe,
  assertNoIdentityOverrides,
} from './guards.js';
import { EDUFISH_OPERATION } from './constants.js';
import {
  OPERATION_INPUT_SCHEMAS,
  OPERATION_OUTPUT_SCHEMAS,
} from './schemas/registry.js';

export function formatZodIssues(
  error: z.ZodError,
  maxIssues = 6,
): string {
  const issues = error.issues.slice(0, maxIssues).map((issue) => {
    const path =
      issue.path.length > 0
        ? issue.path.map((part) => String(part)).join('.')
        : '(root)';
    return `${path}: ${issue.message}`;
  });
  const remaining = error.issues.length - issues.length;
  if (remaining > 0) {
    issues.push(`and ${remaining} more issue${remaining === 1 ? '' : 's'}`);
  }
  return issues.join('; ');
}

/**
 * Validate, canonicalise and bound operation arguments.
 *
 * Identity overrides are rejected before Zod so the error is explicit even
 * when the key appears inside an opaque object such as lab `params`.
 */
export function validateOperationInput(
  operation: EduFishOperationName,
  rawInput: unknown,
): Record<string, unknown> {
  assertNoIdentityOverrides(rawInput, operation);

  const schema = OPERATION_INPUT_SCHEMAS[operation];
  const result = schema.safeParse(rawInput);
  if (!result.success) {
    throw new EduFishPluginError(
      'INVALID_ARGUMENT',
      `Invalid arguments for ${operation}: ${formatZodIssues(result.error)}`,
      { operation },
    );
  }

  assertJsonSafe(result.data, 'arguments', operation);

  if (operation === EDUFISH_OPERATION.labStart) {
    const parsed = result.data as { params?: unknown };
    if (parsed.params !== undefined) {
      assertLabParamsSafe(parsed.params, operation);
    }
  }

  return result.data as Record<string, unknown>;
}

/**
 * Validate the operation-specific success payload. Unknown fields are
 * rejected so a backend cannot silently leak quiz answers or extra identity
 * data through a read operation.
 */
export function validateOperationOutput(
  operation: EduFishOperationName,
  rawOutput: unknown,
): unknown {
  const schema = OPERATION_OUTPUT_SCHEMAS[operation];
  const result = schema.safeParse(rawOutput);
  if (!result.success) {
    throw new EduFishPluginError(
      'INVALID_OUTPUT',
      `Invalid output for ${operation}: ${formatZodIssues(result.error)}`,
      { operation },
    );
  }
  return result.data;
}

/**
 * Attach operation/request context without ever copying a raw thrown value.
 * Non-plugin errors become a generic redacted transport error.
 */
export function attachOperationContext(
  error: unknown,
  operation: EduFishOperationName,
  requestId: string | undefined,
): EduFishPluginError {
  if (error instanceof EduFishPluginError) {
    if (error.operation === operation && error.requestId === requestId) {
      return error;
    }
    return new EduFishPluginError(error.code, error.message, {
      status: error.status,
      operation,
      requestId: requestId ?? error.requestId,
      retriable: error.retriable,
    });
  }

  return new EduFishPluginError(
    'TRANSPORT_ERROR',
    `Transport failed while invoking ${operation}.`,
    { operation, requestId, retriable: true },
  );
}
