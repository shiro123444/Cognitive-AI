import { HH_BOUNDS, LIF_BOUNDS } from './constants.js';
import type {
  HhParams,
  LifParams,
  NeuronModel,
  NeuronParams,
  ParsedNeuronRun,
  WorkbenchRunMetrics,
} from './types.js';

export const DEFAULT_HH_PARAMS: HhParams = Object.freeze({
  stimulus_current: 10,
  duration_ms: 120,
  g_na_scale: 1,
  g_k_scale: 1,
});

export const DEFAULT_LIF_PARAMS: LifParams = Object.freeze({
  stimulus_current: 8,
  duration_ms: 120,
});

type PresetKey =
  | 'labWbPresetBaseline'
  | 'labWbPresetSubthreshold'
  | 'labWbPresetSodiumBlock'
  | 'labWbPresetStrongDrive';

export interface WorkbenchPreset<P extends NeuronParams> {
  readonly id: string;
  readonly labelKey: PresetKey;
  readonly params: P;
}

export const HH_PRESETS: readonly WorkbenchPreset<HhParams>[] = Object.freeze([
  {
    id: 'baseline',
    labelKey: 'labWbPresetBaseline',
    params: Object.freeze({
      stimulus_current: 10,
      duration_ms: 120,
      g_na_scale: 1,
      g_k_scale: 1,
    }),
  },
  {
    id: 'subthreshold',
    labelKey: 'labWbPresetSubthreshold',
    params: Object.freeze({
      stimulus_current: 3,
      duration_ms: 120,
      g_na_scale: 1,
      g_k_scale: 1,
    }),
  },
  {
    id: 'sodium-block',
    labelKey: 'labWbPresetSodiumBlock',
    params: Object.freeze({
      stimulus_current: 10,
      duration_ms: 120,
      g_na_scale: 0.1,
      g_k_scale: 1,
    }),
  },
]);

export const LIF_PRESETS: readonly WorkbenchPreset<LifParams>[] = Object.freeze([
  {
    id: 'baseline',
    labelKey: 'labWbPresetBaseline',
    params: Object.freeze({
      stimulus_current: 8,
      duration_ms: 120,
    }),
  },
  {
    id: 'subthreshold',
    labelKey: 'labWbPresetSubthreshold',
    params: Object.freeze({
      stimulus_current: 2.5,
      duration_ms: 120,
    }),
  },
  {
    id: 'strong-drive',
    labelKey: 'labWbPresetStrongDrive',
    params: Object.freeze({
      stimulus_current: 14,
      duration_ms: 120,
    }),
  },
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function finiteInRange(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

function integerInRange(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

/**
 * Normalise flat or nested HH parameters. Bounds mirror the pinned adapter
 * contract; anything else is rejected rather than coerced.
 */
export function normalizeHhParams(value: unknown): HhParams | undefined {
  if (!isRecord(value)) return undefined;
  if ('stimulus' in value && !isRecord(value.stimulus)) return undefined;
  if ('channels' in value && !isRecord(value.channels)) return undefined;
  const stimulus = isRecord(value.stimulus) ? value.stimulus : value;
  const channels = isRecord(value.channels) ? value.channels : value;

  const stimulusCurrent = finiteInRange(
    stimulus.stimulus_current,
    HH_BOUNDS.stimulus_current.min,
    HH_BOUNDS.stimulus_current.max,
  );
  const durationMs = integerInRange(
    stimulus.duration_ms,
    HH_BOUNDS.duration_ms.min,
    HH_BOUNDS.duration_ms.max,
  );
  const gNaScale = finiteInRange(
    channels.g_na_scale,
    HH_BOUNDS.g_na_scale.min,
    HH_BOUNDS.g_na_scale.max,
  );
  const gKScale = finiteInRange(
    channels.g_k_scale,
    HH_BOUNDS.g_k_scale.min,
    HH_BOUNDS.g_k_scale.max,
  );

  if (
    stimulusCurrent === undefined ||
    durationMs === undefined ||
    gNaScale === undefined ||
    gKScale === undefined
  ) {
    return undefined;
  }

  return Object.freeze({
    stimulus_current: stimulusCurrent,
    duration_ms: durationMs,
    g_na_scale: gNaScale,
    g_k_scale: gKScale,
  });
}

/** Normalise flat or nested LIF parameters using the existing adapter bounds. */
export function normalizeLifParams(value: unknown): LifParams | undefined {
  if (!isRecord(value)) return undefined;
  if ('stimulus' in value && !isRecord(value.stimulus)) return undefined;
  const stimulus = isRecord(value.stimulus) ? value.stimulus : value;

  const stimulusCurrent = finiteInRange(
    stimulus.stimulus_current,
    LIF_BOUNDS.stimulus_current.min,
    LIF_BOUNDS.stimulus_current.max,
  );
  const durationMs = integerInRange(
    stimulus.duration_ms,
    LIF_BOUNDS.duration_ms.min,
    LIF_BOUNDS.duration_ms.max,
  );

  if (stimulusCurrent === undefined || durationMs === undefined) {
    return undefined;
  }

  return Object.freeze({
    stimulus_current: stimulusCurrent,
    duration_ms: durationMs,
  });
}

export function normalizeParamsForModel(
  model: NeuronModel,
  value: unknown,
): NeuronParams | undefined {
  return model === 'hodgkin_huxley'
    ? normalizeHhParams(value)
    : normalizeLifParams(value);
}

export function defaultParamsForModel(model: NeuronModel): NeuronParams {
  return model === 'hodgkin_huxley'
    ? DEFAULT_HH_PARAMS
    : DEFAULT_LIF_PARAMS;
}

export function presetsForModel(model: NeuronModel): readonly WorkbenchPreset<NeuronParams>[] {
  return model === 'hodgkin_huxley' ? HH_PRESETS : LIF_PRESETS;
}

export function paramsEqual(
  model: NeuronModel,
  left: NeuronParams,
  right: NeuronParams,
): boolean {
  if (model === 'hodgkin_huxley') {
    const a = left as HhParams;
    const b = right as HhParams;
    return (
      a.stimulus_current === b.stimulus_current &&
      a.duration_ms === b.duration_ms &&
      a.g_na_scale === b.g_na_scale &&
      a.g_k_scale === b.g_k_scale
    );
  }
  const a = left as LifParams;
  const b = right as LifParams;
  return (
    a.stimulus_current === b.stimulus_current &&
    a.duration_ms === b.duration_ms
  );
}

/**
 * Convert editor parameters into the flat object accepted by the pinned
 * adapters. `undefined` means the value is outside the contract bounds.
 */
export function toLabStartParams(
  model: NeuronModel,
  params: NeuronParams,
): Record<string, unknown> | undefined {
  const normalized = normalizeParamsForModel(model, params);
  if (normalized === undefined) return undefined;
  return { ...normalized };
}

export function clampToRange(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value));
}

/** Metrics derived only from the parsed trace itself. */
export function computeRunMetrics(run: ParsedNeuronRun): WorkbenchRunMetrics {
  let maxPotential = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const value of run.voltageMv) {
    if (value > maxPotential) maxPotential = value;
    sum += value;
  }
  const sampleCount = run.voltageMv.length;
  return {
    totalSpikes: run.totalSpikes,
    firingRateHz: run.firingRateHz,
    maxPotentialMv: sampleCount > 0 ? maxPotential : 0,
    meanPotentialMv: sampleCount > 0 ? sum / sampleCount : 0,
    thresholdMv: run.thresholdMv,
    dtMs: run.dtMs,
    durationMs: run.durationMs,
    sampleCount,
  };
}
