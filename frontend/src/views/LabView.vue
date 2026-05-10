<script setup>
import { computed, onMounted, ref } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import {
  firstSignalPreview,
  reportSections,
  summarizeRun,
  templateStatusLabel
} from './labViewState';

const templates = ref([]);
const selectedExperimentId = ref('');
const selectedRun = ref(null);
const isLoading = ref(false);
const isRunning = ref(false);
const errorMessage = ref('');
const params = ref({
  duration_seconds: 4,
  sample_rate: 128,
  channels: 4
});

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const signalPreview = computed(() => firstSignalPreview(selectedRun.value));
const runSummary = computed(() => summarizeRun(selectedRun.value));
const sections = computed(() => reportSections(selectedRun.value));

function unwrapResponse(response, fallback) {
  return response?.data?.data ?? response?.data ?? response ?? fallback;
}

function resetParams(template) {
  params.value = {
    duration_seconds: template?.default_params?.duration_seconds || 4,
    sample_rate: template?.default_params?.sample_rate || 128,
    channels: template?.default_params?.channels || 4
  };
}

async function loadExperiments() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listExperiments();
    templates.value = unwrapResponse(response, []);
    if (!selectedExperimentId.value && templates.value.length > 0) {
      selectedExperimentId.value = templates.value[0].id;
      resetParams(templates.value[0]);
    }
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验模板加载失败';
  } finally {
    isLoading.value = false;
  }
}

function selectExperiment(template) {
  selectedExperimentId.value = template.id;
  selectedRun.value = null;
  resetParams(template);
}

async function startRun() {
  if (!selectedExperiment.value || selectedExperiment.value.status !== 'published') return;
  isRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await runExperiment(selectedExperiment.value.id, { params: params.value });
    selectedRun.value = unwrapResponse(response, null);
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验运行失败';
  } finally {
    isRunning.value = false;
  }
}

onMounted(loadExperiments);
</script>

<template>
  <section class="lab-view neurolab">
    <header class="lab-hero">
      <p class="eyebrow">EDUFISH NeuroLab</p>
      <h1>虚拟脑与脑机实验平台</h1>
      <p>运行合成 EEG 与神经科学实验，把参数、信号、观察和 AI 报告连接回课程知识图谱。</p>
    </header>

    <p v-if="errorMessage" class="lab-error">{{ errorMessage }}</p>

    <div class="lab-workspace">
      <aside class="lab-template-list" aria-label="实验模板">
        <p v-if="isLoading" class="lab-empty">正在加载实验模板...</p>
        <p v-else-if="!templates.length" class="lab-empty">暂无可用实验模板。</p>
        <button
          v-for="template in templates"
          :key="template.id"
          class="lab-template-button"
          :class="{ active: template.id === selectedExperimentId }"
          type="button"
          @click="selectExperiment(template)"
        >
          <span>{{ template.title }}</span>
          <small>{{ templateStatusLabel(template.status) }} · {{ template.data_source }}</small>
        </button>
      </aside>

      <main v-if="selectedExperiment" class="lab-run-panel">
        <div class="lab-run-header">
          <div>
            <p class="eyebrow">{{ selectedExperiment.experiment_type }}</p>
            <h2>{{ selectedExperiment.title }}</h2>
            <p>{{ selectedExperiment.summary }}</p>
          </div>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="isRunning || selectedExperiment.status !== 'published'"
            @click="startRun"
          >
            {{ isRunning ? '运行中...' : '运行实验' }}
          </button>
        </div>

        <div class="lab-controls">
          <label>
            时长
            <input v-model.number="params.duration_seconds" type="number" min="1" max="30">
          </label>
          <label>
            采样率
            <select v-model.number="params.sample_rate">
              <option :value="64">64 Hz</option>
              <option :value="128">128 Hz</option>
              <option :value="256">256 Hz</option>
            </select>
          </label>
          <label>
            通道
            <input v-model.number="params.channels" type="number" min="1" max="8">
          </label>
        </div>

        <section class="lab-signal">
          <div class="lab-signal-header">
            <h3>Signal Preview</h3>
            <span>{{ runSummary }}</span>
          </div>
          <div class="lab-sparkline" aria-label="Synthetic EEG signal preview">
            <i
              v-for="(point, index) in signalPreview"
              :key="index"
              :style="{ height: `${Math.max(6, Math.min(72, 36 + point * 1.6))}px` }"
            />
            <span v-if="!signalPreview.length">运行实验后显示信号预览。</span>
          </div>
        </section>

        <section v-if="sections.length" class="lab-report">
          <article v-for="section in sections" :key="section.title">
            <h3>{{ section.title }}</h3>
            <p>{{ section.body }}</p>
          </article>
        </section>
      </main>

      <main v-else class="lab-run-panel lab-run-panel-empty">
        <p>请选择一个实验模板。</p>
      </main>
    </div>
  </section>
