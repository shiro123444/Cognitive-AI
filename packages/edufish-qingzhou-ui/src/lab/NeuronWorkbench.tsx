import type { ExperimentRun, LabStartOutput } from '@edufish/plugin';
import { Button } from '@lobehub/ui';
import { Alert, InputNumber, Segmented, Select, Slider, Tag } from 'antd';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useEduFishAction } from '../actions.js';
import { EmptyState } from '../components/shared.js';
import { useRequiredEduFishUIContext } from '../provider.js';
import { toChartRun } from './chart-options.js';
import {
  DEFAULT_HH_TEMPLATE_ID,
  DEFAULT_LIF_TEMPLATE_ID,
  HH_BOUNDS,
  LAB_STATUS_MAX_POLL_MS,
  LAB_STATUS_POLL_INTERVAL_MS,
  LIF_BOUNDS,
  MAX_COMPARISON_RUNS,
  isCompletedStatus,
  isFailedStatus,
  isPendingStatus,
} from './constants.js';
import {
  HH_PRESETS,
  LIF_PRESETS,
  clampToRange,
  computeRunMetrics,
  defaultParamsForModel,
  paramsEqual,
  toLabStartParams,
} from './params.js';
import { parseNeuronRun } from './parser.js';
import { useLabTranslation } from './strings.js';
import type { LabStringKey, LabTranslate } from './strings.js';
import { labStyles } from './styles.js';
import type {
  ChartRun,
  HhParams,
  LifParams,
  NeuronModel,
  NeuronParams,
  ParsedNeuronRun,
} from './types.js';
import type { TraceChartLabels } from './TraceChart.js';

const TraceChart = lazy(() => import('./TraceChart.js'));

export interface NeuronWorkbenchProps {
  readonly courseId: string;
  readonly lifTemplateId?: string;
  readonly hhTemplateId?: string;
  readonly onRun?: (output: LabStartOutput) => void;
}

function formatNumber(value: number, fractionDigits = 3): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toFixed(fractionDigits)));
}

function modelLabelKey(model: NeuronModel): LabStringKey {
  return model === 'hodgkin_huxley' ? 'labWbModelHH' : 'labWbModelLIF';
}

function modelShortKey(model: NeuronModel): LabStringKey {
  return model === 'hodgkin_huxley' ? 'labWbModelHHShort' : 'labWbModelLIFShort';
}

function formatRunParams(run: ParsedNeuronRun, t: LabTranslate): string {
  if (run.model === 'hodgkin_huxley') {
    const params = run.params as HhParams;
    return [
      `${t('labWbStimulusCurrent')} ${formatNumber(params.stimulus_current)} ${t('labWbUnitMicroAmp')}`,
      `${t('labWbDuration')} ${params.duration_ms} ${t('labWbUnitMs')}`,
      `${t('labWbGNaScale')} ${t('labWbUnitScale')}${formatNumber(params.g_na_scale)}`,
      `${t('labWbGKScale')} ${t('labWbUnitScale')}${formatNumber(params.g_k_scale)}`,
    ].join(' · ');
  }
  const params = run.params as LifParams;
  return [
    `${t('labWbStimulusCurrent')} ${formatNumber(params.stimulus_current)} ${t('labWbUnitArbitrary')}`,
    `${t('labWbDuration')} ${params.duration_ms} ${t('labWbUnitMs')}`,
  ].join(' · ');
}

function ParamField({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  disabled,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
  readonly disabled: boolean;
}) {
  const inputId = `${id}-number`;
  return (
    <div className={labStyles.field}>
      <div className={labStyles.fieldHeader}>
        <label className={labStyles.fieldLabel} htmlFor={inputId}>
          {label}
        </label>
        <span className={labStyles.numericGroup}>
          <InputNumber
            aria-label={label}
            disabled={disabled}
            id={inputId}
            max={max}
            min={min}
            onChange={(next) => {
              if (typeof next === 'number') onChange(next);
            }}
            size="small"
            step={step}
            value={value}
          />
          <span>{unit}</span>
        </span>
      </div>
      <Slider
        ariaLabelForHandle={label}
        disabled={disabled}
        max={max}
        min={min}
        onChange={onChange}
        step={step}
        value={value}
      />
    </div>
  );
}

