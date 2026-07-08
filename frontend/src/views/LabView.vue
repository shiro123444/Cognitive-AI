<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import NeuroLabCanvas from '../components/NeuroLabCanvas.vue';
import NeuroLabChart from '../components/NeuroLabChart.vue';
import NeuroLabScrubber from '../components/NeuroLabScrubber.vue';
import ScalpTopo from '../components/ScalpTopo.vue';
import {
  applyRunToWorkspace,
  buildCanvasModel,
  buildInstrumentModel,
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
const resultsExpanded = ref(false);
const workbenchRef = ref(null);
const isFullscreen = ref(false);
const playheadMs = ref(0);
const isPlaying = ref(false);
let scrubberRaf = null;

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const canvasModel = computed(() => buildCanvasModel(workspace.value, selectedRun.value, focus.value, { playheadMs: playheadMs.value }));
const durationMs = computed(() => (workspace.value?.nodeParams?.source?.duration_seconds || 4) * 1000);
const inspector = computed(() => selectedNodeInspector(workspace.value, selectedRun.value));
const instruments = computed(() => buildInstrumentModel(selectedRun.value));

const pipelineNodes = computed(() => {
  if (!workspace.value) return [];
  return workspace.value.nodes.map((node) => {
    const isSelected = workspace.value.selectedNodeId === node.id;
    return { ...node, isSelected };
  });
});

function unwrapResponse(response, fallback) {
  return response?.data?.data ?? response?.data ?? response ?? fallback;
}

function selectExperiment(template) {
  if (!template) return;
  selectedExperimentId.value = template.id;
  selectedRun.value = null;
  resultsExpanded.value = false;
  workspace.value = buildWorkspaceFromTemplate(template);
}

function selectNode(nodeId) {
  workspace.value = workspace.value ? { ...workspace.value, selectedNodeId: nodeId } : workspace.value;
}

function patchNode(nodeId, patch) {
  workspace.value = patchNodeParams(workspace.value, nodeId, patch);
}

function selectChannel(channelId) {
  focus.value = { ...focus.value, channelId };
}

function selectRegion(regionId) {
  focus.value = { ...focus.value, regionId };
}

function advancePlayhead() {
  if (!isPlaying.value) return;
  const next = playheadMs.value + 80;
  if (next >= durationMs.value) {
    playheadMs.value = durationMs.value;
    isPlaying.value = false;
    return;
  }
  playheadMs.value = next;
  scrubberRaf = requestAnimationFrame(advancePlayhead);
}

function togglePlay() {
  if (!selectedRun.value) return;
  if (playheadMs.value >= durationMs.value) playheadMs.value = 0;
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    scrubberRaf = requestAnimationFrame(advancePlayhead);
  } else if (scrubberRaf) {
    cancelAnimationFrame(scrubberRaf);
  }
}

function seek(ms) {
  playheadMs.value = Math.max(0, Math.min(durationMs.value, ms));
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
    resultsExpanded.value = true;
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验运行失败';
  } finally {
    isRunning.value = false;
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await workbenchRef.value?.requestFullscreen?.().catch(() => {});
  } else {
    await document.exitFullscreen?.();
  }
}

function syncFullscreen() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

async function loadExperiments() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listExperiments();
    templates.value = unwrapResponse(response, []);
    if (templates.value.length > 0) selectExperiment(templates.value[0]);
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验模板加载失败';
  } finally {
    isLoading.value = false;
  }
}

watch(selectedRun, (run) => {
  if (run) {
    resultsExpanded.value = true;
    playheadMs.value = 0;
    isPlaying.value = false;
  }
});

onMounted(() => {
  loadExperiments();
  document.addEventListener('fullscreenchange', syncFullscreen);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen);
  if (scrubberRaf) cancelAnimationFrame(scrubberRaf);
});
</script>

