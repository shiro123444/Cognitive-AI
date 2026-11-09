import { describe, expect, it, vi } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_MANIFEST,
  EDUFISH_OPERATION,
  LabEvidenceCollectionSchema,
  LabLearningContextInputSchema,
  LabStartInputSchema,
  LabStartOutputSchema,
  ProgressReadOutputSchema,
  validateOperationInput,
  validateOperationOutput,
  type LabEvidence,
  type LabLearningContext,
} from '../src/index.js';
import { expectPluginError, labOutput, makeInvocation, progressOutput } from './helpers.js';

const contextInput = {
  activity_id: 'activity-1',
  concept_id: 'concept-1',
  graph_snapshot_id: 'a'.repeat(64),
};
const context: LabLearningContext = {
  version: 1,
  course_id: 'course-1',
  chapter_id: 'chapter-1',
  activity_id: 'activity-1',
  concept_id: 'concept-1',
  graph_snapshot_id: 'a'.repeat(64),
};
const startInput = {
  course_id: 'course-1',
  template_id: 'template-1',
  learning_context: contextInput,
};
const startOutput = { ...labOutput, learning_context: context };
const statusInput = { course_id: 'course-1', run_id: 'run-1', include_context: true };
const evidence: LabEvidence = {
  run_id: 'run-1',
  template_id: 'template-1',
  adapter: 'neuron_spike',
  status: 'completed',
  completed_at: '2026-11-09T01:02:03Z',
  learning_context: context,
  artifact_count: 2,
  artifact_ids: ['artifact-1'],
  report_id: 'report-1',
};
const progressWithEvidence = {
  ...progressOutput,
  lab_evidence: { version: 1, runs: [evidence] },
};

function rejectsOutput(operation: Parameters<typeof validateOperationOutput>[0], output: unknown, input: Record<string, unknown>) {
  expect(() => validateOperationOutput(operation, output, input)).toThrowError(
    expect.objectContaining({ code: 'INVALID_OUTPUT' }),
  );
}

