import {
  EDUFISH_OPERATION,
  EDUFISH_OPERATION_NAMES,
  EDUFISH_PLUGIN_ID,
  EDUFISH_PLUGIN_VERSION,
  EDUFISH_PROTOCOL_VERSION,
  MAX_ANSWER_LENGTH,
  MAX_GRAPH_DEPTH,
  MAX_GRAPH_NODES,
  MAX_ID_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_QUIZ_ANSWERS,
  MAX_SEARCH_RESULTS,
  type EduFishOperationName,
} from './constants.js';
import { deepFreeze } from './freeze.js';
import type {
  AgentDiscoveryMetadata,
  EduFishManifest,
  EduFishManifestOperation,
} from './types.js';

interface OperationMetadataEntry {
  readonly description: string;
  readonly mutates: boolean;
  readonly requiresRequestId: boolean;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly discovery: AgentDiscoveryMetadata;
}

const ID_JSON = {
  type: 'string',
  minLength: 1,
  maxLength: MAX_ID_LENGTH,
} as const;

const objectSchema = (
  required: readonly string[],
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
});

const OPERATION_METADATA_INPUT = {
  [EDUFISH_OPERATION.courseRead]: {
    description:
      'Read an accessible course and its ordered chapters, including learning objectives. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(['course_id'], { course_id: ID_JSON }),
    discovery: {
      operation: EDUFISH_OPERATION.courseRead,
      title: 'Read course outline',
      summary:
        'Return a course summary and ordered chapters for planning or navigation.',
      category: 'course',
      tags: ['course', 'outline', 'chapters', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['course:read'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course identifier.',
          constraints: `1-${MAX_ID_LENGTH} characters`,
        },
      ],
      returns:
        '{course:{id,title,summary,status}, chapters:[{id,title,order,objectives}]}',
      limitations: [
        'There is no course membership table; authenticated users may read published courses.',
        'Teachers and administrators may also read draft courses.',
        'Tenant isolation is not claimed; MULTI_TENANT_ENABLED deployments must refuse plugin use.',
      ],
      examples: [
        {
          description: 'Read one course outline.',
          arguments: { course_id: 'course-001' },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.materialSearch]: {
    description:
      'Search stored course material chunks with deterministic keyword matching. Returns bounded excerpts and citation locators, never fabricated results. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(
      ['course_id', 'query'],
      {
        course_id: ID_JSON,
        query: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_QUERY_LENGTH,
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_SEARCH_RESULTS,
          default: 20,
        },
      },
    ),
    discovery: {
      operation: EDUFISH_OPERATION.materialSearch,
      title: 'Search course materials',
      summary:
        'Find stored evidence chunks with citation locators using labelled keyword retrieval.',
      category: 'material',
      tags: ['materials', 'citations', 'evidence', 'keyword-search', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['material:search'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course whose visible material should be searched.',
        },
        {
          name: 'query',
          type: 'string',
          required: true,
          description: 'Keyword query.',
          constraints: `1-${MAX_QUERY_LENGTH} characters`,
        },
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: 'Maximum number of results.',
          constraints: `1-${MAX_SEARCH_RESULTS}; default 20`,
        },
      ],
      returns:
        '{results:[{chunk_id,material_id,course_id,filename,content,page_number,citation_locator,heading}], retrieval_method:"keyword"}',
      limitations: [
        'Retrieval is deterministic keyword matching; no external model, embedding fallback or fabricated answer is used.',
        'An empty result list means no stored evidence matched; it is not an error.',
        'Results include only global published material plus the current user\'s personal material.',
        'Content length and result count are bounded by the server.',
      ],
      examples: [
        {
          description: 'Find evidence about working memory.',
          arguments: {
            course_id: 'course-001',
            query: 'working memory',
            limit: 5,
          },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.graphNeighborhood]: {
    description:
      'Expand a bounded course concept-graph neighborhood. Edges only connect visible nodes. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(
      ['course_id'],
      {
        course_id: ID_JSON,
        concept_id: ID_JSON,
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_GRAPH_DEPTH,
          default: 1,
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_GRAPH_NODES,
          default: 50,
        },
      },
    ),
    discovery: {
      operation: EDUFISH_OPERATION.graphNeighborhood,
      title: 'Explore concept graph',
      summary:
        'Return visible concept nodes and relationships around a starting concept or across the course.',
      category: 'graph',
      tags: ['knowledge-graph', 'concepts', 'relationships', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['graph:read'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course whose graph should be explored.',
        },
        {
          name: 'concept_id',
          type: 'string',
          required: false,
          description: 'Optional starting concept.',
        },
        {
          name: 'depth',
          type: 'integer',
          required: false,
          description: 'Expansion depth from the starting concept.',
          constraints: `1-${MAX_GRAPH_DEPTH}; default 1`,
        },
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: 'Maximum nodes to return.',
          constraints: `1-${MAX_GRAPH_NODES}; default 50`,
        },
      ],
      returns:
        '{nodes:[{id,label,definition}], edges:[{id,source_id,target_id,relationship,evidence}]}',
      limitations: [
        'Only global published knowledge plus the current user\'s personal graph is visible.',
        'Expansion is bounded; edges are returned only when both endpoints are in the result.',
        'Concept and edge relationships are validated against the requested course.',
      ],
      examples: [
        {
          description: 'Expand two hops around a concept.',
          arguments: {
            course_id: 'course-001',
            concept_id: 'concept-001',
            depth: 2,
            limit: 50,
          },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.quizRead]: {
    description:
      'List quiz prompts for a course chapter. Answers and explanations are never returned. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(
      ['course_id', 'chapter_id'],
      {
        course_id: ID_JSON,
        chapter_id: ID_JSON,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_QUIZ_ANSWERS,
          default: 20,
        },
      },
    ),
    discovery: {
      operation: EDUFISH_OPERATION.quizRead,
      title: 'Read quiz prompts',
      summary:
        'Fetch answer-free quiz prompts for a chapter so a learner can respond.',
      category: 'quiz',
      tags: ['quiz', 'assessment', 'answer-hidden', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['quiz:read'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course that owns the chapter.',
        },
        {
          name: 'chapter_id',
          type: 'string',
          required: true,
          description: 'Chapter whose quiz prompts are requested.',
        },
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: 'Maximum prompts to return.',
          constraints: `1-${MAX_QUIZ_ANSWERS}; default 20`,
        },
      ],
      returns: '{items:[{id,prompt}]}',
      limitations: [
        'Answer and explanation fields are never included.',
        'Quiz material visibility is checked in addition to course/chapter relationships.',
      ],
      examples: [
        {
          description: 'List up to ten prompts.',
          arguments: {
            course_id: 'course-001',
            chapter_id: 'chapter-001',
            limit: 10,
          },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.quizSubmit]: {
    description:
      'Submit 1-20 unique quiz answers for deterministic grading. Requires invocation.requestId for durable idempotency; identical replays return the original result. Writes a progress event.',
    mutates: true,
    requiresRequestId: true,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['course_id', 'chapter_id', 'answers'],
      properties: {
        course_id: ID_JSON,
        chapter_id: ID_JSON,
        answers: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_QUIZ_ANSWERS,
          uniqueItems: true,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['quiz_id', 'answer'],
            properties: {
              quiz_id: ID_JSON,
              answer: {
                type: 'string',
                maxLength: MAX_ANSWER_LENGTH,
              },
            },
          },
        },
      },
    },
    discovery: {
      operation: EDUFISH_OPERATION.quizSubmit,
      title: 'Submit quiz answers',
      summary:
        'Grade answers deterministically, persist a progress event and replay safely by request ID.',
      category: 'quiz',
      tags: ['quiz', 'assessment', 'grading', 'idempotent', 'write'],
      mutates: true,
      requiresRequestId: true,
      idempotency: 'request_id',
      identitySource: 'trusted_invocation_scope',
      scopes: ['quiz:submit'],
      sideEffects: [
        'Persists a quiz submission and an answered_quiz progress event.',
      ],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course that owns the chapter.',
        },
        {
          name: 'chapter_id',
          type: 'string',
          required: true,
          description: 'Chapter whose quiz is being answered.',
        },
        {
          name: 'answers',
          type: 'array',
          required: true,
          description: 'Unique quiz answers, each with quiz_id and answer.',
          constraints: `1-${MAX_QUIZ_ANSWERS} items; answer <= ${MAX_ANSWER_LENGTH} characters`,
        },
      ],
      returns:
        '{submission_id,score,total,results:[{quiz_id,correct,feedback}]}',
      limitations: [
        'Grading compares normalized answers deterministically; it is not an LLM judgement.',
        'The same request ID with identical payload replays the stored result; a different payload returns IDEMPOTENCY_CONFLICT (409).',
        'Repeated answers are not counted as mastery.',
        'Quiz, chapter, course and material visibility are all enforced by the server.',
      ],
      examples: [
        {
          description:
            'Submit two answers; invocation.requestId is required separately.',
          arguments: {
            course_id: 'course-001',
            chapter_id: 'chapter-001',
            answers: [
              { quiz_id: 'quiz-001', answer: 'working memory' },
              { quiz_id: 'quiz-002', answer: 'consolidation' },
            ],
          },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.progressRead]: {
    description:
      'Read the authenticated user\'s course-scoped progress event counts and quiz submissions. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(['course_id'], { course_id: ID_JSON }),
    discovery: {
      operation: EDUFISH_OPERATION.progressRead,
      title: 'Read learning progress',
      summary:
        'Return the current learner\'s event counts and quiz submission history for one course.',
      category: 'progress',
      tags: ['progress', 'history', 'quiz-results', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['progress:read'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course whose progress is requested.',
        },
      ],
      returns:
        '{course_id,student_id,event_counts,quiz_submissions:[{submission_id,chapter_id,score,total,created_at}]}',
      limitations: [
        'Only the authenticated user\'s course-scoped data is returned.',
        'Other users\' personal material, graph evidence and quiz evidence are never exposed.',
        'Event counts are a snapshot, not a mastery model.',
      ],
      examples: [
        {
          description: 'Read progress for one course.',
          arguments: { course_id: 'course-001' },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.labStart]: {
    description:
      'Start a published lab template for the authenticated user. Requires invocation.requestId; the run reservation and idempotency record are persisted before enqueueing. Returns the existing serialized run.',
    mutates: true,
    requiresRequestId: true,
    inputSchema: objectSchema(
      ['course_id', 'template_id'],
      {
        course_id: ID_JSON,
        template_id: ID_JSON,
        params: {
          type: 'object',
          additionalProperties: true,
          maxProperties: 200,
        },
      },
    ),
    discovery: {
      operation: EDUFISH_OPERATION.labStart,
      title: 'Start a lab run',
      summary:
        'Reserve and enqueue a published experiment template, returning the domain run representation.',
      category: 'lab',
      tags: ['experiment', 'lab', 'queue', 'idempotent', 'write'],
      mutates: true,
      requiresRequestId: true,
      idempotency: 'request_id',
      identitySource: 'trusted_invocation_scope',
      scopes: ['lab:start'],
      sideEffects: [
        'Creates an ExperimentRun reservation and enqueues a background job.',
      ],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course the run belongs to.',
        },
        {
          name: 'template_id',
          type: 'string',
          required: true,
          description: 'Published experiment template identifier.',
        },
        {
          name: 'params',
          type: 'object',
          required: false,
          description: 'Opaque, bounded template parameters.',
          constraints: 'Plain JSON object; serialised size <= 16 KiB',
        },
      ],
      returns:
        '{run:<ExperimentService.serialize_run output>}',
      limitations: [
        'Only published templates associated with the requested course are runnable.',
        'Ownership is derived from the authenticated user; caller-supplied owner/student IDs are rejected.',
        'The queue is not a durable distributed job system; cancellation and restart recovery are not guaranteed.',
        'Local filesystem paths are never exposed; artifact payloads may be opaque references.',
      ],
      examples: [
        {
          description:
            'Start a template with a fixed seed; invocation.requestId is required separately.',
          arguments: {
            course_id: 'course-001',
            template_id: 'template-001',
            params: { seed: 42 },
          },
        },
      ],
    },
  },
  [EDUFISH_OPERATION.labStatus]: {
    description:
      'Read status, progress and artifacts for one of the authenticated user\'s lab runs in the exact course. Read-only.',
    mutates: false,
    requiresRequestId: false,
    inputSchema: objectSchema(['course_id', 'run_id'], {
      course_id: ID_JSON,
      run_id: ID_JSON,
    }),
    discovery: {
      operation: EDUFISH_OPERATION.labStatus,
      title: 'Read lab run status',
      summary:
        'Poll the serialized experiment run for status, progress and opaque artifacts.',
      category: 'lab',
      tags: ['experiment', 'lab', 'status', 'artifacts', 'read-only'],
      mutates: false,
      requiresRequestId: false,
      idempotency: 'none',
      identitySource: 'trusted_invocation_scope',
      scopes: ['lab:read'],
      sideEffects: [],
      arguments: [
        {
          name: 'course_id',
          type: 'string',
          required: true,
          description: 'Course the run must belong to.',
        },
        {
          name: 'run_id',
          type: 'string',
          required: true,
          description: 'Experiment run identifier.',
        },
      ],
      returns: '{run:<ExperimentService.serialize_run output>}',
      limitations: [
        'Only runs owned by the authenticated user and matching the exact course are returned.',
        'Local filesystem paths are never exposed; artifacts may be opaque references.',
        'Polling is required; this operation does not push progress events.',
      ],
      examples: [
        {
          description: 'Read a run started earlier.',
          arguments: { course_id: 'course-001', run_id: 'run-001' },
        },
      ],
    },
  },
} as const satisfies Record<EduFishOperationName, OperationMetadataEntry>;

export const OPERATION_METADATA: Readonly<
  Record<EduFishOperationName, OperationMetadataEntry>
> = deepFreeze(OPERATION_METADATA_INPUT);

const manifestOperations: EduFishManifestOperation[] =
  EDUFISH_OPERATION_NAMES.map((name) => {
    const metadata = OPERATION_METADATA[name];
    return {
      name,
      description: metadata.description,
      input_schema: metadata.inputSchema,
      mutates: metadata.mutates,
      requires_request_id: metadata.requiresRequestId,
      discovery: metadata.discovery,
    };
  });

/**
 * Immutable, JSON-serialisable manifest. It mirrors the backend wire manifest
 * and adds explicit agent discovery metadata.
 */
export const EDUFISH_MANIFEST: EduFishManifest = deepFreeze({
  id: EDUFISH_PLUGIN_ID,
  version: EDUFISH_PLUGIN_VERSION,
  protocol_version: EDUFISH_PROTOCOL_VERSION,
  operations: manifestOperations,
});

/** Conventional alias for hosts that expect a lowercase manifest export. */
export const manifest: EduFishManifest = EDUFISH_MANIFEST;
