import type {
  BrainAsset,
  BrainRgba,
  BrainThemeColors,
  BrainThemeInput,
  BrainView,
} from './types.js';

const DEFAULT_SURFACE_OPACITY = 0.85;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.15;

const HEX_COLOR = /^#([0-9a-f]{3,8})$/i;
const RGB_FUNCTION = /^rgba?\((.*)\)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Accepts only host-safe asset shapes. Invalid entries and duplicate URLs are
 * dropped so a malformed preview prop cannot turn into a fetch to nowhere.
 */
export function normalizeBrainAsset(input: unknown): BrainAsset | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const record = input as { name?: unknown; url?: unknown };
  if (typeof record.url !== 'string') return undefined;
  const url = record.url.trim();
  if (url.length === 0) return undefined;
  const suppliedName =
    typeof record.name === 'string' ? record.name.trim() : '';
  return {
    url,
    name: suppliedName.length > 0 ? suppliedName : assetNameFromUrl(url),
  };
}

export function normalizeBrainAssets(input: unknown): BrainAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const assets: BrainAsset[] = [];
  for (const item of input) {
    const asset = normalizeBrainAsset(item);
    if (!asset || seen.has(asset.url)) continue;
    seen.add(asset.url);
    assets.push(asset);
  }
  return assets;
}

export function normalizeVolume(input: unknown): BrainAsset | undefined {
  return normalizeBrainAsset(input);
}

/** Best-effort readable name for an asset whose host name is missing. */
export function assetNameFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1] ?? withoutQuery;
  try {
    return decodeURIComponent(last) || withoutQuery;
  } catch {
    return last || withoutQuery;
  }
}

/**
 * Stable identity for the supplied asset list. It is used as an effect
 * dependency so replacing an array with equal contents does not tear down the
 * WebGL scene.
 */
export function brainAssetSignature(assets: readonly BrainAsset[]): string {
  return assets
    .map((asset) => `${asset.url}\u0000${asset.name}`)
    .join('\u0001');
}

export function isBrainView(value: unknown): value is BrainView {
  return value === 'surface' || value === 'volume';
}

/** Surface opacity used before the user changes the slider. */
export const DEFAULT_BRAIN_SURFACE_OPACITY = DEFAULT_SURFACE_OPACITY;

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SURFACE_OPACITY;
  return clamp(value, 0, 1);
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, MIN_ZOOM, MAX_ZOOM);
}

/** Next zoom level in multiplicative steps, clamped and rounded for display. */
export function nextZoom(
  current: number,
  direction: 'in' | 'out',
): number {
  const base = clampZoom(current);
  const next = direction === 'in' ? base * ZOOM_STEP : base / ZOOM_STEP;
  return Math.round(clampZoom(next) * 1000) / 1000;
}

function parseChannel(token: string, max: number): number | undefined {
  const trimmed = token.trim();
  if (trimmed.length === 0) return undefined;
  const isPercent = trimmed.endsWith('%');
  const numeric = Number.parseFloat(
    isPercent ? trimmed.slice(0, -1) : trimmed,
  );
  if (!Number.isFinite(numeric)) return undefined;
  return clamp(isPercent ? (numeric / 100) * max : numeric, 0, max);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const trimmed = token.trim();
  if (trimmed.length === 0) return 1;
  const isPercent = trimmed.endsWith('%');
  const numeric = Number.parseFloat(
    isPercent ? trimmed.slice(0, -1) : trimmed,
  );
  if (!Number.isFinite(numeric)) return 1;
  if (isPercent) return clamp(numeric / 100, 0, 1);
  // Both `rgba(..., 0.5)` and modern `rgb(... / 50%)` reach this branch.
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

/**
 * Parse the CSS color strings returned by Ant Design tokens (hex, rgb, rgba,
 * space-separated rgb and percentage channels) into an 8-bit RGBA tuple.
 */
export function parseCssColor(value: unknown): BrainRgba | undefined {
  if (typeof value !== 'string') return undefined;
  const input = value.trim();
  if (input.length === 0) return undefined;

  const hex = HEX_COLOR.exec(input);
  if (hex) {
    let digits = hex[1] ?? '';
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((digit) => `${digit}${digit}`)
        .join('');
    }
    if (digits.length !== 6 && digits.length !== 8) return undefined;
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(digits.slice(offset, offset + 2), 16),
    );
    const alpha =
      digits.length === 8
        ? Number.parseInt(digits.slice(6, 8), 16) / 255
        : 1;
    return [channels[0], channels[1], channels[2], clamp(alpha, 0, 1)];
  }

  const rgb = RGB_FUNCTION.exec(input);
  if (!rgb) return undefined;
  const body = rgb[1] ?? '';
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return undefined;
  const red = parseChannel(parts[0] ?? '', 255);
  const green = parseChannel(parts[1] ?? '', 255);
  const blue = parseChannel(parts[2] ?? '', 255);
  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }
  return [red, green, blue, parseAlpha(parts[3])];
}