function MetadataDetails({
  run,
  t,
}: {
  readonly run: ParsedNeuronRun;
  readonly t: LabTranslate;
}) {
  const metadata = run.metadata;
  if (metadata === undefined) return null;

  return (
    <details className={labStyles.details}>
      <summary className={labStyles.detailsSummary}>
        {t('labWbMetadata')}
      </summary>
      <dl className={labStyles.definitionList}>
        {metadata.method !== undefined ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbMetadataMethod')}
            </dt>
            <dd className={labStyles.definitionValue}>{metadata.method}</dd>
          </>
        ) : null}
        {metadata.solver !== undefined ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbMetadataSolver')}
            </dt>
            <dd className={labStyles.definitionValue}>{metadata.solver}</dd>
          </>
        ) : null}
        {metadata.temperatureC !== undefined ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbMetadataTemperature')}
            </dt>
            <dd className={labStyles.definitionValue}>
              {formatNumber(metadata.temperatureC, 2)} °C
            </dd>
          </>
        ) : null}
        {metadata.constants !== undefined ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbMetadataConstants')}
            </dt>
            <dd className={labStyles.definitionValue}>
              {Object.entries(metadata.constants)
                .map(([key, value]) => `${key}=${formatNumber(value)}`)
                .join(', ')}
            </dd>
          </>
        ) : null}
        {metadata.units !== undefined ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbMetadataUnits')}
            </dt>
            <dd className={labStyles.definitionValue}>
              {Object.entries(metadata.units)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')}
            </dd>
          </>
        ) : null}
      </dl>
    </details>
  );
}

