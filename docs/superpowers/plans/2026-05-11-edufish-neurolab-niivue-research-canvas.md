# EDUFISH NeuroLab NiiVue Research Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-drawn `/lab` brain surface with a NiiVue-driven research canvas that keeps the current teaching cockpit layout, maps existing experiment artifacts into a 3D scene + connectome view, and degrades cleanly when WebGL or scene assets fail.

**Architecture:** Keep `LabView.vue`, the existing experiment API contract, and the current floating-window shell. Add a static scientific scene-config module that defines the standard brain asset URLs, camera preset, region metadata, connectome scaffold, and material-panel blueprints. Extend `buildCanvasModel()` so it emits a deterministic `brain` scene model and focus-aware `materialPanels`/`assistantMedia`. Wrap NiiVue itself in a dedicated Vue component responsible only for canvas lifecycle, local asset loading, connectome bootstrapping, camera reset, and fallback state. Keep the surrounding waveform bed, pipeline anchors, and image-material overlays in `NeuroLabCanvas.vue`, where they stay easy to test with DOM-level unit tests.

**Tech Stack:** Vue 3, Vite, `@niivue/niivue`, scoped CSS, static assets under `frontend/public`, Apache ECharts, `@vue/test-utils`, Vitest.

---

## Scope

This plan implements the approved NiiVue research-canvas slice and nothing broader:

1. Vendor a minimal local NiiVue scene asset pair from the official demo asset set: `mni152.nii.gz` plus `BrainMesh_ICBM152.lh.mz3`.
2. Create a deterministic region/connectome scaffold for the current four teaching regions and map the existing artifact payload into that scaffold.
3. Replace the current SVG brain body in `NeuroLabCanvas.vue` with a dedicated NiiVue scene layer plus DOM overlays for waveforms, pipeline anchors, region labels, and material fragments.
4. Surface one focus-aware image fragment in the AI/instrument window so the new material layer is not trapped only on the canvas edge.
5. Preserve the current `runExperiment(..., { params: workspace.nodeParams })` contract, the existing experiment templates, and the four-window cockpit shell.

Out of scope for this plan:

1. User-uploaded NIfTI/mesh/atlas assets
2. A full medical image workstation or arbitrary NiiVue control panel
3. Real EEG hardware ingestion
4. Atlas-driven mesh picking or editable brain topology
5. Replacing the current experiment API or changing backend schemas

---

## File Structure

### Static Scene Metadata

- Create: `frontend/src/data/neuroLabBrainScene.js`
  - Standard scene asset URLs, camera preset, region blueprints, connectome scaffold, and visual-material blueprints used by both the canvas and the assistant window.

### State / View Models

- Modify: `frontend/src/views/neuroLabPipelineState.js`
  - Add `buildBrainSceneModel()` helpers inside the state layer and extend `buildCanvasModel()` / `buildWorkbenchPanels()` to emit `brain`, `materialPanels`, and `assistantMedia`.
- Modify: `frontend/src/views/neuroLabPipelineState.test.js`
  - Cover the new NiiVue scene model, connectome matrix construction, and assistant-media mapping.

### Local Scientific Assets

- Modify: `frontend/package.json`
  - Add `@niivue/niivue`.
- Modify: `frontend/package-lock.json`
  - Lock the installed NiiVue version.
- Create: `frontend/public/neurolab/niivue/mni152.nii.gz`
  - Official NiiVue demo volume asset, stored locally for stable builds.
- Create: `frontend/public/neurolab/niivue/BrainMesh_ICBM152.lh.mz3`
  - Official NiiVue demo mesh asset, stored locally for stable builds.

### NiiVue Canvas Wrapper

- Create: `frontend/src/components/NeuroLabNiiVueScene.vue`
  - Encapsulate NiiVue lifecycle, connectome loading, camera reset, and graceful fallback.
- Create: `frontend/src/components/NeuroLabNiiVueScene.test.js`
  - Mock `@niivue/niivue` and verify init, connectome wiring, camera reset, and fallback behavior.

### Canvas Composition

- Modify: `frontend/src/components/NeuroLabCanvas.vue`
  - Replace the current SVG brain layer with `NeuroLabNiiVueScene`, keep DOM overlays for region chips, pipeline anchors, waveforms, and material fragments, and expose a local camera reset affordance.
- Modify: `frontend/src/components/NeuroLabCanvas.test.js`
  - Verify NiiVue shell rendering, material overlay rendering, and the existing node/channel/region focus events.

### Instrument Window

- Modify: `frontend/src/components/NeuroLabInstruments.vue`
  - Render a compact focus-aware assistant media tile above the AI explanation stack.
- Modify: `frontend/src/components/NeuroLabInstruments.test.js`
  - Verify the assistant media tile appears alongside charts, metrics, events, and AI text.

### Page Regression

- Modify: `frontend/src/views/LabView.test.js`
  - Keep the page-level regression focused on template loading, run payload integrity, and the presence of the NiiVue-backed canvas shell.

