#!/usr/bin/env node
/**
 * Focused actual-HTTP check without a browser.
 *
 * Starts the existing fixture server directly (no Vite), uses the fixture's
 * dev handshake, invokes all eight operations through the real production
 * routes, validates responses with the core schemas and prints no tokens.
 * The browser acceptance script additionally verifies the Vite proxy.
 */
import { startFixture } from './orchestrate.mjs';

let core;
try {
  core = await import('@edufish/plugin');
} catch {
  core = await import('../../../packages/edufish-plugin/dist/index.js');
}

const fixture = await startFixture();
const headers = {
  accept: 'application/json',
  'content-type': 'application/json',
};

async function invoke(operation, args, requestId) {
  const response = await fetch(`${fixture.baseUrl}/api/v1/plugin/invoke`, {
    method: 'POST',
    headers: {
      ...headers,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      operation,
      arguments: args,
      ...(requestId ? { request_id: requestId } : {}),
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.success !== true) {
    throw new Error(`${operation} failed: HTTP ${response.status} ${body?.error?.code ?? ''}`);
  }
  core.OPERATION_OUTPUT_SCHEMAS[operation].parse(body.data);
  return body.data;
}

let token = '';
const checks = [];

try {
  const tokenResponse = await fetch(
    `${fixture.baseUrl}/__fixture__/token?user_id=fixture-student`,
    {
      headers: { ...headers, 'X-Fixture-Handshake': fixture.handshake },
    },
  );
  const tokenBody = await tokenResponse.json();
  token = tokenBody?.data?.token;
  if (!tokenResponse.ok || typeof token !== 'string' || !token) {
    throw new Error('Fixture handshake did not mint a token.');
  }

  const course = await invoke('edufish.course.read', { course_id: 'course-fixture-published' });
  checks.push(`course.read: ${course.course.title}`);

  const search = await invoke('edufish.material.search', {
    course_id: 'course-fixture-published',
    query: 'heuristic',
    limit: 5,
  });
  checks.push(`material.search: ${search.results.length} result(s)`);

  const graph = await invoke('edufish.graph.neighborhood', {
    course_id: 'course-fixture-published',
    concept_id: 'concept-fixture-heuristic',
    depth: 1,
    limit: 20,
  });
  checks.push(`graph.neighborhood: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s)`);

  const quiz = await invoke('edufish.quiz.read', {
    course_id: 'course-fixture-published',
    chapter_id: 'chapter-fixture-search',
    limit: 5,
  });
  checks.push(`quiz.read: ${quiz.items.length} item(s)`);

  const answerFor = (prompt) => {
    if (prompt.includes('heuristic in search')) return 'It estimates which states are more promising.';
    if (prompt.includes('A*')) return 'A* combines path cost and a heuristic estimate.';
    return 'A heuristic checklist.';
  };
  const submission = await invoke(
    'edufish.quiz.submit',
    {
      course_id: 'course-fixture-published',
      chapter_id: 'chapter-fixture-search',
      answers: quiz.items.map((item) => ({ quiz_id: item.id, answer: answerFor(item.prompt) })),
    },
    `preview-http-quiz-${Date.now()}`,
  );
  checks.push(`quiz.submit: ${submission.score}/${submission.total}`);

  const progress = await invoke('edufish.progress.read', { course_id: 'course-fixture-published' });
  if (!progress.quiz_submissions.some((entry) => entry.submission_id === submission.submission_id)) {
    throw new Error('progress.read did not include the explicit submission.');
  }
  checks.push(`progress.read: ${progress.quiz_submissions.length} submission(s)`);

  const started = await invoke(
    'edufish.lab.start',
    {
      course_id: 'course-fixture-published',
      template_id: 'exp-neuron-spike',
      params: { stimulus_current: 8, duration_ms: 120 },
    },
    `preview-http-lab-${Date.now()}`,
  );
  checks.push(`lab.start: ${started.run.id} (${started.run.status})`);

  const status = await invoke('edufish.lab.status', {
    course_id: 'course-fixture-published',
    run_id: started.run.id,
  });
  if (status.run.id !== started.run.id) throw new Error('lab.status returned a different run.');
  checks.push(`lab.status: ${status.run.status}`);

  console.log('Actual HTTP check passed:');
  for (const line of checks) console.log(`  ${line}`);
} finally {
  token = '';
  await fixture.stop();
}
