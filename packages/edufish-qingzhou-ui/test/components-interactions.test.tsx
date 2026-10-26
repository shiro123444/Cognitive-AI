import { EduFishPluginError } from '@edufish/plugin';
import type { LabStartOutput, QuizSubmitOutput } from '@edufish/plugin';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabLauncher } from '../src/components/LabLauncher.js';
import { QuizInteraction } from '../src/components/QuizInteraction.js';
import type {
  EduFishInvocation,
  EduFishUIClient,
} from '../src/contracts.js';
import { EduFishUIProvider } from '../src/provider.js';

const invocation: EduFishInvocation = {
  scope: { userId: 'user-1', sessionId: 'session-1' },
};

const quizItems = [
  { id: 'q1', prompt: 'What is 2+2?' },
  { id: 'q2', prompt: 'Explain photosynthesis.' },
];

const submitOutput: QuizSubmitOutput = {
  submission_id: 'sub-1',
  score: 1,
  total: 2,
  results: [
    { quiz_id: 'q1', correct: true, feedback: 'Nice work.' },
    { quiz_id: 'q2', correct: false, feedback: 'Review the light reactions.' },
  ],
};

const labOutput: LabStartOutput = {
  run: {
    id: 'run-1',
    template_id: 'tpl-1',
    student_id: 'student-1',
    course_id: 'c1',
    status: 'completed',
    adapter: 'local',
    params: {},
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
    report: null,
    created_at: '2026-01-02T00:00:00Z',
    completed_at: '2026-01-02T01:00:00Z',
  },
};

const QUIZ_FAILURE =
  'The operation failed. Please retry explicitly. Your answers remain available after an error.';

function createClient(
  handler: (
    operation: string,
    input: unknown,
    callInvocation: EduFishInvocation,
  ) => Promise<unknown>,
) {
  const invoke = vi.fn(handler);
  const client: EduFishUIClient = { invoke };
  return { client, invoke };
}

function requestIds(): () => string {
  let next = 0;
  return () => `request-${(next += 1)}`;
}

function shell(
  ui: ReactNode,
  client: EduFishUIClient,
  createRequestId: () => string,
) {
  return (
    <EduFishUIProvider
      client={client}
      createRequestId={createRequestId}
      getInvocation={() => invocation}
      identityKey="user-1"
    >
      {ui}
    </EduFishUIProvider>
  );
}

