import {
  EduFishPluginError,
  type EduFishInvocation,
  type ExperimentRun,
  type LabEvidence,
  type LabLearningContext,
  type LabLearningContextInput,
  type LabStartInput,
  type LabStartOutput,
  type ProgressReadOutput,
} from '@edufish/plugin';
import { ConfigProvider, theme } from 'antd';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import i18n from 'i18next';
import { StrictMode, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabLauncher } from '../src/components/LabLauncher.js';
import { ProgressResult } from '../src/components/ProgressResult.js';
import type {
  EduFishActivityContext,
  EduFishConceptContext,
  EduFishExperimentContext,
  EduFishUIClient,
} from '../src/contracts.js';
import { createLabLearningContext } from '../src/lab-learning-context.js';
import { NeuronWorkbench } from '../src/lab/NeuronWorkbench.js';
import { LAB_STATUS_POLL_INTERVAL_MS } from '../src/lab/constants.js';
import { EduFishUIProvider } from '../src/provider.js';

// Keep these tests focused on real session/action state, not control animations.
vi.mock('@lobehub/ui', () => ({
  Button: ({ children, disabled, onClick, htmlType }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
    htmlType?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  }) => <button disabled={disabled} onClick={onClick} type={htmlType ?? 'button'}>{children}</button>,
  Empty: ({ description }: { description?: ReactNode }) => <p>{description}</p>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Alert: ({ title }: { title?: ReactNode }) => <p role="alert">{title}</p>,
    InputNumber: ({ id, value, disabled, 'aria-label': label }: {
      id?: string;
      value?: number;
      disabled?: boolean;
      'aria-label'?: string;
    }) => <input aria-label={label} disabled={disabled} id={id} readOnly type="number" value={value} />,
    Progress: () => null,
    Segmented: () => null,
    Select: () => null,
    Slider: () => null,
    Tag: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  };
});

vi.mock('../src/lab/TraceChart.js', () => ({
  default: () => <div aria-label="Completed simulation traces" />,
}));

const invocation: EduFishInvocation = {
  scope: { userId: 'user-1', sessionId: 'session-1' },
};
const context: LabLearningContextInput = {
  chapter_id: 'chapter-1',
  activity_id: 'activity-1',
  concept_id: 'concept-1',
  graph_snapshot_id: 'a'.repeat(64),
};
const reorderedContext: LabLearningContextInput = {
  graph_snapshot_id: context.graph_snapshot_id,
  concept_id: context.concept_id,
  activity_id: context.activity_id,
  chapter_id: context.chapter_id,
};
const contextFields = [
  'chapter_id',
  'activity_id',
  'concept_id',
  'graph_snapshot_id',
] as const;

function persistedContext(
  input: LabLearningContextInput,
): LabLearningContext {
  return {
    version: 1,
    course_id: 'c1',
    chapter_id: input.chapter_id ?? null,
    activity_id: input.activity_id ?? null,
    concept_id: input.concept_id ?? null,
    graph_snapshot_id: input.graph_snapshot_id ?? null,
  };
}

function experimentRun(
  id: string,
  status: 'completed' | 'pending' = 'completed',
): ExperimentRun {
  const params = {
    stimulus_current: 10,
    duration_ms: 120,
    g_na_scale: 1,
    g_k_scale: 1,
  };
  return {
    id,
    template_id: 'exp-hodgkin-huxley',
    student_id: 'student-1',
    course_id: 'c1',
    status,
    adapter: 'hodgkin_huxley',
    params,
    summary: {},
    error_message: '',
    job_id: '',
    progress: status === 'completed' ? 100 : 0,
    progress_message: status,
    pipeline_nodes: {},
    artifacts: status === 'pending' ? [] : [{
      id: `artifact-${id}`,
      run_id: id,
      artifact_type: 'signal_summary',
      title: id,
      data: {
        model: 'hodgkin_huxley',
        params,
        duration_ms: 120,
        dt_ms: 0.025,
        membrane_potential: {
          t_ms: [0, 0.025, 0.05],
          v_mv: [-65, 10, -70],
        },
        spike_times: [0.025],
        total_spikes: 1,
        firing_rate: 10,
        threshold_mv: 0,
        currents: {
          i_na: [0, 1, 2],
          i_k: [1, 2, 3],
          i_leak: [0.1, 0.1, 0.1],
          i_stim: [0, 10, 0],
        },
        gating: {
          m: [0.05, 0.1, 0.2],
          h: [0.6, 0.59, 0.5],
          n: [0.3, 0.31, 0.32],
        },
      },
      created_at: '2026-11-09T00:00:00Z',
    }],
    report: null,
    created_at: '2026-11-09T00:00:00Z',
    completed_at: status === 'completed' ? '2026-11-09T00:00:01Z' : null,
  };
}