<template>
  <section ref="workbenchRef" class="neurolab" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- ═══ Header Strip ═══ -->
    <header class="neurolab__header">
      <div class="neurolab__header-left">
        <span class="neurolab__kicker">EDUFISH NeuroLab</span>
        <h1>{{ selectedExperiment?.title || '脑机实验台' }}</h1>
      </div>
      <div class="neurolab__header-actions">
        <select
          v-if="templates.length > 1"
          class="neurolab__template-select"
          :value="selectedExperimentId"
          @change="selectExperiment(templates.find(t => t.id === $event.target.value))"
        >
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
        <button class="neurolab__btn-icon" type="button" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
          {{ isFullscreen ? '⤬' : '⤢' }}
        </button>
        <button
          class="neurolab__btn-run"
          type="button"
          :disabled="isRunning || !selectedExperiment"
          @click="startRun"
        >
          <span v-if="isRunning" class="neurolab__spinner" />
          {{ isRunning ? '运行中' : '▶ Run' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="neurolab__error">{{ errorMessage }}</p>

    <!-- ═══ Main Body: Left Pipeline + Center Canvas ═══ -->
    <div class="neurolab__body">
      <!-- Left: Pipeline + Params -->
      <aside class="neurolab__sidebar">
        <div class="neurolab__pipeline">
          <div
            v-for="(node, idx) in pipelineNodes"
            :key="node.id"
            class="neurolab__pipe-node"
            :class="[node.status, { selected: node.isSelected }]"
            @click="selectNode(node.id)"
          >
            <div class="neurolab__pipe-connector" v-if="idx > 0" />
            <div class="neurolab__pipe-dot">
              <span class="neurolab__pipe-dot-inner" />
            </div>
            <div class="neurolab__pipe-info">
              <span class="neurolab__pipe-step">{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="neurolab__pipe-label">{{ node.label }}</span>
              <span class="neurolab__pipe-status">{{ node.status }}</span>
            </div>
          </div>
        </div>

        <!-- Inline Inspector for selected node -->
        <Transition name="inspector-fade">
          <div v-if="inspector.node" class="neurolab__inspector">
            <div class="neurolab__inspector-head">
              <span>{{ inspector.node.type }}</span>
              <strong>{{ inspector.statusLabel }}</strong>
            </div>
            <div v-if="inspector.node.editable" class="neurolab__inspector-fields">
              <label v-for="field in inspector.node.fields" :key="field.key" class="neurolab__field">
                <span class="neurolab__field-label">{{ field.label }}</span>
                <select
                  v-if="field.kind === 'select'"
                  :value="inspector.params[field.key]"
                  @change="patchNode(inspector.node.id, { [field.key]: Number($event.target.value) })"
                >
                  <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <input
                  v-else
                  type="range"
                  :value="inspector.params[field.key]"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step || 1"
                  @input="patchNode(inspector.node.id, { [field.key]: Number($event.target.value) })"
                />
                <span class="neurolab__field-value">{{ inspector.params[field.key] }}</span>
              </label>
            </div>
            <p v-if="inspector.explanation" class="neurolab__inspector-hint">{{ inspector.explanation }}</p>
          </div>
        </Transition>
      </aside>

      <!-- Center: 3D Brain Canvas -->
      <main class="neurolab__canvas-area">
        <div v-if="!workspace && isLoading" class="neurolab__loading">
          <span class="neurolab__spinner" />
          <p>加载实验环境...</p>
        </div>
        <NeuroLabCanvas
          v-else-if="workspace"
          :model="canvasModel"
          @select-node="selectNode"
          @select-channel="selectChannel"
          @select-region="selectRegion"
        />
      </main>
    </div>

    <!-- ═══ Scrubber: EEG 回放控制 ═══ -->
    <NeuroLabScrubber
      v-if="selectedRun"
      :duration-ms="durationMs"
      :playhead-ms="playheadMs"
      :is-playing="isPlaying"
      :events="canvasModel.events"
      @seek="seek"
      @toggle-play="togglePlay"
    />

    <!-- ═══ Bottom: Results Strip ═══ -->
    <Transition name="results-expand">
      <div v-if="resultsExpanded && selectedRun" class="neurolab__results">
        <div class="neurolab__results-header">
          <span>实验结果</span>
          <button type="button" class="neurolab__results-toggle" @click="resultsExpanded = false">收起 ↓</button>
        </div>
        <div class="neurolab__results-grid">
          <div class="neurolab__results-chart">
            <span class="neurolab__results-label">Waveform</span>
            <NeuroLabChart :option="instruments.waveform?.option" height="120px" />
          </div>
          <div class="neurolab__results-chart">
            <span class="neurolab__results-label">PSD Spectrum</span>
            <NeuroLabChart :option="instruments.spectrum?.option" height="120px" />
          </div>
          <div class="neurolab__results-chart">
            <span class="neurolab__results-label">Band Power</span>
            <NeuroLabChart :option="instruments.bands?.option" height="120px" />
          </div>
          <div class="neurolab__results-chart neurolab__results-topo">
            <span class="neurolab__results-label">Scalp α</span>
            <ScalpTopo :regions="canvasModel.brain?.regions || []" band="alpha" />
          </div>
          <div v-if="instruments.spectrogram?.option" class="neurolab__results-chart">
            <span class="neurolab__results-label">Spectrogram</span>
            <NeuroLabChart :option="instruments.spectrogram.option" height="120px" />
          </div>
          <div class="neurolab__results-report" v-if="instruments.report?.sections?.length">
            <span class="neurolab__results-label">AI Report</span>
            <div v-for="sec in instruments.report.sections" :key="sec.title" class="neurolab__report-section">
              <strong>{{ sec.title }}</strong>
              <p>{{ sec.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Collapsed results hint -->
    <button
      v-if="selectedRun && !resultsExpanded"
      class="neurolab__results-collapsed"
      type="button"
      @click="resultsExpanded = true"
    >
      ↑ 展开实验结果
    </button>
  </section>
</template>

<style scoped>
.neurolab {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  height: 100vh;
  padding-top: calc(var(--nav-height) + 8px);
  background: var(--surface-0);
  overflow: hidden;
}

.neurolab.is-fullscreen {
  padding-top: 8px;
}

/* ── Header ── */
.neurolab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px 12px;
  border-bottom: 1px solid var(--border-default);
}

.neurolab__header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.neurolab__kicker {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--primary);
  letter-spacing: 0.04em;
}

.neurolab__header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.neurolab__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.neurolab__template-select {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  font-size: 12px;
  font-family: var(--font-mono);
}

.neurolab__btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  font-size: 16px;
  display: grid;
  place-items: center;
  transition: border-color var(--dur-1) ease;
}

.neurolab__btn-icon:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.neurolab__btn-run {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 18px;
  border: none;
  background: var(--primary);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
  transition: background var(--dur-1) ease, transform var(--dur-1) ease;
}

.neurolab__btn-run:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.neurolab__btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.neurolab__error {
  margin: 0;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(220, 38, 38, 0.2);
  background: rgba(220, 38, 38, 0.06);
  color: #b91c1c;
  font-size: 13px;
}

/* ── Body: Sidebar + Canvas ── */
.neurolab__body {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ── */
.neurolab__sidebar {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1px solid var(--border-default);
  overflow-y: auto;
  background: var(--surface-1);
}

.neurolab__pipeline {
  padding: 16px 14px;
}

.neurolab__pipe-node {
  position: relative;
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 8px;
  margin-bottom: 2px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--dur-1) ease, border-color var(--dur-1) ease;
}

.neurolab__pipe-node:hover {
  background: color-mix(in srgb, var(--primary) 3%, transparent);
}

.neurolab__pipe-node.selected {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  border-color: color-mix(in srgb, var(--primary) 2%, transparent);
}

.neurolab__pipe-connector {
  position: absolute;
  left: 22px;
  top: -8px;
  width: 2px;
  height: 12px;
  background: var(--border-strong);
}

.neurolab__pipe-node.completed .neurolab__pipe-connector {
  background: var(--lab-status-completed);
}

.neurolab__pipe-node.running .neurolab__pipe-connector {
  background: var(--primary);
}

.neurolab__pipe-dot {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 2px solid var(--lab-status-ready);
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: border-color var(--dur-2) ease;
}

.neurolab__pipe-node.running .neurolab__pipe-dot {
  border-color: var(--lab-status-running);
  animation: dotPulse 1.4s ease-in-out infinite;
}

.neurolab__pipe-node.completed .neurolab__pipe-dot {
  border-color: var(--lab-status-completed);
  background: var(--lab-status-completed);
}

.neurolab__pipe-node.error .neurolab__pipe-dot {
  border-color: var(--lab-status-error);
  background: var(--lab-status-error);
}

.neurolab__pipe-dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  transition: background var(--dur-1) ease;
}

.neurolab__pipe-node.running .neurolab__pipe-dot-inner {
  background: var(--primary);
  animation: coreBreath 1.4s ease-in-out infinite;
}

.neurolab__pipe-node.completed .neurolab__pipe-dot-inner {
  background: white;
}

@keyframes dotPulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 4%, transparent); }
  50% { box-shadow: 0 0 0 4px rgba(0, 34, 255, 0); }
}

