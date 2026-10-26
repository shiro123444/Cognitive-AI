import type { z } from 'zod';

import { EDUFISH_OPERATION, type EduFishOperationName } from '../constants.js';
import {
  CourseReadInputSchema,
  GraphNeighborhoodInputSchema,
  LabStartInputSchema,
  LabStatusInputSchema,
  MaterialSearchInputSchema,
  ProgressReadInputSchema,
  QuizReadInputSchema,
  QuizSubmitInputSchema,
} from './inputs.js';
import {
  CourseReadOutputSchema,
  GraphNeighborhoodOutputSchema,
  LabStartOutputSchema,
  LabStatusOutputSchema,
  MaterialSearchOutputSchema,
  ProgressReadOutputSchema,
  QuizReadOutputSchema,
  QuizSubmitOutputSchema,
} from './outputs.js';

export const OPERATION_INPUT_SCHEMAS = {
  [EDUFISH_OPERATION.courseRead]: CourseReadInputSchema,
  [EDUFISH_OPERATION.materialSearch]: MaterialSearchInputSchema,
  [EDUFISH_OPERATION.graphNeighborhood]: GraphNeighborhoodInputSchema,
  [EDUFISH_OPERATION.quizRead]: QuizReadInputSchema,
  [EDUFISH_OPERATION.quizSubmit]: QuizSubmitInputSchema,
  [EDUFISH_OPERATION.progressRead]: ProgressReadInputSchema,
  [EDUFISH_OPERATION.labStart]: LabStartInputSchema,
  [EDUFISH_OPERATION.labStatus]: LabStatusInputSchema,
} as const;

export const OPERATION_OUTPUT_SCHEMAS = {
  [EDUFISH_OPERATION.courseRead]: CourseReadOutputSchema,
  [EDUFISH_OPERATION.materialSearch]: MaterialSearchOutputSchema,
  [EDUFISH_OPERATION.graphNeighborhood]: GraphNeighborhoodOutputSchema,
  [EDUFISH_OPERATION.quizRead]: QuizReadOutputSchema,
  [EDUFISH_OPERATION.quizSubmit]: QuizSubmitOutputSchema,
  [EDUFISH_OPERATION.progressRead]: ProgressReadOutputSchema,
  [EDUFISH_OPERATION.labStart]: LabStartOutputSchema,
  [EDUFISH_OPERATION.labStatus]: LabStatusOutputSchema,
} as const;

export type EduFishOperationInputSchemaMap = typeof OPERATION_INPUT_SCHEMAS;
export type EduFishOperationOutputSchemaMap = typeof OPERATION_OUTPUT_SCHEMAS;

export type EduFishOperationInput<N extends EduFishOperationName> = z.input<
  (typeof OPERATION_INPUT_SCHEMAS)[N]
>;
export type EduFishOperationParsedInput<N extends EduFishOperationName> =
  z.output<(typeof OPERATION_INPUT_SCHEMAS)[N]>;
export type EduFishOperationOutput<N extends EduFishOperationName> = z.output<
  (typeof OPERATION_OUTPUT_SCHEMAS)[N]
>;

export type EduFishOperationArguments = {
  [N in EduFishOperationName]: EduFishOperationInput<N>;
}[EduFishOperationName];

export type EduFishOperationResult = {
  [N in EduFishOperationName]: EduFishOperationOutput<N>;
}[EduFishOperationName];
