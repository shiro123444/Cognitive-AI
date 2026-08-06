# EDUFISH NeuroLab Teaching Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/lab` into a single-screen teaching cockpit with a panoramic experiment canvas, asymmetric floating windows, and richer signal-first feedback while preserving the existing experiment APIs and pipeline data model.

**Architecture:** Keep the Flask experiment lifecycle, template/run/report schema, and the existing `neuroLabPipelineState.js` helper as the source of truth. Move all redesign work into the Vue presentation layer: derive cockpit-specific canvas/panel view models from the current experiment artifacts, render the main experiment field with SVG/CSS instead of card grids, and wrap all secondary controls inside a reusable floating-window primitive with constrained docking.

**Tech Stack:** Vue 3, Vite, existing NeuroLab state helpers, scoped component CSS, SVG, Apache ECharts, `@vue/test-utils`, Vitest.

---

## Scope

This plan implements the approved teaching-workbench redesign and nothing broader:

1. Replace the current page-style `/lab` layout with a single-screen cockpit.
2. Replace the straight-line flow panel with a layered canvas: grid, multi-channel waveform bed, abstract brain topology, and embedded pipeline path.
3. Replace the left list / right inspector / bottom tabs with four asymmetric floating experiment windows.
4. Preserve the current backend APIs, template schema, run schema, and `runExperiment(..., { params: workspace.nodeParams })` contract.
5. Keep the existing Klein blue + black/white/gray token system and avoid touching the shared global style files unless a regression makes that unavoidable.

Out of scope for this plan:

1. New backend experiment adapters
2. Real EEG hardware streaming
3. New experiment template types
4. A full drag-anywhere window manager
5. Global theme/token changes

## File Structure

### State / View Models

- Modify: `frontend/src/views/neuroLabPipelineState.js`
  - Keep the current pipeline schema and artifact mapping, but add cockpit-specific view-model builders for the layered canvas, top-strip metrics, template selector rows, and AI/metrics floating windows.
- Modify: `frontend/src/views/neuroLabPipelineState.test.js`
  - Extend the state tests to cover the new canvas and panel view models.

### Shared UI Primitive

- Create: `frontend/src/components/NeuroLabFloatingWindow.vue`
  - Reusable thin floating shell with docking, expand/collapse, header controls, and pointer-based dock reassignment.
- Create: `frontend/src/components/NeuroLabFloatingWindow.test.js`
  - Verify expand toggle and dock-change events.

### Main Visual Surface

- Modify: `frontend/src/components/NeuroLabCanvas.vue`
  - Replace the current Vue Flow surface with the layered SVG/CSS cockpit canvas and emit node/channel/region focus events.
- Modify: `frontend/src/components/NeuroLabCanvas.test.js`
  - Verify node/channel/region affordances render and emit selection events.

### Floating Windows

- Modify: `frontend/src/components/NeuroLabInspector.vue`
  - Wrap node editing in the floating-window shell and present parameters as a compact instrument panel.
- Modify: `frontend/src/components/NeuroLabInstruments.vue`
  - Replace the tabbed block with two floating windows: metrics/waveform and analysis/AI assistant.
- Modify: `frontend/src/components/NeuroLabInstruments.test.js`
  - Verify metrics, events, and AI sections render simultaneously without tab switching.

### Page Orchestration

- Modify: `frontend/src/views/LabView.vue`
  - Recompose the page into a thin control strip, the panoramic canvas, one template-selector window, one inspector window, and two data windows.
- Modify: `frontend/src/views/LabView.test.js`
  - Verify the cockpit layout still loads templates, maintains node-scoped params, and triggers experiment runs correctly.

## Task 1: Extend The NeuroLab State Helpers For Cockpit View Models

**Files:**
- Modify: `frontend/src/views/neuroLabPipelineState.js`
- Modify: `frontend/src/views/neuroLabPipelineState.test.js`

- [ ] **Step 1: Write the failing state tests for canvas and floating-panel models**

