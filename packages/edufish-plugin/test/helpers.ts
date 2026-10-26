import { expect } from 'vitest';

import {
  EduFishPluginError,
  type EduFishFetch,
  type EduFishFetchInit,
  type EduFishFetchResponse,
  type EduFishInvocation,
} from '../src/index.js';

export const scope = {
  userId: 'user-1',
  sessionId: 'session-1',
} as const;

export function makeInvocation(
  overrides: Partial<EduFishInvocation> = {},
): EduFishInvocation {
  return { scope, ...overrides };
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function jsonResponse(
  payload: unknown,
  status = 200,
): EduFishFetchResponse {
  const body = JSON.stringify(payload);
  return {
    status,
    text: async () => body,
  };
}

export function successResponse(
  data: unknown,
  status = 200,
): EduFishFetchResponse {
  return jsonResponse({ success: true, data }, status);
}

export function failureResponse(
  code: string,
  message: string,
  status: number,
): EduFishFetchResponse {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

export interface RecordedFetch {
  readonly fetch: EduFishFetch;
  readonly calls: Array<{ url: string; init: EduFishFetchInit }>;
}

export function recordingFetch(
  respond: (url: string, init: EduFishFetchInit) => Promise<EduFishFetchResponse>,
): RecordedFetch {
  const calls: Array<{ url: string; init: EduFishFetchInit }> = [];
  const fetchImpl: EduFishFetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch: fetchImpl, calls };
}

export async function expectPluginError(
  promise: Promise<unknown>,
  code: string,
): Promise<EduFishPluginError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(EduFishPluginError);
    const pluginError = error as EduFishPluginError;
    expect(pluginError.code).toBe(code);
    return pluginError;
  }
  throw new Error(`Expected EduFishPluginError ${code}, but the call resolved.`);
}

/* ------------------------------------------------------------------------- */
/* Valid sample outputs                                                      */
/* ------------------------------------------------------------------------- */

export const courseOutput = {
  course: {
    id: 'course-1',
    title: 'Cognitive Psychology',
    summary: 'A course about attention and memory.',
    status: 'published',
  },
  chapters: [
    {
      id: 'chapter-1',
      title: 'Working memory',
      order: 1,
      objectives: 'Explain the multi-component model.',
    },
  ],
};

export const materialSearchOutput = {
  results: [
    {
      chunk_id: 'chunk-1',
      material_id: 'material-1',
      course_id: 'course-1',
      filename: 'chapter-1.pdf',
      content: 'Working memory has limited capacity.',
      page_number: 3,
      citation_locator: 'p.3',
      heading: 'Working memory',
    },
  ],
  retrieval_method: 'keyword',
};

export const graphOutput = {
  nodes: [
    {
      id: 'concept-1',
      label: 'Working memory',
      definition: 'A limited-capacity store.',
    },
    {
      id: 'concept-2',
      label: 'Attention',
      definition: 'Selection of information.',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source_id: 'concept-2',
      target_id: 'concept-1',
      relationship: 'modulates',
      evidence: 'p.3',
    },
  ],
};

export const quizReadOutput = {
  items: [{ id: 'quiz-1', prompt: 'What is working memory?' }],
};

export const quizSubmitOutput = {
  submission_id: 'submission-1',
  score: 1,
  total: 1,
  results: [
    {
      quiz_id: 'quiz-1',
      correct: true,
      feedback: 'Correct.',
    },
  ],
};

export const progressOutput = {
  course_id: 'course-1',
  student_id: 'user-1',
  event_counts: { answered_quiz: 1 },
  quiz_submissions: [
    {
      submission_id: 'submission-1',
      chapter_id: 'chapter-1',
      score: 1,
      total: 1,
      created_at: '2026-10-26T00:00:00Z',
    },
  ],
};

export const runOutput = {
  id: 'run-1',
  template_id: 'template-1',
  student_id: 'user-1',
  course_id: 'course-1',
  status: 'pending',
  adapter: 'memory-span',
  params: { seed: 42 },
  summary: {},
  error_message: '',
  job_id: 'job-1',
  progress: 0,
  progress_message: 'queued',
  pipeline_nodes: {},
  artifacts: [],
  report: null,
  created_at: '2026-10-26T00:00:00Z',
  completed_at: null,
};

export const labOutput = { run: runOutput };

export const operationOutputs = {
  'edufish.course.read': courseOutput,
  'edufish.material.search': materialSearchOutput,
  'edufish.graph.neighborhood': graphOutput,
  'edufish.quiz.read': quizReadOutput,
  'edufish.quiz.submit': quizSubmitOutput,
  'edufish.progress.read': progressOutput,
  'edufish.lab.start': labOutput,
  'edufish.lab.status': labOutput,
} as const;
