import { describe, expect, it } from 'vitest';

import {
  FALLBACK_CHART_TOKENS,
  buildCurrentOption,
  buildGatingOption,
  buildVoltageOption,
  readChartTokens,
  toChartRun,
  type ChartTokens,
} from '../src/lab/chart-options.js';
import type { ParsedNeuronRun } from '../src/lab/types.js';

const TOKENS: ChartTokens = Object.freeze({
  ...FALLBACK_CHART_TOKENS,
  primary: 'rgb(1, 1, 1)',
  success: 'rgb(2, 2, 2)',
  warning: 'rgb(3, 3, 3)',
  danger: 'rgb(4, 4, 4)',
  text: 'rgb(5, 5, 5)',
  textSecondary: 'rgb(6, 6, 6)',
  background: 'rgb(7, 7, 7)',
  border: 'rgb(8, 8, 8)',
  borderSecondary: 'rgb(9, 9, 9)',
  fill: 'rgb(10, 10, 10)',
});

const run: ParsedNeuronRun = {
  runId: 'run-1',
  model: 'hodgkin_huxley',
  adapter: 'hodgkin_huxley',
  status: 'completed',
  completedAt: '2026-01-01T00:00:01Z',
  params: {
    stimulus_current: 10,
    duration_ms: 100,
    g_na_scale: 1,
    g_k_scale: 1,
  },
  durationMs: 100,
  dtMs: 0.025,
  timeMs: [0, 0.025, 0.05],
  voltageMv: [-65, -60, 10],
  spikeTimesMs: [0.05],
  totalSpikes: 1,
  firingRateHz: 10,
  thresholdMv: 0,
  currents: {
    iNa: [0, 1, 2],
    iK: [1, 2, 3],
    iLeak: [0.1, 0.1, 0.1],
    iStim: [0, 10, 0],
  },
  gating: {
    m: [0.1, 0.2, 0.3],
    h: [0.6, 0.5, 0.4],
    n: [0.3, 0.35, 0.4],
  },
  events: [],
};

const labels = {
  timeUnit: 'ms',
  voltageUnit: 'mV',
  spikeMarkers: 'Spike markers',
  thresholdLabel: 'threshold',
  ariaLabel: 'voltage a11y',
};

describe('lab chart option builders', () => {
  it('builds SVG-compatible voltage overlays with spikes and a markLine', () => {
    const option = buildVoltageOption(
      [toChartRun(run, 'Run 1 · HH')],
      TOKENS,
      labels,
    );
    const series = option.series as Array<Record<string, unknown>>;

    expect((option.xAxis as Record<string, unknown>).name).toBe('ms');
    expect((option.yAxis as Record<string, unknown>).name).toBe('mV');
    expect((option.legend as Record<string, unknown>).data).toEqual([
      'Run 1 · HH',
    ]);
    expect(option.color).toEqual([TOKENS.primary]);
    expect(series).toHaveLength(2);
    expect(series[0].type).toBe('line');
    expect(series[0].sampling).toBe('lttb');
    expect(series[0].lineStyle).toEqual({
      width: 1.8,
      color: TOKENS.primary,
    });
    expect(series[0].markLine).toMatchObject({
      data: [{ yAxis: 0 }],
    });
    expect(series[1].type).toBe('scatter');
    expect(series[1].data).toEqual([[0.05, 0]]);
    expect(option.dataZoom).toHaveLength(2);
    expect(
      (option.aria as { label: { description: string } }).label.description,
    ).toBe('voltage a11y');
  });

  it('overlays up to three runs with distinct host-token colors', () => {
    const option = buildVoltageOption(
      [
        toChartRun(run, 'Run 1 · HH'),
        toChartRun({ ...run, runId: 'run-2' }, 'Run 2 · HH'),
        toChartRun({ ...run, runId: 'run-3' }, 'Run 3 · HH'),
      ],
      TOKENS,
      labels,
    );
    const series = option.series as Array<Record<string, unknown>>;
    expect(option.color).toEqual([
      TOKENS.primary,
      TOKENS.success,
      TOKENS.warning,
    ]);
    expect(series).toHaveLength(6);
  });

  it('builds current and gating charts only from parsed HH data', () => {
    const current = buildCurrentOption(run, TOKENS, {
      timeUnit: 'ms',
      currentUnit: 'µA/cm²',
      sodium: 'Na',
      potassium: 'K',
      leak: 'Leak',
      stimulus: 'Stimulus',
      ariaLabel: 'current a11y',
    });
    expect((current?.series as unknown[]).length).toBe(4);
    expect(
      (current?.yAxis as Record<string, unknown>).name,
    ).toBe('µA/cm²');

    const gating = buildGatingOption(run, TOKENS, {
      timeUnit: 'ms',
      gatingUnit: 'fraction',
      gateM: 'm',
      gateH: 'h',
      gateN: 'n',
      ariaLabel: 'gate a11y',
    });
    expect((gating?.series as unknown[]).length).toBe(3);
    expect((gating?.yAxis as Record<string, unknown>).min).toBe(0);
    expect((gating?.yAxis as Record<string, unknown>).max).toBe(1);

    const lifRun: ParsedNeuronRun = {
      ...run,
      model: 'lif',
      adapter: 'neuron_simulator',
      params: { stimulus_current: 8, duration_ms: 120 },
      currents: undefined,
      gating: undefined,
    };
    expect(
      buildCurrentOption(lifRun, TOKENS, {
        timeUnit: 'ms',
        currentUnit: 'µA/cm²',
        sodium: 'Na',
        potassium: 'K',
        leak: 'Leak',
        stimulus: 'Stimulus',
        ariaLabel: 'current a11y',
      }),
    ).toBeUndefined();
    expect(
      buildGatingOption(lifRun, TOKENS, {
        timeUnit: 'ms',
        gatingUnit: 'fraction',
        gateM: 'm',
        gateH: 'h',
        gateN: 'n',
        ariaLabel: 'gate a11y',
      }),
    ).toBeUndefined();
  });

  it('maps host semantic CSS variables and falls back when unavailable', () => {
    const host = document.createElement('div');
    host.style.setProperty('--ant-color-text', 'rgb(11, 12, 13)');
    host.style.setProperty('--ant-color-primary', 'rgb(14, 15, 16)');
    host.style.setProperty('--ant-color-bg-container', 'rgb(17, 18, 19)');
    host.style.setProperty('--ant-font-family', 'HostFont');
    document.body.appendChild(host);

    try {
      const tokens = readChartTokens(host);
      expect(tokens.text).toBe('rgb(11, 12, 13)');
      expect(tokens.primary).toBe('rgb(14, 15, 16)');
      expect(tokens.background).toBe('rgb(17, 18, 19)');
      expect(tokens.fontFamily).toBe('HostFont');
    } finally {
      host.remove();
    }

    expect(readChartTokens(null)).toBe(FALLBACK_CHART_TOKENS);
  });
});