---

## Task 1: Model The Standard Brain Scene In The State Layer

**Files:**
- Create: `frontend/src/data/neuroLabBrainScene.js`
- Modify: `frontend/src/views/neuroLabPipelineState.js`
- Modify: `frontend/src/views/neuroLabPipelineState.test.js`

- [ ] **Step 1: Write the failing state tests for the NiiVue scene model**

Update `frontend/src/views/neuroLabPipelineState.test.js` so the canvas-model test asserts the new `brain`, `materialPanels`, and `assistantMedia` structure:

```js
import { describe, expect, it } from 'vitest';
import {
  buildCanvasModel,
  buildInstrumentModel,
  buildWorkbenchPanels,
  buildWorkspaceFromTemplate,
  patchNodeParams,
  selectedNodeInspector
} from './neuroLabPipelineState';

describe('neuroLabPipelineState', () => {
  it('builds a niivue scene model from experiment artifacts', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    const run = {
      status: 'completed',
      report: {
        content: {
          observations: ['Alpha remains dominant across channels.'],
          next_steps: 'Adjust the source duration and compare frontal response.'
        }
      },
      artifacts: [
        {
          data: {
            signal_preview: [
              [0.12, 0.24, -0.18, 0.08],
              [0.06, 0.1, -0.08, 0.02],
              [0.04, 0.08, -0.05, 0.01],
              [0.02, 0.05, -0.03, 0.0]
            ],
            channel_power: [
              { channel: 'CH1', alpha: 3.6, beta: 2.4 },
              { channel: 'CH2', alpha: 2.8, beta: 1.9 },
              { channel: 'CH3', alpha: 2.1, beta: 1.5 },
              { channel: 'CH4', alpha: 1.8, beta: 1.2 }
            ],
            events: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }],
            pipeline_trace: [
              { node_id: 'source', status: 'completed' },
              { node_id: 'filter', status: 'completed' },
              { node_id: 'psd', status: 'completed' }
            ]
          }
        }
      ]
    };

    const model = buildCanvasModel(workspace, run, {
      channelId: 'ch-2',
      regionId: 'motor-right'
    });

    expect(model.brain.images.map((item) => item.url)).toEqual([
      '/neurolab/niivue/mni152.nii.gz',
      '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3'
    ]);
    expect(model.brain.cameraPreset).toEqual({ azimuth: 126, elevation: 18, scale: 0.94 });
    expect(model.brain.regions.find((region) => region.id === 'motor-right').summary).toContain('Alpha');
    expect(model.brain.connectome.nodes.names).toContain('Prefrontal Cortex');
    expect(model.materialPanels.find((panel) => panel.id === 'network-field').isActive).toBe(true);
  });

  it('builds focus-aware assistant media from the selected region', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    const panels = buildWorkbenchPanels({
      templates: [{ id: 'exp-eeg-replay', title: 'EEG Replay Lab', status: 'published' }],
      selectedExperiment: { id: 'exp-eeg-replay', title: 'EEG Replay Lab', status: 'published' },
      workspace,
      run: null,
      focus: { channelId: 'ch-1', regionId: 'prefrontal' }
    });

    expect(panels.assistantMedia.title).toBe('Frontal Atlas Fragment');
    expect(panels.assistantMedia.image).toBe('/brain-hero.png');
  });
});
```

- [ ] **Step 2: Run the state test and verify it fails for the missing NiiVue fields**

Run:

```bash
cd frontend && npm test -- src/views/neuroLabPipelineState.test.js
```

Expected:

```text
FAIL  src/views/neuroLabPipelineState.test.js
  AssertionError: expected undefined to deeply equal [ '/neurolab/niivue/mni152.nii.gz', ... ]
```

- [ ] **Step 3: Add the static scene-config module and extend the state helpers**

Create `frontend/src/data/neuroLabBrainScene.js`:

```js
export const NEUROLAB_BRAIN_IMAGES = [
  { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
  { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
];

export const NEUROLAB_BRAIN_CAMERA = {
  azimuth: 126,
  elevation: 18,
  scale: 0.94
};

export const NEUROLAB_BRAIN_REGIONS = [
  {
    id: 'prefrontal',
    label: 'Prefrontal Cortex',
    shortLabel: 'PFC',
    channels: [0],
    screen: { x: 29, y: 22 },
    mesh: { x: -14, y: 56, z: 24 }
  },
  {
    id: 'motor-left',
    label: 'Motor Cortex L',
    shortLabel: 'M1-L',
    channels: [1],
    screen: { x: 23, y: 43 },
    mesh: { x: -34, y: 18, z: 34 }
  },
  {
    id: 'motor-right',
    label: 'Motor Cortex R',
    shortLabel: 'M1-R',
    channels: [2],
    screen: { x: 56, y: 40 },
    mesh: { x: 18, y: 20, z: 30 }
  },
  {
    id: 'visual',
    label: 'Visual Cortex',
    shortLabel: 'V1',
    channels: [3],
    screen: { x: 47, y: 66 },
    mesh: { x: -8, y: -26, z: 12 }
  }
];

export const NEUROLAB_CONNECTOME_SCAFFOLD = [
  { id: 'pfc-m1l', source: 'prefrontal', target: 'motor-left', weight: 0.92 },
  { id: 'pfc-m1r', source: 'prefrontal', target: 'motor-right', weight: 0.9 },
  { id: 'm1l-v1', source: 'motor-left', target: 'visual', weight: 0.68 },
  { id: 'm1r-v1', source: 'motor-right', target: 'visual', weight: 0.72 }
];

export const NEUROLAB_MATERIAL_PANELS = [
  {
    id: 'atlas-frontal',
    label: 'Frontal Atlas Fragment',
    image: '/brain-hero.png',
    caption: 'Standard-surface fragment used as a teaching annotation layer.',
    regionIds: ['prefrontal', 'motor-left']
  },
  {
    id: 'network-field',
    label: 'Network Field Sheet',
    image: '/neural-network.jpg',
    caption: 'Connectivity-oriented visual panel for posterior and lateral emphasis.',
    regionIds: ['motor-right', 'visual']
  }
];
```

Patch `frontend/src/views/neuroLabPipelineState.js` with the new imports and helpers:

```js
import {
  NEUROLAB_BRAIN_CAMERA,
  NEUROLAB_BRAIN_IMAGES,
  NEUROLAB_BRAIN_REGIONS,
  NEUROLAB_CONNECTOME_SCAFFOLD,
  NEUROLAB_MATERIAL_PANELS
} from '../data/neuroLabBrainScene';

function regionActivity(region, channels) {
  const related = region.channels.map((index) => channels[index]).filter(Boolean);
  return average(related.map((channel) => channel.alpha + channel.beta));
}

function buildLegacyConnectome(regions) {
  const indexById = Object.fromEntries(regions.map((region, index) => [region.id, index]));
  const size = regions.length;
  const edges = Array(size * size).fill(0);

  for (const edge of NEUROLAB_CONNECTOME_SCAFFOLD) {
    const sourceIndex = indexById[edge.source];
    const targetIndex = indexById[edge.target];
    const strength = Number((((regions[sourceIndex].activity + regions[targetIndex].activity) / 2) * edge.weight).toFixed(2));
    edges[sourceIndex * size + targetIndex] = strength;
    edges[targetIndex * size + sourceIndex] = strength;
  }

  return {
    nodes: {
      names: regions.map((region) => region.label),
      prefilled: regions.map((region) => region.summary),
      X: regions.map((region) => region.mesh.x),
      Y: regions.map((region) => region.mesh.y),
      Z: regions.map((region) => region.mesh.z),
      Color: regions.map((region) => Number(region.activity.toFixed(2))),
      Size: regions.map((region) => Number((1.2 + region.intensity * 2.2).toFixed(2)))
    },
    edges,
    nodeColormap: 'warm',
    nodeColormapNegative: 'winter',
    nodeScale: 1.15,
    edgeColormap: 'warm',
    edgeColormapNegative: 'winter',
    edgeScale: 0.64,
    edgeMin: 0,
    edgeMax: 8
  };
}

function buildMaterialPanels(regionId) {
  return NEUROLAB_MATERIAL_PANELS.map((panel) => ({
    ...panel,
    isActive: panel.regionIds.includes(regionId)
  }));
}

function buildBrainSceneModel(channels, focusRegionId = 'prefrontal') {
  const regions = NEUROLAB_BRAIN_REGIONS.map((region) => {
    const activity = regionActivity(region, channels);
    const alpha = average(region.channels.map((index) => channels[index]?.alpha || 0));
    const beta = average(region.channels.map((index) => channels[index]?.beta || 0));

    return {
      ...region,
      activity,
      intensity: Math.min(1, activity / 8),
      summary: `Alpha ${alpha.toFixed(1)} · Beta ${beta.toFixed(1)}`,
      isActive: region.id === focusRegionId
    };
  });

  return {
    images: NEUROLAB_BRAIN_IMAGES,
    cameraPreset: NEUROLAB_BRAIN_CAMERA,
    regions,
    connectome: buildLegacyConnectome(regions),
    sceneRevision: `${focusRegionId}:${regions.map((region) => region.activity.toFixed(2)).join('|')}`,
    fallbackLabel: 'NiiVue unavailable'
  };
}
```

Return the new fields from `buildCanvasModel()` and `buildWorkbenchPanels()`:

```js
  const brain = buildBrainSceneModel(channels, focus.regionId || 'prefrontal');
  const materialPanels = buildMaterialPanels(focus.regionId || 'prefrontal');

  return {
    brain,
    channels,
    regions,
    pipeline,
    events,
    materialPanels,
    gridColumns: 12,
    gridRows: 8
  };
```