function output(
  id: string,
  learningContext?: LabLearningContextInput,
  status: 'completed' | 'pending' = 'completed',
): LabStartOutput {
  return {
    run: experimentRun(id, status),
    ...(learningContext === undefined
      ? {}
      : { learning_context: persistedContext(learningContext) }),
  };
}

function button(label: string): HTMLButtonElement {
  const target = screen.getByText(label).closest('button');
  if (target === null) throw new Error(`No button for ${label}`);
  return target;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function harness(handler: EduFishUIClient['invoke']) {
  const invoke = vi.fn(handler);
  const client: EduFishUIClient = { invoke };
  const getInvocation = () => invocation;
  let requestNumber = 0;
  const createRequestId = () => `request-${++requestNumber}`;
  const onOpenReference = vi.fn();
  const onOpenExperiment = vi.fn();
  return {
    invoke,
    onOpenReference,
    onOpenExperiment,
    wrap: (ui: ReactNode) => (
      <StrictMode>
        <EduFishUIProvider
          client={client}
          createRequestId={createRequestId}
          getInvocation={getInvocation}
          identityKey="user-1"
          onOpenExperiment={onOpenExperiment}
          onOpenReference={onOpenReference}
        >
          {ui}
        </EduFishUIProvider>
      </StrictMode>
    ),
  };
}

const controls = [
  {
    name: 'LabLauncher',
    start: 'Start experiment',
    retry: 'Retry experiment',
    render: (
      learningContext: LabLearningContextInput | undefined,
      onRun: (result: LabStartOutput) => void,
    ) => (
      <LabLauncher
        courseId="c1"
        learningContext={learningContext}
        onStarted={onRun}
        templateId="exp-hodgkin-huxley"
      />
    ),
  },
  {
    name: 'NeuronWorkbench',
    start: 'Run simulation',
    retry: 'Retry simulation',
    render: (
      learningContext: LabLearningContextInput | undefined,
      onRun: (result: LabStartOutput) => void,
    ) => (
      <NeuronWorkbench
        courseId="c1"
        learningContext={learningContext}
        onRun={onRun}
      />
    ),
  },
] as const;

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await act(async () => { await i18n.changeLanguage('en-US'); });
});

