/**
 * Deterministic, schema-valid snapshots for every EduFish operation.
 *
 * These are local render fixtures only. They are parsed against the core
 * schemas by scripts/validate-fixtures.mjs and are never substituted for an
 * HTTP response in "actual" mode.
 */

const RUN_ID = 'run-fixture-lab-start';
const STATUS_RUN_ID = 'run-fixture-lab-status';

const labRun = {
  id: RUN_ID,
  template_id: 'exp-neuron-spike',
  student_id: 'fixture-student',
  course_id: 'course-fixture-published',
  status: 'completed',
  adapter: 'neuron_simulator',
  params: {
    stimulus: { stimulus_current: 8, duration_ms: 120 },
  },
  summary: {
    spike_count: 17,
    firing_rate_hz: 12.5,
  },
  error_message: '',
  job_id: 'job-fixture-lab-start',
  progress: 100,
  progress_message: 'Simulation completed',
  pipeline_nodes: {
    stimulus: { status: 'completed' },
    integrate: { status: 'completed' },
    'detect-spikes': { status: 'completed' },
    'firing-rate': { status: 'completed' },
    'ai-report': { status: 'completed' },
  },
  artifacts: [
    {
      id: 'artifact-fixture-membrane',
      run_id: RUN_ID,
      artifact_type: 'timeseries',
      title: 'Membrane potential trace',
      data: { sample_count: 1200 },
      created_at: '2026-10-26T10:00:01Z',
    },
  ],
  report: {
    id: 'report-fixture-lab-start',
    run_id: RUN_ID,
    status: 'completed',
    content: { summary: 'The LIF neuron emitted 17 spikes at 8 nA.' },
    created_at: '2026-10-26T10:00:01Z',
    updated_at: '2026-10-26T10:00:02Z',
  },
  created_at: '2026-10-26T10:00:00Z',
  completed_at: '2026-10-26T10:00:02Z',
};

const statusRun = {
  ...labRun,
  id: STATUS_RUN_ID,
  job_id: 'job-fixture-lab-status',
  status: 'running',
  progress: 60,
  progress_message: 'Analyzing spike train',
  artifacts: [],
  report: null,
  completed_at: null,
};

export const fixtures = {
  'course.read': {
    course: {
      id: 'course-fixture-published',
      title: 'Plugin Fixture Course',
      summary: 'Deterministic course seeded for the independent plugin example.',
      status: 'published',
    },
    chapters: [
      {
        id: 'chapter-fixture-search',
        title: 'Heuristic Search',
        order: 1,
        objectives: 'Explain how heuristics guide search.',
      },
      {
        id: 'chapter-fixture-lab',
        title: 'Neural Simulation Lab',
        order: 2,
        objectives: 'Run a small LIF neuron simulation.',
      },
    ],
  },

  'material.search': {
    results: [
      {
        chunk_id: 'chunk-fixture-heuristic-1',
        material_id: 'material-fixture-reading',
        course_id: 'course-fixture-published',
        filename: 'heuristic-search.md',
        content:
          'A heuristic estimates which states are more promising during search. It guides the order in which the frontier is explored without guaranteeing optimality.',
        page_number: 3,
        citation_locator: 'p.3 §1.2',
        heading: 'Heuristics',
      },
      {
        chunk_id: 'chunk-fixture-lab-1',
        material_id: 'material-fixture-lab',
        course_id: 'course-fixture-published',
        filename: 'neuron-lab.md',
        content:
          'A leaky integrate-and-fire neuron charges its membrane potential until it crosses threshold and emits a spike, then resets.',
        page_number: 1,
        citation_locator: 'p.1 §1',
        heading: null,
      },
    ],
    retrieval_method: 'keyword',
  },

  'graph.neighborhood': {
    nodes: [
      {
        id: 'concept-fixture-heuristic',
        label: 'Heuristic Search',
        definition:
          'A strategy that uses estimates to decide which states to explore first.',
      },
      {
        id: 'concept-fixture-astar',
        label: 'A* Search',
        definition:
          'A best-first search combining path cost with a heuristic estimate.',
      },
      {
        id: 'concept-fixture-frontier',
        label: 'Search Frontier',
        definition: 'The collection of states waiting to be expanded.',
      },
    ],
    edges: [
      {
        id: 'edge-fixture-heuristic-astar',
        source_id: 'concept-fixture-heuristic',
        target_id: 'concept-fixture-astar',
        relationship: 'PREREQUISITE_OF',
        evidence: 'Understanding heuristic estimates helps explain A* search.',
      },
      {
        id: 'edge-fixture-heuristic-frontier',
        source_id: 'concept-fixture-heuristic',
        target_id: 'concept-fixture-frontier',
        relationship: 'RELATED_TO',
        evidence: 'Heuristics rank states inside the search frontier.',
      },
    ],
  },

  'quiz.read': {
    items: [
      {
        id: 'quiz-fixture-heuristic',
        prompt: 'What is the role of a heuristic in search?',
      },
      {
        id: 'quiz-fixture-astar',
        prompt: 'What does A* combine?',
      },
      {
        id: 'quiz-fixture-personal',
        prompt: "What is in the student's private checklist?",
      },
    ],
  },

  'quiz.submit': {
    submission_id: 'submission-fixture-demo',
    score: 2,
    total: 3,
    results: [
      {
        quiz_id: 'quiz-fixture-heuristic',
        correct: true,
        feedback:
          'Correct. A heuristic guides search without guaranteeing optimality.',
      },
      {
        quiz_id: 'quiz-fixture-astar',
        correct: true,
        feedback: 'Correct. A* adds g(n) and h(n).',
      },
      {
        quiz_id: 'quiz-fixture-personal',
        correct: false,
        feedback: 'Incorrect. Personal quiz attached to the student material.',
      },
    ],
  },

  'progress.read': {
    course_id: 'course-fixture-published',
    student_id: 'fixture-student',
    event_counts: { answered_quiz: 1, ran_lab: 1 },
    quiz_submissions: [
      {
        submission_id: 'submission-fixture-demo',
        chapter_id: 'chapter-fixture-search',
        score: 2,
        total: 3,
        created_at: '2026-10-26T10:30:00Z',
      },
    ],
  },

  'lab.start': { run: labRun },

  'lab.status': { run: statusRun },
};

/** Short operation names used by the render maps. */
export const SHORT_OPERATIONS = [
  'course.read',
  'material.search',
  'graph.neighborhood',
  'quiz.read',
  'quiz.submit',
  'progress.read',
  'lab.start',
  'lab.status',
];

/** Full wire operation name for a short name. */
export function wireOperation(shortName) {
  return `edufish.${shortName}`;
}
