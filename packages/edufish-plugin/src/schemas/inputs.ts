import { z } from 'zod';

import {
  MAX_ANSWER_LENGTH,
  MAX_GRAPH_DEPTH,
  MAX_GRAPH_NODES,
  MAX_QUIZ_ANSWERS,
  MAX_SEARCH_RESULTS,
} from '../constants.js';
import { IdSchema, QuerySchema } from './common.js';

const ObjectSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict();

const BoundedLimit = (max: number, defaultValue: number) =>
  z.number().int().min(1).max(max).optional().default(defaultValue);

export const CourseReadInputSchema = ObjectSchema({
  course_id: IdSchema,
});

export const MaterialSearchInputSchema = ObjectSchema({
  course_id: IdSchema,
  query: QuerySchema,
  limit: BoundedLimit(MAX_SEARCH_RESULTS, 20),
});

export const GraphNeighborhoodInputSchema = ObjectSchema({
  course_id: IdSchema,
  concept_id: IdSchema.optional(),
  depth: z
    .number()
    .int()
    .min(1)
    .max(MAX_GRAPH_DEPTH)
    .optional()
    .default(1),
  limit: BoundedLimit(MAX_GRAPH_NODES, 50),
  // Keep omitted on the wire so existing v1 servers still accept legacy calls.
  include_context: z.boolean().optional(),
});

export const QuizReadInputSchema = ObjectSchema({
  course_id: IdSchema,
  chapter_id: IdSchema,
  limit: BoundedLimit(MAX_QUIZ_ANSWERS, 20),
});

export const QuizAnswerInputSchema = ObjectSchema({
  quiz_id: IdSchema,
  answer: z.string().max(MAX_ANSWER_LENGTH),
});

export const QuizSubmitInputSchema = ObjectSchema({
  course_id: IdSchema,
  chapter_id: IdSchema,
  answers: z
    .array(QuizAnswerInputSchema)
    .min(1)
    .max(MAX_QUIZ_ANSWERS)
    .superRefine((answers, ctx) => {
      const seen = new Set<string>();
      answers.forEach((entry, index) => {
        if (seen.has(entry.quiz_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'quiz_id'],
            message: 'quiz_id values must be unique within one submission',
          });
        } else {
          seen.add(entry.quiz_id);
        }
      });
    }),
});

export const ProgressReadInputSchema = ObjectSchema({
  course_id: IdSchema,
  include_lab_evidence: z.boolean().optional(),
});

/** Business references, never a source of authenticated identity or mastery. */
export const LabLearningContextInputSchema = ObjectSchema({
  chapter_id: IdSchema.optional(),
  activity_id: IdSchema.optional(),
  concept_id: IdSchema.optional(),
  graph_snapshot_id: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).superRefine((context, ctx) => {
  if (
    context.chapter_id === undefined &&
    context.activity_id === undefined &&
    context.concept_id === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A chapter, activity or concept reference is required',
    });
  }
  if (context.graph_snapshot_id !== undefined && context.concept_id === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['graph_snapshot_id'],
      message: 'A graph snapshot reference requires concept_id',
    });
  }
});

/**
 * Lab parameters are intentionally opaque to the plugin, but they must be a
 * plain JSON object. Size and JSON-safety are enforced in `validation.ts`.
 */
export const LabStartInputSchema = ObjectSchema({
  course_id: IdSchema,
  template_id: IdSchema,
  params: z.record(z.unknown()).optional(),
  learning_context: LabLearningContextInputSchema.optional(),
});

export const LabStatusInputSchema = ObjectSchema({
  course_id: IdSchema,
  run_id: IdSchema,
  include_context: z.boolean().optional(),
});

export type CourseReadInput = z.input<typeof CourseReadInputSchema>;
export type CourseReadParsedInput = z.output<typeof CourseReadInputSchema>;

export type MaterialSearchInput = z.input<typeof MaterialSearchInputSchema>;
export type MaterialSearchParsedInput = z.output<
  typeof MaterialSearchInputSchema
>;

export type GraphNeighborhoodInput = z.input<
  typeof GraphNeighborhoodInputSchema
>;
export type GraphNeighborhoodParsedInput = z.output<
  typeof GraphNeighborhoodInputSchema
>;

export type QuizReadInput = z.input<typeof QuizReadInputSchema>;
export type QuizReadParsedInput = z.output<typeof QuizReadInputSchema>;

export type QuizAnswerInput = z.input<typeof QuizAnswerInputSchema>;
export type QuizSubmitInput = z.input<typeof QuizSubmitInputSchema>;
export type QuizSubmitParsedInput = z.output<typeof QuizSubmitInputSchema>;

export type ProgressReadInput = z.input<typeof ProgressReadInputSchema>;
export type ProgressReadParsedInput = z.output<typeof ProgressReadInputSchema>;

export type LabLearningContextInput = z.input<typeof LabLearningContextInputSchema>;

export type LabStartInput = z.input<typeof LabStartInputSchema>;
export type LabStartParsedInput = z.output<typeof LabStartInputSchema>;

export type LabStatusInput = z.input<typeof LabStatusInputSchema>;
export type LabStatusParsedInput = z.output<typeof LabStatusInputSchema>;
