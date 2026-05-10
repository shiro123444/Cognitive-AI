<script setup>
import { computed, onMounted, ref } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import NeuroLabCanvas from '../components/NeuroLabCanvas.vue';
import NeuroLabInspector from '../components/NeuroLabInspector.vue';
import NeuroLabInstruments from '../components/NeuroLabInstruments.vue';
import { templateStatusLabel } from './labViewState';
import {
  applyRunToWorkspace,
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

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const instruments = computed(() => buildInstrumentModel(selectedRun.value));
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
    <header class="lab-workbench-header">
      <div>
        <p class="eyebrow">EDUFISH NeuroLab</p>
        <h1>脑机实验工作台</h1>
        <p>固定 EEG pipeline、节点参数检查、仪器图和 AI 实验解释在同一页完成。</p>
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

    <div class="lab-workbench-grid">
      <aside class="lab-template-list" aria-label="实验模板">
        <p v-if="isLoading" class="lab-empty">正在加载实验模板...</p>
        <p v-else-if="!templates.length" class="lab-empty">暂无可用实验模板。</p>
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="lab-template-button"
          :class="{ active: template.id === selectedExperimentId }"
          @click="selectExperiment(template)"
        >
          <span>{{ template.title }}</span>
          <small>{{ templateStatusLabel(template.status) }} · {{ template.data_source }}</small>
        </button>
      </aside>

      <main class="lab-canvas-panel">
        <div class="lab-canvas-head">
          <h2>{{ selectedExperiment?.title || '请选择实验模板' }}</h2>
          <p>{{ selectedExperiment?.summary || '暂无实验摘要。' }}</p>
        </div>
        <NeuroLabCanvas v-if="workspace" :workspace="workspace" @select-node="selectNode" />
      </main>

      <NeuroLabInspector
        :node="inspector.node"
        :params="inspector.params"
        :explanation="inspector.explanation"
        @patch-node="patchNode"
      />
    </div>

    <NeuroLabInstruments :model="instruments" />
  </section>
</template>

<style scoped>
.lab-workbench {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 32px) clamp(20px, 4vw, 48px) 64px;
  background: var(--surface-0);
}

.lab-workbench-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lab-workbench-header h1 {
  margin: 0 0 14px;
  color: var(--text-1);
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1;
}

.lab-workbench-header p:last-child {
  max-width: 760px;
  margin: 0;
  color: var(--text-3);
  line-height: 1.7;
}

.lab-run-action {
  flex: 0 0 auto;
}

.lab-error {
  margin: 0 0 20px;
  padding: 14px 16px;
  border: 1px solid rgba(220, 38, 38, 0.32);
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.lab-workbench-grid {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 320px);
  gap: 20px;
  margin-bottom: 20px;
}

.lab-template-list,
.lab-canvas-panel {
  border: 1px solid var(--border-default);
  background: var(--surface-1);
}

.lab-template-list {
  align-self: start;
}

.lab-empty {
  margin: 0;
  padding: 18px 16px;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.6;
}

.lab-template-button {
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 76px;
  padding: 16px;
  border: 0;
  border-bottom: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-2);
  text-align: left;
  cursor: pointer;
}

.lab-template-button:last-child {
  border-bottom: 0;
}

.lab-template-button.active {
  background: rgba(37, 99, 235, 0.08);
  color: var(--text-1);
}

.lab-template-button span,
.lab-template-button small {
  display: block;
}

.lab-canvas-panel {
  display: grid;
  gap: 18px;
  padding: 20px;
}

.lab-canvas-head {
  display: grid;
  gap: 10px;
}

.lab-canvas-head h2,
.lab-canvas-head p {
  margin: 0;
}

.lab-canvas-head p {
  color: var(--text-3);
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .lab-workbench-grid {
    grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .lab-workbench {
    padding-inline: 16px;
  }

  .lab-workbench-header {
    flex-direction: column;
  }

  .lab-workbench-grid {
    grid-template-columns: 1fr;
  }
}
</style>