function toUnitColor(
  color: BrainRgba,
  alphaOverride?: number,
): BrainRgba {
  return [
    clamp(color[0] / 255, 0, 1),
    clamp(color[1] / 255, 0, 1),
    clamp(color[2] / 255, 0, 1),
    clamp(alphaOverride ?? color[3], 0, 1),
  ];
}

/**
 * Composite a translucent token color over the host background. Ant Design
 * neutral text tokens are often `rgba(0,0,0,0.65)` style colors; without
 * compositing, forcing them opaque would collapse both hemisphere colors into
 * the same flat tone. Compositing keeps the host's intended neutral shade
 * order (secondary lighter/darker than tertiary) in both light and dark mode.
 */
function compositeOver(color: BrainRgba, background: BrainRgba): BrainRgba {
  const alpha = clamp(color[3], 0, 1);
  const backgroundAlpha = clamp(background[3], 0, 1);
  const outAlpha = alpha + backgroundAlpha * (1 - alpha);
  if (outAlpha <= 0) return [0, 0, 0, 1];
  const blend = (foreground: number, back: number): number =>
    (foreground * alpha + back * backgroundAlpha * (1 - alpha)) /
    outAlpha;
  return [
    blend(color[0], background[0]),
    blend(color[1], background[1]),
    blend(color[2], background[2]),
    1,
  ];
}

/**
 * Resolve host token colors into the numeric palette Niivue needs. No brand
 * palette is introduced: every value originates in the host theme, with a
 * neutral black/white fallback only if a token is not a parseable CSS color.
 */
export function resolveBrainTheme(input: BrainThemeInput): BrainThemeColors {
  const background = parseCssColor(input.background) ?? [0, 0, 0, 1];
  const text = parseCssColor(input.text) ?? [255, 255, 255, 1];
  const primary = parseCssColor(input.primary) ?? [200, 200, 200, 1];
  const meshPrimary = parseCssColor(input.meshPrimary) ?? [200, 200, 200, 1];
  const meshSecondary =
    parseCssColor(input.meshSecondary) ?? [160, 160, 160, 1];

  return {
    // The canvas is opaque; draw the host container color at full alpha.
    background: toUnitColor(background, 1),
    // Orientation labels and crosshairs inherit host text/accent colors.
    font: toUnitColor(text, 1),
    crosshair: toUnitColor(primary, 1),
    meshes: [
      toUnitColor(compositeOver(meshPrimary, background), 1),
      toUnitColor(compositeOver(meshSecondary, background), 1),
    ],
  };
}

/** RGBA bytes for `NVMesh.rgba255`; surface opacity is handled separately. */
export function toMeshRgba255(color: BrainRgba): Uint8Array {
  return new Uint8Array([
    Math.round(clamp(color[0], 0, 1) * 255),
    Math.round(clamp(color[1], 0, 1) * 255),
    Math.round(clamp(color[2], 0, 1) * 255),
    255,
  ]);
}

/**
 * A short, human-readable technical detail for a failed async load. Returns
 * `undefined` rather than inventing a cause.
 */
export function describeError(cause: unknown): string | undefined {
  if (cause instanceof Error) {
    const message = cause.message.trim();
    return message.length > 0 ? message : undefined;
  }
  if (typeof cause === 'string') {
    const message = cause.trim();
    return message.length > 0 ? message : undefined;
  }
  return undefined;
}

/**
 * Probe for WebGL 2 on a throwaway canvas. The probe context is explicitly
 * released so it cannot exhaust the browser's limited context pool.
 */
export function supportsWebGL2(doc?: Document): boolean {
  const target =
    doc ?? (typeof document === 'undefined' ? undefined : document);
  if (!target) return false;
  try {
    const canvas = target.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
