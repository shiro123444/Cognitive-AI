import {
  EduFishPluginError,
  type EduFishInvocation,
  type ExperimentRun,
  type LabStartOutput,
} from '@edufish/plugin';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EduFishUIClient } from '../src/contracts.js';
import { NeuronWorkbench } from '../src/lab/index.js';
import { EduFishUIProvider } from '../src/provider.js';

const invocation: EduFishInvocation = {
  scope: { userId: 'user-1', sessionId: 'session-1' },
};

const TIME = [0, 0.025, 0.05, 0.075, 0.1];

function hhData(stimulusCurrent: number): Record<string, unknown> {
  return {
    model: 'hodgkin_huxley',
    duration_ms: 120,
    dt_ms: 0.025,
    params: {
      stimulus_current: stimulusCurrent,
      duration_ms: 120,
      g_na_scale: 1,
      g_k_scale: 1,
    },
    membrane_potential: {
      t_ms: [...TIME],
      v_mv: [-65, -64, -60, 10, -70],
    },
    spike_times: [0.075],
    total_spikes: 1,
    firing_rate: 10,
    threshold_mv: 0,
    currents: {
      i_na: [0, 1, 2, 3, 4],
      i_k: [1, 2, 3, 4, 5],
      i_leak: [0.1, 0.1, 0.1, 0.1, 0.1],
      i_stim: [0, 10, 10, 10, 0],
    },
    gating: {
      m: [0.05, 0.1, 0.2, 0.9, 0.1],
      h: [0.6, 0.59, 0.5, 0.2, 0.55],
      n: [0.3, 0.31, 0.32, 0.4, 0.35],
    },
    events: [{ label: 'Stimulus', start_ms: 10, end_ms: 90 }],
    metadata: {
      method: 'Classic Hodgkin-Huxley, RK4 dt=0.025 ms',
      temperature_c: 6.3,
    },
    pipeline_trace: [{ node_id: 'stimulus', status: 'completed' }],
  };
}

function lifData(): Record<string, unknown> {
  return {
    model: 'lif',
    duration_ms: 120,
    dt_ms: 0.1,
    params: { stimulus_current: 8, duration_ms: 120 },
    membrane_potential: { t_ms: [0, 0.1, 0.2], v_mv: [-70, -60, 10] },
    spike_times: [0.2],
    total_spikes: 1,
    firing_rate: 5,
    threshold_mv: -55,
    reset_mv: -70,
    events: [{ label: 'Stimulus On', start_ms: 0, end_ms: 120 }],
    pipeline_trace: [{ node_id: 'stimulus', status: 'completed' }],
  };
}