for (const control of controls) {
  describe(`${control.name} learning context`, () => {
    it.each([undefined, context])(
      'forwards context only on explicit start and leaves omitted input unchanged (%j)',
      async (learningContext) => {
        const host = harness(async (_operation, input) =>
          output('explicit-run', (input as LabStartInput).learning_context),
        );
        const onRun = vi.fn();
        render(host.wrap(control.render(learningContext, onRun)));
        expect(host.invoke).not.toHaveBeenCalled();

        fireEvent.click(button(control.start));
        await screen.findByText('explicit-run');

        expect(host.invoke).toHaveBeenCalledTimes(1);
        expect(host.invoke.mock.calls[0][0]).toBe('edufish.lab.start');
        expect(host.invoke.mock.calls[0][1]).toEqual({
          course_id: 'c1',
          template_id: 'exp-hodgkin-huxley',
          ...(control.name === 'NeuronWorkbench'
            ? { params: {
                stimulus_current: 10,
                duration_ms: 120,
                g_na_scale: 1,
                g_k_scale: 1,
              } }
            : {}),
          ...(learningContext === undefined
            ? {}
            : { learning_context: learningContext }),
        });
        expect(onRun).toHaveBeenCalledTimes(1);
      },
    );

    it('preserves state and retry identity for equivalent reordered context', async () => {
      let attempts = 0;
      const host = harness(async (_operation, input) => {
        attempts += 1;
        if (attempts === 1) throw new EduFishPluginError('UNAVAILABLE', 'Try again');
        return output(`same-context-${attempts}`, (input as LabStartInput).learning_context);
      });
      const onRun = vi.fn();
      const view = render(host.wrap(control.render(context, onRun)));
      fireEvent.click(button(control.start));
      await screen.findByText(control.retry);

      view.rerender(host.wrap(control.render({ ...reorderedContext }, onRun)));
      expect(host.invoke).toHaveBeenCalledTimes(1);
      fireEvent.click(button(control.retry));
      await screen.findByText('same-context-2');

      view.rerender(host.wrap(control.render({ ...context }, onRun)));
      expect(screen.getByText('same-context-2')).toBeTruthy();
      expect(host.invoke).toHaveBeenCalledTimes(2);
      fireEvent.click(button(control.start));
      await screen.findByText('same-context-3');
      const ids = host.invoke.mock.calls.map((call) => call[2].requestId);
      expect(ids[0]).toBeTruthy();
      expect(ids[1]).toBe(ids[0]);
      expect(ids[2]).toBeTruthy();
      expect(ids[2]).not.toBe(ids[0]);
    });

    it.each(contextFields)(
      'clears previous state and suppresses a late start response when %s changes',
      async (field) => {
        const late = deferred<LabStartOutput>();
        let attempts = 0;
        const host = harness(async (_operation, input) => {
          attempts += 1;
          if (attempts === 2) return late.promise;
          return output(`scope-run-${attempts}`, (input as LabStartInput).learning_context);
        });
        const onRun = vi.fn();
        const view = render(host.wrap(control.render(context, onRun)));
        fireEvent.click(button(control.start));
        await screen.findByText('scope-run-1');
        fireEvent.click(button(control.start));
        expect(host.invoke).toHaveBeenCalledTimes(2);
        const previousSignal = host.invoke.mock.calls[1][2].signal;
        const nextContext = {
          ...context,
          [field]: field === 'graph_snapshot_id' ? 'b'.repeat(64) : `${field}-2`,
        };

        view.rerender(host.wrap(control.render(nextContext, onRun)));
        expect(previousSignal?.aborted).toBe(true);
        expect(screen.queryByText('scope-run-1')).toBeNull();
        expect(button(control.start).disabled).toBe(false);
        expect(host.invoke).toHaveBeenCalledTimes(2);

        await act(async () => { late.resolve(output('late-old-run', context)); });
        expect(screen.queryByText('late-old-run')).toBeNull();
        expect(onRun).toHaveBeenCalledTimes(1);
        expect(host.invoke).toHaveBeenCalledTimes(2);

        fireEvent.click(button(control.start));
        await screen.findByText('scope-run-3');
        expect((host.invoke.mock.calls[2][1] as LabStartInput).learning_context).toEqual(nextContext);
        expect(host.invoke.mock.calls[2][2].requestId).not.toBe(host.invoke.mock.calls[1][2].requestId);
        expect(onRun).toHaveBeenCalledTimes(2);
      },
    );

    it('does not call APIs on replay, language, theme or context changes', async () => {
      const host = harness(async () => { throw new Error('No API expected'); });
      const onRun = vi.fn();
      const tree = (learningContext: LabLearningContextInput, themeMode: 'light' | 'dark') => (
        <ConfigProvider theme={{
          algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { motion: false },
        }}>
          {host.wrap(control.render(learningContext, onRun))}
        </ConfigProvider>
      );
      const view = render(tree(context, 'light'));
      view.rerender(tree({ ...reorderedContext }, 'dark'));
      await act(async () => { await i18n.changeLanguage('zh-CN'); });
      view.rerender(tree({ ...context, concept_id: 'concept-2' }, 'dark'));
      await act(async () => { await Promise.resolve(); });
      expect(host.invoke).not.toHaveBeenCalled();
      expect(onRun).not.toHaveBeenCalled();
    });
  });
}

