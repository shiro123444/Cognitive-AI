import type { ExperimentRun } from '@edufish/plugin';
import { describe, expect, it, vi } from 'vitest';

import { parseNeuronRun } from '../src/lab/parser.js';
import {
  normalizeHhParams,
  normalizeLifParams,
} from '../src/lab/params.js';

const TIME = [0, 0.025, 0.05, 0.075, 0.1];
const VOLTAGE = [-65, -64, -60, 10, -70];

function hhData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: 'hodgkin_huxley',
    duration_ms: 100,
    dt_ms: 0.025,
    params: {
      stimulus: { stimulus_current: 10, duration_ms: 100 },
      channels: { g_na_scale: 1, g_k_scale: 1 },
    },
    membrane_potential: { t_ms: [...TIME], v_mv: [...VOLTAGE] },
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
      constants: { c_m: 1, g_na: 120, g_k: 36 },
      units: { voltage: 'mV', current: 'uA/cm2', time: 'ms' },
    },
    pipeline_trace: [{ node_id: 'stimulus', status: 'completed' }],
    ...overrides,
  };
}

function lifData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: 'lif',
    duration_ms: 120,
    dt_ms: 0.1,
    params: {
      stimulus: { stimulus_current: 8, duration_ms: 120 },
    },
    membrane_potential: {
      t_ms: [0, 0.1, 0.2],
      v_mv: [-70, -60, 10],
    },
    spike_times: [0.2],
    total_spikes: 1,
    firing_rate: 5,
    threshold_mv: -55,
    reset_mv: -70,
    events: [{ label: 'Stimulus On', start_ms: 0, end_ms: 120 }],
    ...overrides,
  };
}