function RunCard({
  run,
  index,
  t,
}: {
  readonly run: ParsedNeuronRun;
  readonly index: number;
  readonly t: LabTranslate;
}) {
  const metrics = computeRunMetrics(run);
  const visibleSpikes = run.spikeTimesMs.slice(0, 12);

  return (
    <li className={labStyles.card}>
      <div className={labStyles.row}>
        <strong>{t('labWbRunLabel', { index })}</strong>
        <Tag>{t(modelLabelKey(run.model))}</Tag>
        <Tag color={isCompletedStatus(run.status) ? 'success' : 'default'}>
          {run.status}
        </Tag>
      </div>

      <p className={labStyles.muted}>{formatRunParams(run, t)}</p>

      {run.events.length > 0 ? (
        <p className={labStyles.muted}>
          {t('labWbEvents')}:{' '}
          {run.events
            .map(
              (event) =>
                `${event.label} ${formatNumber(event.startMs)}–${formatNumber(event.endMs)} ${t('labWbUnitMs')}`,
            )
            .join(' · ')}
        </p>
      ) : null}

      <dl className={labStyles.definitionList}>
        <dt className={labStyles.definitionTerm}>{t('labWbRunId')}</dt>
        <dd className={labStyles.definitionValue}>{run.runId}</dd>
        {run.completedAt !== null ? (
          <>
            <dt className={labStyles.definitionTerm}>
              {t('labWbCompletedAt')}
            </dt>
            <dd className={labStyles.definitionValue}>
              <time dateTime={run.completedAt}>{run.completedAt}</time>
            </dd>
          </>
        ) : null}
        <dt className={labStyles.definitionTerm}>
          {t('labWbTotalSpikes')}
        </dt>
        <dd className={labStyles.definitionValue}>{metrics.totalSpikes}</dd>
        <dt className={labStyles.definitionTerm}>
          {t('labWbFiringRate')}
        </dt>
        <dd className={labStyles.definitionValue}>
          {formatNumber(metrics.firingRateHz)} {t('labWbFiringRateUnit')}
        </dd>
        <dt className={labStyles.definitionTerm}>
          {t('labWbMaxPotential')}
        </dt>
        <dd className={labStyles.definitionValue}>
          {formatNumber(metrics.maxPotentialMv)} {t('labWbVoltageUnit')}
        </dd>
        <dt className={labStyles.definitionTerm}>
          {t('labWbMeanPotential')}
        </dt>
        <dd className={labStyles.definitionValue}>
          {formatNumber(metrics.meanPotentialMv)} {t('labWbVoltageUnit')}
        </dd>
        <dt className={labStyles.definitionTerm}>{t('labWbThreshold')}</dt>
        <dd className={labStyles.definitionValue}>
          {formatNumber(metrics.thresholdMv)} {t('labWbVoltageUnit')}
        </dd>
        <dt className={labStyles.definitionTerm}>{t('labWbDt')}</dt>
        <dd className={labStyles.definitionValue}>
          {formatNumber(metrics.dtMs, 4)} {t('labWbUnitMs')}
        </dd>
        <dt className={labStyles.definitionTerm}>
          {t('labWbSampleCount')}
        </dt>
        <dd className={labStyles.definitionValue}>{metrics.sampleCount}</dd>
      </dl>

      <details className={labStyles.details}>
        <summary className={labStyles.detailsSummary}>
          {t('labWbSpikeTimes')}
        </summary>
        {run.spikeTimesMs.length === 0 ? (
          <p className={labStyles.muted}>{t('labWbNoSpikes')}</p>
        ) : (
          <>
            <ul className={labStyles.spikeList}>
              {visibleSpikes.map((time, spikeIndex) => (
                <li
                  className={labStyles.spikeItem}
                  key={`${time}-${spikeIndex}`}
                >
                  {formatNumber(time)} {t('labWbUnitMs')}
                </li>
              ))}
            </ul>
            {run.spikeTimesMs.length > visibleSpikes.length ? (
              <p className={labStyles.muted}>
                {t('labWbSpikeMore', {
                  count: run.spikeTimesMs.length - visibleSpikes.length,
                })}
              </p>
            ) : null}
          </>
        )}
      </details>

      <MetadataDetails run={run} t={t} />
    </li>
  );
}