Update `frontend/src/views/neuroLabPipelineState.test.js`:

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
  it('builds the default fixed pipeline from legacy flat template params', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    expect(workspace.nodes.map((node) => node.id)).toEqual([
      'source',
      'filter',
      'psd',
      'band-power',
      'ai-report'
    ]);
    expect(workspace.nodeParams.source.channels).toBe(4);
    expect(workspace.nodeParams.filter.high_hz).toBe(40);
    expect(workspace.selectedNodeId).toBe('source');
  });

  it('patches editable node params without changing node order', () => {
    const workspace = buildWorkspaceFromTemplate({
      default_params: {
        pipeline: {
          nodes: [
            { id: 'source' },
            { id: 'filter' },
            { id: 'psd' },
            { id: 'band-power' },
            { id: 'ai-report' }
          ],
          edges: [
            ['source', 'filter'],
            ['filter', 'psd'],
            ['psd', 'band-power'],
            ['band-power', 'ai-report']
          ]
        },
        node_params: {
          source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
          filter: { low_hz: 1, high_hz: 40 }
        }
      }
    });

    const next = patchNodeParams(workspace, 'filter', { high_hz: 32 });

    expect(next.nodeParams.filter.high_hz).toBe(32);
    expect(next.nodes.map((node) => node.id)).toEqual(workspace.nodes.map((node) => node.id));
  });

  it('builds a layered canvas model from experiment artifacts', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    const run = {
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

    expect(model.channels).toHaveLength(4);
    expect(model.channels[1].id).toBe('ch-2');
    expect(model.channels[1].points.length).toBeGreaterThan(0);
    expect(model.regions.find((region) => region.id === 'motor-right').isActive).toBe(true);
    expect(model.pipeline.find((node) => node.id === 'psd').status).toBe('completed');
    expect(model.events[0].left).toBe('25.00%');
  });

  it('builds top-strip and floating-panel content from the current run', () => {
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
          limitations: 'Synthetic data only.',
          next_steps: 'Try a lower high-cut value.',
          node_explanations: [
            {
              node_id: 'source',
              title: 'Synthetic EEG Source',
              body: 'Synthetic capture is stable enough for teaching demos.'
            }
          ]
        }
      },
      artifacts: [
        {
          data: {
            signal_preview: [[0.1, 0.2, -0.1]],
            psd: [
              {
                channel: 'CH1',
                frequencies: [4, 8, 12],
                values: [1.2, 3.6, 2.4]
              }
            ],
            channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
            events: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }],
            pipeline_trace: [{ node_id: 'source', status: 'completed' }]
          }
        }
      ]
    };

    const panels = buildWorkbenchPanels({
      templates: [{ id: 'exp-eeg-replay', title: 'EEG Replay Lab', status: 'published' }],
      selectedExperiment: { id: 'exp-eeg-replay', title: 'EEG Replay Lab', status: 'published' },
      workspace,
      run,
      focus: { channelId: 'ch-1', regionId: 'motor-left' }
    });

    expect(panels.controlStrip.statusLabel).toBe('Completed');
    expect(panels.metrics[0].label).toBe('采样率');
    expect(panels.templateItems[0].title).toBe('EEG Replay Lab');
    expect(panels.assistantSections[0].title).toBe('当前观察');
  });

  it('maps experiment artifacts into instrument panels and inspector explanations', () => {
    const run = {
      report: {
        content: {
          node_explanations: [
            {
              node_id: 'filter',
              title: 'Bandpass Filter',
              body: 'Removes drift and high-frequency noise before spectrum analysis.'
            }
          ],
          observations: ['Alpha remains dominant across channels.'],
          limitations: 'Synthetic data only.',
          next_steps: 'Try a lower high-cut value.'
        }
      },
      artifacts: [
        {
          data: {
            signal_preview: [[0.1, 0.2, -0.1]],
            psd: [
              {
                channel: 'CH1',
                frequencies: [4, 8, 12],
                values: [1.2, 3.6, 2.4]
              }
            ],
            channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
            events: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }],
            pipeline_trace: [
              { node_id: 'source', status: 'completed' },
              { node_id: 'filter', status: 'completed' }
            ]
          }
        }
      ]
    };

    const instruments = buildInstrumentModel(run);
    const inspector = selectedNodeInspector(
      {
        nodes: [
          {
            id: 'filter',
            label: 'Bandpass Filter',
            type: 'signal_processing',
            editable: true,
            status: 'completed',
            fields: []
          }
        ],
        nodeParams: {
          filter: { low_hz: 1, high_hz: 40 }
        },
        selectedNodeId: 'filter'
      },
      run
    );

    expect(instruments.waveform.option.series[0].data).toEqual([0.1, 0.2, -0.1]);
    expect(instruments.events.rows[0].label).toBe('Stimulus');
    expect(inspector.explanation).toContain('Removes drift');
    expect(inspector.statusLabel).toBe('Completed');
  });
});
```

- [ ] **Step 2: Run the state tests to verify they fail**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js
```

Expected: FAIL with `buildCanvasModel is not exported` and `buildWorkbenchPanels is not exported`.

- [ ] **Step 3: Implement canvas and cockpit panel builders in the state helper**

Update `frontend/src/views/neuroLabPipelineState.js` with the new display-only helpers:

```js
const REGION_BLUEPRINTS = [
  { id: 'prefrontal', label: 'Prefrontal', x: 34, y: 28, channels: [0] },
  { id: 'motor-left', label: 'Motor Left', x: 26, y: 44, channels: [1] },
  { id: 'motor-right', label: 'Motor Right', x: 58, y: 44, channels: [2] },
  { id: 'visual', label: 'Visual', x: 42, y: 62, channels: [3] }
];

const PIPELINE_ANCHORS = [
  { id: 'source', x: 10, y: 14 },
  { id: 'filter', x: 23, y: 12 },
  { id: 'psd', x: 70, y: 16 },
  { id: 'band-power', x: 84, y: 26 },
  { id: 'ai-report', x: 88, y: 62 }
];

function artifactData(run) {
  return run?.artifacts?.[0]?.data || {};
}

function nodeStatusLabel(status) {
  return {
    ready: 'Ready',
    running: 'Running',
    completed: 'Completed',
    error: 'Error'
  }[status] || 'Ready';
}

function toPolyline(samples = []) {
  if (!samples.length) return '';
  const max = Math.max(...samples.map((value) => Math.abs(value))) || 1;
  return samples.map((value, index) => {
    const x = (index / Math.max(samples.length - 1, 1)) * 100;
    const y = 50 - (value / max) * 38;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPercent(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

export function buildCanvasModel(workspace, run, focus = {}) {
  const artifact = artifactData(run);
  const preview = Array.isArray(artifact.signal_preview) ? artifact.signal_preview : [];
  const powers = Array.isArray(artifact.channel_power) ? artifact.channel_power : [];
  const traceById = Object.fromEntries(
    (artifact.pipeline_trace || []).map((item) => [item.node_id, item.status])
  );
  const channelCount = preview.length || workspace?.nodeParams?.source?.channels || 4;
  const durationMs = (workspace?.nodeParams?.source?.duration_seconds || 4) * 1000;

  const channels = Array.from({ length: channelCount }, (_, index) => {
    const id = `ch-${index + 1}`;
    const samples = preview[index] || [];
    const power = powers[index] || {};
    return {
      id,
      label: `CH${index + 1}`,
      points: toPolyline(samples),
      alpha: power.alpha ?? 0,
      beta: power.beta ?? 0,
      isActive: focus.channelId ? focus.channelId === id : index === 0
    };
  });

  const regions = REGION_BLUEPRINTS.map((region) => {
    const related = region.channels.map((index) => channels[index]).filter(Boolean);
    const activity = average(related.map((channel) => channel.alpha + channel.beta));
    return {
      ...region,
      activity,
      intensity: Math.min(1, activity / 8),
      isActive: focus.regionId === region.id
    };
  });

  const pipeline = (workspace?.nodes || []).map((node, index) => {
    const anchor = PIPELINE_ANCHORS.find((item) => item.id === node.id) || PIPELINE_ANCHORS[index];
    const status = traceById[node.id] || node.status || 'ready';
    return {
      ...node,
      status,
      statusLabel: nodeStatusLabel(status),
      x: anchor?.x ?? 20 + index * 14,
      y: anchor?.y ?? 20 + index * 10,
      isSelected: workspace?.selectedNodeId === node.id
    };
  });

  const events = (artifact.events || []).map((event) => ({
    ...event,
    left: clampPercent((event.start_ms / durationMs) * 100),
    width: clampPercent(((event.end_ms - event.start_ms) / durationMs) * 100)
  }));

  return {
    channels,
    regions,
    pipeline,
    events,
    gridColumns: 12,
    gridRows: 8
  };
}

export function buildWorkbenchPanels({
  templates = [],
  selectedExperiment = null,
  workspace = null,
  run = null,
  focus = {}
}) {
  const sourceParams = workspace?.nodeParams?.source || {};
  const artifact = artifactData(run);
  const trace = artifact.pipeline_trace || [];
  const lastTrace = trace[trace.length - 1];
  const focusChannel = focus.channelId || 'ch-1';
  const focusRegion = focus.regionId || 'prefrontal';

  return {
    controlStrip: {
      title: selectedExperiment?.title || '请选择实验模板',
      modeLabel: 'Teaching Cockpit',
      statusLabel: nodeStatusLabel(run?.status || lastTrace?.status || 'ready'),
      sessionLabel: `${sourceParams.channels || 4} CH · ${sourceParams.sample_rate || 128} Hz`
    },
    templateItems: templates.map((template) => ({
      id: template.id,
      title: template.title,
      subtitle: `${template.status || 'draft'} · ${template.data_source || 'simulation'}`,
      isActive: template.id === selectedExperiment?.id
    })),
    metrics: [
      { id: 'sample-rate', label: '采样率', value: `${sourceParams.sample_rate || 128} Hz` },
      { id: 'channels', label: '通道数', value: `${sourceParams.channels || 4}` },
      { id: 'duration', label: '时长', value: `${sourceParams.duration_seconds || 4} s` },
      { id: 'events', label: '事件数', value: `${(artifact.events || []).length}` }
    ],
    assistantSections: [
      {
        id: 'observation',
        title: '当前观察',
        body: run?.report?.content?.observations?.[0] || '运行实验后显示当前观察。'
      },
      {
        id: 'meaning',
        title: '可能含义',
        body: `当前焦点：${focusChannel.toUpperCase()} / ${focusRegion.replace('-', ' ')}。`
      },
      {
        id: 'next-step',
        title: '下一步建议',
        body: run?.report?.content?.next_steps || '调整参数后再次运行以比较结果。'
      }
    ]
  };
}

export function selectedNodeInspector(workspace, run) {
  const node = workspace?.nodes?.find((item) => item.id === workspace.selectedNodeId) || null;
  const explanations = run?.report?.content?.node_explanations || [];
  const explanation = explanations.find((item) => item.node_id === node?.id)?.body || '';

  return {
    node,
    params: node ? clone(workspace.nodeParams[node.id] || {}) : {},
    explanation,
    statusLabel: nodeStatusLabel(node?.status || 'ready')
  };
}
```

- [ ] **Step 4: Run the state tests to verify they pass**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js
```

Expected: PASS with `5 passed`.

- [ ] **Step 5: Commit the state-helper changes**

Run:

```bash
git add frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js
git commit -m "feat: add neurolab cockpit view models"
```

## Task 2: Add A Reusable Floating Window Primitive

**Files:**
- Create: `frontend/src/components/NeuroLabFloatingWindow.vue`
- Create: `frontend/src/components/NeuroLabFloatingWindow.test.js`

- [ ] **Step 1: Write the failing floating-window test**

Create `frontend/src/components/NeuroLabFloatingWindow.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

describe('NeuroLabFloatingWindow', () => {
  it('emits expand and dock updates from header controls', async () => {
    const wrapper = mount(NeuroLabFloatingWindow, {
      props: {
        title: '参数控制',
        subtitle: 'Bandpass Filter',
        dock: 'top-right',
        expanded: false
      },
      slots: {
        default: '<div>content</div>'
      }
    });

    expect(wrapper.classes()).toContain('dock-top-right');

    await wrapper.get('[data-testid="window-toggle"]').trigger('click');
    expect(wrapper.emitted('update:expanded')[0][0]).toBe(true);

    await wrapper.get('[data-testid="dock-bottom-left"]').trigger('click');
    expect(wrapper.emitted('update:dock')[0][0]).toBe('bottom-left');
  });
});
```

- [ ] **Step 2: Run the floating-window test to verify it fails**

Run:

```bash
npm test -- src/components/NeuroLabFloatingWindow.test.js
```

Expected: FAIL with `Cannot find module './NeuroLabFloatingWindow.vue'`.

- [ ] **Step 3: Implement the floating window shell with constrained docking**

Create `frontend/src/components/NeuroLabFloatingWindow.vue`:

```vue
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  dock: {
    type: String,
    default: 'top-left',
    validator: (value) => ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value)
  },
  expanded: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['update:dock', 'update:expanded']);
const dragState = ref(null);

const dockClass = computed(() => `dock-${props.dock}`);

function setDock(nextDock) {
  emit('update:dock', nextDock);
}

function toggleExpanded() {
  emit('update:expanded', !props.expanded);
}

function onPointerMove(event) {
  if (!dragState.value) return;
  dragState.value = {
    ...dragState.value,
    x: event.clientX,
    y: event.clientY
  };
}

function onPointerUp() {
  if (!dragState.value) return;
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const horizontal = dragState.value.x > viewportWidth / 2 ? 'right' : 'left';
  const vertical = dragState.value.y > viewportHeight / 2 ? 'bottom' : 'top';
  emit('update:dock', `${vertical}-${horizontal}`);
  dragState.value = null;
}