```js
  const assistantMedia = buildMaterialPanels(focusRegion).find((panel) => panel.isActive)
    || buildMaterialPanels(focusRegion)[0];

  return {
    controlStrip: { ... },
    templateItems: ...,
    metrics: ...,
    assistantSections: [...],
    assistantMedia: {
      title: assistantMedia.label,
      image: assistantMedia.image,
      caption: assistantMedia.caption
    }
  };
```

- [ ] **Step 4: Run the state test and verify it passes**

Run:

```bash
cd frontend && npm test -- src/views/neuroLabPipelineState.test.js
```

Expected:

```text
PASS  src/views/neuroLabPipelineState.test.js
  ✓ builds a niivue scene model from experiment artifacts
  ✓ builds focus-aware assistant media from the selected region
```

- [ ] **Step 5: Commit the state-model slice**

```bash
git add frontend/src/data/neuroLabBrainScene.js frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js
git commit -m "feat: model niivue brain scene"
```

## Task 2: Add The NiiVue Wrapper And Vendor Local Scientific Assets

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/public/neurolab/niivue/mni152.nii.gz`
- Create: `frontend/public/neurolab/niivue/BrainMesh_ICBM152.lh.mz3`
- Create: `frontend/src/components/NeuroLabNiiVueScene.vue`
- Create: `frontend/src/components/NeuroLabNiiVueScene.test.js`

- [ ] **Step 1: Write the failing NiiVue wrapper tests**

Create `frontend/src/components/NeuroLabNiiVueScene.test.js`:

```js
// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const attachToCanvas = vi.fn(() => Promise.resolve());
const loadImages = vi.fn(() => Promise.resolve());
const loadConnectome = vi.fn();
const setRenderAzimuthElevation = vi.fn();
const addEventListener = vi.fn();
const cleanup = vi.fn();

vi.mock('@niivue/niivue', () => ({
  Niivue: vi.fn().mockImplementation(() => ({
    attachToCanvas,
    loadImages,
    loadConnectome,
    setRenderAzimuthElevation,
    addEventListener,
    cleanup
  }))
}));

import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

describe('NeuroLabNiiVueScene', () => {
  it('boots niivue with local assets and the generated connectome', async () => {
    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          images: [
            { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
            { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
          ],
          cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
          connectome: { nodes: { names: ['Prefrontal Cortex'], prefilled: ['Alpha 3.6'], X: [0], Y: [0], Z: [0], Color: [3.6], Size: [1.8] }, edges: [0] },
          fallbackLabel: 'NiiVue unavailable',
          sceneRevision: 'prefrontal:3.60'
        },
        cameraResetToken: 0
      }
    });

    await flushPromises();

    expect(attachToCanvas).toHaveBeenCalled();
    expect(loadImages).toHaveBeenCalledWith([
      { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
      { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
    ]);
    expect(loadConnectome).toHaveBeenCalledWith(expect.objectContaining({
      nodes: expect.objectContaining({ names: ['Prefrontal Cortex'] })
    }));
    expect(setRenderAzimuthElevation).toHaveBeenCalledWith(126, 18);
    expect(wrapper.find('[data-testid="niivue-fallback"]').exists()).toBe(false);
  });

  it('shows the fallback layer when niivue init fails', async () => {
    attachToCanvas.mockImplementationOnce(() => Promise.reject(new Error('webgl unavailable')));

    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          images: [],
          cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
          connectome: { nodes: { names: [], prefilled: [], X: [], Y: [], Z: [], Color: [], Size: [] }, edges: [] },
          fallbackLabel: 'NiiVue unavailable',
          sceneRevision: 'fallback'
        },
        cameraResetToken: 0
      }
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="niivue-fallback"]').exists()).toBe(true);
    expect(wrapper.emitted('scene-error')[0][0]).toBe('webgl unavailable');
  });
});
```

- [ ] **Step 2: Run the wrapper test and verify it fails before the component exists**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabNiiVueScene.test.js
```

Expected:

```text
FAIL  src/components/NeuroLabNiiVueScene.test.js
  Error: Failed to resolve import "./NeuroLabNiiVueScene.vue"
```

- [ ] **Step 3: Install NiiVue, vendor the official demo assets locally, and implement the wrapper**

Install the dependency and store the official demo assets locally:

```bash
cd frontend
npm install @niivue/niivue
mkdir -p public/neurolab/niivue
curl -L -o public/neurolab/niivue/mni152.nii.gz https://niivue.github.io/niivue-demo-images/mni152.nii.gz
curl -L -o public/neurolab/niivue/BrainMesh_ICBM152.lh.mz3 https://niivue.github.io/niivue-demo-images/BrainMesh_ICBM152.lh.mz3
```

Create `frontend/src/components/NeuroLabNiiVueScene.vue`:

```vue
<script setup>
import { Niivue } from '@niivue/niivue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  model: {
    type: Object,
    required: true
  },
  cameraResetToken: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['scene-ready', 'scene-error']);

const canvas = ref(null);
const status = ref('booting');
let nv = null;

function applyCameraPreset() {
  if (!nv || !props.model?.cameraPreset) return;
  nv.setRenderAzimuthElevation(props.model.cameraPreset.azimuth, props.model.cameraPreset.elevation);
}

async function mountScene() {
  if (!canvas.value) return;

  status.value = 'booting';

  try {
    nv?.cleanup?.();
    nv = new Niivue({
      backColor: [0, 0, 0, 0],
      show3Dcrosshair: false,
      isOrientCube: false,
      crosshairWidth: 0
    });

    await nextTick();
    await nv.attachToCanvas(canvas.value);
    await nv.loadImages(props.model.images || []);
    nv.loadConnectome(props.model.connectome);
    applyCameraPreset();

    status.value = 'ready';
    emit('scene-ready');
  } catch (error) {
    status.value = 'error';
    emit('scene-error', error?.message || 'niivue init failed');
  }
}

watch(() => props.model.sceneRevision, mountScene);
watch(() => props.cameraResetToken, applyCameraPreset);

onMounted(mountScene);
onBeforeUnmount(() => {
  nv?.cleanup?.();
});
</script>

<template>
  <div class="lab-niivue-scene" :data-state="status">
    <canvas ref="canvas" data-testid="niivue-canvas" />

    <div v-if="status === 'error'" class="lab-niivue-scene__fallback" data-testid="niivue-fallback">
      <img src="/brain-hero.png" alt="" />
      <p>{{ model.fallbackLabel }}</p>
    </div>
  </div>
</template>

<style scoped>
.lab-niivue-scene {
  position: absolute;
  inset: 0;
}

.lab-niivue-scene canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.lab-niivue-scene__fallback {
  position: absolute;
  inset: 10% 12%;
  display: grid;
  place-items: center;
  gap: 14px;
  border: 1px solid rgba(0, 34, 255, 0.18);
  background: rgba(255, 255, 255, 0.84);
}

.lab-niivue-scene__fallback img {
  width: min(320px, 48%);
  opacity: 0.9;
}
</style>
```

- [ ] **Step 4: Run the wrapper and state tests and verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabNiiVueScene.test.js src/views/neuroLabPipelineState.test.js
```

Expected:

```text
PASS  src/components/NeuroLabNiiVueScene.test.js
PASS  src/views/neuroLabPipelineState.test.js
```

- [ ] **Step 5: Commit the wrapper slice**

```bash
git add frontend/package.json frontend/package-lock.json frontend/public/neurolab/niivue/mni152.nii.gz frontend/public/neurolab/niivue/BrainMesh_ICBM152.lh.mz3 frontend/src/components/NeuroLabNiiVueScene.vue frontend/src/components/NeuroLabNiiVueScene.test.js
git commit -m "feat: add niivue scene wrapper"
```

## Task 3: Rebuild The Main Canvas Around The NiiVue Scene

**Files:**
- Modify: `frontend/src/components/NeuroLabCanvas.vue`
- Modify: `frontend/src/components/NeuroLabCanvas.test.js`

- [ ] **Step 1: Write the failing canvas test for the NiiVue shell and material overlays**

Update `frontend/src/components/NeuroLabCanvas.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabNiiVueScene.vue', () => ({
  default: {
    props: ['model', 'cameraResetToken'],
    emits: ['scene-error'],
    template: '<div data-testid="niivue-scene">{{ model.fallbackLabel }}</div>'
  }
}));

