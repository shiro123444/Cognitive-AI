# Neuroimaging: independent anatomical reference viewer

`BrainViewer` renders a standard-template cortical surface and, on explicit
request, the standard MNI152 template MRI. It is deliberately independent of
the electrophysiology lab: it shows **no** measured, simulated, or
model-predicted activity, and it is **not** a patient scan.

Implementation lives in `packages/edufish-qingzhou-ui/src/neuroimaging/`.
The coordinator owns the package barrel export (`./neuroimaging/index.js`);
the preview supplies asset URLs.

## Public API

```ts
interface BrainAsset {
  url: string;
  name: string;
}

interface BrainViewerProps {
  meshes?: Array<{ url: string; name: string }>;
  volume?: { url: string; name: string };
  className?: string;
}

function BrainViewer(props: BrainViewerProps): JSX.Element;
```

Also exported: pure helpers (`normalizeBrainAssets`, `normalizeVolume`,
`parseCssColor`, `resolveBrainTheme`, `toMeshRgba255`, `nextZoom`,
`clampOpacity`, `supportsWebGL2`, `describeError`), the `BrainViewerProps` and
related types, and the English/Chinese default string bundles
(`BRAIN_EN_DEFAULTS`, `BRAIN_ZH_DEFAULTS`, `useBrainTranslation`).

The host owns every URL. No remote asset is hardcoded, and importing the
module performs no fetch and does not load Niivue.

## Behavior

- **Lazy renderer.** `@niivue/niivue` 0.68.2 is loaded with a dynamic
  `import()` inside the mount effect, after a WebGL 2 probe. Niivue is imported
  type-only at module scope, so it is erased from the emitted JavaScript.
- **Surface view on mount.** Supplied meshes are fetched once with
  `Niivue.loadMeshes`. Surface mode uses `sliceTypeRender`; drag rotates and
  wheel zooms through Niivue's standard interactions.
- **MRI is opt-in.** The volume URL is not requested until the user selects
  **MRI slices**. The first successful load uses `Niivue.loadVolumes` with a
  gray colormap and switches to `sliceTypeMultiplanar`. Later toggles reuse the
  already loaded volume.
- **View isolation.** Surface mode re-enables meshes at the selected opacity
  and sets volume opacity to zero. MRI mode hides meshes and restores volume
  opacity. No blended overlay suggests that a simulation maps onto anatomy.
- **Camera and zoom.** Toolbar buttons rotate ±15°, zoom in/out in multiplicative
  steps, and reset azimuth/elevation, 3D scale, 2D pan and crosshair position.
  The reset is explicit and does not reload assets.
- **Opacity.** The slider controls surface-mesh opacity only (0–100%, default
  85%). It is disabled in MRI mode.
- **Theme inheritance.** Canvas background, orientation-label color, crosshair
  color and neutral surface colors are derived from the host Ant Design tokens
  (`colorBgContainer`, `colorText`, `colorPrimary`, `colorTextSecondary`,
  `colorTextTertiary`). Translucent neutral tokens are composited over the
  container color so both hemispheres keep distinct, theme-correct shades in
  light and dark mode. Token changes recolor the existing scene without
  recreating it. If a token cannot be parsed, neutral black/white fallbacks are
  used; no local brand palette is introduced.
- **Responsive canvas.** The viewport has a meaningful responsive height
  (`clamp(320px, 55vh, 560px)`) and Niivue's resize observer keeps the drawing
  buffer in sync.
- **Accessibility.** Toolbar controls are native, keyboard-operable Ant Design
  buttons and segmented control. The canvas is focusable through Niivue and
  supports its arrow-key navigation; the toolbar duplicates rotate, zoom and
  reset so those actions never require a pointer. A live `role="status"` line
  reports initialization, load and failure state, and a textual summary below
  the canvas names the active assets and repeats the independent-reference
  disclaimer.
- **Failure handling.** WebGL 2 absence, meshes failing to load, context loss,
  and MRI failure all produce a visible error with a retry action. A failed or
  empty viewer is never presented as a successful brain image.