function onPointerDown(event) {
  dragState.value = { x: event.clientX, y: event.clientY };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp, { once: true });
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});
</script>

<template>
  <section
    class="lab-floating-window"
    :class="[dockClass, { expanded, compact, dragging: !!dragState }]"
  >
    <header class="lab-floating-window__header" @pointerdown="onPointerDown">
      <div>
        <p class="lab-floating-window__eyebrow">{{ title }}</p>
        <h3 v-if="subtitle">{{ subtitle }}</h3>
      </div>

      <div class="lab-floating-window__actions">
        <button data-testid="dock-top-left" type="button" @click.stop="setDock('top-left')">TL</button>
        <button data-testid="dock-top-right" type="button" @click.stop="setDock('top-right')">TR</button>
        <button data-testid="dock-bottom-left" type="button" @click.stop="setDock('bottom-left')">BL</button>
        <button data-testid="dock-bottom-right" type="button" @click.stop="setDock('bottom-right')">BR</button>
        <button data-testid="window-toggle" type="button" @click.stop="toggleExpanded">
          {{ expanded ? '收起' : '展开' }}
        </button>
      </div>
    </header>

    <div class="lab-floating-window__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.lab-floating-window {
  position: absolute;
  z-index: 4;
  width: min(320px, calc(100vw - 32px));
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  transition:
    transform var(--dur-2) var(--ease-out-quint),
    border-color var(--dur-2) ease,
    box-shadow var(--dur-2) ease;
}

.lab-floating-window.expanded {
  width: min(420px, calc(100vw - 32px));
}

.lab-floating-window.dragging {
  border-color: var(--primary);
  box-shadow: 0 16px 40px rgba(0, 34, 255, 0.14);
}

.dock-top-left {
  top: 24px;
  left: 24px;
}

.dock-top-right {
  top: 24px;
  right: 24px;
}

.dock-bottom-left {
  bottom: 24px;
  left: 24px;
}

.dock-bottom-right {
  right: 24px;
  bottom: 24px;
}

.lab-floating-window__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-default);
  cursor: grab;
}

.lab-floating-window__eyebrow {
  margin: 0 0 6px;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lab-floating-window__header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.lab-floating-window__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lab-floating-window__actions button {
  min-width: 34px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  font-size: 11px;
}

.lab-floating-window__body {
  padding: 14px 16px 16px;
}
```

- [ ] **Step 4: Run the floating-window test to verify it passes**

Run:

```bash
npm test -- src/components/NeuroLabFloatingWindow.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the floating-window primitive**

Run:

```bash
git add frontend/src/components/NeuroLabFloatingWindow.vue frontend/src/components/NeuroLabFloatingWindow.test.js
git commit -m "feat: add neurolab floating window shell"
```

## Task 3: Rebuild The Main Canvas As A Layered Experiment Field

**Files:**
- Modify: `frontend/src/components/NeuroLabCanvas.vue`
- Modify: `frontend/src/components/NeuroLabCanvas.test.js`

- [ ] **Step 1: Write the failing canvas test for the new layered model**

Replace `frontend/src/components/NeuroLabCanvas.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders channels, regions, and pipeline anchors and emits focus events', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        model: {
          channels: [
            { id: 'ch-1', label: 'CH1', points: '0,50 100,20', alpha: 3.6, beta: 2.4, isActive: true },
            { id: 'ch-2', label: 'CH2', points: '0,40 100,55', alpha: 2.8, beta: 1.8, isActive: false }
          ],
          regions: [
            { id: 'prefrontal', label: 'Prefrontal', x: 34, y: 28, intensity: 0.7, isActive: false },
            { id: 'motor-right', label: 'Motor Right', x: 58, y: 44, intensity: 0.5, isActive: true }
          ],
          pipeline: [
            { id: 'source', label: 'Synthetic EEG Source', x: 10, y: 14, status: 'completed', statusLabel: 'Completed', isSelected: false },
            { id: 'filter', label: 'Bandpass Filter', x: 23, y: 12, status: 'running', statusLabel: 'Running', isSelected: true }
          ],
          events: [{ label: 'Stimulus', left: '25.00%', width: '12.50%' }],
          gridColumns: 12,
          gridRows: 8
        }
      }
    });

    expect(wrapper.text()).toContain('CH1');
    expect(wrapper.text()).toContain('Motor Right');
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

- [ ] **Step 2: Run the canvas test to verify it fails**

Run:

```bash
npm test -- src/components/NeuroLabCanvas.test.js
```

Expected: FAIL because `NeuroLabCanvas` still expects `workspace` and does not emit `select-channel` / `select-region`.

- [ ] **Step 3: Implement the layered SVG/CSS cockpit canvas**

Replace `frontend/src/components/NeuroLabCanvas.vue`:

```vue
<script setup>
const props = defineProps({
  model: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node', 'select-channel', 'select-region']);

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
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
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

    <svg class="lab-canvas__brain" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <path d="M18,40 C18,20 34,12 50,12 C66,12 82,20 82,40 C82,66 66,82 50,82 C34,82 18,66 18,40 Z" />
      <path d="M50,12 L50,82" />
      <path d="M24,36 C36,34 44,30 50,22 C56,30 64,34 76,36" />
      <path d="M22,52 C34,50 42,52 50,60 C58,52 66,50 78,52" />
    </svg>

    <button
      v-for="region in model.regions"
      :key="region.id"
      :data-testid="`region-${region.id}`"
      class="lab-canvas__region"
      :class="{ active: region.isActive }"
      type="button"
      :style="{
        left: `${region.x}%`,
        top: `${region.y}%`,
        '--region-scale': `${0.88 + region.intensity * 0.34}`
      }"
      @click="emit('select-region', region.id)"
    >
      <span>{{ region.label }}</span>
    </button>

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

<style scoped>
.lab-canvas {
  position: relative;
  min-height: 720px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  background:
    radial-gradient(circle at 55% 46%, rgba(0, 34, 255, 0.08), transparent 26%),
    linear-gradient(135deg, rgba(0, 34, 255, 0.04), transparent 34%),
    var(--surface-0);
}

.lab-canvas__grid-column,
.lab-canvas__grid-row {
  position: absolute;
  background: rgba(0, 0, 0, 0.06);
}

.lab-canvas__grid-column {
  top: 0;
  bottom: 0;
  width: 1px;
}

.lab-canvas__grid-row {
  left: 0;
  right: 0;
  height: 1px;
}

.lab-canvas__wave-bed {
  position: absolute;
  inset: auto 8% 6% 8%;
  display: grid;
  gap: 12px;
}

.lab-canvas__channel {
  position: relative;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: center;
  min-height: 68px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.52);
}

.lab-canvas__channel.active {
  border-color: rgba(0, 34, 255, 0.36);
  background: rgba(0, 34, 255, 0.06);
}

.lab-canvas__channel svg {
  width: 100%;
  height: 42px;
}

.lab-canvas__channel polyline {
  fill: none;
  stroke: var(--primary);
  stroke-width: 2.4;
}

.lab-canvas__event {
  position: absolute;
  bottom: -14px;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid rgba(0, 34, 255, 0.28);
  background: rgba(0, 34, 255, 0.08);
  font-size: 11px;
}

.lab-canvas__brain {
  position: absolute;
  inset: 16% 27% 27%;
  width: 46%;
  height: 46%;
  stroke: rgba(0, 0, 0, 0.42);
  stroke-width: 1.3;
  fill: rgba(255, 255, 255, 0.16);
}

.lab-canvas__region {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--region-scale));
  min-width: 110px;
  min-height: 52px;
  padding: 0 12px;
  border: 1px solid rgba(0, 34, 255, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.lab-canvas__region.active {
  border-color: rgba(0, 34, 255, 0.52);
  box-shadow: 0 0 0 8px rgba(0, 34, 255, 0.08);
}

.lab-canvas__node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 4px;
  width: 160px;
  min-height: 68px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
}