</template>

<style scoped>
.neurolab {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 48px) clamp(20px, 4vw, 64px) 72px;
  background: var(--surface-0);
}

.lab-hero {
  max-width: 920px;
  margin-bottom: 32px;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lab-hero h1 {
  margin: 0 0 14px;
  color: var(--text-1);
  font-size: clamp(2rem, 5vw, 4.5rem);
  line-height: 1;
  letter-spacing: 0;
}

.lab-hero p:last-child {
  max-width: 720px;
  margin: 0;
  color: var(--text-3);
  font-size: 16px;
  line-height: 1.8;
}

.lab-error {
  margin: 0 0 20px;
  padding: 14px 16px;
  border: 1px solid rgba(220, 38, 38, 0.32);
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.lab-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 24px;
}

.lab-template-list,
.lab-run-panel {
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

.lab-template-button:hover,
.lab-template-button.active {
  color: var(--text-1);
  background: var(--surface-2);
}

.lab-template-button span {
  overflow-wrap: anywhere;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.lab-template-button small {
  overflow-wrap: anywhere;
  color: var(--text-4);
  font-size: 12px;
  line-height: 1.4;
}

.lab-run-panel {
  padding: clamp(20px, 3vw, 32px);
}

.lab-run-panel-empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  color: var(--text-3);
}

.lab-run-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
}

.lab-run-header h2 {
  margin: 0 0 12px;
  color: var(--text-1);
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: 0;
}

.lab-run-header p:last-child {
  max-width: 720px;
  margin: 0;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.7;
}

.lab-run-header .btn {
  flex: 0 0 auto;
  min-width: 112px;
  white-space: nowrap;
}

.lab-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 24px 0;
}

.lab-controls label {
  display: grid;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.4;
}

.lab-controls input,
.lab-controls select {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  color: var(--text-1);
  padding: 0 12px;
  font: inherit;
}

.lab-signal {
  margin-top: 24px;
}

.lab-signal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: baseline;
  margin-bottom: 12px;
}

.lab-signal-header h3 {
  margin: 0;
  color: var(--text-1);
  font-size: 16px;
  letter-spacing: 0;
}

.lab-signal-header span {
  color: var(--text-4);
  font-size: 13px;
  text-align: right;
}

.lab-sparkline {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 96px;
  padding: 12px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
}

.lab-sparkline i {
  display: block;
  flex: 0 0 3px;
  width: 3px;
  background: var(--primary);
}

.lab-sparkline span {
  color: var(--text-4);
  font-size: 13px;
}

.lab-report {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.lab-report article {
  border: 1px solid var(--border-default);
  padding: 16px;
  background: var(--surface-0);
}

.lab-report h3 {
  margin: 0 0 10px;
  color: var(--text-1);
  font-size: 15px;
  letter-spacing: 0;
}

.lab-report p {
  margin: 0;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

@media (max-width: 840px) {
  .lab-workspace,
  .lab-controls,
  .lab-report {
    grid-template-columns: 1fr;
  }

  .lab-run-header,
  .lab-signal-header {
    align-items: stretch;
    flex-direction: column;
  }

  .lab-run-header .btn {
    width: 100%;
  }

  .lab-signal-header span {
    text-align: left;
  }
}
</style>