function makeRun(
  adapter: string,
  data: Record<string, unknown>,
  overrides: Partial<ExperimentRun> = {},
): ExperimentRun {
  return {
    id: 'run-1',
    template_id:
      adapter === 'hodgkin_huxley' ? 'exp-hodgkin-huxley' : 'exp-neuron-spike',
    student_id: 'student-1',
    course_id: 'course-1',
    status: 'completed',
    adapter,
    params: {
      stimulus_current: 10,
      duration_ms: 100,
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
        id: 'artifact-1',
        run_id: 'run-1',
        artifact_type: 'signal_summary',
        title: 'Neuron output',
        data,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    report: null,
    created_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:00:01Z',
    ...overrides,
  };
}

describe('normalizeHhParams / normalizeLifParams', () => {
  it('accepts both flat and normalized parameter shapes', () => {
    expect(
      normalizeHhParams({
        stimulus_current: 10,
        duration_ms: 120,
        g_na_scale: 1,
        g_k_scale: 1,
      }),
    ).toEqual({
      stimulus_current: 10,
      duration_ms: 120,
      g_na_scale: 1,
      g_k_scale: 1,
    });

    expect(
      normalizeHhParams({
        stimulus: { stimulus_current: 10, duration_ms: 120 },
        channels: { g_na_scale: 0.3, g_k_scale: 1 },
      }),
    ).toEqual({
      stimulus_current: 10,
      duration_ms: 120,
      g_na_scale: 0.3,
      g_k_scale: 1,
    });

    expect(
      normalizeLifParams({
        stimulus: { stimulus_current: 8, duration_ms: 120 },
      }),
    ).toEqual({ stimulus_current: 8, duration_ms: 120 });
  });

  it('rejects booleans, invalid nesting, fractional durations and bounds', () => {
    expect(
      normalizeHhParams({
        stimulus_current: true,
        duration_ms: 120,
        g_na_scale: 1,
        g_k_scale: 1,
      }),
    ).toBeUndefined();

    expect(
      normalizeHhParams({
        stimulus: 5,
        stimulus_current: 10,
        duration_ms: 120,
        g_na_scale: 1,
        g_k_scale: 1,
      }),
    ).toBeUndefined();

    expect(
      normalizeHhParams({
        stimulus_current: 10,
        duration_ms: 120.5,
        g_na_scale: 1,
        g_k_scale: 1,
      }),
    ).toBeUndefined();

    expect(
      normalizeHhParams({
        stimulus_current: 31,
        duration_ms: 120,
        g_na_scale: 1,
        g_k_scale: 1,
      }),
    ).toBeUndefined();

    expect(
      normalizeLifParams({ stimulus: 5, stimulus_current: 8, duration_ms: 120 }),
    ).toBeUndefined();
  });
});

describe('parseNeuronRun', () => {
  it('parses and freezes a known Hodgkin–Huxley artifact', () => {
    const parsed = parseNeuronRun(makeRun('hodgkin_huxley', hhData()));

    expect(parsed).toBeDefined();
    expect(parsed?.model).toBe('hodgkin_huxley');
    expect(parsed?.params).toEqual({
      stimulus_current: 10,
      duration_ms: 100,
      g_na_scale: 1,
      g_k_scale: 1,
    });
    expect(parsed?.timeMs).toEqual(TIME);
    expect(parsed?.voltageMv).toEqual(VOLTAGE);
    expect(parsed?.spikeTimesMs).toEqual([0.075]);
    expect(parsed?.currents?.iNa).toEqual([0, 1, 2, 3, 4]);
    expect(parsed?.gating?.h).toHaveLength(TIME.length);
    expect(parsed?.events).toEqual([
      { label: 'Stimulus', startMs: 10, endMs: 90 },
    ]);
    expect(parsed?.metadata?.method).toContain('Hodgkin');
    expect(parsed?.metadata?.temperatureC).toBe(6.3);
    expect(parsed?.metadata?.constants).toEqual({ c_m: 1, g_na: 120, g_k: 36 });

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.timeMs)).toBe(true);
    expect(Object.isFrozen(parsed?.params)).toBe(true);
    expect(Object.isFrozen(parsed?.currents)).toBe(true);
  });

  it('parses a known LIF artifact without inventing HH fields', () => {
    const parsed = parseNeuronRun(makeRun('neuron_simulator', lifData()));

    expect(parsed?.model).toBe('lif');
    expect(parsed?.params).toEqual({
      stimulus_current: 8,
      duration_ms: 120,
    });
    expect(parsed?.resetMv).toBe(-70);
    expect(parsed?.currents).toBeUndefined();
    expect(parsed?.gating).toBeUndefined();
  });

  it('projects only whitelisted fields and never exposes unknown payload data', () => {
    const data = hhData({
      secret: '/home/student/secret-output.txt',
      metadata: {
        method: 'RK4',
        secret: '/home/student/secret-output.txt',
        units: { voltage: 'mV', secret: 'hidden' },
      },
    });
    const parsed = parseNeuronRun(makeRun('hodgkin_huxley', data));

    expect(parsed).toBeDefined();
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('/home');
    expect(parsed?.metadata?.units).toEqual({ voltage: 'mV' });
  });

  it('rejects non-monotonic time and unequal sample lengths', () => {
    const badTime = hhData();
    badTime.membrane_potential = {
      t_ms: [0, 0.05, 0.025, 0.075, 0.1],
      v_mv: [...VOLTAGE],
    };
    expect(parseNeuronRun(makeRun('hodgkin_huxley', badTime))).toBeUndefined();

    const badLength = hhData();
    badLength.membrane_potential = {
      t_ms: [...TIME],
      v_mv: [-65, -64, -60],
    };
    expect(parseNeuronRun(makeRun('hodgkin_huxley', badLength))).toBeUndefined();
  });

  it('rejects non-finite values and inconsistent spike counts', () => {
    const badNumber = hhData();
    badNumber.membrane_potential = {
      t_ms: [...TIME],
      v_mv: [-65, Number.NaN, -60, 10, -70],
    };
    expect(parseNeuronRun(makeRun('hodgkin_huxley', badNumber))).toBeUndefined();

    const badCount = hhData({ total_spikes: 2 });
    expect(parseNeuronRun(makeRun('hodgkin_huxley', badCount))).toBeUndefined();

    const outOfBounds = hhData({ spike_times: [500], total_spikes: 1 });
    expect(
      parseNeuronRun(makeRun('hodgkin_huxley', outOfBounds)),
    ).toBeUndefined();
  });

  it('enforces the pinned sample and spike bounds', () => {
    const count = 16_002;
    const time = Array.from({ length: count }, (_, index) => index * 0.025);
    const voltage = Array.from({ length: count }, () => -65);
    const same = Array.from({ length: count }, () => 0);
    const tooMany = hhData({
      membrane_potential: { t_ms: time, v_mv: voltage },
      currents: {
        i_na: same,
        i_k: same,
        i_leak: same,
        i_stim: same,
      },
      gating: { m: same, h: same, n: same },
      spike_times: [],
      total_spikes: 0,
    });
    expect(parseNeuronRun(makeRun('hodgkin_huxley', tooMany))).toBeUndefined();
  });

  it('rejects unknown adapters, conflicting models and malformed parameters', () => {
    expect(
      parseNeuronRun(makeRun('synthetic_eeg', hhData())),
    ).toBeUndefined();

    const conflicting = hhData({ model: 'lif' });
    expect(
      parseNeuronRun(makeRun('hodgkin_huxley', conflicting)),
    ).toBeUndefined();

    const outOfBounds = hhData({
      params: {
        stimulus_current: 10,
        duration_ms: 100,
        g_na_scale: 1.5,
        g_k_scale: 1,
      },
    });
    expect(
      parseNeuronRun(
        makeRun('hodgkin_huxley', outOfBounds, {
          params: {
            stimulus_current: 10,
            duration_ms: 100,
            g_na_scale: 1.5,
            g_k_scale: 1,
          },
        }),
      ),
    ).toBeUndefined();
  });

  it('rejects a HH payload missing pinned current or gating arrays', () => {
    const missingCurrents = hhData({ currents: { i_na: [0, 0, 0, 0, 0] } });
    expect(
      parseNeuronRun(makeRun('hodgkin_huxley', missingCurrents)),
    ).toBeUndefined();

    const missingGating = hhData({ gating: { m: [0, 0, 0, 0, 0] } });
    expect(
      parseNeuronRun(makeRun('hodgkin_huxley', missingGating)),
    ).toBeUndefined();
  });

  it('projects the engine-shaped HH metadata constants', () => {
    const data = hhData({
      metadata: {
        method: 'fixed-step classical RK4 integration of coupled V/m/h/n ODEs',
        temperature_c: 6.3,
        constants: {
          capacitance_uf_cm2: 1,
          g_na_ms_cm2: 120,
          g_k_ms_cm2: 36,
          g_leak_ms_cm2: 0.3,
          e_na_mv: 50,
          e_k_mv: -77,
          e_leak_mv: -54.387,
          g_na_scaled_ms_cm2: 36,
          g_k_scaled_ms_cm2: 36,
        },
        units: {
          time: 'ms',
          voltage: 'mV',
          current: 'uA/cm^2',
          conductance: 'mS/cm^2',
          capacitance: 'uF/cm^2',
        },
      },
    });
    const parsed = parseNeuronRun(makeRun('hodgkin_huxley', data));

    expect(parsed?.metadata?.constants).toEqual({
      c_m: 1,
      g_na: 120,
      g_k: 36,
      g_l: 0.3,
      e_na: 50,
      e_k: -77,
      e_l: -54.387,
      g_na_scaled: 36,
      g_k_scaled: 36,
    });
    expect(parsed?.metadata?.units).toEqual({
      time: 'ms',
      voltage: 'mV',
      current: 'uA/cm^2',
      conductance: 'mS/cm^2',
      capacitance: 'uF/cm^2',
    });
  });

  it('is snapshot-only and performs no network calls', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      parseNeuronRun(makeRun('hodgkin_huxley', hhData()));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
