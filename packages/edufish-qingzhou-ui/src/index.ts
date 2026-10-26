/**
 * Public barrel for `@edufish/qingzhou-ui`.
 *
 * Importing this module has no side effects: it initialises no theme, i18n
 * instance, stylesheet or network client.
 */

export * from './contracts.js';

export {
  EduFishUIProvider,
  useEduFishUIContext,
  useRequiredEduFishUIContext,
} from './provider.js';
export type { EduFishUIContextValue } from './provider.js';

export { useEduFishAction } from './actions.js';

export {
  EduFishInspectors,
  EduFishRenders,
  EduFishStreaming,
  EduFishToolResult,
  normalizeEduFishOperation,
  parseEduFishSnapshot,
} from './registry.js';
export type { EduFishSnapshot } from './registry.js';

export { edufishUIResources } from './i18n.js';
export type { EduFishUILocale, EduFishUIResourceBundle } from './i18n.js';

export * from './components/index.js';

export * from './lab/index.js';
export * from './neuroimaging/index.js';
