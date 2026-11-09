import { z } from 'zod';

import {
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  MAX_LAB_ARTIFACTS,
  MAX_LAB_EVIDENCE_ARTIFACTS,
  MAX_LAB_EVIDENCE_RUNS,
  MAX_SEARCH_CONTENT_CHARS,
  MAX_SEARCH_RESULTS,
  MAX_QUIZ_RESULTS,
  MAX_PROGRESS_SUBMISSIONS,
} from '../constants.js';
import {
  IdSchema,
  JsonRecordSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
  boundedText,
} from './common.js';

/* ------------------------------------------------------------------------- */
/* Course                                                                    */
/* ------------------------------------------------------------------------- */

export const CourseSummarySchema = z
  .object({
    id: IdSchema,
    title: boundedText(500),
    summary: boundedText(20_000),
    status: boundedText(50),
  })
  .strict();

export const ChapterSchema = z
  .object({
    id: IdSchema,
    title: boundedText(500),
    order: z.number().int(),
    objectives: boundedText(20_000),
  })
  .strict();

export const CourseReadOutputSchema = z
  .object({
    course: CourseSummarySchema,
    chapters: z.array(ChapterSchema).max(500),
  })
  .strict();

export type CourseReadOutput = z.output<typeof CourseReadOutputSchema>;

/* ------------------------------------------------------------------------- */
/* Material search                                                           */
/* ------------------------------------------------------------------------- */

export const MaterialSearchResultSchema = z
  .object({
    chunk_id: IdSchema,
    material_id: IdSchema,
    course_id: IdSchema,
    filename: boundedText(500),
    content: boundedText(MAX_SEARCH_CONTENT_CHARS),
    page_number: NonNegativeIntegerSchema,
    citation_locator: boundedText(500),
    heading: boundedText(500).nullable(),
  })
  .strict();

export const MaterialSearchOutputSchema = z
  .object({
    results: z.array(MaterialSearchResultSchema).max(MAX_SEARCH_RESULTS),
    retrieval_method: z.literal('keyword'),
  })
  .strict();

export type MaterialSearchOutput = z.output<
  typeof MaterialSearchOutputSchema
>;

/* ------------------------------------------------------------------------- */
/* Knowledge graph                                                           */
/* ------------------------------------------------------------------------- */

export const GraphNodeSchema = z
  .object({
    id: IdSchema,
    label: boundedText(500),
    definition: boundedText(20_000),
  })
  .strict();

export const GraphEdgeSchema = z
  .object({
    id: IdSchema,
    source_id: IdSchema,
    target_id: IdSchema,
    relationship: boundedText(200),
    evidence: boundedText(20_000),
  })
  .strict();

const ContentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Domain IDs must be resolved to host resources by an authorized host adapter. */
export const GraphSourceReferenceSchema = z
  .object({
    course_id: IdSchema,
    material_id: IdSchema,
    chunk_id: IdSchema,
    filename: boundedText(500),
    page_number: NonNegativeIntegerSchema,
    citation_locator: boundedText(500),
    content_sha256: ContentHashSchema,
  })
  .strict();

export const GraphActivityReferenceSchema = z
  .object({
    activity_id: IdSchema,
    chapter_id: IdSchema.nullable(),
    title: boundedText(500),
    activity_type: boundedText(50),
  })
  .strict();

export const GraphExperimentReferenceSchema = z
  .object({
    template_id: IdSchema,
    title: boundedText(500),
    adapter: boundedText(100),
  })
  .strict();

export const GraphConceptContextSchema = z
  .object({
    concept_id: IdSchema,
    sources: z.array(GraphSourceReferenceSchema).max(10),
    activities: z.array(GraphActivityReferenceSchema).max(20),
    experiments: z.array(GraphExperimentReferenceSchema).max(20),
  })
  .strict();

export const GraphEdgeContextSchema = z
  .object({
    edge_id: IdSchema,
    sources: z.array(GraphSourceReferenceSchema).max(10),
  })
  .strict();

/** Opt-in extension; a digest identifies this authorized snapshot, not a live graph. */
export const GraphContextSchema = z
  .object({
    version: z.literal(1),
    course_id: IdSchema,
    snapshot_id: ContentHashSchema,
    concepts: z.array(GraphConceptContextSchema).max(MAX_GRAPH_NODES),
    edges: z.array(GraphEdgeContextSchema).max(MAX_GRAPH_EDGES),
  })
  .strict();