@keyframes coreBreath {
  0%, 100% { transform: scale(0.7); }
  50% { transform: scale(1.1); }
}

.neurolab__pipe-info {
  display: grid;
  gap: 2px;
}

.neurolab__pipe-step {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-4);
  letter-spacing: 0.06em;
}

.neurolab__pipe-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

.neurolab__pipe-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-4);
  text-transform: uppercase;
}

.neurolab__pipe-node.running .neurolab__pipe-status {
  color: var(--primary);
}

.neurolab__pipe-node.completed .neurolab__pipe-status {
  color: var(--lab-status-completed);
}

/* ── Inspector ── */
.neurolab__inspector {
  padding: 14px;
  border-top: 1px solid var(--border-default);
  background: var(--surface-0);
}

.neurolab__inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--text-3);
}

.neurolab__inspector-head strong {
  font-family: var(--font-mono);
  color: var(--text-1);
}

.neurolab__inspector-fields {
  display: grid;
  gap: 14px;
}

.neurolab__field {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
}

.neurolab__field-label {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.neurolab__field input[type="range"] {
  width: 100%;
  accent-color: var(--primary);
}

.neurolab__field select {
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-default);
  background: var(--surface-1);
  font-size: 12px;
}

.neurolab__field-value {
  min-width: 32px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

.neurolab__inspector-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.6;
}