.lab-canvas__node.selected,
.lab-canvas__node.running,
.lab-canvas__node.completed {
  border-color: rgba(0, 34, 255, 0.48);
}
```

- [ ] **Step 4: Run the canvas test to verify it passes**

Run:

```bash
npm test -- src/components/NeuroLabCanvas.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the layered canvas**

Run:

```bash
git add frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabCanvas.test.js
git commit -m "feat: rebuild neurolab canvas as cockpit surface"
```

## Task 4: Convert Inspector And Instruments Into Floating Experiment Windows

**Files:**
- Modify: `frontend/src/components/NeuroLabInspector.vue`
- Modify: `frontend/src/components/NeuroLabInstruments.vue`
- Modify: `frontend/src/components/NeuroLabInstruments.test.js`

- [ ] **Step 1: Write the failing instruments test for the new always-visible windows**

Replace `frontend/src/components/NeuroLabInstruments.test.js`:

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
  it('renders metrics, events, and assistant sections without tab switching', () => {
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
          ]
        },
        windows: {
          metrics: { dock: 'bottom-left', expanded: false },
          assistant: { dock: 'bottom-right', expanded: true }
        }
      }
    });

    expect(wrapper.text()).toContain('采样率');
    expect(wrapper.text()).toContain('Stimulus');
    expect(wrapper.text()).toContain('当前观察');
    expect(wrapper.findAll('[data-testid="chart"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the instruments test to verify it fails**

Run:

```bash
npm test -- src/components/NeuroLabInstruments.test.js
```

Expected: FAIL because the current component still renders a tab strip and does not accept `windows`.

- [ ] **Step 3: Rebuild the inspector as a compact parameter floating window**

Replace `frontend/src/components/NeuroLabInspector.vue`:

```vue
<script setup>
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

const props = defineProps({
  node: { type: Object, default: null },
  params: { type: Object, default: () => ({}) },
  explanation: { type: String, default: '' },
  statusLabel: { type: String, default: 'Ready' },
  windowState: {
    type: Object,
    default: () => ({ dock: 'top-right', expanded: true })
  }
});

const emit = defineEmits(['patch-node', 'update-window']);

function updateField(key, rawValue) {
  const value = rawValue === '' ? rawValue : Number(rawValue);
  emit('patch-node', props.node.id, { [key]: Number.isNaN(value) ? rawValue : value });
}

function patchWindow(patch) {
  emit('update-window', patch);
}
</script>

<template>
  <NeuroLabFloatingWindow
    title="参数控制"
    :subtitle="node?.label || '未选择节点'"
    :dock="windowState.dock"
    :expanded="windowState.expanded"
    @update:dock="patchWindow({ dock: $event })"
    @update:expanded="patchWindow({ expanded: $event })"
  >
    <div v-if="node" class="lab-inspector">
      <div class="lab-inspector__status">
        <span>{{ node.type }}</span>
        <strong>{{ statusLabel }}</strong>
      </div>

      <div v-if="node.editable" class="lab-inspector__fields">
        <label v-for="field in node.fields" :key="field.key">
          <span>{{ field.label }}</span>
          <select
            v-if="field.kind === 'select'"
            :value="params[field.key]"
            @change="updateField(field.key, $event.target.value)"
          >
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input
            v-else
            :value="params[field.key]"
            :min="field.min"
            :max="field.max"
            :step="field.step || 1"
            type="number"
            @input="updateField(field.key, $event.target.value)"
          >
        </label>
      </div>

      <p class="lab-inspector__hint">{{ explanation || '运行实验后显示该节点的 AI 解释。' }}</p>
    </div>

    <p v-else class="lab-inspector__empty">请选择一个节点以查看参数和节点说明。</p>
  </NeuroLabFloatingWindow>
</template>

<style scoped>
.lab-inspector {
  display: grid;
  gap: 16px;
}

.lab-inspector__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-3);
}

.lab-inspector__status strong {
  color: var(--text-1);
  font-family: var(--font-mono);
}

.lab-inspector__fields {
  display: grid;
  gap: 12px;
}

.lab-inspector__fields label {
  display: grid;
  gap: 6px;
}

.lab-inspector__fields input,
.lab-inspector__fields select {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
}

.lab-inspector__hint,
.lab-inspector__empty {
  margin: 0;
  color: var(--text-3);
  line-height: 1.7;
}
</style>
```

- [ ] **Step 4: Rebuild the instruments area as two floating windows**

Replace `frontend/src/components/NeuroLabInstruments.vue`:

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

function patchWindow(key, patch) {
  emit('update-window', key, patch);
}
</script>

<template>
  <section class="lab-instruments-shell">
    <NeuroLabFloatingWindow
      title="实验读数"
      subtitle="Waveform / Metrics"
      :dock="windows.metrics.dock"
      :expanded="windows.metrics.expanded"
      @update:dock="patchWindow('metrics', { dock: $event })"
      @update:expanded="patchWindow('metrics', { expanded: $event })"
    >
      <div class="lab-instruments__metrics-grid">
        <article v-for="metric in metrics" :key="metric.id">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </div>
      <NeuroLabChart :option="model.waveform?.option" height="180px" />
    </NeuroLabFloatingWindow>

    <NeuroLabFloatingWindow
      title="分析与 AI 助教"
      subtitle="Spectrum / Events / Guidance"
      :dock="windows.assistant.dock"
      :expanded="windows.assistant.expanded"
      @update:dock="patchWindow('assistant', { dock: $event })"
      @update:expanded="patchWindow('assistant', { expanded: $event })"
    >
      <div class="lab-instruments__stack">
        <NeuroLabChart :option="model.spectrum?.option" height="140px" />
        <NeuroLabChart :option="model.bands?.option" height="140px" />

        <div class="lab-instruments__events">
          <h4>事件标记</h4>
          <div v-if="eventRows.length" class="lab-instruments__event-list">
            <article v-for="row in eventRows" :key="`${row.label}-${row.start_ms}`">
              <strong>{{ row.label }}</strong>
              <span>{{ row.start_ms }} - {{ row.end_ms }} ms</span>
            </article>
          </div>
          <p v-else>暂无事件数据。</p>
        </div>

        <div class="lab-instruments__assistant">
          <article v-for="section in assistantSections" :key="section.id">
            <h4>{{ section.title }}</h4>
            <p>{{ section.body }}</p>
          </article>
        </div>
      </div>
    </NeuroLabFloatingWindow>
  </section>
</template>

<style scoped>
.lab-instruments-shell {
  position: static;
}

.lab-instruments__metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.lab-instruments__metrics-grid article {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border-default);
  background: rgba(0, 34, 255, 0.04);
}

.lab-instruments__metrics-grid span {
  color: var(--text-3);
  font-size: 12px;
}

.lab-instruments__metrics-grid strong {
  font-size: 16px;
}

.lab-instruments__stack {
  display: grid;
  gap: 12px;
}

.lab-instruments__events,
.lab-instruments__assistant article {
  display: grid;
  gap: 8px;
}

.lab-instruments__event-list {
  display: grid;
  gap: 8px;
}

.lab-instruments__event-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
}
</style>
```

- [ ] **Step 5: Run the instruments test to verify it passes**

Run:

```bash
npm test -- src/components/NeuroLabInstruments.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 6: Commit the floating window surfaces**