describe('lab learning context compatibility', () => {
  it('advertises each optional capability without adding an operation', () => {
    const properties = (operation: string) => EDUFISH_MANIFEST.operations.find((entry) => entry.name === operation)?.input_schema.properties;
    expect(EDUFISH_MANIFEST.operations).toHaveLength(8);
    expect(properties(EDUFISH_OPERATION.labStart)).toHaveProperty('learning_context');
    expect(properties(EDUFISH_OPERATION.labStatus)).toHaveProperty('include_context', { type: 'boolean', default: false });
    expect(properties(EDUFISH_OPERATION.progressRead)).toHaveProperty('include_lab_evidence', { type: 'boolean', default: false });
  });

  it('keeps new keys off legacy start, status and progress calls', async () => {
    for (const [operation, input, output, key] of [
      [EDUFISH_OPERATION.labStart, { course_id: 'course-1', template_id: 'template-1' }, labOutput, 'learning_context'],
      [EDUFISH_OPERATION.labStatus, { course_id: 'course-1', run_id: 'run-1' }, labOutput, 'include_context'],
      [EDUFISH_OPERATION.progressRead, { course_id: 'course-1' }, progressOutput, 'include_lab_evidence'],
    ] as const) {
      const invoke = vi.fn(async (_operation: string, _input: Readonly<Record<string, unknown>>) => output);
      const plugin = createEduFishPlugin({ transport: { invoke } });
      expect(await plugin.invoke(operation, input, makeInvocation({ requestId: 'legacy-request' }))).toEqual(output);
      expect(invoke.mock.calls[0]?.[1]).not.toHaveProperty(key);
    }
  });

  it('preserves omitted nested keys while permitting an activity-derived chapter', async () => {
    const invoke = vi.fn(async (_operation: string, _input: Readonly<Record<string, unknown>>) => startOutput);
    const plugin = createEduFishPlugin({ transport: { invoke } });
    const output = await plugin.invoke(EDUFISH_OPERATION.labStart, startInput, makeInvocation({ requestId: 'new-request' }));
    expect(output).toEqual(startOutput);
    expect(invoke.mock.calls[0]?.[1].learning_context).toEqual(contextInput);
    expect(invoke.mock.calls[0]?.[1].learning_context).not.toHaveProperty('chapter_id');
  });

  it.each([
    null, {}, [],
    { concept_id: null },
    { activity_id: false },
    { concept_id: 'concept-1', graph_snapshot_id: 'A'.repeat(64) },
    { concept_id: 'concept-1', graph_snapshot_id: 'not-a-hash' },
    { graph_snapshot_id: 'a'.repeat(64) },
    { chapter_id: 'chapter-1', graph_snapshot_id: 'a'.repeat(64) },
    { concept_id: 'concept-1', messageId: 'message-1' },
  ])('rejects malformed context %j', (learning_context) => {
    expect(LabStartInputSchema.safeParse({ ...startInput, learning_context }).success).toBe(false);
  });

  it.each(['user_id', 'student_id', 'sessionId', 'access_token'])('rejects nested identity override %s before transport', async (key) => {
    const invoke = vi.fn();
    const plugin = createEduFishPlugin({ transport: { invoke } });
    await expectPluginError(plugin.invoke(EDUFISH_OPERATION.labStart, {
      ...startInput, learning_context: { ...contextInput, [key]: 'forged' },
    }, makeInvocation({ requestId: 'identity-test' })), 'INVALID_ARGUMENT');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([null, 0, 1, 'true', [], {}])('rejects non-boolean context and evidence switches %j', (flag) => {
    expect(() => validateOperationInput(EDUFISH_OPERATION.labStatus, { ...statusInput, include_context: flag })).toThrow();
    expect(() => validateOperationInput(EDUFISH_OPERATION.progressRead, { course_id: 'course-1', include_lab_evidence: flag })).toThrow();
  });

  it('supports standalone concept, chapter and activity references', () => {
    for (const key of ['concept_id', 'chapter_id', 'activity_id']) {
      expect(LabLearningContextInputSchema.parse({ [key]: 'reference-1' })).toEqual({ [key]: 'reference-1' });
    }
  });
});

describe('lab result binding', () => {
  it.each([
    { label: 'missing context', output: labOutput, input: startInput },
    { label: 'unsolicited context', output: startOutput, input: { course_id: 'course-1', template_id: 'template-1' } },
    { label: 'wrong course', output: startOutput, input: { ...startInput, course_id: 'course-2' } },
    { label: 'wrong template', output: startOutput, input: { ...startInput, template_id: 'template-2' } },
    { label: 'wrong chapter', output: startOutput, input: { ...startInput, learning_context: { ...contextInput, chapter_id: 'chapter-2' } } },
    { label: 'wrong activity', output: startOutput, input: { ...startInput, learning_context: { ...contextInput, activity_id: 'activity-2' } } },
    { label: 'wrong concept', output: startOutput, input: { ...startInput, learning_context: { ...contextInput, concept_id: 'concept-2' } } },
    { label: 'wrong snapshot', output: startOutput, input: { ...startInput, learning_context: { ...contextInput, graph_snapshot_id: 'b'.repeat(64) } } },
    { label: 'invented activity', output: startOutput, input: { ...startInput, learning_context: { concept_id: 'concept-1' } } },
  ])('rejects $label', ({ output, input }) => rejectsOutput(EDUFISH_OPERATION.labStart, output, input));

  it('rejects a context course that disagrees with its run even during historical parsing', () => {
    expect(LabStartOutputSchema.safeParse({ ...startOutput, learning_context: { ...context, course_id: 'course-2' } }).success).toBe(false);
  });

  it('binds status to run id and explicit opt-in', () => {
    expect(validateOperationOutput(EDUFISH_OPERATION.labStatus, startOutput, statusInput)).toEqual(startOutput);
    rejectsOutput(EDUFISH_OPERATION.labStatus, startOutput, { ...statusInput, run_id: 'run-2' });
    rejectsOutput(EDUFISH_OPERATION.labStatus, startOutput, { ...statusInput, include_context: false });
    rejectsOutput(EDUFISH_OPERATION.labStatus, labOutput, statusInput);
  });

  it('allows legacy runs to return only their actual persisted associations', () => {
    const legacyContext = { ...context, concept_id: null, graph_snapshot_id: null };
    expect(validateOperationOutput(EDUFISH_OPERATION.labStatus, { ...labOutput, learning_context: legacyContext }, statusInput)).toHaveProperty('learning_context', legacyContext);
  });
});

describe('completed lab evidence', () => {
  it('accepts bounded references without exposing run payloads', () => {
    expect(validateOperationOutput(EDUFISH_OPERATION.progressRead, progressWithEvidence, { course_id: 'course-1', include_lab_evidence: true })).toEqual(progressWithEvidence);
    expect(ProgressReadOutputSchema.parse(progressOutput)).toEqual(progressOutput);
  });

  it('requires explicit evidence opt-in and the requested course', () => {
    rejectsOutput(EDUFISH_OPERATION.progressRead, progressWithEvidence, { course_id: 'course-1' });
    rejectsOutput(EDUFISH_OPERATION.progressRead, progressWithEvidence, { course_id: 'course-1', include_lab_evidence: false });
    rejectsOutput(EDUFISH_OPERATION.progressRead, progressOutput, { course_id: 'course-1', include_lab_evidence: true });
    rejectsOutput(EDUFISH_OPERATION.progressRead, progressWithEvidence, { course_id: 'course-2', include_lab_evidence: true });
  });

  it.each([
    { ...evidence, status: 'pending' },
    { ...evidence, completed_at: null },
    { ...evidence, learning_context: { ...context, course_id: 'course-2' } },
    { ...evidence, artifact_count: 0 },
    { ...evidence, artifact_ids: ['artifact-1', 'artifact-1'] },
    { ...evidence, params: { secret: 'raw payload' } },
    { ...evidence, mastery: 1 },
  ])('rejects false or overbroad evidence %j', (run) => {
    expect(ProgressReadOutputSchema.safeParse({ ...progressOutput, lab_evidence: { version: 1, runs: [run] } }).success).toBe(false);
  });

  it('bounds the collection, rejects repeated runs and bounds artifact references', () => {
    expect(LabEvidenceCollectionSchema.safeParse({ version: 1, runs: [evidence, evidence] }).success).toBe(false);
    const runs = Array.from({ length: 51 }, (_, index) => ({ ...evidence, run_id: `run-${index}` }));
    expect(LabEvidenceCollectionSchema.safeParse({ version: 1, runs }).success).toBe(false);
    const artifact_ids = Array.from({ length: 21 }, (_, index) => `artifact-${index}`);
    expect(LabEvidenceCollectionSchema.safeParse({ version: 1, runs: [{ ...evidence, artifact_count: 21, artifact_ids }] }).success).toBe(false);
  });
});