import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders the niivue shell, material panels, and existing focus affordances', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        model: {
          brain: {
            images: [
              { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
              { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
            ],
            cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
            connectome: { nodes: { names: ['Prefrontal Cortex'], prefilled: ['Alpha 3.6'], X: [0], Y: [0], Z: [0], Color: [3.6], Size: [1.8] }, edges: [0] },
            regions: [
              { id: 'prefrontal', label: 'Prefrontal Cortex', shortLabel: 'PFC', x: 29, y: 22, summary: 'Alpha 3.6 · Beta 2.4', intensity: 0.7, isActive: false },
              { id: 'motor-right', label: 'Motor Cortex R', shortLabel: 'M1-R', x: 56, y: 40, summary: 'Alpha 2.1 · Beta 1.5', intensity: 0.5, isActive: true }
            ],
            fallbackLabel: 'NiiVue unavailable',
            sceneRevision: 'motor-right:2.10'
          },
          channels: [
            { id: 'ch-1', label: 'CH1', points: '0,50 100,20', alpha: 3.6, beta: 2.4, isActive: true },
            { id: 'ch-2', label: 'CH2', points: '0,40 100,55', alpha: 2.8, beta: 1.8, isActive: false }
          ],
          pipeline: [
            { id: 'source', label: 'Synthetic EEG Source', x: 12, y: 14, status: 'completed', statusLabel: 'Completed', isSelected: false },
            { id: 'filter', label: 'Bandpass Filter', x: 78, y: 18, status: 'running', statusLabel: 'Running', isSelected: true }
          ],
          events: [{ label: 'Stimulus', left: '25.00%', width: '12.50%' }],
          materialPanels: [
            { id: 'atlas-frontal', label: 'Frontal Atlas Fragment', image: '/brain-hero.png', caption: 'Atlas view', isActive: true },
            { id: 'network-field', label: 'Network Field Sheet', image: '/neural-network.jpg', caption: 'Network view', isActive: false }
          ],
          gridColumns: 12,
          gridRows: 8
        }
      }
    });

    expect(wrapper.get('[data-testid="niivue-scene"]').text()).toContain('NiiVue unavailable');
    expect(wrapper.get('[data-testid="material-atlas-frontal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Bandpass Filter');

    await wrapper.get('[data-testid="pipeline-filter"]').trigger('click');
    expect(wrapper.emitted('select-node')[0][0]).toBe('filter');

    await wrapper.get('[data-testid="channel-ch-2"]').trigger('click');
    expect(wrapper.emitted('select-channel')[0][0]).toBe('ch-2');

    await wrapper.get('[data-testid="region-motor-right"]').trigger('click');
    expect(wrapper.emitted('select-region')[0][0]).toBe('motor-right');
  });
});
```

- [ ] **Step 2: Run the canvas test and verify it fails before the template is rebuilt**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabCanvas.test.js
```

Expected:

```text
FAIL  src/components/NeuroLabCanvas.test.js
  Unable to find an element by: [data-testid="niivue-scene"]
```

- [ ] **Step 3: Compose the NiiVue wrapper, wave bed, region chips, and material fragments**

Update `frontend/src/components/NeuroLabCanvas.vue`:

```vue
<script setup>
import { ref } from 'vue';
import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node', 'select-channel', 'select-region']);
const cameraResetToken = ref(0);
const sceneError = ref('');

function resetCamera() {
  cameraResetToken.value += 1;
}

function onSceneError(message) {
  sceneError.value = message;
}

function gridTrack(count) {
  return Array.from({ length: count }, (_, index) => index + 1);
}
</script>

<template>
  <section class="lab-canvas">
    <div class="lab-canvas__grid">
      <span
        v-for="column in gridTrack(model.gridColumns || 12)"
        :key="`col-${column}`"
        class="lab-canvas__grid-column"
        :style="{ left: `${(column / (model.gridColumns || 12)) * 100}%` }"
      />
      <span
        v-for="row in gridTrack(model.gridRows || 8)"
        :key="`row-${row}`"
        class="lab-canvas__grid-row"
        :style="{ top: `${(row / (model.gridRows || 8)) * 100}%` }"
      />
    </div>

    <NeuroLabNiiVueScene
      :model="model.brain"
      :camera-reset-token="cameraResetToken"
      @scene-error="onSceneError"
    />

    <button class="lab-canvas__camera-reset" data-testid="brain-reset" type="button" @click="resetCamera">
      Reset View
    </button>

    <p v-if="sceneError" class="lab-canvas__scene-note">{{ sceneError }}</p>

    <button
      v-for="region in model.brain.regions"
      :key="region.id"
      :data-testid="`region-${region.id}`"
      class="lab-canvas__region"
      :class="{ active: region.isActive }"
      :style="{ left: `${region.screen?.x || region.x}%`, top: `${region.screen?.y || region.y}%` }"
      type="button"
      @click="emit('select-region', region.id)"
    >
      <strong>{{ region.shortLabel || region.label }}</strong>
      <small>{{ region.summary }}</small>
    </button>

    <article
      v-for="panel in model.materialPanels"
      :key="panel.id"
      :data-testid="`material-${panel.id}`"
      class="lab-canvas__material"
      :class="{ active: panel.isActive }"
    >
      <img :src="panel.image" alt="" />
      <div>
        <strong>{{ panel.label }}</strong>
        <small>{{ panel.caption }}</small>
      </div>
    </article>

    <div class="lab-canvas__wave-bed">
      <button
        v-for="channel in model.channels"
        :key="channel.id"
        :data-testid="`channel-${channel.id}`"
        class="lab-canvas__channel"
        :class="{ active: channel.isActive }"
        type="button"
        @click="emit('select-channel', channel.id)"
      >
        <span class="lab-canvas__channel-label">{{ channel.label }}</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline :points="channel.points" />
        </svg>
      </button>

      <span
        v-for="event in model.events"
        :key="`${event.label}-${event.left}`"
        class="lab-canvas__event"
        :style="{ left: event.left, width: event.width }"
      >
        {{ event.label }}
      </span>
    </div>

    <button
      v-for="node in model.pipeline"
      :key="node.id"
      :data-testid="`pipeline-${node.id}`"
      class="lab-canvas__node"
      :class="[node.status, { selected: node.isSelected }]"
      type="button"
      :style="{ left: `${node.x}%`, top: `${node.y}%` }"
      @click="emit('select-node', node.id)"
    >
      <strong>{{ node.label }}</strong>
      <small>{{ node.statusLabel }}</small>
    </button>
  </section>
</template>
```

