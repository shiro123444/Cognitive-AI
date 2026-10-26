/**
 * @edufish/plugin — host-independent EduFish atomic plugin.
 *
 * No Qingzhou imports, no global registration and no dependency on the custom
 * Node Agent Runtime. The package speaks the authenticated HTTP wire protocol
 * through an injected transport.
 */

export {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  EDUFISH_OPERATION,
  EDUFISH_OPERATION_NAMES,
  EDUFISH_PACKAGE_NAME,
  EDUFISH_PLUGIN_ID,
  EDUFISH_PLUGIN_VERSION,
  EDUFISH_PROTOCOL_VERSION,
  EDUFISH_WRITE_OPERATIONS,
  MAX_ANSWER_LENGTH,
  MAX_GRAPH_DEPTH,
  MAX_GRAPH_NODES,
  MAX_ID_LENGTH,
  MAX_PARAMS_BYTES,
  MAX_QUERY_LENGTH,
  MAX_QUIZ_ANSWERS,
  MAX_REQUEST_BODY_BYTES,
  MAX_REQUEST_ID_LENGTH,
  MAX_SEARCH_RESULTS,
  isEduFishOperationName,
  isWriteOperation,
  type EduFishOperationName,
} from './constants.js';

export {
  EDUFISH_CLIENT_ERROR_CODES,
  EDUFISH_SERVER_ERROR_CODES,
  EduFishPluginError,
  isEduFishPluginError,
  isServerErrorCode,
  sanitizeErrorMessage,
  type EduFishClientErrorCode,
  type EduFishErrorCode,
  type EduFishPluginErrorOptions,
  type EduFishServerErrorCode,
} from './errors.js';

export type {
  AgentArgumentHint,
  AgentArgumentType,
  AgentDiscoveryExample,
  AgentDiscoveryMetadata,
  EduFishCompletedEvent,
  EduFishEventSink,
  EduFishEventType,
  EduFishFailedEvent,
  EduFishInvocation,
  EduFishManifest,
  EduFishManifestOperation,
  EduFishOperationDefinition,
  EduFishOperationEvent,
  EduFishOperationEventBase,
  EduFishOperationScope,
  EduFishPlugin,
  EduFishStartedEvent,
  EduFishTransport,
} from './types.js';

export {
  abortedError,
  disposedError,
  raceWithAbort,
  timeoutError,
} from './failures.js';

export {
  assertJsonSafe,
  assertLabParamsSafe,
  assertNoIdentityOverrides,
  assertTrustedInvocation,
  resolveRequestId,
} from './guards.js';

export {
  OPERATION_METADATA,
  EDUFISH_MANIFEST,
  manifest,
} from './metadata.js';

export {
  OPERATION_SPECS,
  OPERATION_SPEC_BY_NAME,
  getOperationSpec,
  type OperationSpec,
} from './operations.js';

export {
  createEduFishPlugin,
  type CreateEduFishPluginOptions,
} from './plugin.js';

export {
  createHttpTransport,
  type CreateHttpTransportOptions,
  type EduFishFetch,
  type EduFishFetchInit,
  type EduFishFetchResponse,
  type EduFishHttpTransport,
  type EduFishReadableStream,
  type EduFishStreamReader,
  type EduFishStreamReadResult,
} from './transport/http.js';

export {
  formatZodIssues,
  validateOperationInput,
  validateOperationOutput,
} from './validation.js';

export {
  CourseReadInputSchema,
  GraphNeighborhoodInputSchema,
  LabStartInputSchema,
  LabStatusInputSchema,
  MaterialSearchInputSchema,
  ProgressReadInputSchema,
  QuizAnswerInputSchema,
  QuizReadInputSchema,
  QuizSubmitInputSchema,
  type CourseReadInput,
  type CourseReadParsedInput,
  type GraphNeighborhoodInput,
  type GraphNeighborhoodParsedInput,
  type LabStartInput,
  type LabStartParsedInput,
  type LabStatusInput,
  type LabStatusParsedInput,
  type MaterialSearchInput,
  type MaterialSearchParsedInput,
  type ProgressReadInput,
  type ProgressReadParsedInput,
  type QuizAnswerInput,
  type QuizReadInput,
  type QuizReadParsedInput,
  type QuizSubmitInput,
  type QuizSubmitParsedInput,
} from './schemas/inputs.js';

export {
  ChapterSchema,
  CourseReadOutputSchema,
  CourseSummarySchema,
  ExperimentArtifactSchema,
  ExperimentReportSchema,
  ExperimentRunSchema,
  GraphEdgeSchema,
  GraphNeighborhoodOutputSchema,
  GraphNodeSchema,
  LabStartOutputSchema,
  LabStatusOutputSchema,
  MaterialSearchOutputSchema,
  MaterialSearchResultSchema,
  ProgressReadOutputSchema,
  QuizItemSchema,
  QuizReadOutputSchema,
  QuizSubmissionSummarySchema,
  QuizSubmitOutputSchema,
  QuizSubmitResultSchema,
  type CourseReadOutput,
  type ExperimentRun,
  type GraphNeighborhoodOutput,
  type LabStartOutput,
  type LabStatusOutput,
  type MaterialSearchOutput,
  type ProgressReadOutput,
  type QuizReadOutput,
  type QuizSubmitOutput,
} from './schemas/outputs.js';

export {
  OPERATION_INPUT_SCHEMAS,
  OPERATION_OUTPUT_SCHEMAS,
  type EduFishOperationArguments,
  type EduFishOperationInput,
  type EduFishOperationOutput,
  type EduFishOperationParsedInput,
  type EduFishOperationResult,
} from './schemas/registry.js';

export {
  ErrorDetailSchema,
  ErrorEnvelopeSchema,
  SuccessEnvelopeSchema,
  type ErrorEnvelope,
} from './schemas/envelopes.js';