Run:

```bash
git add frontend/src/components/NeuroLabInspector.vue frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabInstruments.test.js
git commit -m "feat: convert neurolab panels into floating windows"
```

## Task 5: Recompose LabView Into The Single-Screen Teaching Cockpit

**Files:**
- Modify: `frontend/src/views/LabView.vue`
- Modify: `frontend/src/views/LabView.test.js`

- [ ] **Step 1: Write the failing LabView integration test for the cockpit shell**

Replace `frontend/src/views/LabView.test.js`:

```js
// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/experiments', () => ({
  listExperiments: vi.fn(() => Promise.resolve({
    data: {
      data: [
        {
          id: 'exp-eeg-replay',
          title: 'EEG Replay Lab',
          experiment_type: 'eeg_replay',
          summary: 'Synthetic EEG pipeline.',
          status: 'published',
          default_params: {
            pipeline: {
              nodes: [
                { id: 'source' },
                { id: 'filter' },
                { id: 'psd' },
                { id: 'band-power' },
                { id: 'ai-report' }
              ],
              edges: [
                ['source', 'filter'],
                ['filter', 'psd'],
                ['psd', 'band-power'],
                ['band-power', 'ai-report']
              ]
            },
            node_params: {
              source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
              filter: { low_hz: 1, high_hz: 40 }
            }
          }
        }
      ]
    }
  })),
  runExperiment: vi.fn(() => Promise.resolve({
    data: {
      data: {
        status: 'completed',
        artifacts: [
          {
            data: {
              signal_preview: [[0.1, 0.2], [0.05, 0.1], [0.04, 0.08], [0.02, 0.05]],
              psd: [{ channel: 'CH1', frequencies: [4, 8], values: [1.2, 3.6] }],
              channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
              events: [{ label: 'Stimulus', start_ms: 500, end_ms: 1500 }],
              pipeline_trace: [
                { node_id: 'source', status: 'completed' },
                { node_id: 'filter', status: 'completed' },
                { node_id: 'psd', status: 'completed' },
                { node_id: 'band-power', status: 'completed' },
                { node_id: 'ai-report', status: 'completed' }
              ]
            }
          }
        ],
        report: {
          content: {
            node_explanations: [],
            observations: ['Alpha remains dominant.'],
            limitations: 'Synthetic data only.',
            next_steps: 'Adjust sample rate.'
          }
        }
      }
    }
  }))
}));

vi.mock('../components/NeuroLabChart.vue', () => ({
  default: { props: ['option', 'height'], template: '<div data-testid="chart">{{ height }}</div>' }
}));

import LabView from './LabView.vue';
import { listExperiments, runExperiment } from '../api/experiments';

describe('LabView', () => {
  it('loads the cockpit shell and sends node-scoped params on run', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    expect(listExperiments).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Teaching Cockpit');
    expect(wrapper.text()).toContain('EEG Replay Lab');

    await wrapper.get('button.lab-run-action').trigger('click');

    expect(runExperiment).toHaveBeenCalledWith('exp-eeg-replay', {
      params: {
        source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
        filter: { low_hz: 1, high_hz: 40 }
      }
    });
  });
});
```