function renderWithProvider(
  ui: ReactNode,
  client: EduFishUIClient,
  createRequestId = requestIds(),
) {
  return render(shell(ui, client, createRequestId));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('QuizInteraction', () => {
  it('does not submit or autofill on mount, including StrictMode', async () => {
    const { client, invoke } = createClient(async () => submitOutput);

    renderWithProvider(
      <StrictMode>
        <QuizInteraction
          chapterId="ch1"
          courseId="c1"
          items={quizItems}
        />
      </StrictMode>,
      client,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invoke).not.toHaveBeenCalled();
    const first = screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement;
    const second = screen.getByLabelText(
      'Explain photosynthesis.',
    ) as HTMLTextAreaElement;
    expect(first.value).toBe('');
    expect(second.value).toBe('');
    expect(first.getAttribute('maxlength')).toBe('4000');
    expect(screen.getByRole('button', { name: 'Submit answers' })).toBeTruthy();
  });

  it('submits only after explicit user action and shows feedback', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    const { client, invoke } = createClient(async () => submitOutput);

    renderWithProvider(
      <QuizInteraction
        chapterId="ch1"
        courseId="c1"
        items={quizItems}
        onSubmitted={onSubmitted}
      />,
      client,
    );

    await user.type(screen.getByLabelText('What is 2+2?'), '4');
    await user.type(
      screen.getByLabelText('Explain photosynthesis.'),
      'Light to energy',
    );
    expect(invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toBe('edufish.quiz.submit');
    expect(invoke.mock.calls[0][1]).toEqual({
      course_id: 'c1',
      chapter_id: 'ch1',
      answers: [
        { quiz_id: 'q1', answer: '4' },
        { quiz_id: 'q2', answer: 'Light to energy' },
      ],
    });
    expect(
      (invoke.mock.calls[0][2] as EduFishInvocation).requestId,
    ).toBeTruthy();

    await screen.findByText('Nice work.');
    expect(screen.getByText('Score: 1 / 2')).toBeTruthy();
    expect(screen.getByText('Answers submitted')).toBeTruthy();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalledWith(submitOutput);
    expect(
      (screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value,
    ).toBe('4');
  });

  it('blocks blank answers without calling the client', async () => {
    const user = userEvent.setup();
    const { client, invoke } = createClient(async () => submitOutput);

    renderWithProvider(
      <QuizInteraction
        chapterId="ch1"
        courseId="c1"
        items={quizItems}
      />,
      client,
    );

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    await waitFor(() => {
      expect(
        screen.getAllByText('Enter an answer for every question.').length,
      ).toBeGreaterThan(0);
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('prevents concurrent double submissions', async () => {
    const user = userEvent.setup();
    let resolveRun: ((value: unknown) => void) | undefined;
    const { client, invoke } = createClient(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    renderWithProvider(
      <QuizInteraction
        chapterId="ch1"
        courseId="c1"
        items={quizItems}
      />,
      client,
    );

    await user.type(screen.getByLabelText('What is 2+2?'), '4');
    await user.type(
      screen.getByLabelText('Explain photosynthesis.'),
      'Light to energy',
    );

    const submitButton = screen.getByRole('button', {
      name: 'Submit answers',
    });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(resolveRun).toBeDefined();
    resolveRun?.(submitOutput);

    await screen.findByText('Nice work.');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves answers and retry identity after a failed submission', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { client, invoke } = createClient(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new EduFishPluginError(
          'UNAVAILABLE',
          'Service unavailable at /home/student/secret.',
        );
      }
      return submitOutput;
    });

    renderWithProvider(
      <QuizInteraction
        chapterId="ch1"
        courseId="c1"
        items={quizItems}
      />,
      client,
    );

    await user.type(screen.getByLabelText('What is 2+2?'), '4');
    await user.type(
      screen.getByLabelText('Explain photosynthesis.'),
      'Light to energy',
    );
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    await screen.findByText(QUIZ_FAILURE);
    expect(
      (screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value,
    ).toBe('4');
    expect(screen.queryByText(/secret/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    await screen.findByText('Nice work.');

    const ids = invoke.mock.calls.map(
      (call) => (call[2] as EduFishInvocation).requestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it('clears private drafts and completed feedback when the account changes', async () => {
    const user = userEvent.setup();
    const { client, invoke } = createClient(async () => submitOutput);
    const getInvocation = () => invocation;
    const tree = (identityKey: string) => (
      <EduFishUIProvider client={client} getInvocation={getInvocation} identityKey={identityKey}>
        <QuizInteraction courseId="c1" chapterId="ch1" items={quizItems} />
      </EduFishUIProvider>
    );
    const { rerender } = render(tree('user-1'));
    await user.type(screen.getByLabelText('What is 2+2?'), 'private draft');
    rerender(tree('user-2'));
    expect((screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value).toBe('');
    expect(invoke).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('What is 2+2?'), '4');
    await user.type(screen.getByLabelText('Explain photosynthesis.'), 'Light to energy');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    await screen.findByText('Nice work.');
    rerender(tree('user-3'));
    expect(screen.queryByText('Nice work.')).toBeNull();
    expect((screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value).toBe('');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('clears private answers when course, chapter or quiz scope changes', async () => {
    const user = userEvent.setup();
    const { client } = createClient(async () => submitOutput);
    const createRequestId = requestIds();

    const tree = (courseId: string, chapterId: string) =>
      shell(
        <QuizInteraction
          chapterId={chapterId}
          courseId={courseId}
          items={quizItems}
        />,
        client,
        createRequestId,
      );

    const { rerender } = render(tree('c1', 'ch1'));
    await user.type(screen.getByLabelText('What is 2+2?'), '4');
    expect(
      (screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value,
    ).toBe('4');

    rerender(tree('c1', 'ch2'));
    expect(
      (screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value,
    ).toBe('');

    await user.type(screen.getByLabelText('What is 2+2?'), '5');
    rerender(tree('c2', 'ch2'));
    expect(
      (screen.getByLabelText('What is 2+2?') as HTMLTextAreaElement).value,
    ).toBe('');
  });
});

describe('LabLauncher', () => {
  it('does not start on mount and explains local-only cancellation', async () => {
    const { client, invoke } = createClient(async () => labOutput);

    renderWithProvider(
      <StrictMode>
        <LabLauncher courseId="c1" templateId="tpl-1" />
      </StrictMode>,
      client,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invoke).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Nothing runs until you choose to start/),
    ).toBeTruthy();
    expect(
      screen.getByText(/does not cancel work already running on the server/),
    ).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
  });

  it('starts only on explicit action and renders the returned run', async () => {
    const user = userEvent.setup();
    const onStarted = vi.fn();
    const { client, invoke } = createClient(async () => labOutput);

    renderWithProvider(
      <LabLauncher
        courseId="c1"
        onStarted={onStarted}
        params={{ seed: 7 }}
        templateId="tpl-1"
      />,
      client,
    );

    expect(invoke).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Start experiment' }),
    );

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toBe('edufish.lab.start');
    expect(invoke.mock.calls[0][1]).toEqual({
      course_id: 'c1',
      template_id: 'tpl-1',
      params: { seed: 7 },
    });

    await screen.findByText('Experiment run');
    expect(screen.getByText('Results table')).toBeTruthy();
    expect(screen.getByText('Progress: 100%')).toBeTruthy();
    expect(screen.queryByText(/secret-output/)).toBeNull();
    expect(onStarted).toHaveBeenCalledWith(labOutput);
  });

  it('starts a new run on an explicit second start', async () => {
    const user = userEvent.setup();
    const { client, invoke } = createClient(async () => labOutput);

    renderWithProvider(
      <LabLauncher courseId="c1" templateId="tpl-1" />,
      client,
    );

    await user.click(
      screen.getByRole('button', { name: 'Start experiment' }),
    );
    await screen.findByText('Experiment run');

    await user.click(
      screen.getByRole('button', { name: 'Start experiment' }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    const ids = invoke.mock.calls.map(
      (call) => (call[2] as EduFishInvocation).requestId,
    );
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[1]).not.toBe(ids[0]);
    await screen.findByText('Experiment run');
  });

  it('prevents duplicate starts while a start is pending', async () => {
    let resolveRun: ((value: unknown) => void) | undefined;
    const { client, invoke } = createClient(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    renderWithProvider(
      <LabLauncher courseId="c1" templateId="tpl-1" />,
      client,
    );

    const startButton = screen.getByRole('button', {
      name: 'Start experiment',
    });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    resolveRun?.(labOutput);
    await screen.findByText('Experiment run');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('retries a failed start with the same request identity', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { client, invoke } = createClient(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new EduFishPluginError(
          'UNAVAILABLE',
          'Failed near /home/student/secret.',
        );
      }
      return labOutput;
    });

    renderWithProvider(
      <LabLauncher courseId="c1" templateId="tpl-1" />,
      client,
    );

    await user.click(
      screen.getByRole('button', { name: 'Start experiment' }),
    );
    await screen.findByText(
      'The operation failed. Please retry explicitly.',
    );
    expect(screen.queryByText(/secret/)).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Retry experiment' }),
    );
    await screen.findByText('Experiment run');

    const ids = invoke.mock.calls.map(
      (call) => (call[2] as EduFishInvocation).requestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it('describes cancellation as stopping the local wait only', async () => {
    const user = userEvent.setup();
    const { client, invoke } = createClient(() => new Promise(() => undefined));

    renderWithProvider(
      <LabLauncher courseId="c1" templateId="tpl-1" />,
      client,
    );

    await user.click(
      screen.getByRole('button', { name: 'Start experiment' }),
    );
    const cancelButton = await screen.findByRole('button', {
      name: 'Stop waiting',
    });
    await user.click(cancelButton);

    expect(
      await screen.findByText('The local wait was cancelled.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /does not cancel work already running on the server/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/remote cancel/i)).toBeNull();
    expect(screen.queryByText(/^Lab cancelled/i)).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
