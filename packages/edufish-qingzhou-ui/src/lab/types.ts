/**
 * Public types for the interactive neuron workbench.
 *
 * Every trace below is a whitelist projection of a known adapter artifact. No
 * arbitrary artifact JSON, report content or local path is represented here.
 */

export type NeuronModel = 'hodgkin_huxley' | 'lif';
export type NeuronAdapter = 'hodgkin_huxley' | 'neuron_simulator';

export interface HhParams {
  readonly stimulus_current: number;
  readonly duration_ms: number;
  readonly g_na_scale: number;
  readonly g_k_scale: number;
}

export interface LifParams {
  readonly stimulus_current: number;
  readonly duration_ms: number;
}

export type NeuronParams = HhParams | LifParams;

export interface NeuronCurrents {
  readonly iNa: readonly number[];
  readonly iK: readonly number[];
  readonly iLeak: readonly number[];
  readonly iStim: readonly number[];
}

export interface NeuronGating {
  readonly m: readonly number[];
  readonly h: readonly number[];
  readonly n: readonly number[];
}

export interface NeuronEvent {
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface NeuronMetadata {
  readonly method?: string;
  readonly solver?: string;
  readonly temperatureC?: number;
  readonly constants?: Readonly<Record<string, number>>;
  readonly units?: Readonly<Record<string, string>>;
}

/** Bounded, read-only projection of one completed neuron run. */
export interface ParsedNeuronRun {
  readonly runId: string;
  readonly model: NeuronModel;
  readonly adapter: NeuronAdapter;
  readonly status: string;
  readonly completedAt: string | null;
  readonly params: NeuronParams;
  readonly durationMs: number;
  readonly dtMs: number;
  readonly timeMs: readonly number[];
  readonly voltageMv: readonly number[];
  readonly spikeTimesMs: readonly number[];
  readonly totalSpikes: number;
  readonly firingRateHz: number;
  readonly thresholdMv: number;
  readonly resetMv?: number;
  readonly currents?: NeuronCurrents;
  readonly gating?: NeuronGating;
  readonly events: readonly NeuronEvent[];
  readonly metadata?: NeuronMetadata;
}

/** A completed run rendered as one voltage-overlay series. */
export interface ChartRun {
  readonly runId: string;
  readonly label: string;
  readonly model: NeuronModel;
  readonly timeMs: readonly number[];
  readonly voltageMv: readonly number[];
  readonly spikeTimesMs: readonly number[];
  readonly thresholdMv: number;
}

export interface WorkbenchRunMetrics {
  readonly totalSpikes: number;
  readonly firingRateHz: number;
  readonly maxPotentialMv: number;
  readonly meanPotentialMv: number;
  readonly thresholdMv: number;
  readonly dtMs: number;
  readonly durationMs: number;
  readonly sampleCount: number;
}

export function isHodgkinHuxleyRun(
  run: ParsedNeuronRun,
): run is ParsedNeuronRun & {
  readonly model: 'hodgkin_huxley';
  readonly params: HhParams;
  readonly currents: NeuronCurrents;
  readonly gating: NeuronGating;
} {
  return (
    run.model === 'hodgkin_huxley' &&
    run.params !== undefined &&
    run.currents !== undefined &&
    run.gating !== undefined
  );
}