- **Lifecycle.** StrictMode and unmount cleanup call `Niivue.cleanup()`, remove
  context-loss listeners and the inline parent background, and invalidate an
  epoch counter. Async import, mesh and volume paths check both the epoch and
  the current instance before touching React state, so a stale instance cannot
  update the UI.
- **Asset changes.** Replacing the mesh or volume URL signature tears down and
  rebuilds the viewer, resetting to surface view. The MRI volume is still not
  fetched until explicitly requested.

## Supplied assets in this repository

The preview supplies the files already present under
`frontend/public/neurolab/niivue/` and
`examples/qingzhou-ui-preview/public/neurolab/niivue/`:

- `BrainMesh_ICBM152.lh.mz3`
- `BrainMesh_ICBM152.rh.mz3`
- `mni152.nii.gz`

Exact underlying atlas attribution for these files is verified by the
coordinator. The viewer makes no claim beyond "standard template anatomical
reference".

## Niivue 0.68.2 APIs used

Checked against the installed package types/source, not assumed from another
version:

- lazy `import('@niivue/niivue')`; `new Niivue(Partial<NVConfigOptions>)`
- `attachToCanvas`, `cleanup`, `drawScene`, `updateGLVolume` (via setters)
- `loadMeshes(LoadFromUrlParams[])`, `loadVolumes(ImageFromUrlOptions[])`
- `setSliceType`, `setOpacity`, `setRenderAzimuthElevation`, `setPan2Dxyzmm`
- `opts.backColor`, `opts.crosshairColor`, `opts.fontColor`
- `meshes`, `volumes`, `scene.renderAzimuth`, `scene.renderElevation`,
  `scene.volScaleMultiplier`, `scene.pan2Dxyzmm`, `scene.crosshairPos`
- `NVMesh.rgba255`, `NVMesh.opacity`, `NVMesh.visible`,
  `NVMesh.setProperty('rgba255', …, gl)`

## Tests

`test/brain-viewer-helpers.test.tsx` covers the pure, browser-independent
surface:

- asset normalization, URL-derived names, deduplication and signatures
- CSS token color parsing (hex/rgb/rgba/percentages) and theme resolution
- opacity/zoom clamping and error-detail extraction
- English/Chinese default-key parity and disclaimer wording

`test/brain-viewer-mount.test.tsx` mounts the component in jsdom, where WebGL 2
does not exist, and asserts that the missing capability produces a visible
retryable error, that no asset (including the MRI volume) is fetched, and that
the "not a patient scan" textual equivalent is present. This is a graceful
failure check, not a renderer test.

Real rendering must be checked in a browser with actual WebGL 2 and the real
Niivue library (the coordinator's browser acceptance pass); no mocked canvas is
treated as proof of a working renderer.

## Licensing and attribution

- **NiiVue** (`@niivue/niivue` 0.68.2) is distributed under the **BSD-2-Clause**
  license. This component imports it as a normal dependency and does not vendor
  or modify its source. See the package's `LICENSE` in `node_modules`.
- The surface and volume files above are part of this repository's existing
  preview assets. Their upstream atlas provenance and required citation text
  must be confirmed and documented by the coordinator before public release.

## Integration notes for the coordinator

1. Add `export * from './neuroimaging/index.js';` to the package barrel.
2. Keep `@niivue/niivue` 0.68.2 at runtime; it is already listed in the package
   dependencies.
3. Mount below the host's Ant Design `ConfigProvider`/theme so token colors and
   dark mode are inherited.
4. In browser acceptance, verify: real WebGL canvas, both hemispheres, drag
   rotation and wheel zoom, reset, surface/MRI toggle, no MRI network request
   before the explicit toggle, MRI slices after it, opacity, light/dark token
   changes, context-loss/retry behavior (DevTools can force context loss), and
   no console errors on mount/unmount/StrictMode.
5. If translations are merged into the host bundle, the keys are exactly those
   in `BRAIN_EN_DEFAULTS` / `BRAIN_ZH_DEFAULTS` in the `edufish` namespace.
