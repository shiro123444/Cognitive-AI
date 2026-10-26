import type {
  ExperimentRun,
  LabStartOutput,
} from '@edufish/plugin';

import {
  HH_ADAPTER,
  LIF_ADAPTER,
  MAX_EVENTS,
  MAX_SPIKES,
  MAX_STRING_LENGTH,
  MAX_TRACE_SAMPLES,
} from './constants.js';
import {
  normalizeHhParams,
  normalizeLifParams,
} from './params.js';
import type {
  HhParams,
  LifParams,
  NeuronAdapter,
  NeuronCurrents,
  NeuronEvent,
  NeuronGating,
  NeuronMetadata,
  NeuronModel,
  ParsedNeuronRun,
} from './types.js';

const MAX_ABS_NUMBER = 1_000_000;
const TIME_EPSILON = 1e-6;

const METADATA_CONSTANTS: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  ['c_m', ['c_m', 'C_m', 'capacitance_uf_cm2']],
  ['g_na', ['g_na', 'g_Na', 'g_na_ms_cm2']],
  ['g_k', ['g_k', 'g_K', 'g_k_ms_cm2']],
  ['g_l', ['g_l', 'g_L', 'g_leak_ms_cm2']],
  ['e_na', ['e_na', 'e_Na', 'e_na_mv']],
  ['e_k', ['e_k', 'e_K', 'e_k_mv']],
  ['e_l', ['e_l', 'e_L', 'e_leak_mv']],
  ['g_na_scaled', ['g_na_scaled', 'g_na_scaled_ms_cm2']],
  ['g_k_scaled', ['g_k_scaled', 'g_k_scaled_ms_cm2']],
];

const METADATA_UNIT_KEYS = new Set([
  'voltage',
  'current',
  'time',
  'conductance',
  'capacitance',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABS_NUMBER
  );
}

function readFinite(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return isFiniteNumber(value) && value >= min && value <= max
    ? value
    : undefined;
}

function readInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

function readBoundedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_STRING_LENGTH
    ? trimmed
    : undefined;
}

function frozenNumberArray(
  value: unknown,
  expectedLength: number,
): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    return undefined;
  }
  const out = new Array<number>(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    const entry = value[index];
    if (!isFiniteNumber(entry)) return undefined;
    out[index] = entry;
  }
  return Object.freeze(out);
}

function parseTimeArray(value: unknown): readonly number[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > MAX_TRACE_SAMPLES
  ) {
    return undefined;
  }
  const out = new Array<number>(value.length);
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isFiniteNumber(entry) || entry < 0) return undefined;
    if (index > 0 && entry <= previous) return undefined;
    out[index] = entry;
    previous = entry;
  }
  return Object.freeze(out);
}

function parseSpikeTimes(
  value: unknown,
  time: readonly number[],
  totalSpikes: number,
): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_SPIKES) return undefined;
  if (value.length !== totalSpikes) return undefined;

  const first = time[0];
  const last = time[time.length - 1];
  if (first === undefined || last === undefined) return undefined;

  const out = new Array<number>(value.length);
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isFiniteNumber(entry)) return undefined;
    if (entry < first - TIME_EPSILON || entry > last + TIME_EPSILON) {
      return undefined;
    }
    if (index > 0 && entry < previous) return undefined;
    // Clamp only floating-point noise at the endpoints into the known trace.
    out[index] = Math.min(last, Math.max(first, entry));
    previous = entry;
  }
  return Object.freeze(out);
}

function parseEvents(value: unknown): readonly NeuronEvent[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_EVENTS) return undefined;

  const out: NeuronEvent[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    const label = readBoundedString(entry.label);
    const startMs = readFinite(entry.start_ms, 0, MAX_ABS_NUMBER);
    const endMs = readFinite(entry.end_ms, 0, MAX_ABS_NUMBER);
    if (
      label === undefined ||
      startMs === undefined ||
      endMs === undefined ||
      startMs > endMs
    ) {
      return undefined;
    }
    out.push(Object.freeze({ label, startMs, endMs }));
  }
  return Object.freeze(out);
}

function parseMetadata(value: unknown): NeuronMetadata | undefined {
  if (!isRecord(value)) return undefined;

  const method = readBoundedString(value.method);
  const solver = readBoundedString(value.solver);
  const temperatureC =
    readFinite(value.temperature_c, -50, 100) ??
    readFinite(value.temperature_C, -50, 100) ??
    readFinite(value.temperature_celsius, -50, 100);

  let constants: Readonly<Record<string, number>> | undefined;
  if (isRecord(value.constants)) {
    const entries: Record<string, number> = {};
    for (const [canonical, aliases] of METADATA_CONSTANTS) {
      for (const alias of aliases) {
        const candidate = value.constants[alias];
        if (isFiniteNumber(candidate)) {
          entries[canonical] = candidate;
          break;
        }
      }
    }
    if (Object.keys(entries).length > 0) {
      constants = Object.freeze(entries);
    }
  }

  let units: Readonly<Record<string, string>> | undefined;
  if (isRecord(value.units)) {
    const entries: Record<string, string> = {};
    for (const key of METADATA_UNIT_KEYS) {
      const candidate = readBoundedString(value.units[key]);
      if (candidate !== undefined) entries[key] = candidate;
    }
    if (Object.keys(entries).length > 0) {
      units = Object.freeze(entries);
    }
  }

  if (
    method === undefined &&
    solver === undefined &&
    temperatureC === undefined &&
    constants === undefined &&
    units === undefined
  ) {
    return undefined;
  }

  return Object.freeze({
    ...(method === undefined ? {} : { method }),
    ...(solver === undefined ? {} : { solver }),
    ...(temperatureC === undefined ? {} : { temperatureC }),
    ...(constants === undefined ? {} : { constants }),
    ...(units === undefined ? {} : { units }),
  });
}