export const GraphNeighborhoodOutputSchema = z
  .object({
    nodes: z.array(GraphNodeSchema).max(MAX_GRAPH_NODES),
    edges: z.array(GraphEdgeSchema).max(MAX_GRAPH_EDGES),
    context: GraphContextSchema.optional(),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const context = graph.context;
    if (!context) return;

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    const conceptIds = new Set(context.concepts.map((entry) => entry.concept_id));
    const contextEdgeIds = new Set(context.edges.map((entry) => entry.edge_id));
    if (
      nodeIds.size !== graph.nodes.length ||
      conceptIds.size !== context.concepts.length ||
      conceptIds.size !== nodeIds.size ||
      context.concepts.some((entry) => !nodeIds.has(entry.concept_id))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context', 'concepts'],
        message: 'Concept context must match the returned nodes exactly',
      });
    }
    if (
      edgeIds.size !== graph.edges.length ||
      contextEdgeIds.size !== context.edges.length ||
      contextEdgeIds.size !== edgeIds.size ||
      context.edges.some((entry) => !edgeIds.has(entry.edge_id)) ||
      graph.edges.some((edge) => !nodeIds.has(edge.source_id) || !nodeIds.has(edge.target_id))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context', 'edges'],
        message: 'Edge context must match the returned edges and visible endpoints',
      });
    }
    for (const entry of [...context.concepts, ...context.edges]) {
      const chunks = new Set(entry.sources.map((source) => source.chunk_id));
      if (
        chunks.size !== entry.sources.length ||
        entry.sources.some((source) => source.course_id !== context.course_id)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['context'],
          message: 'Sources must be unique within their subject and belong to the graph course',
        });
      }
    }
  });

export type GraphSourceReference = z.output<typeof GraphSourceReferenceSchema>;
export type GraphActivityReference = z.output<typeof GraphActivityReferenceSchema>;
export type GraphExperimentReference = z.output<typeof GraphExperimentReferenceSchema>;
export type GraphContext = z.output<typeof GraphContextSchema>;
export type GraphNeighborhoodOutput = z.output<
  typeof GraphNeighborhoodOutputSchema
>;

/* ------------------------------------------------------------------------- */
/* Quiz                                                                      */
/* ------------------------------------------------------------------------- */

/** Deliberately excludes `answer` and `explanation`. Strict objects catch leaks. */
export const QuizItemSchema = z
  .object({
    id: IdSchema,
    prompt: boundedText(20_000),
  })
  .strict();

export const QuizReadOutputSchema = z
  .object({
    items: z.array(QuizItemSchema).max(20),
  })
  .strict();

export type QuizReadOutput = z.output<typeof QuizReadOutputSchema>;

export const QuizSubmitResultSchema = z
  .object({
    quiz_id: IdSchema,
    correct: z.boolean(),
    feedback: boundedText(4_000),
  })
  .strict();

export const QuizSubmitOutputSchema = z
  .object({
    submission_id: IdSchema,
    score: z.number().nonnegative(),
    total: z.number().int().nonnegative(),
    results: z.array(QuizSubmitResultSchema).max(MAX_QUIZ_RESULTS),
  })
  .strict();

export type QuizSubmitOutput = z.output<typeof QuizSubmitOutputSchema>;

/* ------------------------------------------------------------------------- */
/* Progress                                                                  */
/* ------------------------------------------------------------------------- */

export const QuizSubmissionSummarySchema = z
  .object({
    submission_id: IdSchema,
    chapter_id: IdSchema.nullable(),
    score: z.number().nonnegative(),
    total: z.number().int().nonnegative(),
    created_at: TimestampSchema.nullable(),
  })
  .strict();

/** Persisted run context; the snapshot hash is caller-reported correlation. */
export const LabLearningContextSchema = z
  .object({
    version: z.literal(1),
    course_id: IdSchema,
    chapter_id: IdSchema.nullable(),
    activity_id: IdSchema.nullable(),
    concept_id: IdSchema.nullable(),
    graph_snapshot_id: ContentHashSchema.nullable(),
  })
  .strict()
  .superRefine((context, ctx) => {
    if (context.graph_snapshot_id !== null && context.concept_id === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['graph_snapshot_id'],
        message: 'A graph snapshot reference requires concept_id',
      });
    }
  });

