/**
 * Stable identifiers, operation names and hard bounds for the EduFish plugin.
 *
 * Everything in this file is wire-visible or part of the package's public
 * contract. Keep the values in sync with docs/plugin/IMPLEMENTATION-CONTRACT.md.
 */

export const EDUFISH_PLUGIN_ID = 'edufish' as const;
export const EDUFISH_PACKAGE_NAME = '@edufish/plugin' as const;
export const EDUFISH_PLUGIN_VERSION = '0.1.0' as const;
export const EDUFISH_PROTOCOL_VERSION = 1 as const;

export const EDUFISH_OPERATION = {
  courseRead: 'edufish.course.read',
  materialSearch: 'edufish.material.search',
  graphNeighborhood: 'edufish.graph.neighborhood',
  quizRead: 'edufish.quiz.read',
  quizSubmit: 'edufish.quiz.submit',
  progressRead: 'edufish.progress.read',
  labStart: 'edufish.lab.start',
  labStatus: 'edufish.lab.status',
} as const;

export type EduFishOperationName =
  (typeof EDUFISH_OPERATION)[keyof typeof EDUFISH_OPERATION];

/** Ordered list used by the immutable manifest and discovery surfaces. */
export const EDUFISH_OPERATION_NAMES: readonly EduFishOperationName[] =
  Object.freeze([
    EDUFISH_OPERATION.courseRead,
    EDUFISH_OPERATION.materialSearch,
    EDUFISH_OPERATION.graphNeighborhood,
    EDUFISH_OPERATION.quizRead,
    EDUFISH_OPERATION.quizSubmit,
    EDUFISH_OPERATION.progressRead,
    EDUFISH_OPERATION.labStart,
    EDUFISH_OPERATION.labStatus,
  ]);

/**
 * Operations that require `invocation.requestId`.
 *
 * Both operations mutate durable domain state and must be safely replayable
 * after a transport retry. This list is intentionally duplicated in the
 * manifest metadata and checked by both the plugin and the HTTP transport.
 */
export const EDUFISH_WRITE_OPERATIONS: readonly EduFishOperationName[] =
  Object.freeze([EDUFISH_OPERATION.quizSubmit, EDUFISH_OPERATION.labStart]);

export const MAX_ID_LENGTH = 200;
export const MAX_QUERY_LENGTH = 2_000;
export const MAX_ANSWER_LENGTH = 4_000;
export const MAX_REQUEST_ID_LENGTH = 200;

export const MAX_SEARCH_RESULTS = 20;
export const MAX_SEARCH_CONTENT_CHARS = 40_000;
export const MAX_GRAPH_DEPTH = 2;
export const MAX_GRAPH_NODES = 100;
export const MAX_GRAPH_EDGES = 1_000;
export const MAX_QUIZ_ANSWERS = 20;
export const MAX_QUIZ_RESULTS = 20;
export const MAX_PROGRESS_SUBMISSIONS = 1_000;
export const MAX_LAB_ARTIFACTS = 200;

/** Maximum serialised size of an experiment `params` object. */
export const MAX_PARAMS_BYTES = 16 * 1024;

/** Maximum serialised request body accepted by the HTTP transport. */
export const MAX_REQUEST_BODY_BYTES = 256 * 1024;

/** Maximum response body accepted by the HTTP transport. */
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MIN_MAX_RESPONSE_BYTES = 1_024;
export const MAX_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const MIN_REQUEST_TIMEOUT_MS = 1;
export const MAX_REQUEST_TIMEOUT_MS = 120_000;

/** Maximum nesting depth accepted for caller-supplied JSON values. */
export const MAX_JSON_DEPTH = 8;
export const MAX_JSON_KEYS = 500;
export const MAX_JSON_ARRAY_ITEMS = 1_000;
export const MAX_JSON_KEY_LENGTH = 200;

export function isEduFishOperationName(
  value: unknown,
): value is EduFishOperationName {
  return (
    typeof value === 'string' &&
    (EDUFISH_OPERATION_NAMES as readonly string[]).includes(value)
  );
}

export function isWriteOperation(
  operation: EduFishOperationName,
): boolean {
  return (EDUFISH_WRITE_OPERATIONS as readonly string[]).includes(operation);
}
