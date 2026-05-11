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

const panelModel = computed(() => buildWorkbenchPanels({
  templates: templates.value,
  selectedExperiment: selectedExperiment.value,
  workspace: workspace.value,
  run: selectedRun.value,
  focus: focus.value
}));

const instruments = computed(() => ({
  ...buildInstrumentModel(selectedRun.value),
  metrics: panelModel.value.metrics,
  assistantSections: panelModel.value.assistantSections
}));

const canvasModel = computed(() => buildCanvasModel(workspace.value, selectedRun.value, focus.value));
const inspector = computed(() => selectedNodeInspector(workspace.value, selectedRun.value));

function unwrapResponse(response, fallback) {
  return response?.data?.data ?? response?.data ?? response ?? fallback;
}

function selectExperiment(template) {
  if (!template) return;
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
        <h1>{{ panelModel.controlStrip?.title || '脑机实验台' }}</h1>
      </div>

      <div class="lab-workbench__status">
        <span>{{ panelModel.controlStrip?.modeLabel || 'Teaching Cockpit' }}</span>
        <span>{{ panelModel.controlStrip?.statusLabel || 'Ready' }}</span>
        <span>{{ panelModel.controlStrip?.sessionLabel || '--' }}</span>
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
            v-for="item in panelModel.templateItems || []"
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
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100vh;
  padding: calc(var(--nav-height) + 12px) 16px 12px;
  background: var(--surface-0);
  overflow: hidden;
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
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: rgba(0, 34, 255, 0.04);
}

.lab-workbench__stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
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

@media (max-width: 1200px) {
  .lab-workbench__strip {
    grid-template-columns: 1fr;
  }
}
</style>