- [ ] **Step 2: Run the LabView test to verify it fails**

Run:

```bash
npm test -- src/views/LabView.test.js
```

Expected: FAIL because the current `LabView` still renders the old header/grid layout and does not show `Teaching Cockpit`.

- [ ] **Step 3: Rebuild LabView around the canvas model, floating windows, and top strip**

Update `frontend/src/views/LabView.vue`:

```vue
<script setup>
import { computed, onMounted, ref } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import NeuroLabCanvas from '../components/NeuroLabCanvas.vue';
import NeuroLabFloatingWindow from '../components/NeuroLabFloatingWindow.vue';
import NeuroLabInspector from '../components/NeuroLabInspector.vue';
import NeuroLabInstruments from '../components/NeuroLabInstruments.vue';
import {
  applyRunToWorkspace,
  buildCanvasModel,
  buildInstrumentModel,
  buildWorkbenchPanels,
  buildWorkspaceFromTemplate,
  patchNodeParams,
  selectedNodeInspector
} from './neuroLabPipelineState';

const templates = ref([]);
const selectedExperimentId = ref('');
const workspace = ref(null);
const selectedRun = ref(null);
const isLoading = ref(false);
const isRunning = ref(false);
const errorMessage = ref('');
const focus = ref({ channelId: 'ch-1', regionId: 'prefrontal' });
const windows = ref({
  template: { dock: 'top-left', expanded: false },
  inspector: { dock: 'top-right', expanded: true },
  metrics: { dock: 'bottom-left', expanded: false },
  assistant: { dock: 'bottom-right', expanded: true }
});

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const instruments = computed(() => ({
  ...buildInstrumentModel(selectedRun.value),
  ...buildWorkbenchPanels({
    templates: templates.value,
    selectedExperiment: selectedExperiment.value,
    workspace: workspace.value,
    run: selectedRun.value,
    focus: focus.value
  })
}));

const canvasModel = computed(() => buildCanvasModel(workspace.value, selectedRun.value, focus.value));
const inspector = computed(() => selectedNodeInspector(workspace.value, selectedRun.value));

function unwrapResponse(response, fallback) {
  return response?.data?.data ?? response?.data ?? response ?? fallback;
}

function selectExperiment(template) {
  selectedExperimentId.value = template.id;
  selectedRun.value = null;
  workspace.value = buildWorkspaceFromTemplate(template);
}

function selectNode(nodeId) {
  workspace.value = workspace.value ? { ...workspace.value, selectedNodeId: nodeId } : workspace.value;
}

function patchNode(nodeId, patch) {
  workspace.value = patchNodeParams(workspace.value, nodeId, patch);
}

function patchWindow(key, patch) {
  windows.value = {
    ...windows.value,
    [key]: {
      ...windows.value[key],
      ...patch
    }
  };
}

function selectChannel(channelId) {
  focus.value = {
    ...focus.value,
    channelId
  };
}

function selectRegion(regionId) {
  focus.value = {
    ...focus.value,
    regionId
  };
}

function updateInstrumentWindow(key, patch) {
  patchWindow(key, patch);
}

async function loadExperiments() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listExperiments();
    templates.value = unwrapResponse(response, []);
    if (templates.value.length > 0) {
      selectExperiment(templates.value[0]);
    }
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验模板加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function startRun() {
  if (!selectedExperiment.value || !workspace.value) return;
  isRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await runExperiment(selectedExperiment.value.id, {
      params: workspace.value.nodeParams
    });
    selectedRun.value = unwrapResponse(response, null);
    workspace.value = applyRunToWorkspace(workspace.value, selectedRun.value);
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验运行失败';
  } finally {
    isRunning.value = false;
  }
}

onMounted(loadExperiments);
</script>

<template>
  <section class="lab-workbench">
    <header class="lab-workbench__strip">
      <div>
        <p class="kicker">EDUFISH NeuroLab</p>
        <h1>{{ instruments.controlStrip?.title || '脑机实验台' }}</h1>
      </div>

      <div class="lab-workbench__status">
        <span>{{ instruments.controlStrip?.modeLabel || 'Teaching Cockpit' }}</span>
        <span>{{ instruments.controlStrip?.statusLabel || 'Ready' }}</span>
        <span>{{ instruments.controlStrip?.sessionLabel || '--' }}</span>
      </div>

      <button
        class="btn btn-primary lab-run-action"
        type="button"
        :disabled="isRunning || !selectedExperiment || selectedExperiment.status !== 'published'"
        @click="startRun"
      >
        {{ isRunning ? '运行中...' : 'Run Pipeline' }}
      </button>
    </header>

    <p v-if="errorMessage" class="lab-error">{{ errorMessage }}</p>

    <div class="lab-workbench__stage">
      <NeuroLabCanvas
        v-if="workspace"
        :model="canvasModel"
        @select-node="selectNode"
        @select-channel="selectChannel"
        @select-region="selectRegion"
      />

      <NeuroLabFloatingWindow
        title="实验选择"
        :subtitle="selectedExperiment?.title || '未加载模板'"
        :dock="windows.template.dock"
        :expanded="windows.template.expanded"
        @update:dock="patchWindow('template', { dock: $event })"
        @update:expanded="patchWindow('template', { expanded: $event })"
      >
        <div class="lab-template-list">
          <p v-if="isLoading" class="lab-empty">正在加载实验模板...</p>
          <p v-else-if="!templates.length" class="lab-empty">暂无可用实验模板。</p>
          <button
            v-for="item in instruments.templateItems || []"
            :key="item.id"
            type="button"
            class="lab-template-button"
            :class="{ active: item.isActive }"
            @click="selectExperiment(templates.find((template) => template.id === item.id))"
          >
            <span>{{ item.title }}</span>
            <small>{{ item.subtitle }}</small>
          </button>
        </div>
      </NeuroLabFloatingWindow>

      <NeuroLabInspector
        :node="inspector.node"
        :params="inspector.params"
        :explanation="inspector.explanation"
        :status-label="inspector.statusLabel"
        :window-state="windows.inspector"
        @patch-node="patchNode"
        @update-window="patchWindow('inspector', $event)"
      />

      <NeuroLabInstruments
        :model="instruments"
        :windows="{ metrics: windows.metrics, assistant: windows.assistant }"
        @update-window="updateInstrumentWindow"
      />
    </div>
  </section>
</template>

<style scoped>
.lab-workbench {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 16px) 20px 24px;
  background: var(--surface-0);
}

.lab-workbench__strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.lab-workbench__strip h1 {
  margin: 4px 0 0;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  line-height: 1;
}

.lab-workbench__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lab-workbench__status span {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: rgba(0, 34, 255, 0.04);
  display: inline-flex;
  align-items: center;
}

.lab-workbench__stage {
  position: relative;
}

.lab-error {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid rgba(220, 38, 38, 0.32);
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.lab-template-list {
  display: grid;
  gap: 10px;
}

.lab-template-button {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  text-align: left;
}

.lab-template-button.active {
  border-color: rgba(0, 34, 255, 0.42);
  background: rgba(0, 34, 255, 0.05);
}

.lab-empty {
  margin: 0;
  color: var(--text-3);
}
</style>
```