.inspector-fade-enter-active,
.inspector-fade-leave-active {
  transition: opacity var(--dur-2) ease, transform var(--dur-2) ease;
}

.inspector-fade-enter-from,
.inspector-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── Canvas Area ── */
.neurolab__canvas-area {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.neurolab__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  place-content: center;
  gap: 12px;
}

.neurolab__loading p {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.neurolab__spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-default);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Results Strip ── */
.neurolab__results {
  border-top: 1px solid var(--border-default);
  background: var(--surface-1);
  overflow: hidden;
}

.neurolab__results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-default);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.neurolab__results-toggle {
  border: none;
  background: none;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-4);
  cursor: pointer;
}

.neurolab__results-toggle:hover {
  color: var(--primary);
}

.neurolab__results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1px;
  background: var(--border-default);
  max-height: 180px;
  overflow-y: auto;
}

.neurolab__results-chart,
.neurolab__results-report {
  padding: 10px 14px;
  background: var(--surface-0);
}

.neurolab__results-label {
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.neurolab__report-section {
  margin-bottom: 8px;
}

.neurolab__report-section strong {
  display: block;
  font-size: 11px;
  margin-bottom: 2px;
}

.neurolab__report-section p {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.5;
}

.neurolab__results-collapsed {
  display: block;
  width: 100%;
  padding: 8px;
  border: none;
  border-top: 1px solid var(--border-default);
  background: var(--surface-1);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-4);
  text-align: center;
  cursor: pointer;
  transition: color var(--dur-1) ease, background var(--dur-1) ease;
}

.neurolab__results-collapsed:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.results-expand-enter-active {
  transition: max-height var(--dur-3) var(--ease-out-expo), opacity var(--dur-2) ease;
}

.results-expand-leave-active {
  transition: max-height var(--dur-2) ease, opacity var(--dur-1) ease;
}

.results-expand-enter-from,
.results-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.results-expand-enter-to,
.results-expand-leave-from {
  max-height: 240px;
  opacity: 1;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .neurolab__body {
    grid-template-columns: 200px 1fr;
  }
}

@media (max-width: 640px) {
  .neurolab__body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .neurolab__sidebar {
    border-right: none;
    border-bottom: 1px solid var(--border-default);
    max-height: 180px;
  }

  .neurolab__pipeline {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 10px;
  }

  .neurolab__pipe-node {
    grid-template-columns: 1fr;
    min-width: 100px;
  }

  .neurolab__pipe-connector {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .neurolab__pipe-node.running .neurolab__pipe-dot,
  .neurolab__pipe-node.running .neurolab__pipe-dot-inner,
  .neurolab__spinner {
    animation: none;
  }
}
</style>