Add the CSS needed for the new layered composition:

```css
.lab-canvas__camera-reset {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 3;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(0, 34, 255, 0.24);
  background: rgba(255, 255, 255, 0.82);
}

.lab-canvas__region {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 4px;
  min-width: 126px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 34, 255, 0.16);
  background: rgba(255, 255, 255, 0.9);
  text-align: left;
}

.lab-canvas__material {
  position: absolute;
  z-index: 2;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  width: min(280px, 28%);
  padding: 10px;
  border: 1px solid rgba(0, 34, 255, 0.12);
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(10px);
}

.lab-canvas__material:first-of-type {
  top: 16%;
  left: 4%;
}

.lab-canvas__material:last-of-type {
  right: 5%;
  bottom: 30%;
}

.lab-canvas__material img {
  width: 72px;
  height: 72px;
  object-fit: cover;
}
```

- [ ] **Step 4: Run the canvas and wrapper tests and verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabCanvas.test.js src/components/NeuroLabNiiVueScene.test.js
```

Expected:

```text
PASS  src/components/NeuroLabCanvas.test.js
PASS  src/components/NeuroLabNiiVueScene.test.js
```

- [ ] **Step 5: Commit the canvas slice**

```bash
git add frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabCanvas.test.js
git commit -m "feat: compose niivue lab canvas"
```

## Task 4: Surface Focus-Aware Media In The Assistant Window And Close The Regressions

**Files:**
- Modify: `frontend/src/components/NeuroLabInstruments.vue`
- Modify: `frontend/src/components/NeuroLabInstruments.test.js`
- Modify: `frontend/src/views/LabView.test.js`

- [ ] **Step 1: Write the failing regression tests for assistant media and page-level NiiVue presence**

Update `frontend/src/components/NeuroLabInstruments.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabChart.vue', () => ({
  default: {
    props: ['option', 'height'],
    template: '<div data-testid="chart">{{ height }}</div>'
  }
}));

vi.mock('./NeuroLabFloatingWindow.vue', () => ({
  default: {
    props: ['title', 'subtitle', 'dock', 'expanded'],
    emits: ['update:dock', 'update:expanded'],
    template: '<section><header>{{ title }} {{ subtitle }}</header><slot /></section>'
  }
}));

import NeuroLabInstruments from './NeuroLabInstruments.vue';

describe('NeuroLabInstruments', () => {
  it('renders assistant media alongside charts, metrics, and AI sections', () => {
    const wrapper = mount(NeuroLabInstruments, {
      props: {
        model: {
          waveform: { option: { series: [{ data: [0.1, 0.2] }] } },
          spectrum: { option: { series: [{ data: [1.2, 3.6] }] } },
          bands: { option: { series: [{ data: [3.6] }, { data: [2.4] }] } },
          events: { rows: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }] },
          metrics: [
            { id: 'sample-rate', label: '采样率', value: '128 Hz' },
            { id: 'channels', label: '通道数', value: '4' }
          ],
          assistantSections: [
            { id: 'observation', title: '当前观察', body: 'Alpha remains dominant across channels.' }
          ],
          assistantMedia: {
            title: 'Frontal Atlas Fragment',
            image: '/brain-hero.png',
            caption: 'Standard-surface fragment used as a teaching annotation layer.'
          }
        },
        windows: {
          metrics: { dock: 'bottom-left', expanded: false },
          assistant: { dock: 'bottom-right', expanded: true }
        }
      }
    });

    expect(wrapper.text()).toContain('Frontal Atlas Fragment');
    expect(wrapper.find('[data-testid="assistant-media"]').attributes('src')).toBe('/brain-hero.png');
    expect(wrapper.findAll('[data-testid="chart"]')).toHaveLength(3);
  });
});
```

Patch `frontend/src/views/LabView.test.js` to assert the scene shell appears:

```js
vi.mock('../components/NeuroLabNiiVueScene.vue', () => ({
  default: {
    props: ['model', 'cameraResetToken'],
    emits: ['scene-error'],
    template: '<div data-testid="niivue-scene">{{ model.fallbackLabel }}</div>'
  }
}));

// ...

expect(wrapper.find('[data-testid="niivue-scene"]').exists()).toBe(true);
```

- [ ] **Step 2: Run the instrument and page tests and verify they fail before the assistant media exists**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabInstruments.test.js src/views/LabView.test.js
```

Expected:

```text
FAIL  src/components/NeuroLabInstruments.test.js
  Unable to find [data-testid="assistant-media"]
```

- [ ] **Step 3: Render the assistant media tile in the existing AI window**

Update `frontend/src/components/NeuroLabInstruments.vue`:

```vue
<script setup>
import { computed } from 'vue';
import NeuroLabChart from './NeuroLabChart.vue';
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  },
  windows: {
    type: Object,
    default: () => ({
      metrics: { dock: 'bottom-left', expanded: false },
      assistant: { dock: 'bottom-right', expanded: true }
    })
  }
});

const emit = defineEmits(['update-window']);

const metrics = computed(() => props.model?.metrics || []);
const eventRows = computed(() => props.model?.events?.rows || []);
const assistantSections = computed(() => props.model?.assistantSections || []);
const assistantMedia = computed(() => props.model?.assistantMedia || null);

function patchWindow(key, patch) {
  emit('update-window', key, patch);
}
</script>
```

Add the media tile near the top of the assistant stack:

```vue
<div class="lab-instruments__stack">
  <NeuroLabChart :option="model.spectrum?.option" height="140px" />
  <NeuroLabChart :option="model.bands?.option" height="140px" />

  <figure v-if="assistantMedia" class="lab-instruments__media">
    <img :src="assistantMedia.image" :alt="assistantMedia.title" data-testid="assistant-media">
    <figcaption>
      <strong>{{ assistantMedia.title }}</strong>
      <p>{{ assistantMedia.caption }}</p>
    </figcaption>
  </figure>

  <div class="lab-instruments__events">
    <h4>事件标记</h4>
    <!-- existing event content -->
  </div>
</div>
```

Add the media tile styles:

```css
.lab-instruments__media {
  display: grid;
  gap: 10px;
  margin: 0;
}

.lab-instruments__media img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 1px solid var(--border-default);
}

.lab-instruments__media figcaption {
  display: grid;
  gap: 4px;
}

.lab-instruments__media p {
  margin: 0;
  color: var(--text-3);
  line-height: 1.5;
}
```

- [ ] **Step 4: Run the instrument, canvas, and page regressions and verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/NeuroLabInstruments.test.js src/components/NeuroLabCanvas.test.js src/views/LabView.test.js
```

Expected:

```text
PASS  src/components/NeuroLabInstruments.test.js
PASS  src/components/NeuroLabCanvas.test.js
PASS  src/views/LabView.test.js
```

- [ ] **Step 5: Commit the assistant-media regression slice**

```bash
git add frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabInstruments.test.js frontend/src/views/LabView.test.js
git commit -m "feat: link assistant media to brain focus"
```

## Task 5: Full Verification And Browser Validation

**Files:**
- Modify: none
- Test: `frontend/src/views/neuroLabPipelineState.test.js`
- Test: `frontend/src/components/NeuroLabNiiVueScene.test.js`
- Test: `frontend/src/components/NeuroLabCanvas.test.js`
- Test: `frontend/src/components/NeuroLabInstruments.test.js`
- Test: `frontend/src/views/LabView.test.js`

- [ ] **Step 1: Run the complete focused frontend test set**

Run:

```bash
cd frontend && npm test -- src/views/neuroLabPipelineState.test.js src/components/NeuroLabNiiVueScene.test.js src/components/NeuroLabCanvas.test.js src/components/NeuroLabInstruments.test.js src/views/LabView.test.js
```

Expected:

```text
PASS  src/views/neuroLabPipelineState.test.js
PASS  src/components/NeuroLabNiiVueScene.test.js
PASS  src/components/NeuroLabCanvas.test.js
PASS  src/components/NeuroLabInstruments.test.js
PASS  src/views/LabView.test.js
```

- [ ] **Step 2: Run the production build**

Run:

```bash
cd frontend && npm run build
```

Expected:

```text
vite build
✓ built in ...
```

- [ ] **Step 3: Start a local dev server and validate the cockpit in a real browser**

Run:

```bash
cd frontend && npm run dev -- --port 3026
```

Expected:

```text
VITE v...
Local: http://localhost:3026/
```

Manual validation at `http://localhost:3026/lab` using `student1 / student123`:

1. First viewport shows a nonblank 3D brain scene rather than the old SVG outline.
2. Four floating windows remain visible and no vertical scrolling appears on desktop.
3. Clicking a region chip updates the highlighted waveform, the right-side explanation context, and the assistant media tile.
4. `Reset View` restores the oblique research camera.
5. When the NiiVue scene is forced to error in the component test, the fallback poster still leaves the cockpit usable.

- [ ] **Step 4: Commit the verification checkpoint**

```bash
git add frontend/package.json frontend/package-lock.json frontend/public/neurolab/niivue/mni152.nii.gz frontend/public/neurolab/niivue/BrainMesh_ICBM152.lh.mz3 frontend/src/data/neuroLabBrainScene.js frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js frontend/src/components/NeuroLabNiiVueScene.vue frontend/src/components/NeuroLabNiiVueScene.test.js frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabCanvas.test.js frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabInstruments.test.js frontend/src/views/LabView.test.js
git commit -m "test: verify niivue research canvas"
```