function hhRun(id: string, stimulusCurrent = 10): ExperimentRun {
  return {
    id,
    template_id: 'exp-hodgkin-huxley',
    student_id: 'student-1',
    course_id: 'c1',
    status: 'completed',
    adapter: 'hodgkin_huxley',
    params: {
      stimulus_current: stimulusCurrent,
      duration_ms: 120,
      g_na_scale: 1,
      g_k_scale: 1,
    },
    summary: {},
    error_message: '',
    job_id: '',
    progress: 100,
    progress_message: 'Completed',
    pipeline_nodes: {},
    artifacts: [
      {
        id: `artifact-${id}`,
        run_id: id,
        artifact_type: 'signal_summary',
        title: 'HH output',
        data: hhData(stimulusCurrent),
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    report: null,
    created_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:00:01Z',
  };
}

function lifRun(id: string): ExperimentRun {
  return {
    ...hhRun(id),
    template_id: 'exp-neuron-spike',
    adapter: 'neuron_simulator',
    params: { stimulus_current: 8, duration_ms: 120 },
    artifacts: [
      {
        id: `artifact-${id}`,
        run_id: id,
        artifact_type: 'signal_summary',
        title: 'LIF output',
        data: lifData(),
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function pendingRun(id: string): ExperimentRun {
  return {
    ...hhRun(id),
    status: 'pending',
    progress: 0,
    progress_message: 'Waiting for worker',
    artifacts: [],
    completed_at: null,
  };
}

function output(run: ExperimentRun): LabStartOutput {
  return { run };
}

function createRequestIds(start = 0): () => string {
  let next = start;
  return () => `request-${(next += 1)}`;
}

function shell(
  ui: ReactNode,
  client: EduFishUIClient,
  createRequestId: () => string,
): ReactNode {
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

function requestIds(invoke: ReturnType<typeof vi.fn>): string[] {
  return invoke.mock.calls.map(
    (call) => (call[2] as EduFishInvocation).requestId as string,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NeuronWorkbench', () => {
  it('does not call the API on mount, StrictMode, model switch or preset', async () => {
    const invoke = vi.fn(async () => output(hhRun('run-1')));
    const client: EduFishUIClient = { invoke };

    render(
      shell(
        <StrictMode>
          <NeuronWorkbench courseId="c1" />
        </StrictMode>,
        client,
        createRequestIds(),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText('Neuron workbench')).toBeTruthy();
    expect(screen.getByText(/No completed runs yet/)).toBeTruthy();
    expect(screen.getByText('Current inputs')).toBeTruthy();

    fireEvent.click(screen.getByText('Leaky integrate-and-fire'));
    fireEvent.click(screen.getByText('Subthreshold'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invoke).not.toHaveBeenCalled();
  });

  it('starts only on explicit action with the HH template and flat parameters', async () => {
    const user = userEvent.setup();
    const startOutput = output(hhRun('run-1'));
    const onRun = vi.fn();
    const invoke = vi.fn(async () => startOutput);
    const client: EduFishUIClient = { invoke };

    render(
      shell(
        <NeuronWorkbench courseId="c1" onRun={onRun} />,
        client,
        createRequestIds(),
      ),
    );

    expect(invoke).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toBe('edufish.lab.start');
    expect(invoke.mock.calls[0][1]).toEqual({
      course_id: 'c1',
      template_id: 'exp-hodgkin-huxley',
      params: {
        stimulus_current: 10,
        duration_ms: 120,
        g_na_scale: 1,
        g_k_scale: 1,
      },
    });
    expect(onRun).toHaveBeenCalledWith(startOutput);

    await screen.findByRole('table');
    expect(screen.getAllByText('Run 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('run-1').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Stimulus current 10 µA\/cm²/),
    ).toBeTruthy();
    expect(screen.queryByText('Edited — not yet run')).toBeNull();
  });

  it('switches to the LIF template and arbitrary teaching units', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async () => output(lifRun('run-lif')));
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await user.click(screen.getByText('Leaky integrate-and-fire'));
    expect(screen.getByText('a.u.')).toBeTruthy();
    expect(screen.queryByText('Na⁺ conductance scale')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][1]).toEqual({
      course_id: 'c1',
      template_id: 'exp-neuron-spike',
      params: { stimulus_current: 8, duration_ms: 120 },
    });

    await screen.findByRole('table');
    expect(screen.getByText('LIF')).toBeTruthy();
  });

  it('keeps completed parameters frozen while marking edited inputs as not run', async () => {
    const user = userEvent.setup();
    let starts = 0;
    const invoke = vi.fn(async (operation: string, input: unknown) => {
      if (operation !== 'edufish.lab.start') {
        throw new Error('unexpected operation');
      }
      starts += 1;
      const params = (input as { params: { stimulus_current: number } })
        .params;
      return output(hhRun(`run-${starts}`, params.stimulus_current));
    });
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await screen.findByRole('table');
    expect(
      screen.getByText(/Stimulus current 10 µA\/cm²/),
    ).toBeTruthy();

    const stimulus = screen.getByRole('spinbutton', {
      name: 'Stimulus current',
    });
    fireEvent.change(stimulus, { target: { value: '12' } });
    fireEvent.blur(stimulus);

    await waitFor(() =>
      expect(screen.getByText('Edited — not yet run')).toBeTruthy(),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    // The completed run still belongs to the old inputs.
    expect(
      screen.getByText(/Stimulus current 10 µA\/cm²/),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(
      (invoke.mock.calls[1][1] as { params: { stimulus_current: number } })
        .params.stimulus_current,
    ).toBe(12);
    await screen.findByText(/Stimulus current 12 µA\/cm²/);
    expect(screen.queryByText('Edited — not yet run')).toBeNull();
  });

  it('applies the sodium channel block preset without writing', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async () => output(hhRun('run-block')));
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await user.click(screen.getByText('Sodium channel block'));
    expect(invoke).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(
      (invoke.mock.calls[0][1] as { params: { g_na_scale: number } }).params
        .g_na_scale,
    ).toBe(0.1);
  });

  it('preserves the retry request id and uses a new id after success', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const invoke = vi.fn(async (operation: string) => {
      if (operation !== 'edufish.lab.start') {
        throw new Error('unexpected operation');
      }
      attempt += 1;
      if (attempt === 1) {
        throw new EduFishPluginError(
          'UNAVAILABLE',
          'Failed near /home/student/secret.',
        );
      }
      return output(hhRun(`run-${attempt}`));
    });
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await screen.findByText(
      'The simulation could not be started. Please retry explicitly.',
    );
    expect(screen.queryByText(/secret/)).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Retry simulation' }),
    );
    await screen.findByRole('table');

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));

    const ids = requestIds(invoke);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBeTruthy();
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('polls status only after an explicit run and renders the completed trace', async () => {
    const invoke = vi.fn(
      async (operation: string) => {
        if (operation === 'edufish.lab.start') {
          return output(pendingRun('run-pending'));
        }
        if (operation === 'edufish.lab.status') {
          return output(hhRun('run-pending'));
        }
        throw new Error('unexpected operation');
      },
    );
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );

    await waitFor(() =>
      expect(
        invoke.mock.calls.some(
          (call) => call[0] === 'edufish.lab.status',
        ),
      ).toBe(true),
    );

    const startCalls = invoke.mock.calls.filter(
      (call) => call[0] === 'edufish.lab.start',
    );
    expect(startCalls).toHaveLength(1);
    const statusCall = invoke.mock.calls.find(
      (call) => call[0] === 'edufish.lab.status',
    );
    expect(statusCall?.[1]).toEqual({
      course_id: 'c1',
      run_id: 'run-pending',
    });

    await screen.findByRole('table');
    expect(screen.getAllByText('run-pending').length).toBeGreaterThan(0);
  });

  it('keeps at most three completed runs, clears on course change and explicit clear', async () => {
    let starts = 0;
    const invoke = vi.fn(async (operation: string) => {
      if (operation !== 'edufish.lab.start') {
        throw new Error('unexpected operation');
      }
      starts += 1;
      return output(hhRun(`run-${starts}`));
    });
    const client: EduFishUIClient = { invoke };
    const createRequestId = createRequestIds();

    const view = render(
      shell(
        <NeuronWorkbench courseId="c1" />,
        client,
        createRequestId,
      ),
    );

    for (let index = 1; index <= 4; index += 1) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Run simulation' }),
      );
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(index));
      await screen.findByText(`run-${index}`);
    }

    expect(screen.queryByText('run-1')).toBeNull();
    expect(screen.getByText('run-2')).toBeTruthy();
    expect(screen.getByText('run-3')).toBeTruthy();
    expect(screen.getByText('run-4')).toBeTruthy();

    view.rerender(
      shell(
        <NeuronWorkbench courseId="c2" />,
        client,
        createRequestId,
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/No completed runs yet/)).toBeTruthy(),
    );
    expect(screen.queryByText('run-4')).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(4);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(5));
    await screen.findByText('run-5');

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear comparison' }),
    );
    expect(screen.getByText(/No completed runs yet/)).toBeTruthy();
    expect(screen.queryByText('run-5')).toBeNull();
  }, 30_000);

  it('labels cancellation as a local wait and never claims remote cancellation', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(() => new Promise<unknown>(() => undefined));
    const client: EduFishUIClient = { invoke };

    render(
      shell(<NeuronWorkbench courseId="c1" />, client, createRequestIds()),
    );

    await user.click(
      screen.getByRole('button', { name: 'Run simulation' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Stop waiting' }),
    );

    expect(
      await screen.findByText(
        'Stopped waiting locally. The run may still be running.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /does not cancel work already running on the server/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/remote cancel/i)).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
