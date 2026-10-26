import type {
  ChartRun,
  NeuronCurrents,
  ParsedNeuronRun,
} from './types.js';

/**
 * Chart option builders are pure functions of parsed, whitelisted trace data
 * and host color tokens. They never inspect artifact JSON or run state.
 */

export interface ChartTokens {
  readonly text: string;
  readonly textSecondary: string;
  readonly background: string;
  readonly border: string;
  readonly borderSecondary: string;
  readonly primary: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly fill: string;
  readonly fontFamily: string;
}

export const FALLBACK_CHART_TOKENS: ChartTokens = Object.freeze({
  text: '#1f1f1f',
  textSecondary: '#595959',
  background: '#ffffff',
  border: '#d9d9d9',
  borderSecondary: '#f0f0f0',
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  fill: '#f5f5f5',
  fontFamily: 'system-ui, sans-serif',
});

const SERIES_FALLBACKS = ['primary', 'success', 'warning'] as const;

function readCustomProperty(
  style: CSSStyleDeclaration | undefined,
  name: string,
  fallback: string,
): string {
  const value = style?.getPropertyValue(name)?.trim();
  return value !== undefined && value.length > 0 ? value : fallback;
}

/** Read host semantic tokens from the mounted lab container. */
export function readChartTokens(element: HTMLElement | null): ChartTokens {
  if (element === null || typeof getComputedStyle !== 'function') {
    return FALLBACK_CHART_TOKENS;
  }
  const style = getComputedStyle(element);
  return Object.freeze({
    text: readCustomProperty(style, '--ant-color-text', FALLBACK_CHART_TOKENS.text),
    textSecondary: readCustomProperty(
      style,
      '--ant-color-text-secondary',
      FALLBACK_CHART_TOKENS.textSecondary,
    ),
    background: readCustomProperty(
      style,
      '--ant-color-bg-elevated',
      readCustomProperty(
        style,
        '--ant-color-bg-container',
        FALLBACK_CHART_TOKENS.background,
      ),
    ),
    border: readCustomProperty(
      style,
      '--ant-color-border',
      FALLBACK_CHART_TOKENS.border,
    ),
    borderSecondary: readCustomProperty(
      style,
      '--ant-color-border-secondary',
      FALLBACK_CHART_TOKENS.borderSecondary,
    ),
    primary: readCustomProperty(
      style,
      '--ant-color-primary',
      FALLBACK_CHART_TOKENS.primary,
    ),
    success: readCustomProperty(
      style,
      '--ant-color-success',
      FALLBACK_CHART_TOKENS.success,
    ),
    warning: readCustomProperty(
      style,
      '--ant-color-warning',
      FALLBACK_CHART_TOKENS.warning,
    ),
    danger: readCustomProperty(
      style,
      '--ant-color-error',
      FALLBACK_CHART_TOKENS.danger,
    ),
    fill: readCustomProperty(
      style,
      '--ant-color-fill-quaternary',
      FALLBACK_CHART_TOKENS.fill,
    ),
    fontFamily: readCustomProperty(
      style,
      '--ant-font-family',
      FALLBACK_CHART_TOKENS.fontFamily,
    ),
  });
}

export function seriesColor(index: number, tokens: ChartTokens): string {
  const key = SERIES_FALLBACKS[index % SERIES_FALLBACKS.length];
  return tokens[key];
}

function pairs(
  x: readonly number[],
  y: readonly number[],
): [number, number][] {
  const length = Math.min(x.length, y.length);
  const out = new Array<[number, number]>(length);
  for (let index = 0; index < length; index += 1) {
    out[index] = [x[index], y[index]];
  }
  return out;
}

function axisStyle(tokens: ChartTokens): Record<string, unknown> {
  return {
    axisLabel: { color: tokens.textSecondary },
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { lineStyle: { color: tokens.border } },
    splitLine: { lineStyle: { color: tokens.borderSecondary } },
    nameTextStyle: { color: tokens.textSecondary },
  };
}

