import type { z } from 'zod';

import {
  EDUFISH_OPERATION,
  type EduFishOperationName,
} from './constants.js';
import { OPERATION_METADATA } from './metadata.js';
import {
  CourseReadInputSchema,
  GraphNeighborhoodInputSchema,
  LabStartInputSchema,
  LabStatusInputSchema,
  MaterialSearchInputSchema,
  ProgressReadInputSchema,
  QuizReadInputSchema,
  QuizSubmitInputSchema,
} from './schemas/inputs.js';
import {
  CourseReadOutputSchema,
  GraphNeighborhoodOutputSchema,
  LabStartOutputSchema,
  LabStatusOutputSchema,
  MaterialSearchOutputSchema,
  ProgressReadOutputSchema,
  QuizReadOutputSchema,
  QuizSubmitOutputSchema,
} from './schemas/outputs.js';
import type { AgentDiscoveryMetadata } from './types.js';

/**
 * Static operation description used to build AtomicPlugin-shaped operations.
 * The plugin layer adds transport invocation, validation and event handling.
 */
export interface OperationSpec<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly name: EduFishOperationName;
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly mutates: boolean;
  readonly requiresRequestId: boolean;
  readonly discovery: AgentDiscoveryMetadata;
}

function defineOperation<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  name: EduFishOperationName,
  input: I,
  output: O,
): OperationSpec<I, O> {
  const metadata = OPERATION_METADATA[name];
  return Object.freeze({
    name,
    description: metadata.description,
    input,
    output,
    mutates: metadata.mutates,
    requiresRequestId: metadata.requiresRequestId,
    discovery: metadata.discovery,
  });
}

export const OPERATION_SPECS: readonly OperationSpec[] = Object.freeze([
  defineOperation(
    EDUFISH_OPERATION.courseRead,
    CourseReadInputSchema,
    CourseReadOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.materialSearch,
    MaterialSearchInputSchema,
    MaterialSearchOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.graphNeighborhood,
    GraphNeighborhoodInputSchema,
    GraphNeighborhoodOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.quizRead,
    QuizReadInputSchema,
    QuizReadOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.quizSubmit,
    QuizSubmitInputSchema,
    QuizSubmitOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.progressRead,
    ProgressReadInputSchema,
    ProgressReadOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.labStart,
    LabStartInputSchema,
    LabStartOutputSchema,
  ),
  defineOperation(
    EDUFISH_OPERATION.labStatus,
    LabStatusInputSchema,
    LabStatusOutputSchema,
  ),
]);

export const OPERATION_SPEC_BY_NAME: Readonly<
  Record<EduFishOperationName, OperationSpec>
> = Object.freeze(
  Object.fromEntries(
    OPERATION_SPECS.map((spec) => [spec.name, spec]),
  ) as Record<EduFishOperationName, OperationSpec>,
);

export function getOperationSpec(
  name: EduFishOperationName,
): OperationSpec {
  return OPERATION_SPEC_BY_NAME[name];
}
