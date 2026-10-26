import { z } from 'zod';

import {
  MAX_GRAPH_EDGES,
  MAX_LAB_ARTIFACTS,
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

export const GraphNeighborhoodOutputSchema = z
  .object({
    nodes: z.array(GraphNodeSchema).max(100),
    edges: z.array(GraphEdgeSchema).max(MAX_GRAPH_EDGES),
  })
  .strict();

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

export const ProgressReadOutputSchema = z
  .object({
    course_id: IdSchema,
    student_id: IdSchema,
    event_counts: z.record(NonNegativeIntegerSchema),
    quiz_submissions: z
      .array(QuizSubmissionSummarySchema)
      .max(MAX_PROGRESS_SUBMISSIONS),
  })
  .strict();

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
  })
  .strict();

export const LabStatusOutputSchema = z
  .object({
    run: ExperimentRunSchema,
  })
  .strict();

export type LabStartOutput = z.output<typeof LabStartOutputSchema>;
export type LabStatusOutput = z.output<typeof LabStatusOutputSchema>;
export type ExperimentRun = z.output<typeof ExperimentRunSchema>;
