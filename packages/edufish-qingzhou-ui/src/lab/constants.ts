/** Pinned public identifiers and bounded limits for the neuron workbench. */

export const HH_ADAPTER = 'hodgkin_huxley';
export const LIF_ADAPTER = 'neuron_simulator';

export const DEFAULT_HH_TEMPLATE_ID = 'exp-hodgkin-huxley';
export const DEFAULT_LIF_TEMPLATE_ID = 'exp-neuron-spike';

/** Upper bound accepted for every sample-aligned trace array. */
export const MAX_TRACE_SAMPLES = 16_001;
/** Upper bound for a single run's spike list. */
export const MAX_SPIKES = 16_001;
/** Upper bound for a nested numeric list (events are tiny). */
export const MAX_EVENTS = 32;

export const MAX_STRING_LENGTH = 160;
export const MAX_ERROR_MESSAGE_LENGTH = 4_000;

/** Bounded status polling after an explicit run. */
export const LAB_STATUS_POLL_INTERVAL_MS = 1_500;
export const LAB_STATUS_MAX_POLL_MS = 60_000;

/** At most this many completed runs are kept for voltage comparison. */
export const MAX_COMPARISON_RUNS = 3;

export const HH_BOUNDS = Object.freeze({
  stimulus_current: { min: 0, max: 30, step: 0.5 },
  duration_ms: { min: 50, max: 300, step: 10 },
  g_na_scale: { min: 0, max: 1, step: 0.05 },
  g_k_scale: { min: 0, max: 1, step: 0.05 },
} as const);

export const LIF_BOUNDS = Object.freeze({
  stimulus_current: { min: 0.5, max: 20, step: 0.5 },
  duration_ms: { min: 50, max: 500, step: 10 },
} as const);

export function isPendingStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'pending' ||
    normalized === 'queued' ||
    normalized === 'running' ||
    normalized === 'started' ||
    normalized === 'processing'
  );
}

export function isCompletedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'succeeded' ||
    normalized === 'success'
  );
}

export function isFailedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'cancelled' ||
    normalized === 'canceled'
  );
}

export function isTerminalStatus(status: string): boolean {
  return isCompletedStatus(status) || isFailedStatus(status);
}
