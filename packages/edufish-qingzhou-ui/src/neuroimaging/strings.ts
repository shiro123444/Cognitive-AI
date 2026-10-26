import { useTranslation } from 'react-i18next';

/**
 * Default strings for the anatomical viewer. They live in the pinned
 * `edufish` namespace but are never registered globally: the host's resource
 * bundle wins, and the coordinator may merge these defaults.
 */
export const BRAIN_EN_DEFAULTS = {
  brainTitle: 'Brain anatomy reference',
  brainSubtitle:
    'Independent 3D surface and MRI reference built from standard template data.',
  brainTagWebgl: 'WebGL 2',
  brainTagTemplate: 'Standard template',
  brainToolbarLabel: 'Brain viewer controls',
  brainViewLabel: 'View mode',
  brainSurfaceView: 'Surface',
  brainVolumeView: 'MRI slices',
  brainOpacity: 'Surface opacity',
  brainRotateLeft: 'Rotate left',
  brainRotateRight: 'Rotate right',
  brainZoomIn: 'Zoom in',
  brainZoomOut: 'Zoom out',
  brainResetView: 'Reset view',
  brainRetry: 'Retry',
  brainRetryMri: 'Retry MRI',
  brainInitializing: 'Initializing the WebGL viewer…',
  brainVolumeLoading: 'Loading the MRI volume…',
  brainStatusError: 'The 3D viewer is unavailable.',
  brainSurfaceReady:
    'Showing the 3D cortical surface. Drag to rotate, scroll to zoom, or use the controls above. When the canvas is focused, the arrow keys also rotate the surface.',
  brainVolumeReady:
    'Showing the MRI volume in multiplanar view. Use the crosshair and slice controls; the arrow keys work when the canvas is focused.',
  brainNoSurface: 'No surface meshes were supplied.',
  brainChooseMri: 'Select “MRI slices” to load the template volume.',
  brainCanvasLabel: 'Interactive 3D brain anatomy canvas',
  brainCanvasFallback:
    'This interactive anatomical view requires a browser with WebGL 2.',
  brainTextSummary:
    'Anatomical reference only. Surfaces: {{surfaces}}. MRI volume: {{volume}}.',
  brainDisclaimer:
    'Independent anatomical reference generated from standard template data (ICBM152 surface and MNI152 MRI). It is not a patient scan, and it does not show measured, simulated, or model-predicted neural activity.',
  brainWebglUnavailable:
    'WebGL 2 is not available in this browser, so the anatomical viewer cannot start.',
  brainWebglLost:
    'The WebGL context was lost. Retry to rebuild the anatomical viewer.',
  brainInitFailed: 'The anatomical viewer could not start.',
  brainVolumeFailed: 'The MRI volume could not be loaded.',
  brainLoaded: 'loaded',
  brainNotLoaded: 'loaded on demand',
  brainNoSurfaceAssets: 'none supplied',
  brainNoVolumeAsset: 'none supplied',
} as const;

export type BrainResourceKey = keyof typeof BRAIN_EN_DEFAULTS;

export const BRAIN_ZH_DEFAULTS: Record<BrainResourceKey, string> = {
  brainTitle: '脑解剖参考',
  brainSubtitle: '基于标准模板数据构建的独立 3D 表面与 MRI 参考视图。',
  brainTagWebgl: 'WebGL 2',
  brainTagTemplate: '标准模板',
  brainToolbarLabel: '脑视图控制',
  brainViewLabel: '视图模式',
  brainSurfaceView: '表面',
  brainVolumeView: 'MRI 切片',
  brainOpacity: '表面不透明度',
  brainRotateLeft: '向左旋转',
  brainRotateRight: '向右旋转',
  brainZoomIn: '放大',
  brainZoomOut: '缩小',
  brainResetView: '重置视图',
  brainRetry: '重试',
  brainRetryMri: '重试 MRI',
  brainInitializing: '正在初始化 WebGL 视图…',
  brainVolumeLoading: '正在加载 MRI 体数据…',
  brainStatusError: '3D 视图当前不可用。',
  brainSurfaceReady:
    '正在显示 3D 皮层表面。可拖动旋转、滚轮缩放，或使用上方控件；画布获得焦点后也可用方向键旋转。',
  brainVolumeReady:
    '正在以多平面视图显示 MRI 体数据。可使用十字线与切片控件；画布获得焦点后方向键同样有效。',
  brainNoSurface: '未提供表面网格。',
  brainChooseMri: '选择“MRI 切片”以加载模板体数据。',
  brainCanvasLabel: '可交互的 3D 脑解剖画布',
  brainCanvasFallback: '此交互式解剖视图需要支持 WebGL 2 的浏览器。',
  brainTextSummary:
    '仅作解剖参考。表面：{{surfaces}}。MRI 体数据：{{volume}}。',
  brainDisclaimer:
    '此视图是基于标准模板数据（ICBM152 表面与 MNI152 MRI）生成的独立解剖参考，不是患者扫描，也不显示任何实测、仿真或模型预测的神经活动。',
  brainWebglUnavailable:
    '此浏览器不支持 WebGL 2，因此无法启动解剖视图。',
  brainWebglLost: 'WebGL 上下文已丢失。请重试以重建解剖视图。',
  brainInitFailed: '解剖视图未能启动。',
  brainVolumeFailed: 'MRI 体数据加载失败。',
  brainLoaded: '已加载',
  brainNotLoaded: '按需加载',
  brainNoSurfaceAssets: '未提供',
  brainNoVolumeAsset: '未提供',
};

export type BrainTranslate = (
  key: BrainResourceKey,
  options?: Record<string, string | number>,
) => string;

/**
 * Translation helper for the pinned `edufish` namespace. Host resources take
 * precedence; otherwise the English or Chinese default is shown according to
 * the host's resolved language.
 */
export function useBrainTranslation(): BrainTranslate {
  const { i18n, t } = useTranslation('edufish');
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  const language = (i18n.resolvedLanguage ?? i18n.language ?? '').toLowerCase();
  const defaults = language.startsWith('zh')
    ? BRAIN_ZH_DEFAULTS
    : BRAIN_EN_DEFAULTS;

  return (key, options) =>
    translate(key, { defaultValue: defaults[key], ...options });
}
