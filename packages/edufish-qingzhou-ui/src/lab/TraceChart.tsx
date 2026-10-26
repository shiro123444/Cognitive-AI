import { LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import { theme } from 'antd';
import type { RefObject } from 'react';

import {
  buildCurrentOption,
  buildGatingOption,
  buildVoltageOption,
  type ChartTokens,
} from './chart-options.js';
import { labStyles } from './styles.js';
import type { ChartRun, ParsedNeuronRun } from './types.js';

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  MarkLineComponent,
  SVGRenderer,
]);

type ChartInstance = ReturnType<typeof echarts.init>;

export interface TraceChartLabels {
  readonly timeUnit: string;
  readonly voltageUnit: string;
  readonly currentUnit: string;
  readonly gatingUnit: string;
  readonly spikeMarkers: string;
  readonly thresholdLine: string;
  readonly sodium: string;
  readonly potassium: string;
  readonly leak: string;
  readonly stimulus: string;
  readonly gateM: string;
  readonly gateH: string;
  readonly gateN: string;
  readonly voltageA11y: string;
  readonly currentA11y: string;
  readonly gateA11y: string;
}

export interface TraceChartProps {
  readonly runs: readonly ChartRun[];
  readonly inspected?: ParsedNeuronRun;
  readonly labels: TraceChartLabels;
}

function useHostChartTokens(): {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly tokens: ChartTokens;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The host can replace CSS-variable rules without changing DOM attributes.
  // Subscribe to the same Ant Design token context instead of observing DOM
  // mutations, so JS-rendered SVG traces follow appearance and primary color.
  const { token } = theme.useToken();
  const tokens = useMemo<ChartTokens>(() => ({
    text: token.colorText,
    textSecondary: token.colorTextSecondary,
    background: token.colorBgContainer,
    border: token.colorBorder,
    borderSecondary: token.colorBorderSecondary,
    primary: token.colorPrimary,
    success: token.colorSuccess,
    warning: token.colorWarning,
    danger: token.colorError,
    fill: token.colorFillQuaternary,
    fontFamily: token.fontFamily,
  }), [token]);

  return { containerRef, tokens };
}

function ChartSurface({
  option,
  height,
  ariaLabel,
}: {
  readonly option: Record<string, unknown>;
  readonly height: number;
  readonly ariaLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;

    const initialize = (width: number): void => {
      if (disposed || chartRef.current !== null || width <= 0) return;
      const chart = echarts.init(host, undefined, {
        renderer: 'svg',
        width,
        height,
      });
      chartRef.current = chart;
      chart.setOption(optionRef.current as EChartsCoreOption, true);
    };

    initialize(Math.floor(host.clientWidth));

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const width = Math.floor(entries[0]?.contentRect.width ?? 0);
        if (width <= 0) return;
        const chart = chartRef.current;
        if (chart === null) {
          initialize(width);
        } else {
          chart.resize({ width, height });
        }
      });
      observer.observe(host);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart !== null) {
      chart.setOption(option as EChartsCoreOption, true);
    }
  }, [option]);

  return (
    <figure className={labStyles.chartFigure}>
      <div
        ref={hostRef}
        role="img"
        aria-label={ariaLabel}
        className={labStyles.chartHost}
        style={{ height: `${height}px` }}
      />
      <figcaption className={labStyles.srOnly}>{ariaLabel}</figcaption>
    </figure>
  );
}

/** Lazy-loaded ECharts SVG traces. No data is fabricated here. */
export default function TraceChart({
  runs,
  inspected,
  labels,
}: TraceChartProps) {
  const { containerRef, tokens } = useHostChartTokens();

  const voltageOption = useMemo(
    () =>
      buildVoltageOption(runs, tokens, {
        timeUnit: labels.timeUnit,
        voltageUnit: labels.voltageUnit,
        spikeMarkers: labels.spikeMarkers,
        thresholdLabel: labels.thresholdLine,
        ariaLabel: labels.voltageA11y,
      }),
    [runs, tokens, labels],
  );

  const currentOption = useMemo(
    () =>
      inspected === undefined
        ? undefined
        : buildCurrentOption(inspected, tokens, {
            timeUnit: labels.timeUnit,
            currentUnit: labels.currentUnit,
            sodium: labels.sodium,
            potassium: labels.potassium,
            leak: labels.leak,
            stimulus: labels.stimulus,
            ariaLabel: labels.currentA11y,
          }),
    [inspected, tokens, labels],
  );

  const gateOption = useMemo(
    () =>
      inspected === undefined
        ? undefined
        : buildGatingOption(inspected, tokens, {
            timeUnit: labels.timeUnit,
            gatingUnit: labels.gatingUnit,
            gateM: labels.gateM,
            gateH: labels.gateH,
            gateN: labels.gateN,
            ariaLabel: labels.gateA11y,
          }),
    [inspected, tokens, labels],
  );

  return (
    <div className={labStyles.chartStack} ref={containerRef}>
      {runs.length > 0 ? (
        <ChartSurface
          option={voltageOption}
          height={340}
          ariaLabel={labels.voltageA11y}
        />
      ) : null}
      {currentOption !== undefined ? (
        <ChartSurface
          option={currentOption}
          height={280}
          ariaLabel={labels.currentA11y}
        />
      ) : null}
      {gateOption !== undefined ? (
        <ChartSurface
          option={gateOption}
          height={260}
          ariaLabel={labels.gateA11y}
        />
      ) : null}
    </div>
  );
}
