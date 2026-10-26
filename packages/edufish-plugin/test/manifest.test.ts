import { describe, expect, it } from 'vitest';

import {
  EDUFISH_MANIFEST,
  EDUFISH_OPERATION,
  EDUFISH_OPERATION_NAMES,
  EDUFISH_WRITE_OPERATIONS,
  OPERATION_INPUT_SCHEMAS,
  OPERATION_OUTPUT_SCHEMAS,
  OPERATION_SPECS,
  QuizReadOutputSchema,
  QuizSubmitInputSchema,
  EDUFISH_PLUGIN_ID,
  EDUFISH_PLUGIN_VERSION,
  EDUFISH_PROTOCOL_VERSION,
} from '../src/index.js';

describe('manifest and discovery metadata', () => {
  it('exposes the contracted identity and all eight operations in order', () => {
    expect(EDUFISH_MANIFEST.id).toBe(EDUFISH_PLUGIN_ID);
    expect(EDUFISH_MANIFEST.version).toBe(EDUFISH_PLUGIN_VERSION);
    expect(EDUFISH_MANIFEST.protocol_version).toBe(
      EDUFISH_PROTOCOL_VERSION,
    );
    expect(EDUFISH_MANIFEST.operations.map((operation) => operation.name)).toEqual(
      [...EDUFISH_OPERATION_NAMES],
    );
    expect(EDUFISH_MANIFEST.operations).toHaveLength(8);
  });

  it('is deeply immutable', () => {
    expect(Object.isFrozen(EDUFISH_MANIFEST)).toBe(true);
    expect(Object.isFrozen(EDUFISH_MANIFEST.operations)).toBe(true);
    expect(Object.isFrozen(EDUFISH_MANIFEST.operations[0])).toBe(true);
    expect(
      Object.isFrozen(EDUFISH_MANIFEST.operations[0]?.discovery),
    ).toBe(true);
    expect(
      Object.isFrozen(EDUFISH_MANIFEST.operations[0]?.discovery.examples),
    ).toBe(true);

    expect(() => {
      (EDUFISH_MANIFEST as { id: string }).id = 'other';
    }).toThrow();
  });

  it('marks exactly the write operations as mutating and request-ID-bound', () => {
    for (const operation of EDUFISH_MANIFEST.operations) {
      const isWrite = (EDUFISH_WRITE_OPERATIONS as readonly string[]).includes(
        operation.name,
      );
      expect(operation.mutates).toBe(isWrite);
      expect(operation.requires_request_id).toBe(isWrite);
      expect(operation.discovery.mutates).toBe(isWrite);
      expect(operation.discovery.requiresRequestId).toBe(isWrite);
      expect(operation.discovery.idempotency).toBe(
        isWrite ? 'request_id' : 'none',
      );
      expect(operation.discovery.identitySource).toBe(
        'trusted_invocation_scope',
      );
      expect(operation.description.length).toBeGreaterThan(20);
      expect(operation.discovery.arguments.length).toBeGreaterThan(0);
      expect(operation.discovery.limitations.length).toBeGreaterThan(0);
      expect(operation.discovery.examples.length).toBeGreaterThan(0);
      expect(operation.input_schema.type).toBe('object');
    }
  });

  it('keeps operation specs and manifest in lockstep', () => {
    expect(OPERATION_SPECS).toHaveLength(
      EDUFISH_MANIFEST.operations.length,
    );
    for (const spec of OPERATION_SPECS) {
      const manifestOperation = EDUFISH_MANIFEST.operations.find(
        (operation) => operation.name === spec.name,
      );
      expect(manifestOperation).toBeDefined();
      expect(spec.description).toBe(manifestOperation?.description);
      expect(spec.mutates).toBe(manifestOperation?.mutates);
      expect(spec.requiresRequestId).toBe(
        manifestOperation?.requires_request_id,
      );
      expect(spec.discovery).toBe(manifestOperation?.discovery);
      expect(spec.input).toBe(OPERATION_INPUT_SCHEMAS[spec.name]);
      expect(spec.output).toBe(OPERATION_OUTPUT_SCHEMAS[spec.name]);
    }
  });

  it('rejects unknown argument keys and identity overrides at the schema layer', () => {
    const courseRead = OPERATION_INPUT_SCHEMAS[EDUFISH_OPERATION.courseRead];
    expect(courseRead.safeParse({ course_id: 'course-1' }).success).toBe(true);
    expect(
      courseRead.safeParse({ course_id: 'course-1', user_id: 'attacker' })
        .success,
    ).toBe(false);
    expect(
      courseRead.safeParse({ course_id: 'course-1', role: 'admin' }).success,
    ).toBe(false);
    expect(
      courseRead.safeParse({
        course_id: 'bad' + String.fromCharCode(0) + 'id',
      }).success,
    ).toBe(false);
  });

  it('enforces the quiz-submit bounds and unique quiz IDs', () => {
    expect(
      QuizSubmitInputSchema.safeParse({
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'a' }],
      }).success,
    ).toBe(true);

    expect(
      QuizSubmitInputSchema.safeParse({
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [
          { quiz_id: 'quiz-1', answer: 'a' },
          { quiz_id: 'quiz-1', answer: 'b' },
        ],
      }).success,
    ).toBe(false);

    expect(
      QuizSubmitInputSchema.safeParse({
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [],
      }).success,
    ).toBe(false);

    expect(
      QuizSubmitInputSchema.safeParse({
        course_id: 'course-1',
        chapter_id: 'chapter-1',
        answers: [{ quiz_id: 'quiz-1', answer: 'x'.repeat(4_001) }],
      }).success,
    ).toBe(false);
  });

  it('never permits quiz answers in quiz.read output', () => {
    expect(
      QuizReadOutputSchema.safeParse({
        items: [
          {
            id: 'quiz-1',
            prompt: 'Question?',
            answer: 'secret',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      QuizReadOutputSchema.safeParse({
        items: [{ id: 'quiz-1', prompt: 'Question?' }],
      }).success,
    ).toBe(true);
  });
});