- [ ] **Step 4: Run the LabView integration test to verify it passes**

Run:

```bash
npm test -- src/views/LabView.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Run the focused NeuroLab frontend regression suite**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js src/components/NeuroLabFloatingWindow.test.js src/components/NeuroLabCanvas.test.js src/components/NeuroLabInstruments.test.js src/views/LabView.test.js
```

Expected: PASS with all targeted NeuroLab redesign tests green.

- [ ] **Step 6: Commit the cockpit orchestration**

Run:

```bash
git add frontend/src/views/LabView.vue frontend/src/views/LabView.test.js
git commit -m "feat: assemble neurolab teaching cockpit"
```

## Task 6: Final Verification And Browser Acceptance

**Files:**
- Modify when browser verification exposes a defect:
  - `frontend/src/views/neuroLabPipelineState.js`
  - `frontend/src/components/NeuroLabFloatingWindow.vue`
  - `frontend/src/components/NeuroLabCanvas.vue`
  - `frontend/src/components/NeuroLabInspector.vue`
  - `frontend/src/components/NeuroLabInstruments.vue`
  - `frontend/src/views/LabView.vue`
  - their matching test files from Tasks 1-5 only

- [ ] **Step 1: Run the full frontend build**

Run:

```bash
npm run build
```

Expected: PASS. Existing non-blocking chunk warnings are acceptable if the build completes successfully.

- [ ] **Step 2: Start the frontend dev server for manual review**

Run:

```bash
npm run dev -- --host 0.0.0.0 --port 3025
```

Expected: Vite starts and serves the cockpit at `http://localhost:3025/lab`.

- [ ] **Step 3: Manually verify the cockpit acceptance checklist**

Use the browser and confirm:

```text
1. The first screen reads as a single experiment cockpit, not a three-column page.
2. The main canvas shows visible multi-channel waveforms, brain regions, and pipeline anchors without opening any tabs.
3. The template window, inspector window, metrics window, and assistant window all render as floating surfaces and can change docks.
4. Clicking Run Pipeline updates the status strip and leaves the screen in a visually active state.
5. The page fits a 1440x900 desktop viewport without requiring vertical scroll for the primary workflow.
```

- [ ] **Step 4: Apply any verification fixes and rerun the focused suite**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js src/components/NeuroLabFloatingWindow.test.js src/components/NeuroLabCanvas.test.js src/components/NeuroLabInstruments.test.js src/views/LabView.test.js
npm run build
```

Expected: PASS again after any polish fixes.

- [ ] **Step 5: Commit the final verified polish**

Run:

```bash
git add frontend/src/views/LabView.vue frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabInspector.vue frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabFloatingWindow.vue frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js frontend/src/components/NeuroLabFloatingWindow.test.js frontend/src/components/NeuroLabCanvas.test.js frontend/src/components/NeuroLabInstruments.test.js frontend/src/views/LabView.test.js
git commit -m "test: verify neurolab teaching cockpit redesign"
```

## Self-Review

### Spec Coverage

The plan covers every approved design area:

1. Single-screen cockpit shell: Task 5
2. Layered main canvas: Task 1 and Task 3
3. Asymmetric floating windows: Task 2, Task 4, Task 5
4. Klein blue + existing token discipline: all styling stays component-scoped; no global token rewrite
5. Signal-first visualization and visible event alignment: Task 1 and Task 3
6. AI assistant reframed as short guidance sections: Task 1 and Task 4
7. Verification in browser and build: Task 6

### Placeholder Scan

This plan intentionally avoids `TODO`, `TBD`, “handle edge cases later”, and “write tests for the above” placeholders. Every task has named files, explicit tests, commands, and commit messages.

### Type Consistency

The new exported helper names are consistent across tasks:

1. `buildCanvasModel`
2. `buildWorkbenchPanels`
3. `selectedNodeInspector(...).statusLabel`
4. `NeuroLabFloatingWindow` props `dock` / `expanded`
5. `NeuroLabInstruments` prop `windows`
