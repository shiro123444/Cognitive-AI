import type {
  CourseReadOutput,
  GraphNeighborhoodOutput,
  LabStartOutput,
  MaterialSearchOutput,
  ProgressReadOutput,
  QuizReadOutput,
  QuizSubmitOutput,
} from '@edufish/plugin';
import { ThemeProvider } from '@lobehub/ui';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CourseResult,
  GraphResult,
  LabResult,
  MaterialSearchResult,
  ProgressResult,
  QuizResult,
  QuizSubmissionResult,
} from '../src/components/index.js';
import { styles } from '../src/components/styles.js';

function renderUI(ui: ReactNode) {
  return render(ui);
}

function collectCssText(): string {
  const fromTags = Array.from(document.querySelectorAll('style')).map(
    (tag) => tag.textContent ?? '',
  );
  const fromSheets = Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules).map((rule) => rule.cssText);
    } catch {
      return [];
    }
  });
  return [...fromTags, ...fromSheets].join('\n');
}

const course: CourseReadOutput = {
  course: {
    id: 'c1',
    title: 'Biology',
    summary: 'An introduction to living systems.',
    status: 'active',
  },
  chapters: [
    { id: 'ch2', title: 'Cells', order: 2, objectives: 'Know the cell.' },
    {
      id: 'ch1',
      title: 'Foundations',
      order: 1,
      objectives: 'Start with the basics.',
    },
  ],
};

const material: MaterialSearchOutput = {
  retrieval_method: 'keyword',
  results: [
    {
      chunk_id: 'chunk-1',
      material_id: 'm1',
      course_id: 'c1',
      filename: 'cells.pdf',
      content: 'Mitochondria produce chemical energy.',
      page_number: 3,
      citation_locator: 'p. 3',
      heading: 'Energy',
    },
  ],
};

const graph: GraphNeighborhoodOutput = {
  nodes: [
    {
      id: 'n1',
      label: 'Photosynthesis',
      definition: 'Plants convert light into chemical energy.',
    },
    {
      id: 'n2',
      label: 'Chlorophyll',
      definition: 'The pigment that absorbs light.',
    },
  ],
  edges: [
    {
      id: 'e1',
      source_id: 'n1',
      target_id: 'n2',
      relationship: 'uses',
      evidence: 'Chlorophyll absorbs the light used in photosynthesis.',
    },
  ],
};

const submission: QuizSubmitOutput = {
  submission_id: 'sub-1',
  score: 1,
  total: 2,
  results: [
    { quiz_id: 'q1', correct: true, feedback: 'Nice work.' },
    { quiz_id: 'q2', correct: false, feedback: 'Review the light reactions.' },
  ],
};

const labStart: LabStartOutput = {
  run: {
    id: 'run-1',
    template_id: 'tpl-1',
    student_id: 'student-1',
    course_id: 'c1',
    status: 'completed',
    adapter: 'local',
    params: { threshold: 0.5 },
    summary: {},
    error_message: '',
    job_id: 'job-1',
    progress: 100,
    progress_message: 'Finished',
    pipeline_nodes: {},
    artifacts: [
      {
        id: 'artifact-1',
        run_id: 'run-1',
        artifact_type: 'table',
        title: 'Results table',
        data: { path: '/home/student/secret-output.txt' },
        created_at: '2026-01-02T00:00:00Z',
      },
    ],
    report: {
      id: 'report-1',
      run_id: 'run-1',
      status: 'ready',
      content: { note: 'private report content' },
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T01:00:00Z',
    },
    created_at: '2026-01-02T00:00:00Z',
    completed_at: '2026-01-02T01:00:00Z',
  },
};