/** A bounded pointer to a successful run, not a concept assessment. */
export const LabEvidenceSchema = z
  .object({
    run_id: IdSchema,
    template_id: IdSchema,
    adapter: boundedText(100),
    status: z.literal('completed'),
    completed_at: TimestampSchema,
    learning_context: LabLearningContextSchema,
    artifact_count: NonNegativeIntegerSchema,
    artifact_ids: z.array(IdSchema).max(MAX_LAB_EVIDENCE_ARTIFACTS),
    report_id: IdSchema.nullable(),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (
      evidence.artifact_count < evidence.artifact_ids.length ||
      new Set(evidence.artifact_ids).size !== evidence.artifact_ids.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artifact_ids'],
        message: 'Artifact references must be unique and bounded by artifact_count',
      });
    }
  });

export const LabEvidenceCollectionSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(LabEvidenceSchema).max(MAX_LAB_EVIDENCE_RUNS),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (new Set(evidence.runs.map((run) => run.run_id)).size !== evidence.runs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runs'],
        message: 'Completed run references must be unique',
      });
    }
  });

export const ProgressReadOutputSchema = z
  .object({
    course_id: IdSchema,
    student_id: IdSchema,
    event_counts: z.record(NonNegativeIntegerSchema),
    quiz_submissions: z
      .array(QuizSubmissionSummarySchema)
      .max(MAX_PROGRESS_SUBMISSIONS),
    lab_evidence: LabEvidenceCollectionSchema.optional(),
  })
  .strict()
  .superRefine((progress, ctx) => {
    progress.lab_evidence?.runs.forEach((run, index) => {
      if (run.learning_context.course_id !== progress.course_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lab_evidence', 'runs', index, 'learning_context', 'course_id'],
          message: 'Lab evidence must belong to the progress course',
        });
      }
    });
  });

export type LabLearningContext = z.output<typeof LabLearningContextSchema>;
export type LabEvidence = z.output<typeof LabEvidenceSchema>;
export type LabEvidenceCollection = z.output<typeof LabEvidenceCollectionSchema>;

export type ProgressReadOutput = z.output<typeof ProgressReadOutputSchema>;

/* ------------------------------------------------------------------------- */
/* Lab                                                                       */
/* ------------------------------------------------------------------------- */

export const ExperimentArtifactSchema = z
  .object({
    id: IdSchema,
    run_id: IdSchema,
    artifact_type: boundedText(100),
    title: boundedText(500),
    data: z.unknown(),
    created_at: TimestampSchema.nullable(),
  })
  .strict();

export const ExperimentReportSchema = z
  .object({
    id: IdSchema,
    run_id: IdSchema,
    status: boundedText(50),
    content: JsonRecordSchema,
    created_at: TimestampSchema.nullable(),
    updated_at: TimestampSchema.nullable(),
  })
  .strict();

/**
 * Mirrors `ExperimentService.serialize_run` in the Python backend.
 *
 * The server must scrub local paths and replace raw artifact payloads with
 * opaque references where necessary; `data` is intentionally opaque here.
 */
export const ExperimentRunSchema = z
  .object({
    id: IdSchema,
    template_id: IdSchema,
    student_id: IdSchema.nullable(),
    course_id: IdSchema.nullable(),
    status: boundedText(50),
    adapter: boundedText(100),
    params: JsonRecordSchema,
    summary: JsonRecordSchema,
    error_message: boundedText(4_000),
    job_id: boundedText(200),
    progress: z.number().int().min(0).max(100),
    progress_message: boundedText(1_000),
    pipeline_nodes: JsonRecordSchema,
    artifacts: z.array(ExperimentArtifactSchema).max(MAX_LAB_ARTIFACTS),
    report: ExperimentReportSchema.nullable(),
    created_at: TimestampSchema.nullable(),
    completed_at: TimestampSchema.nullable(),
  })
  .strict();

export const LabStartOutputSchema = z
  .object({
    run: ExperimentRunSchema,
    learning_context: LabLearningContextSchema.optional(),
  })
  .strict()
  .superRefine((output, ctx) => {
    if (
      output.learning_context !== undefined &&
      output.learning_context.course_id !== output.run.course_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['learning_context', 'course_id'],
        message: 'Learning context must belong to the run course',
      });
    }
  });

export const LabStatusOutputSchema = LabStartOutputSchema;

export type LabStartOutput = z.output<typeof LabStartOutputSchema>;
export type LabStatusOutput = z.output<typeof LabStatusOutputSchema>;
export type ExperimentRun = z.output<typeof ExperimentRunSchema>;