function baseOption(
  tokens: ChartTokens,
  ariaLabel: string,
): Record<string, unknown> {
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {
      color: tokens.text,
      fontFamily: tokens.fontFamily,
    },
    aria: {
      enabled: true,
      decal: { show: false },
      label: { enabled: true, description: ariaLabel },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: tokens.background,
      borderColor: tokens.border,
      textStyle: { color: tokens.text },
      axisPointer: {
        lineStyle: { color: tokens.border },
        crossStyle: { color: tokens.border },
        label: {
          backgroundColor: tokens.background,
          borderColor: tokens.border,
          color: tokens.text,
        },
      },
    },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: tokens.textSecondary },
      inactiveColor: tokens.border,
      pageTextStyle: { color: tokens.textSecondary },
      pageIconColor: tokens.textSecondary,
      pageIconInactiveColor: tokens.borderSecondary,
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      {
        type: 'slider',
        height: 16,
        bottom: 6,
        borderColor: tokens.borderSecondary,
        backgroundColor: 'transparent',
        fillerColor: tokens.fill,
        handleStyle: { color: tokens.primary },
        moveHandleStyle: { color: tokens.textSecondary },
        dataBackground: {
          lineStyle: { color: tokens.border },
          areaStyle: { color: tokens.fill },
        },
        selectedDataBackground: {
          lineStyle: { color: tokens.primary },
          areaStyle: { color: tokens.fill },
        },
        emphasis: { handleStyle: { color: tokens.primary } },
        textStyle: { color: tokens.textSecondary },
      },
    ],
  };
}

export function toChartRun(
  run: ParsedNeuronRun,
  label: string,
): ChartRun {
  return Object.freeze({
    runId: run.runId,
    label,
    model: run.model,
    timeMs: run.timeMs,
    voltageMv: run.voltageMv,
    spikeTimesMs: run.spikeTimesMs,
    thresholdMv: run.thresholdMv,
  });
}

export interface VoltageOptionLabels {
  readonly timeUnit: string;
  readonly voltageUnit: string;
  readonly spikeMarkers: string;
  readonly thresholdLabel: string;
  readonly ariaLabel: string;
}

export function buildVoltageOption(
  runs: readonly ChartRun[],
  tokens: ChartTokens,
  labels: VoltageOptionLabels,
): Record<string, unknown> {
  const lineNames = runs.map((run) => run.label);
  const series: Record<string, unknown>[] = [];

  runs.forEach((run, index) => {
    const color = seriesColor(index, tokens);
    series.push({
      name: run.label,
      type: 'line',
      showSymbol: false,
      symbol: 'none',
      sampling: 'lttb',
      lineStyle: { width: 1.8, color },
      itemStyle: { color },
      emphasis: { focus: 'series' },
      data: pairs(run.timeMs, run.voltageMv),
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color, type: 'dashed', opacity: 0.45, width: 1 },
        label: {
          show: index === runs.length - 1,
          formatter: labels.thresholdLabel,
          color: tokens.textSecondary,
          fontSize: 11,
          position: 'insideEndTop',
        },
        data: [{ yAxis: run.thresholdMv }],
      },
    });

    if (run.spikeTimesMs.length > 0) {
      series.push({
        name: `${run.label} · ${labels.spikeMarkers}`,
        type: 'scatter',
        symbol: 'triangle',
        symbolSize: 7,
        itemStyle: { color },
        emphasis: { focus: 'series' },
        data: run.spikeTimesMs.map((time) => [time, run.thresholdMv]),
      });
    }
  });

  const base = baseOption(tokens, labels.ariaLabel);
  return {
    ...base,
    color: runs.map((_, index) => seriesColor(index, tokens)),
    grid: { left: 56, right: 18, top: 40, bottom: 58, containLabel: true },
    legend: {
      ...(base.legend as Record<string, unknown>),
      data: lineNames,
    },
    xAxis: {
      type: 'value',
      name: labels.timeUnit,
      nameLocation: 'end',
      nameGap: 22,
      scale: false,
      ...axisStyle(tokens),
    },
    yAxis: {
      type: 'value',
      name: labels.voltageUnit,
      nameLocation: 'end',
      scale: true,
      ...axisStyle(tokens),
    },
    series,
  };
}