describe('NeuronWorkbench context polling', () => {
  it.each([undefined, context])(
    'opts into status context only after an explicit contextual start (%j)',
    async (learningContext) => {
      const host = harness(async (operation, input) =>
        operation === 'edufish.lab.start'
          ? output('poll-run', (input as LabStartInput).learning_context, 'pending')
          : output('poll-run', learningContext),
      );
      render(host.wrap(<NeuronWorkbench courseId="c1" learningContext={learningContext} />));
      expect(host.invoke).not.toHaveBeenCalled();
      fireEvent.click(button('Run simulation'));
      await screen.findByText('poll-run');
      const statusCalls = host.invoke.mock.calls.filter((call) => call[0] === 'edufish.lab.status');
      expect(statusCalls).toHaveLength(1);
      expect(statusCalls[0][1]).toEqual({
        course_id: 'c1',
        run_id: 'poll-run',
        ...(learningContext === undefined ? {} : { include_context: true }),
      });
      expect(host.invoke.mock.calls.filter((call) => call[0] === 'edufish.lab.start')).toHaveLength(1);
    },
  );

  it('keeps the poll schedule for equivalent context and stops it when context changes', async () => {
    vi.useFakeTimers();
    const lateStatus = deferred<LabStartOutput>();
    let checks = 0;
    const host = harness(async (operation) => {
      if (operation === 'edufish.lab.start') return output('old-poll-run', context, 'pending');
      checks += 1;
      return checks === 1
        ? output('old-poll-run', context, 'pending')
        : lateStatus.promise;
    });
    const tree = (learningContext: LabLearningContextInput) => host.wrap(
      <NeuronWorkbench courseId="c1" learningContext={learningContext} />,
    );
    const view = render(tree(context));
    await act(async () => {
      fireEvent.click(button('Run simulation'));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(checks).toBe(1);

    view.rerender(tree({ ...reorderedContext }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(checks).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(LAB_STATUS_POLL_INTERVAL_MS); });
    expect(checks).toBe(2);
    const previousSignal = host.invoke.mock.calls[2][2].signal;

    view.rerender(tree({ ...context, activity_id: 'activity-2' }));
    expect(previousSignal?.aborted).toBe(true);
    expect(screen.queryByText(/Run ID: old-poll-run/)).toBeNull();
    expect(screen.getByText(/No completed runs yet/)).toBeTruthy();
    await act(async () => { lateStatus.resolve(output('old-poll-run', context)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LAB_STATUS_POLL_INTERVAL_MS * 2); });
    expect(checks).toBe(2);
    expect(screen.queryByText('old-poll-run')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each(['lifTemplateId', 'hhTemplateId'] as const)(
    'clears comparison runs when the effective %s changes',
    async (templateProp) => {
      const host = harness(async (_operation, input) => output('template-run', (input as LabStartInput).learning_context));
      const view = render(host.wrap(<NeuronWorkbench courseId="c1" learningContext={context} />));
      fireEvent.click(button('Run simulation'));
      await screen.findByText('template-run');
      view.rerender(host.wrap(
        <NeuronWorkbench courseId="c1" learningContext={context} {...{ [templateProp]: 'another-neuron-template' }} />,
      ));
      expect(screen.queryByText('template-run')).toBeNull();
      expect(screen.getByText(/No completed runs yet/)).toBeTruthy();
      expect(host.invoke).toHaveBeenCalledTimes(1);
    },
  );
});

describe('createLabLearningContext', () => {
  const concept: EduFishConceptContext = {
    course_id: 'c1',
    concept_id: 'concept-1',
    graph_snapshot_id: 'a'.repeat(64),
    label: 'Membrane potential',
    origin: { messageId: 'host-message', toolCallId: 'host-tool-call' },
  };

  it('copies only graph business references, excluding host origin, identity and parameters', () => {
    const hostContext = {
      ...concept,
      user_id: 'user-private',
      session_id: 'session-private',
      message_id: 'message-private',
      params: { stimulus_current: 99 },
    };
    expect(createLabLearningContext(hostContext)).toEqual({
      concept_id: 'concept-1',
      graph_snapshot_id: 'a'.repeat(64),
    });
    expect(hostContext.origin).toEqual(concept.origin);
  });

  it.each(['chapter-1', null])('copies activity and only a nonnull chapter (%s)', (chapterId) => {
    const activity: EduFishActivityContext = {
      ...concept,
      activity: {
        activity_id: 'activity-1',
        chapter_id: chapterId,
        title: 'Explore firing',
        activity_type: 'experiment',
      },
    };
    expect(createLabLearningContext(activity)).toEqual({
      concept_id: 'concept-1',
      graph_snapshot_id: 'a'.repeat(64),
      activity_id: 'activity-1',
      ...(chapterId === null ? {} : { chapter_id: chapterId }),
    });
  });

  it('accepts experiment context structurally without adding its template or parameters', () => {
    const experiment: EduFishExperimentContext = {
      ...concept,
      experiment: { template_id: 'exp-hodgkin-huxley', title: 'Neuron', adapter: 'hodgkin_huxley' },
    };
    expect(createLabLearningContext(experiment)).toEqual({
      concept_id: concept.concept_id,
      graph_snapshot_id: concept.graph_snapshot_id,
    });
  });
});

const legacyProgress: ProgressReadOutput = {
  course_id: 'c1',
  student_id: 'student-1',
  event_counts: { experiment_completed: 3 },
  quiz_submissions: [],
};

function evidence(runId = 'evidence-run'): LabEvidence {
  return {
    run_id: runId,
    template_id: 'exp-hodgkin-huxley',
    adapter: 'hodgkin_huxley',
    status: 'completed',
    completed_at: '2026-11-09T00:00:01Z',
    learning_context: persistedContext(context),
    artifact_count: 45,
    artifact_ids: ['artifact-opaque-1', 'artifact-opaque-2'],
    report_id: 'report-opaque-1',
  };
}

describe('ProgressResult experiment evidence', () => {
  it('leaves legacy snapshots unchanged when evidence was not requested', () => {
    render(<ProgressResult data={legacyProgress} />);
    expect(screen.getByText('experiment_completed')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('No quiz submissions yet.')).toBeTruthy();
    expect(screen.queryByText('Completed experiment evidence')).toBeNull();
    expect(screen.queryByText(/proof of mastery/)).toBeNull();
  });

  it('explains an explicitly empty evidence extension', () => {
    render(<ProgressResult data={{ ...legacyProgress, lab_evidence: { version: 1, runs: [] } }} />);
    expect(screen.getByRole('heading', { name: 'Completed experiment evidence' })).toBeTruthy();
    expect(screen.getByText('No completed experiments with learning context yet.')).toBeTruthy();
    expect(screen.getByText(/not proof of mastery/)).toBeTruthy();
  });

  it('renders readable references and total artifact count without links, requests or navigation', async () => {
    const host = harness(async () => { throw new Error('No API expected'); });
    const data: ProgressReadOutput = {
      ...legacyProgress,
      lab_evidence: {
        version: 1,
        runs: [
          evidence(),
          {
            ...evidence('chapter-only-run'),
            learning_context: persistedContext({ chapter_id: 'chapter-only' }),
            artifact_count: 0,
            artifact_ids: [],
            report_id: null,
          },
        ],
      },
    };
    const view = render(host.wrap(<ProgressResult data={data} />));
    expect(screen.getByText('Experiment run: evidence-run')).toBeTruthy();
    expect(screen.getAllByText('Template: exp-hodgkin-huxley')).toHaveLength(2);
    expect(screen.getAllByText('Adapter: hodgkin_huxley')).toHaveLength(2);
    expect(screen.getByText('Concept: concept-1')).toBeTruthy();
    expect(screen.getByText('Chapter: chapter-1')).toBeTruthy();
    expect(screen.getByText('Activity: activity-1')).toBeTruthy();
    expect(screen.getByText('Chapter: chapter-only')).toBeTruthy();
    expect(screen.getByText('Artifact count: 45')).toBeTruthy();
    expect(screen.getByText('Artifact count: 0')).toBeTruthy();
    expect(screen.getByText('Report available (reference): report-opaque-1')).toBeTruthy();
    expect(screen.getByText('No report available')).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-09T00:00:01Z');
    expect(screen.getByText(/Completion records and artifact counts.*not proof of mastery/)).toBeTruthy();
    expect(screen.queryByText('artifact-opaque-1')).toBeNull();
    expect(screen.queryByText('Concept:')).toBeNull();
    expect(document.querySelectorAll('button, a[href], input, textarea, select')).toHaveLength(0);

    await act(async () => { await i18n.changeLanguage('zh-CN'); });
    view.rerender(host.wrap(<ProgressResult data={data} />));
    expect(screen.getByRole('heading', { name: '已完成实验的证据' })).toBeTruthy();
    expect(screen.getByText('产出数量: 45')).toBeTruthy();
    expect(screen.getByText('报告可用（引用编号）：report-opaque-1')).toBeTruthy();
    expect(screen.getByText(/不代表知识掌握程度/)).toBeTruthy();
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.onOpenReference).not.toHaveBeenCalled();
    expect(host.onOpenExperiment).not.toHaveBeenCalled();
  });

  it('bounds direct snapshot rendering to fifty evidence cards', () => {
    const runs = Array.from({ length: 51 }, (_, index) => evidence(`bounded-run-${index}`));
    render(<ProgressResult data={{ ...legacyProgress, lab_evidence: { version: 1, runs } }} />);
    expect(screen.getByText('Experiment run: bounded-run-49')).toBeTruthy();
    expect(screen.queryByText('Experiment run: bounded-run-50')).toBeNull();
    expect(screen.getByText('1 more completed experiments not shown.')).toBeTruthy();
  });
});