const progress: ProgressReadOutput = {
  course_id: 'c1',
  student_id: 'student-1',
  event_counts: { quiz_submit: 2, material_open: 1 },
  quiz_submissions: [
    {
      submission_id: 'sub-1',
      chapter_id: 'ch1',
      score: 1,
      total: 2,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      submission_id: 'sub-2',
      chapter_id: null,
      score: 0,
      total: 2,
      created_at: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('snapshot result components', () => {
  it('renders a course in chapter order', () => {
    renderUI(<CourseResult data={course} />);

    expect(screen.getByRole('heading', { name: 'Biology' })).toBeTruthy();
    const chapterTitles = Array.from(
      document.querySelectorAll('ol > li'),
    ).map((item) => item.textContent ?? '');
    expect(chapterTitles[0]).toContain('Foundations');
    expect(chapterTitles[0]).toContain('Order 1');
    expect(chapterTitles[1]).toContain('Cells');
    expect(screen.getByText('An introduction to living systems.')).toBeTruthy();
  });

  it('opens a material reference only through the explicit callback', async () => {
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderUI(
      <MaterialSearchResult
        data={material}
        onOpenReference={onOpenReference}
      />,
    );

    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
    await user.click(
      screen.getByRole('button', {
        name: 'Open the cited source in a new view: cells.pdf, Page 3',
      }),
    );
    expect(onOpenReference).toHaveBeenCalledWith({
      course_id: 'c1',
      material_id: 'm1',
      chunk_id: 'chunk-1',
      filename: 'cells.pdf',
      page_number: 3,
      citation_locator: 'p. 3',
    });
  });

  it('does not render a reference control without a host callback', () => {
    renderUI(<MaterialSearchResult data={material} />);

    expect(
      screen.queryByRole('button', { name: /Open source reference/ }),
    ).toBeNull();
    expect(screen.getByText('Keyword search')).toBeTruthy();
  });

  it('renders an accessible graph and readable selection details', async () => {
    const user = userEvent.setup();
    renderUI(<GraphResult data={graph} />);

    expect(
      screen.getByRole('img', {
        name: 'Accessible concept graph with a readable node and edge list.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Photosynthesis' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
    expect(
      screen.getByText('Plants convert light into chemical energy.'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Chlorophyll' }));
    expect(
      screen.getByRole('button', { name: 'Chlorophyll' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
    expect(
      await screen.findByText('The pigment that absorbs light.'),
    ).toBeTruthy();
    expect(screen.getByText('← Photosynthesis — uses')).toBeTruthy();
  });

  it('keeps quiz answers out of read-only quiz snapshots', () => {
    const hostileItems = [
      {
        id: 'q1',
        prompt: 'Visible question',
        answer: 'CANONICAL ANSWER',
        explanation: 'SECRET EXPLANATION',
      },
    ] as unknown as QuizReadOutput['items'];

    renderUI(<QuizResult data={{ items: hostileItems }} />);

    expect(screen.getByText('Visible question')).toBeTruthy();
    expect(screen.queryByText('CANONICAL ANSWER')).toBeNull();
    expect(screen.queryByText('SECRET EXPLANATION')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders submission score, verdicts and feedback', () => {
    renderUI(<QuizSubmissionResult data={submission} />);

    expect(screen.getByText('Answers submitted')).toBeTruthy();
    expect(screen.getByText('Score: 1 / 2')).toBeTruthy();
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Nice work.')).toBeTruthy();
    expect(screen.getByText('Review the light reactions.')).toBeTruthy();
  });

  it('renders progress counters and submissions with empty sub-states', () => {
    const { unmount } = renderUI(<ProgressResult data={progress} />);
    expect(screen.getByText('quiz_submit')).toBeTruthy();
    expect(screen.getByText('material_open')).toBeTruthy();
    expect(screen.getByText('Chapter: ch1')).toBeTruthy();
    expect(screen.getByText('No chapter assigned')).toBeTruthy();
    expect(screen.getByText('Submission ID: sub-1')).toBeTruthy();
    unmount();

    renderUI(
      <ProgressResult
        data={{
          course_id: 'c1',
          student_id: 'student-1',
          event_counts: {},
          quiz_submissions: [],
        }}
      />,
    );
    expect(screen.getByText('No recorded activity.')).toBeTruthy();
    expect(screen.getByText('No quiz submissions yet.')).toBeTruthy();
  });

  it('shows run metadata without leaking artifact or report payloads', () => {
    renderUI(<LabResult data={labStart} />);

    expect(screen.getByText('Experiment run')).toBeTruthy();
    expect(screen.getByText('Progress: 100%')).toBeTruthy();
    expect(screen.getByText('Results table')).toBeTruthy();
    expect(screen.getByText('Report status: ready')).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret-output');
    expect(document.body.textContent).not.toContain('private report content');
  });

  it('renders empty states for empty snapshots', () => {
    const { unmount } = renderUI(
      <CourseResult
        data={{
          course: {
            id: 'c1',
            title: 'Empty',
            summary: '',
            status: 'draft',
          },
          chapters: [],
        }}
      />,
    );
    expect(screen.getByText('This course has no chapters yet.')).toBeTruthy();
    unmount();

    const { unmount: unmountMaterial } = renderUI(
      <MaterialSearchResult
        data={{ results: [], retrieval_method: 'keyword' }}
      />,
    );
    expect(screen.getByText('No matching material excerpts.')).toBeTruthy();
    unmountMaterial();

    const { unmount: unmountGraph } = renderUI(
      <GraphResult data={{ nodes: [], edges: [] }} />,
    );
    expect(screen.getByText('No graph data is available.')).toBeTruthy();
    unmountGraph();

    const { unmount: unmountQuiz } = renderUI(
      <QuizResult data={{ items: [] }} />,
    );
    expect(
      screen.getByText('No questions are available for this chapter.'),
    ).toBeTruthy();
    unmountQuiz();

    renderUI(
      <LabResult
        data={{
          run: { ...labStart.run, artifacts: [], progress: 0 },
        }}
      />,
    );
    expect(screen.getByText('No artifacts yet.')).toBeTruthy();
  });

  it('performs no network work while rendering snapshots', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderUI(
      <>
        <CourseResult data={course} />
        <MaterialSearchResult data={material} />
        <GraphResult data={graph} />
        <QuizResult data={{ items: [{ id: 'q1', prompt: 'Prompt' }] }} />
        <QuizSubmissionResult data={submission} />
        <ProgressResult data={progress} />
        <LabResult data={labStart} />
      </>,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('uses host semantic tokens and inherits the host theme provider', async () => {
    render(
      <ThemeProvider themeMode="dark">
        <CourseResult data={course} />
      </ThemeProvider>,
    );

    const section = screen
      .getByRole('heading', { name: 'Biology' })
      .closest('section');
    expect(section).not.toBeNull();
    expect(section?.className).toContain(styles.root);

    await waitFor(() => {
      expect(collectCssText()).toContain(`.${styles.root}`);
    });
    const cssText = collectCssText();
    const ruleStart = cssText.indexOf(`.${styles.root}`);
    const rule = cssText.slice(ruleStart, ruleStart + 400);
    expect(rule).toContain('var(--');

    const hexColors = rule.match(/#[0-9a-f]{3,8}/gi);
    expect(hexColors).toBeNull();
  });
});