export interface CurrentOptionLabels {
  readonly timeUnit: string;
  readonly currentUnit: string;
  readonly sodium: string;
  readonly potassium: string;
  readonly leak: string;
  readonly stimulus: string;
  readonly ariaLabel: string;
}

function buildMultiLineOption(
  timeMs: readonly number[],
  lines: readonly {
    readonly name: string;
    readonly values: readonly number[];
    readonly color: string;
  }[],
  tokens: ChartTokens,
  labels: {
    readonly timeUnit: string;
    readonly yUnit: string;
    readonly ariaLabel: string;
  },
  yAxisExtra: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = baseOption(tokens, labels.ariaLabel);
  return {
    ...base,
    color: lines.map((line) => line.color),
    grid: { left: 56, right: 18, top: 40, bottom: 58, containLabel: true },
    legend: {
      ...(base.legend as Record<string, unknown>),
      data: lines.map((line) => line.name),
    },
    xAxis: {
      type: 'value',
      name: labels.timeUnit,
      nameLocation: 'end',
      nameGap: 22,
      scale: false,
      ...axisStyle(tokens),
    },
    yAxis: {
      type: 'value',
      name: labels.yUnit,
      nameLocation: 'end',
      scale: true,
      ...yAxisExtra,
      ...axisStyle(tokens),
    },
    series: lines.map((line) => ({
      name: line.name,
      type: 'line',
      showSymbol: false,
      symbol: 'none',
      sampling: 'lttb',
      lineStyle: { width: 1.5, color: line.color },
      itemStyle: { color: line.color },
      emphasis: { focus: 'series' },
      data: pairs(timeMs, line.values),
    })),
  };
}

export function buildCurrentOption(
  run: ParsedNeuronRun,
  tokens: ChartTokens,
  labels: CurrentOptionLabels,
): Record<string, unknown> | undefined {
  const currents: NeuronCurrents | undefined = run.currents;
  if (currents === undefined) return undefined;

  return buildMultiLineOption(
    run.timeMs,
    [
      { name: labels.sodium, values: currents.iNa, color: tokens.primary },
      { name: labels.potassium, values: currents.iK, color: tokens.success },
      { name: labels.leak, values: currents.iLeak, color: tokens.warning },
      { name: labels.stimulus, values: currents.iStim, color: tokens.danger },
    ],
    tokens,
    {
      timeUnit: labels.timeUnit,
      yUnit: labels.currentUnit,
      ariaLabel: labels.ariaLabel,
    },
  );
}

export interface GateOptionLabels {
  readonly timeUnit: string;
  readonly gatingUnit: string;
  readonly gateM: string;
  readonly gateH: string;
  readonly gateN: string;
  readonly ariaLabel: string;
}

export function buildGatingOption(
  run: ParsedNeuronRun,
  tokens: ChartTokens,
  labels: GateOptionLabels,
): Record<string, unknown> | undefined {
  const gating = run.gating;
  if (gating === undefined) return undefined;

  return buildMultiLineOption(
    run.timeMs,
    [
      { name: labels.gateM, values: gating.m, color: tokens.primary },
      { name: labels.gateH, values: gating.h, color: tokens.success },
      { name: labels.gateN, values: gating.n, color: tokens.warning },
    ],
    tokens,
    {
      timeUnit: labels.timeUnit,
      yUnit: labels.gatingUnit,
      ariaLabel: labels.ariaLabel,
    },
    { min: 0, max: 1, scale: false },
  );
}
