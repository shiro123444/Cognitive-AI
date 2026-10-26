/**
 * Independent anatomical reference viewer.
 *
 * Importing this module is side-effect free: Niivue is loaded lazily inside
 * the mounted component, so no browser-only code or remote asset is touched on
 * server import.
 */

export { BrainViewer } from './BrainViewer.js';
export type {
  BrainAsset,
  BrainFailure,
  BrainRgba,
  BrainStatus,
  BrainThemeColors,
  BrainThemeInput,
  BrainView,
  BrainVolumeAsset,
  BrainVolumeStatus,
  BrainViewerProps,
} from './types.js';
export {
  assetNameFromUrl,
  brainAssetSignature,
  clampOpacity,
  clampZoom,
  describeError,
  isBrainView,
  nextZoom,
  normalizeBrainAsset,
  normalizeBrainAssets,
  normalizeVolume,
  parseCssColor,
  resolveBrainTheme,
  supportsWebGL2,
  toMeshRgba255,
} from './helpers.js';
export {
  BRAIN_EN_DEFAULTS,
  BRAIN_ZH_DEFAULTS,
  useBrainTranslation,
} from './strings.js';
export type { BrainResourceKey, BrainTranslate } from './strings.js';
