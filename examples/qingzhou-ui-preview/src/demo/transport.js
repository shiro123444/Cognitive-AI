import { fixtures } from '../fixtures.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestamp = () => '2026-10-26T10:00:00Z';

function clone(value) {
  return structuredClone(value);
}

/**
 * Explicitly labelled demo transport.
 *
 * It returns schema-valid local snapshots and counts only explicit write
 * invocations (quiz.submit / lab.start). It is never selected in actual HTTP
 * mode and it can never satisfy an actual-mode request.
 */
export function createDemoTransport({ onWrite }) {
  let sequence = 0;

  return {
    async invoke(operation, input) {
      const call = ++sequence;
      await wait(160);

      switch (operation) {
        case 'edufish.course.read':
          return clone(fixtures['course.read']);

        case 'edufish.material.search':
          return clone(fixtures['material.search']);

        case 'edufish.graph.neighborhood':
          return clone(fixtures['graph.neighborhood']);

        case 'edufish.quiz.read':
          return clone(fixtures['quiz.read']);

        case 'edufish.quiz.submit': {
          const answers = Array.isArray(input?.answers) ? input.answers : [];
          const submissionId = `submission-demo-${call}`;
          onWrite?.({
            operation,
            requestId: submissionId,
            at: new Date().toISOString(),
          });
          return {
            submission_id: submissionId,
            score: answers.length,
            total: answers.length,
            results: answers.map((answer) => ({
              quiz_id: String(answer.quiz_id),
              correct: true,
              feedback:
                'Correct. Demo transport result; compare with actual HTTP mode for real scoring.',
            })),
          };
        }

        case 'edufish.progress.read':
          return {
            ...clone(fixtures['progress.read']),
            course_id: String(input?.course_id ?? fixtures['progress.read'].course_id),
          };

        case 'edufish.lab.start': {
          const runId = `run-demo-${call}`;
          onWrite?.({
            operation,
            requestId: `lab-start-${runId}`,
            at: new Date().toISOString(),
          });
          const base = clone(fixtures['lab.start'].run);
          return {
            run: {
              ...base,
              id: runId,
              course_id: String(input?.course_id ?? base.course_id),
              template_id: String(input?.template_id ?? base.template_id),
              params:
                input?.params && typeof input.params === 'object'
                  ? input.params
                  : base.params,
              job_id: `job-${runId}`,
              created_at: timestamp(),
            },
          };
        }

        case 'edufish.lab.status': {
          const base = clone(fixtures['lab.status'].run);
          return {
            run: {
              ...base,
              id: String(input?.run_id ?? base.id),
              course_id: String(input?.course_id ?? base.course_id),
            },
          };
        }

        default:
          throw new Error(`Demo transport does not implement ${operation}.`);
      }
    },
  };
}
