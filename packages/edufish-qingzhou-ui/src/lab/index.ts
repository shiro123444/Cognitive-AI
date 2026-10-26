/**
 * Interactive neuron workbench (lab role).
 *
 * The coordinator exports `./lab/index.js` from the package barrel. This module
 * has no side effects: it initialises no theme, i18n instance or stylesheet.
 */

export { NeuronWorkbench } from './NeuronWorkbench.js';
export type { NeuronWorkbenchProps } from './NeuronWorkbench.js';

export { parseNeuronOutput, parseNeuronRun } from './parser.js';

export type {
  ChartRun,
  HhParams,
  LifParams,
  NeuronAdapter,
  NeuronCurrents,
  NeuronEvent,
  NeuronGating,
  NeuronMetadata,
  NeuronModel,
  NeuronParams,
  ParsedNeuronRun,
  WorkbenchRunMetrics,
} from './types.js';
export { isHodgkinHuxleyRun } from './types.js';

export {
  DEFAULT_HH_TEMPLATE_ID,
  DEFAULT_LIF_TEMPLATE_ID,
  HH_ADAPTER,
  LAB_STATUS_MAX_POLL_MS,
  LAB_STATUS_POLL_INTERVAL_MS,
  LIF_ADAPTER,
  MAX_COMPARISON_RUNS,
  MAX_EVENTS,
  MAX_SPIKES,
  MAX_TRACE_SAMPLES,
  isCompletedStatus,
  isFailedStatus,
  isPendingStatus,
  isTerminalStatus,
} from './constants.js';

export {
  DEFAULT_HH_PARAMS,
  DEFAULT_LIF_PARAMS,
  HH_PRESETS,
  LIF_PRESETS,
  clampToRange,
  computeRunMetrics,
  defaultParamsForModel,
  normalizeHhParams,
  normalizeLifParams,
  normalizeParamsForModel,
  paramsEqual,
  presetsForModel,
  toLabStartParams,
} from './params.js';
export type { WorkbenchPreset } from './params.js';

export {
  FALLBACK_CHART_TOKENS,
  buildCurrentOption,
  buildGatingOption,
  buildVoltageOption,
  readChartTokens,
  seriesColor,
  toChartRun,
} from './chart-options.js';
export type {
  ChartTokens,
  CurrentOptionLabels,
  GateOptionLabels,
  VoltageOptionLabels,
} from './chart-options.js';

export { edufishLabResources, useLabTranslation } from './strings.js';
export type { LabStringKey, LabTranslate } from './strings.js';