function SummaryTable({
  runs,
  t,
}: {
  readonly runs: readonly ParsedNeuronRun[];
  readonly t: LabTranslate;
}) {
  return (
    <div className={labStyles.tableWrapper}>
      <table className={labStyles.table}>
        <caption className={labStyles.tableCaption}>
          {t('labWbCompletedRuns')}
        </caption>
        <thead>
          <tr>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbRunColumn')}
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbModelLabel')}
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbTotalSpikes')}
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbFiringRate')} ({t('labWbFiringRateUnit')})
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbMaxPotential')} ({t('labWbVoltageUnit')})
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbThreshold')} ({t('labWbVoltageUnit')})
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbDt')} ({t('labWbUnitMs')})
            </th>
            <th className={labStyles.tableHeaderCell} scope="col">
              {t('labWbDuration')} ({t('labWbUnitMs')})
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const metrics = computeRunMetrics(run);
            return (
              <tr key={run.runId}>
                <th className={labStyles.tableCell} scope="row">
                  {t('labWbRunLabel', { index: index + 1 })}
                </th>
                <td className={labStyles.tableCell}>
                  {t(modelShortKey(run.model))}
                </td>
                <td className={labStyles.tableCell}>{metrics.totalSpikes}</td>
                <td className={labStyles.tableCell}>
                  {formatNumber(metrics.firingRateHz)}
                </td>
                <td className={labStyles.tableCell}>
                  {formatNumber(metrics.maxPotentialMv)}
                </td>
                <td className={labStyles.tableCell}>
                  {formatNumber(metrics.thresholdMv)}
                </td>
                <td className={labStyles.tableCell}>
                  {formatNumber(metrics.dtMs, 4)}
                </td>
                <td className={labStyles.tableCell}>
                  {formatNumber(metrics.durationMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorkbenchSession({
  courseId,
  lifTemplateId = DEFAULT_LIF_TEMPLATE_ID,
  hhTemplateId = DEFAULT_HH_TEMPLATE_ID,
  onRun,
}: NeuronWorkbenchProps) {
  const t = useLabTranslation();
  const startAction = useEduFishAction('edufish.lab.start');
  const statusAction = useEduFishAction('edufish.lab.status');

  const {
    run: runStart,
    reset: resetStart,
    cancel: cancelStart,
    pending: startPending,
    error: startError,
  } = startAction;
  const {
    run: runStatus,
    reset: resetStatus,
    cancel: cancelStatus,
  } = statusAction;

  const titleId = useId();
  const paramsId = useId();
  const resultsId = useId();
  const modelId = useId();
  const inspectId = useId();

  const [model, setModel] = useState<NeuronModel>('hodgkin_huxley');
  const [hhParams, setHhParams] = useState<HhParams>(
    defaultParamsForModel('hodgkin_huxley') as HhParams,
  );
  const [lifParams, setLifParams] = useState<LifParams>(
    defaultParamsForModel('lif') as LifParams,
  );
  const [completedRuns, setCompletedRuns] = useState<
    readonly ParsedNeuronRun[]
  >([]);
  const [inspectRunId, setInspectRunId] = useState<string | undefined>(
    undefined,
  );
  const [activeRun, setActiveRun] = useState<
    { readonly id: string; readonly status: string } | undefined
  >(undefined);
  const [pollStopped, setPollStopped] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [parameterError, setParameterError] = useState(false);
  const [localStartError, setLocalStartError] = useState(false);
  const [statusCheckFailed, setStatusCheckFailed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [statusRetryNonce, setStatusRetryNonce] = useState(0);

  const pollStartRef = useRef(0);
  const statusBusyRef = useRef(false);
  const startingRef = useRef(false);
  const hasSuccessfulStartRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const editorParams: NeuronParams =
    model === 'hodgkin_huxley' ? hhParams : lifParams;
  const templateId =
    model === 'hodgkin_huxley' ? hhTemplateId : lifTemplateId;

  const latestForModel = useMemo(() => {
    for (let index = completedRuns.length - 1; index >= 0; index -= 1) {
      if (completedRuns[index].model === model) return completedRuns[index];
    }
    return undefined;
  }, [completedRuns, model]);

  const edited =
    latestForModel !== undefined &&
    !paramsEqual(model, editorParams, latestForModel.params);

  const addCompleted = useCallback((parsed: ParsedNeuronRun) => {
    setCompletedRuns((previous) => {
      const withoutDuplicate = previous.filter(
        (entry) => entry.runId !== parsed.runId,
      );
      return [...withoutDuplicate, parsed].slice(-MAX_COMPARISON_RUNS);
    });
    setInspectRunId(parsed.runId);
    setUnreadable(false);
  }, []);

  const applyRun = useCallback(
    (run: ExperimentRun) => {
      if (isCompletedStatus(run.status)) {
        const parsed = parseNeuronRun(run);
        if (parsed !== undefined) {
          addCompleted(parsed);
        } else {
          setUnreadable(true);
        }
        setActiveRun(undefined);
        return;
      }
      setActiveRun({ id: run.id, status: run.status });
    },
    [addCompleted],
  );

  const handleRun = useCallback(async () => {
    if (startingRef.current || startPending) return;
    startingRef.current = true;

    setParameterError(false);
    setLocalStartError(false);
    setCancelled(false);
    setPollStopped(false);
    setStatusCheckFailed(false);
    setPollTimedOut(false);
    setUnreadable(false);
    setActiveRun(undefined);
    pollStartRef.current = Date.now();
    statusBusyRef.current = false;

    const inputParams = toLabStartParams(model, editorParams);
    if (inputParams === undefined) {
      setParameterError(true);
      startingRef.current = false;
      return;
    }

    // A new explicit run replaces any outstanding status wait.
    cancelStatus();
    resetStatus();

    try {
      // A new run after a successful write needs a fresh id. A retry after an
      // error intentionally keeps the core hook's id.
      if (hasSuccessfulStartRef.current) {
        resetStart();
        hasSuccessfulStartRef.current = false;
      }

      const output = await runStart({
        course_id: courseId,
        template_id: templateId,
        params: inputParams,
      });

      if (!mountedRef.current) return;
      if (output === undefined) {
        setLocalStartError(true);
        return;
      }

      hasSuccessfulStartRef.current = true;
      try {
        onRun?.(output);
      } catch {
        // A host callback must not break the workbench.
      }
      applyRun(output.run);
    } catch {
      if (mountedRef.current) setLocalStartError(true);
    } finally {
      startingRef.current = false;
    }
  }, [
    applyRun,
    cancelStatus,
    courseId,
    editorParams,
    model,
    onRun,
    resetStart,
    resetStatus,
    runStart,
    startPending,
    templateId,
  ]);

  const stopWaiting = useCallback(() => {
    setCancelled(true);
    setPollStopped(true);
    cancelStatus();
    cancelStart();
  }, [cancelStart, cancelStatus]);

  const retryStatus = useCallback(() => {
    setStatusCheckFailed(false);
    setPollTimedOut(false);
    setPollStopped(false);
    setCancelled(false);
    resetStatus();
    pollStartRef.current = Date.now();
    setStatusRetryNonce((value) => value + 1);
  }, [resetStatus]);

  const clearRuns = useCallback(() => {
    setCompletedRuns([]);
    setInspectRunId(undefined);
    setUnreadable(false);
  }, []);

  const activeRunId = activeRun?.id;
  const activeRunStatus = activeRun?.status;

  useEffect(() => {
    if (activeRunId === undefined || activeRunStatus === undefined) return;
    if (!isPendingStatus(activeRunStatus)) return;
    if (
      pollStopped ||
      cancelled ||
      statusCheckFailed ||
      pollTimedOut
    ) {
      return;
    }

    let disposed = false;

    const tick = async (): Promise<void> => {
      if (disposed || statusBusyRef.current) return;
      if (Date.now() - pollStartRef.current > LAB_STATUS_MAX_POLL_MS) {
        setPollTimedOut(true);
        return;
      }

      statusBusyRef.current = true;
      try {
        const output = await runStatus({
          course_id: courseId,
          run_id: activeRunId,
        });
        if (disposed) return;
        if (output === undefined) {
          setStatusCheckFailed(true);
          return;
        }
        applyRun(output.run);
      } finally {
        statusBusyRef.current = false;
      }
    };

    const kickoff = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, LAB_STATUS_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [
    activeRunId,
    activeRunStatus,
    applyRun,
    cancelled,
    courseId,
    pollStopped,
    pollTimedOut,
    runStatus,
    statusCheckFailed,
    statusRetryNonce,
  ]);

  function updateHhParam(key: keyof HhParams, raw: number | null): void {
    if (raw === null || !Number.isFinite(raw)) return;
    const bounds = HH_BOUNDS[key];
    let value = clampToRange(raw, bounds.min, bounds.max);
    if (key === 'duration_ms') value = Math.round(value);
    setParameterError(false);
    setHhParams((previous) => ({ ...previous, [key]: value }));
  }

  function updateLifParam(key: keyof LifParams, raw: number | null): void {
    if (raw === null || !Number.isFinite(raw)) return;
    const bounds = LIF_BOUNDS[key];
    let value = clampToRange(raw, bounds.min, bounds.max);
    if (key === 'duration_ms') value = Math.round(value);
    setParameterError(false);
    setLifParams((previous) => ({ ...previous, [key]: value }));
  }

  const chartRuns = useMemo<readonly ChartRun[]>(
    () =>
      completedRuns.map((run, index) =>
        toChartRun(
          run,
          `${t('labWbRunLabel', { index: index + 1 })} · ${t(
            modelShortKey(run.model),
          )}`,
        ),
      ),
    [completedRuns, t],
  );

  const inspectedRun = useMemo(() => {
    if (inspectRunId !== undefined) {
      const found = completedRuns.find(
        (run) => run.runId === inspectRunId,
      );
      if (found !== undefined) return found;
    }
    return completedRuns[completedRuns.length - 1];
  }, [completedRuns, inspectRunId]);

  const chartLabels = useMemo<TraceChartLabels>(
    () => ({
      timeUnit: t('labWbTimeUnit'),
      voltageUnit: t('labWbVoltageUnit'),
      currentUnit: t('labWbCurrentUnit'),
      gatingUnit: t('labWbGatingUnit'),
      spikeMarkers: t('labWbSpikeMarkers'),
      thresholdLine: t('labWbThresholdLine'),
      sodium: t('labWbSodiumCurrent'),
      potassium: t('labWbPotassiumCurrent'),
      leak: t('labWbLeakCurrent'),
      stimulus: t('labWbStimulusCurrentTrace'),
      gateM: t('labWbGateM'),
      gateH: t('labWbGateH'),
      gateN: t('labWbGateN'),
      voltageA11y: t('labWbVoltageChartA11y', {
        count: completedRuns.length,
      }),
      currentA11y: t('labWbCurrentChartA11y'),
      gateA11y: t('labWbGateChartA11y'),
    }),
    [completedRuns.length, t],
  );

  const startFailed =
    (startError !== undefined || localStartError) && !cancelled;
  const pollActive =
    activeRunId !== undefined &&
    activeRunStatus !== undefined &&
    isPendingStatus(activeRunStatus) &&
    !pollStopped &&
    !cancelled &&
    !statusCheckFailed &&
    !pollTimedOut;
  const runFailed =
    activeRunStatus !== undefined && isFailedStatus(activeRunStatus);
  const canRetryStatus =
    activeRunId !== undefined &&
    (statusCheckFailed ||
      pollTimedOut ||
      (pollStopped &&
        activeRunStatus !== undefined &&
        isPendingStatus(activeRunStatus)));

  return (
    <section
      aria-busy={startPending || pollActive}
      aria-labelledby={titleId}
      className={labStyles.root}
    >
      <header className={labStyles.header}>
        <h3 className={labStyles.title} id={titleId}>
          {t('labWbTitle')}
        </h3>
        <p className={labStyles.description}>{t('labWbDescription')}</p>
      </header>

      <section aria-labelledby={paramsId} className={labStyles.section}>
        <div className={labStyles.sectionHeader}>
          <h4 className={labStyles.sectionTitle} id={paramsId}>
            {t('labWbParameters')}
          </h4>
          <div className={labStyles.row}>
            <Tag color="processing">{t('labWbCurrentInputs')}</Tag>
            {edited ? (
              <Tag color="warning">{t('labWbEditedNotRun')}</Tag>
            ) : null}
          </div>
        </div>

        <div
          aria-labelledby={modelId}
          className={labStyles.row}
          role="group"
        >
          <span className={labStyles.fieldLabel} id={modelId}>
            {t('labWbModel')}
          </span>
          <Segmented
            block
            orientation="vertical"
            disabled={startPending}
            onChange={(value) => {
              if (value === 'hodgkin_huxley' || value === 'lif') {
                setModel(value);
              }
            }}
            options={[
              { label: t('labWbModelHH'), value: 'hodgkin_huxley' },
              { label: t('labWbModelLIF'), value: 'lif' },
            ]}
            value={model}
          />
        </div>

        <p className={labStyles.muted}>
          {model === 'hodgkin_huxley'
            ? t('labWbModelNoteHH')
            : t('labWbModelNoteLIF')}
        </p>

        <div className={labStyles.presetRow}>
          <span className={labStyles.fieldLabel}>{t('labWbPresets')}</span>
          {model === 'hodgkin_huxley'
            ? HH_PRESETS.map((preset) => (
                <Button
                  disabled={startPending}
                  key={preset.id}
                  onClick={() => {
                    setParameterError(false);
                    setHhParams(preset.params);
                  }}
                  size="small"
                >
                  {t(preset.labelKey)}
                </Button>
              ))
            : LIF_PRESETS.map((preset) => (
                <Button
                  disabled={startPending}
                  key={preset.id}
                  onClick={() => {
                    setParameterError(false);
                    setLifParams(preset.params);
                  }}
                  size="small"
                >
                  {t(preset.labelKey)}
                </Button>
              ))}
        </div>

        {model === 'hodgkin_huxley' ? (
          <>
            <ParamField
              disabled={startPending}
              id={`${paramsId}-stimulus`}
              label={t('labWbStimulusCurrent')}
              max={HH_BOUNDS.stimulus_current.max}
              min={HH_BOUNDS.stimulus_current.min}
              onChange={(value) => updateHhParam('stimulus_current', value)}
              step={HH_BOUNDS.stimulus_current.step}
              unit={t('labWbUnitMicroAmp')}
              value={hhParams.stimulus_current}
            />
            <ParamField
              disabled={startPending}
              id={`${paramsId}-duration`}
              label={t('labWbDuration')}
              max={HH_BOUNDS.duration_ms.max}
              min={HH_BOUNDS.duration_ms.min}
              onChange={(value) => updateHhParam('duration_ms', value)}
              step={HH_BOUNDS.duration_ms.step}
              unit={t('labWbUnitMs')}
              value={hhParams.duration_ms}
            />
            <ParamField
              disabled={startPending}
              id={`${paramsId}-gna`}
              label={t('labWbGNaScale')}
              max={HH_BOUNDS.g_na_scale.max}
              min={HH_BOUNDS.g_na_scale.min}
              onChange={(value) => updateHhParam('g_na_scale', value)}
              step={HH_BOUNDS.g_na_scale.step}
              unit={t('labWbUnitScale')}
              value={hhParams.g_na_scale}
            />
            <ParamField
              disabled={startPending}
              id={`${paramsId}-gk`}
              label={t('labWbGKScale')}
              max={HH_BOUNDS.g_k_scale.max}
              min={HH_BOUNDS.g_k_scale.min}
              onChange={(value) => updateHhParam('g_k_scale', value)}
              step={HH_BOUNDS.g_k_scale.step}
              unit={t('labWbUnitScale')}
              value={hhParams.g_k_scale}
            />
          </>
        ) : (
          <>
            <ParamField
              disabled={startPending}
              id={`${paramsId}-stimulus`}
              label={t('labWbStimulusCurrent')}
              max={LIF_BOUNDS.stimulus_current.max}
              min={LIF_BOUNDS.stimulus_current.min}
              onChange={(value) => updateLifParam('stimulus_current', value)}
              step={LIF_BOUNDS.stimulus_current.step}
              unit={t('labWbUnitArbitrary')}
              value={lifParams.stimulus_current}
            />
            <ParamField
              disabled={startPending}
              id={`${paramsId}-duration`}
              label={t('labWbDuration')}
              max={LIF_BOUNDS.duration_ms.max}
              min={LIF_BOUNDS.duration_ms.min}
              onChange={(value) => updateLifParam('duration_ms', value)}
              step={LIF_BOUNDS.duration_ms.step}
              unit={t('labWbUnitMs')}
              value={lifParams.duration_ms}
            />
          </>
        )}

        <div className={labStyles.actions}>
          <Button
            disabled={startPending}
            onClick={() => {
              void handleRun();
            }}
            type="primary"
          >
            {startPending
              ? t('labWbRunning')
              : startFailed
                ? t('labWbRetry')
                : t('labWbRun')}
          </Button>
          {startPending || pollActive ? (
            <Button onClick={stopWaiting}>{t('labWbStopWaiting')}</Button>
          ) : null}
          {canRetryStatus ? (
            <Button onClick={retryStatus}>{t('labWbStatusRetry')}</Button>
          ) : null}
        </div>

        <p className={labStyles.muted}>{t('labWbCancelNotice')}</p>

        <div className={labStyles.alertStack}>
          {parameterError ? (
            <Alert
              showIcon
              title={t('labWbParameterRequired')}
              type="warning"
            />
          ) : null}
          {startFailed ? (
            <Alert showIcon title={t('labWbStartError')} type="error" />
          ) : null}
          {cancelled ? (
            <Alert showIcon title={t('labWbCancelled')} type="info" />
          ) : null}
          {pollTimedOut ? (
            <Alert showIcon title={t('labWbPollTimeout')} type="info" />
          ) : null}
          {statusCheckFailed ? (
            <Alert showIcon title={t('labWbStatusError')} type="warning" />
          ) : null}
          {unreadable ? (
            <Alert showIcon title={t('labWbUnreadable')} type="warning" />
          ) : null}
          {runFailed ? (
            <Alert showIcon title={t('labWbRunFailed')} type="error" />
          ) : null}
          {pollActive ? (
            <p className={labStyles.muted} role="status">
              {t('labWbStatusPending')}
            </p>
          ) : null}
          {activeRun !== undefined ? (
            <p className={labStyles.muted}>
              {t('labWbStatus')}: {activeRun.status} · {t('labWbRunId')}:{' '}
              {activeRun.id}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby={resultsId} className={labStyles.section}>
        <div className={labStyles.sectionHeader}>
          <h4 className={labStyles.sectionTitle} id={resultsId}>
            {t('labWbCompletedRuns')}
          </h4>
          {completedRuns.length > 0 ? (
            <Button onClick={clearRuns} size="small">
              {t('labWbClearRuns')}
            </Button>
          ) : null}
        </div>

        {completedRuns.length === 0 ? (
          <EmptyState message={t('labWbNoCompletedRuns')} />
        ) : (
          <>
            <p className={labStyles.muted}>{t('labWbComparisonNote')}</p>

            <div className={labStyles.field}>
              <label className={labStyles.fieldLabel} htmlFor={inspectId}>
                {t('labWbInspectRun')}
              </label>
              <Select
                id={inspectId}
                onChange={(value: string) => setInspectRunId(value)}
                options={completedRuns.map((run, index) => ({
                  value: run.runId,
                  label: `${t('labWbRunLabel', {
                    index: index + 1,
                  })} · ${t(modelShortKey(run.model))}`,
                }))}
                value={inspectedRun?.runId}
              />
            </div>

            <Suspense
              fallback={
                <p className={labStyles.muted} role="status">
                  {t('labWbChartLoading')}
                </p>
              }
            >
              <TraceChart
                inspected={inspectedRun}
                labels={chartLabels}
                runs={chartRuns}
              />
            </Suspense>

            <SummaryTable runs={completedRuns} t={t} />

            <ul className={labStyles.runList}>
              {completedRuns.map((run, index) => (
                <RunCard
                  index={index + 1}
                  key={run.runId}
                  run={run}
                  t={t}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  );
}

/**
 * Interactive neuron workbench.
 *
 * Private state is keyed by the trusted identity and course: changing either
 * remounts the session, discarding comparison runs and drafts. No action runs
 * on mount; only an explicit Run click writes.
 */
export function NeuronWorkbench(props: NeuronWorkbenchProps) {
  const { identityKey } = useRequiredEduFishUIContext();
  return (
    <WorkbenchSession
      key={JSON.stringify([identityKey, props.courseId])}
      {...props}
    />
  );
}