function parseCurrents(
  value: unknown,
  sampleCount: number,
): NeuronCurrents | undefined {
  if (!isRecord(value)) return undefined;
  const iNa = frozenNumberArray(value.i_na, sampleCount);
  const iK = frozenNumberArray(value.i_k, sampleCount);
  const iLeak = frozenNumberArray(value.i_leak, sampleCount);
  const iStim = frozenNumberArray(value.i_stim, sampleCount);
  if (
    iNa === undefined ||
    iK === undefined ||
    iLeak === undefined ||
    iStim === undefined
  ) {
    return undefined;
  }
  return Object.freeze({ iNa, iK, iLeak, iStim });
}

function parseGating(
  value: unknown,
  sampleCount: number,
): NeuronGating | undefined {
  if (!isRecord(value)) return undefined;
  const m = frozenNumberArray(value.m, sampleCount);
  const h = frozenNumberArray(value.h, sampleCount);
  const n = frozenNumberArray(value.n, sampleCount);
  if (m === undefined || h === undefined || n === undefined) {
    return undefined;
  }
  return Object.freeze({ m, h, n });
}

function resolveModel(
  adapter: NeuronAdapter,
  value: unknown,
): NeuronModel | undefined {
  if (value === undefined) {
    return adapter === HH_ADAPTER ? 'hodgkin_huxley' : 'lif';
  }
  if (value === 'hodgkin_huxley') {
    return adapter === HH_ADAPTER ? 'hodgkin_huxley' : undefined;
  }
  if (value === 'lif' || value === 'leaky_integrate_fire') {
    return adapter === LIF_ADAPTER ? 'lif' : undefined;
  }
  return undefined;
}

function parseArtifactData(
  adapter: NeuronAdapter,
  data: unknown,
  run: ExperimentRun,
): ParsedNeuronRun | undefined {
  if (!isRecord(data)) return undefined;

  const model = resolveModel(adapter, data.model);
  if (model === undefined) return undefined;

  const membrane = data.membrane_potential;
  if (!isRecord(membrane)) return undefined;

  const timeMs = parseTimeArray(membrane.t_ms);
  if (timeMs === undefined) return undefined;
  const voltageMv = frozenNumberArray(membrane.v_mv, timeMs.length);
  if (voltageMv === undefined) return undefined;

  const totalSpikes = readInteger(data.total_spikes, 0, MAX_SPIKES);
  if (totalSpikes === undefined) return undefined;
  const spikeTimesMs = parseSpikeTimes(
    data.spike_times,
    timeMs,
    totalSpikes,
  );
  if (spikeTimesMs === undefined) return undefined;

  const firingRateHz = readFinite(data.firing_rate, 0, MAX_ABS_NUMBER);
  const durationMs = readFinite(data.duration_ms, 0.001, 600_000);
  const dtMs = readFinite(data.dt_ms, 0.000_001, 100);
  const thresholdMv = readFinite(data.threshold_mv, -500, 500);
  if (
    firingRateHz === undefined ||
    durationMs === undefined ||
    dtMs === undefined ||
    thresholdMv === undefined
  ) {
    return undefined;
  }

  const resetMv = readFinite(data.reset_mv, -500, 500);

  const events = parseEvents(data.events);
  if (events === undefined) return undefined;

  let params: HhParams | LifParams | undefined;
  let currents: NeuronCurrents | undefined;
  let gating: NeuronGating | undefined;

  if (model === 'hodgkin_huxley') {
    params =
      normalizeHhParams(data.params) ??
      normalizeHhParams(run.params);
    if (params === undefined) return undefined;
    currents = parseCurrents(data.currents, timeMs.length);
    gating = parseGating(data.gating, timeMs.length);
    if (currents === undefined || gating === undefined) return undefined;
  } else {
    params =
      normalizeLifParams(data.params) ??
      normalizeLifParams(run.params);
    if (params === undefined) return undefined;
  }

  const metadata = parseMetadata(data.metadata);

  return Object.freeze({
    runId: run.id,
    model,
    adapter,
    status: run.status,
    completedAt: run.completed_at,
    params,
    durationMs,
    dtMs,
    timeMs,
    voltageMv,
    spikeTimesMs,
    totalSpikes,
    firingRateHz,
    thresholdMv,
    ...(resetMv === undefined ? {} : { resetMv }),
    ...(currents === undefined ? {} : { currents }),
    ...(gating === undefined ? {} : { gating }),
    events,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

/**
 * Strictly parse a known neuron artifact from a run.
 *
 * Only `hodgkin_huxley` and `neuron_simulator` adapters are recognised. Every
 * numeric array is bounded, finite, sample-length checked and time-monotonic;
 * spikes must lie on the trace. Unknown adapters, models or malformed fields
 * return `undefined` so the UI can show a generic unavailable state.
 *
 * This is a pure function: it never calls the API.
 */
export function parseNeuronRun(
  run: ExperimentRun,
): ParsedNeuronRun | undefined {
  const adapter = run.adapter;
  if (adapter !== HH_ADAPTER && adapter !== LIF_ADAPTER) {
    return undefined;
  }

  for (const artifact of run.artifacts) {
    const parsed = parseArtifactData(adapter, artifact.data, run);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** Convenience wrapper for an explicit lab.start/lab.status output. */
export function parseNeuronOutput(
  output: LabStartOutput,
): ParsedNeuronRun | undefined {
  return parseNeuronRun(output.run);
}
