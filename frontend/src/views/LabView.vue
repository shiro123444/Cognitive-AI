<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { exploreExperiments, listExperiments, runExperiment } from '../api/experiments';
import NeuroLabCanvas from '../components/NeuroLabCanvas.vue';
import NeuroLabResultsDock from '../components/NeuroLabResultsDock.vue';
import NeuroLabScrubber from '../components/NeuroLabScrubber.vue';
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
const resultTab = ref('overview');
const exploreQuery = ref('');
const exploreResults = ref([]);
const exploreOpen = ref(false);
const exploreLoading = ref(false);
let exploreTimer = null;
const workbenchRef = ref(null);
const isFullscreen = ref(false);
const playheadMs = ref(0);
const isPlaying = ref(false);
let scrubberRaf = null;

/* ── View Mode: 'overview' vs 'workbench' ── */
const labViewMode = ref('workbench');

/* ── 4 Paradigms for Overview Guide Hub ── */
const PARADIGM_GUIDES = [
  {
    id: 'exp-neuron-spike',
    type: 'neuron',
    title: 'LIF 神经元脉冲动力学仿真',
    tag: '神经计算 · 微分方程',
    color: 'pink',
    badge: 'PARADIGM 01',
    hypothesis: '验证漏电积分-发放 (Leaky Integrate-and-Fire) 模型的阈值全或无放电特性，探究注入电流强度与动作电位发放频率的非线性响应关系。',
    formula: 'τ_m (dV/dt) = -(V - V_rest) + R · I(t)',
    steps: ['刺激电流注入 (pA)', '膜电位微分积分', '阈值发放检测 (-55mV)', '脉冲发放率统计'],
    parameters: [
      { name: '注入电流 I_inj', default: '8 pA', range: '1 ~ 30 pA' },
      { name: '刺激时长 Duration', default: '120 ms', range: '20 ~ 500 ms' }
    ],
    difficulty: '入门 ★☆☆',
    duration: '15 min'
  },
  {
    id: 'exp-eeg-replay',
    type: 'eeg',
    title: '多通道 EEG 脑电信号与频段分析',
    tag: '脑机接口 · 信号处理',
    color: 'cyan',
    badge: 'PARADIGM 02',
    hypothesis: '基于 10-20 国际导联系统进行信号回放与数字带通滤波，计算枕叶 Alpha (8-13Hz) 与前额 Beta (14-30Hz) 功率谱密度及脑区激活联动。',
    formula: 'PSD(f) = (1/N) · |FFT(x(t))|^2',
    steps: ['合成/真实多导联源', '数字带通滤波 (1-40Hz)', 'FFT 功率谱密度分析', '频段能量拓扑映射'],
    parameters: [
      { name: '低截频 Low Cutoff', default: '1.0 Hz', range: '0.1 ~ 10 Hz' },
      { name: '高截频 High Cutoff', default: '40.0 Hz', range: '20 ~ 100 Hz' }
    ],
    difficulty: '中级 ★★☆',
    duration: '25 min'
  },
  {
    id: 'exp-perceptron-train',
    type: 'ml',
    title: '感知机分类器与决策边界演化',
    tag: '机器学习 · 模式识别',
    color: 'yellow',
    badge: 'PARADIGM 03',
    hypothesis: '探究线性二分类感知机在不同数据集分布下的超平面旋转收敛过程，观察学习率对梯度迭代步长与损失函数下降速度的影响。',
    formula: 'w_(t+1) = w_t + η · (y_i - ŷ_i) · x_i',
    steps: ['二维数据集采样', '线性超平面初始化', '批量权重梯度迭代', '决策分类边界评估'],
    parameters: [
      { name: '学习率 Learning Rate', default: '0.05', range: '0.001 ~ 0.5' },
      { name: '迭代轮数 Epochs', default: '50', range: '10 ~ 200' }
    ],
    difficulty: '进阶 ★★★',
    duration: '30 min'
  },
  {
    id: 'exp-spatial-connectome',
    type: 'connectome',
    title: '全脑 3D 脑影像与空间连接组',
    tag: '认知神经 · 空间拓扑',
    color: 'green',
    badge: 'PARADIGM 04',
    hypothesis: '结合 NiiVue 3D 脑表面网格渲染，将头皮电极信号投影至解剖学 Brodmann 脑区，实时观察前额叶、顶叶与枕叶的功能联动。',
    formula: 'Corr(R_i, R_j) = Cov(i, j) / (σ_i · σ_j)',
    steps: ['3D NIfTI 脑表面载入', '皮层电极空间配准', '脑区频段功率关联', '空间高亮交互联动'],
    parameters: [
      { name: '聚焦脑区 Focus Region', default: '前额叶 (Prefrontal)', range: '额/顶/枕/颞' },
      { name: '空间透明度 Opacity', default: '0.85', range: '0.1 ~ 1.0' }
    ],
    difficulty: '综合 ★★★',
    duration: '35 min'
  }
];

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const canvasModel = computed(() => buildCanvasModel(workspace.value, selectedRun.value, focus.value, { playheadMs: playheadMs.value }));
const durationMs = computed(() => (
  workspace.value?.nodeParams?.stimulus?.duration_ms
  || (workspace.value?.nodeParams?.source?.duration_seconds || 4) * 1000
));
const inspector = computed(() => selectedNodeInspector(workspace.value, selectedRun.value));
const instruments = computed(() => buildInstrumentModel(selectedRun.value));
const labState = computed(() => {
  if (isRunning.value) return 'running';
  if (selectedRun.value) return selectedRun.value.status === 'completed' ? 'completed' : selectedRun.value.status;
  if (errorMessage.value) return 'error';
  return 'ready';
});

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
  resultTab.value = 'overview';
  workspace.value = buildWorkspaceFromTemplate(template);
}

function selectNode(nodeId) {
  workspace.value = workspace.value ? { ...workspace.value, selectedNodeId: nodeId } : workspace.value;
  if (!selectedRun.value) return;
  resultTab.value = {
    source: 'overview',
    filter: 'overview',
    psd: 'spectrum',
    'band-power': 'spectrum',
    'ai-report': 'ai'
  }[nodeId] || resultTab.value;
  resultsExpanded.value = true;
}

function patchNode(nodeId, patch) {
  workspace.value = patchNodeParams(workspace.value, nodeId, patch);
}

function selectChannel(channelId) {
  focus.value = { ...focus.value, channelId };
}

function selectRegion(regionId) {
  focus.value = { ...focus.value, regionId };
  if (selectedRun.value) {
    resultTab.value = 'spatial';
    resultsExpanded.value = true;
  }
}

function advancePlayhead() {
  if (!isPlaying.value) return;
  const step = Math.max(16, Math.min(80, durationMs.value / 50));
  const next = playheadMs.value + step;
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
  labViewMode.value = 'workbench';

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

function launchParadigm(paradigmId) {
  const target = templates.value.find((t) => t.id === paradigmId) || templates.value[0];
  if (target) {
    selectExperiment(target);
  }
  labViewMode.value = 'workbench';
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

async function runExplore() {
  const query = exploreQuery.value.trim();
  if (!query) {
    exploreResults.value = [];
    exploreOpen.value = false;
    return;
  }
  exploreLoading.value = true;
  try {
    const response = await exploreExperiments(query);
    exploreResults.value = unwrapResponse(response, []);
    exploreOpen.value = true;
  } catch {
    exploreResults.value = [];
  } finally {
    exploreLoading.value = false;
  }
}

function onExploreInput() {
  clearTimeout(exploreTimer);
  exploreTimer = setTimeout(runExplore, 300);
}

function closeExplore() {
  setTimeout(() => { exploreOpen.value = false; }, 120);
}

function pickExploreResult(template) {
  exploreOpen.value = false;
  exploreQuery.value = '';
  exploreResults.value = [];
  selectExperiment(template);
  labViewMode.value = 'workbench';
}

async function pickAndRunExploreResult(template) {
  pickExploreResult(template);
  await nextTick();
  await startRun();
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
    resultTab.value = 'overview';
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
  clearTimeout(exploreTimer);
});
</script>

<template>
  <section ref="workbenchRef" class="neurolab" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- ═══ Header Strip (Raft / RK Pixel Style) ═══ -->
    <header class="neurolab__header">
      <div class="neurolab__header-left">
        <span class="neurolab__kicker mono">
          <span class="sq sq-cyan" /> EDUFISH NEUROLAB
        </span>
        <h1>{{ selectedExperiment?.title || '脑机实验台' }}</h1>

        <!-- Mode Switcher -->
        <div class="mode-switcher-pills">
          <button
            type="button"
            class="mode-pill"
            :class="{ active: labViewMode === 'overview' }"
            @click="labViewMode = 'overview'"
          >
            <span class="sq sq-yellow" /> 总览与导引
          </button>
          <button
            type="button"
            class="mode-pill"
            :class="{ active: labViewMode === 'workbench' }"
            @click="labViewMode = 'workbench'"
          >
            <span class="sq sq-pink" /> 实验工作台
          </button>
        </div>
      </div>

      <!-- Explore Search -->
      <div class="neurolab__explore">
        <input
          v-model="exploreQuery"
          type="search"
          placeholder="探究：输入概念或问题，如“神经元 / alpha 波”"
          aria-label="探究实验查询"
          data-testid="explore-input"
          class="form-control"
          @input="onExploreInput"
          @focus="runExplore"
          @blur="closeExplore"
        />
        <span v-if="exploreLoading" class="neurolab__spinner neurolab__spinner-sm" aria-hidden="true" />
        <div
          v-if="exploreOpen && (exploreResults.length || exploreQuery.trim())"
          class="neurolab__explore-dropdown"
          role="listbox"
          aria-label="探究结果"
        >
          <button
            v-for="item in exploreResults"
            :key="item.id"
            type="button"
            role="option"
            data-testid="explore-result"
            @mousedown.prevent
            @click="pickAndRunExploreResult(item)"
          >
            <span>
              <strong>{{ item.title }}</strong>
              <small v-if="item.matched_concepts?.length">关联概念：{{ item.matched_concepts.join(' / ') }}</small>
              <small v-else>{{ item.summary }}</small>
            </span>
            <em>运行 ▸</em>
          </button>
          <p v-if="!exploreResults.length" class="neurolab__explore-empty mono">未找到匹配实验</p>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="neurolab__header-actions">
        <select
          v-if="templates.length > 1"
          class="neurolab__template-select form-control mono"
          :value="selectedExperimentId"
          @change="selectExperiment(templates.find(t => t.id === $event.target.value))"
        >
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
        <button class="neurolab__btn-icon btn btn-subtle" type="button" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
          {{ isFullscreen ? '⤬' : '⤢' }}
        </button>
        <button
          class="neurolab__btn-run btn btn-primary"
          type="button"
          :disabled="isRunning || !selectedExperiment"
          @click="startRun"
        >
          <span v-if="isRunning" class="neurolab__spinner" />
          {{ isRunning ? '处理中…' : '▶ 运行实验' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="neurolab__error mono" role="alert">
      <span class="sq sq-orange" /> {{ errorMessage }}
    </p>

    <!-- ═════════════════════════════════════════════════════════════
         MODE 1: 实验平台总览与范式引导界面 (Overview & Guide Hub)
         ═════════════════════════════════════════════════════════════ -->
    <section v-if="labViewMode === 'overview'" class="neurolab__overview-hub">
      <div class="guide-hero-banner hero-banner">
        <div class="banner-text">
          <span class="banner-kicker mono">
            <span class="sq sq-yellow" /> NEUROLAB EXPERIMENT CATALOG
          </span>
          <h2 class="hero-banner-title">脑机与神经计算实验体系总览</h2>
          <p class="banner-desc">
            平台涵盖微观离子膜电位、宏观脑电多导联波形、机器学习决策面与三维脑皮层连接组 4 大计算范式。请选定实验范式载入计算管线，或点击步骤导引开始探索：
          </p>
        </div>

        <div class="workflow-steps-strip">
          <div class="workflow-step">
            <span class="step-num mono">01</span>
            <div class="step-detail">
              <strong>选定实验范式</strong>
              <small>载入预置管线节点</small>
            </div>
          </div>
          <span class="step-arrow mono">→</span>
          <div class="workflow-step">
            <span class="step-num mono">02</span>
            <div class="step-detail">
              <strong>微观参数调优</strong>
              <small>调节刺激/滤波/学习率</small>
            </div>
          </div>
          <span class="step-arrow mono">→</span>
          <div class="workflow-step">
            <span class="step-num mono">03</span>
            <div class="step-detail">
              <strong>实时动态联动</strong>
              <small>放电波形与三维脑图</small>
            </div>
          </div>
          <span class="step-arrow mono">→</span>
          <div class="workflow-step">
            <span class="step-num mono">04</span>
            <div class="step-detail">
              <strong>时间轴与报告</strong>
              <small>回放游标与 AI 假说解读</small>
            </div>
          </div>
        </div>
      </div>

      <!-- 4 Paradigm Cards Grid -->
      <div class="paradigm-grid">
        <article
          v-for="item in PARADIGM_GUIDES"
          :key="item.id"
          class="paradigm-card panel"
          :class="`theme-${item.color}`"
        >
          <header class="paradigm-card-head">
            <span class="paradigm-badge mono">{{ item.badge }}</span>
            <span class="paradigm-diff mono">{{ item.difficulty }} · {{ item.duration }}</span>
          </header>

          <h3 class="paradigm-title">{{ item.title }}</h3>
          <span class="paradigm-tag mono">
            <span class="sq" :class="`sq-${item.color}`" /> {{ item.tag }}
          </span>

          <p class="paradigm-hypo">{{ item.hypothesis }}</p>

          <div class="paradigm-formula mono">
            <span class="formula-label">形式化方程:</span>
            <code>{{ item.formula }}</code>
          </div>

          <div class="paradigm-pipeline-chain mono">
            <div v-for="(step, sIdx) in item.steps" :key="step" class="chain-node">
              <span>{{ sIdx + 1 }}. {{ step }}</span>
            </div>
          </div>

          <div class="paradigm-params-preview mono">
            <div v-for="param in item.parameters" :key="param.name" class="param-row">
              <span class="param-name">{{ param.name }}:</span>
              <strong class="param-val">{{ param.default }}</strong>
              <small class="param-range">({{ param.range }})</small>
            </div>
          </div>

          <footer class="paradigm-card-footer">
            <button
              type="button"
              class="btn btn-primary btn-sm w-full"
              @click="launchParadigm(item.id)"
            >
              ▶ 载入并进入实验工作台
            </button>
          </footer>
        </article>
      </div>
    </section>

    <!-- ═════════════════════════════════════════════════════════════
         MODE 2: 分层级实验交互工作台 (Hierarchical Workbench)
         ═════════════════════════════════════════════════════════════ -->
    <div v-show="labViewMode === 'workbench'" class="neurolab__body">
      <!-- ── Level 2: Left Pipeline & Parameters Inspector ── -->
      <aside class="neurolab__sidebar">
        <div class="sidebar-head mono">
          <span class="sq sq-cyan" />
          <strong>PIPELINE TOPOLOGY</strong>
          <small>管线编排</small>
        </div>

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
              <span class="neurolab__pipe-step mono">{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="neurolab__pipe-label">{{ node.label }}</span>
              <span class="neurolab__pipe-status mono">{{ node.status }}</span>
            </div>
          </div>
        </div>

        <!-- Inline Inspector for selected node -->
        <Transition name="inspector-fade">
          <div v-if="inspector.node" class="neurolab__inspector">
            <div class="neurolab__inspector-head mono">
              <span>{{ inspector.typeLabel }}</span>
              <strong class="status-pill">{{ inspector.statusLabel }}</strong>
            </div>
            <div v-if="inspector.node.editable" class="neurolab__inspector-fields">
              <label v-for="field in inspector.node.fields" :key="field.key" class="neurolab__field">
                <span class="neurolab__field-label mono">{{ field.label }}</span>
                <select
                  v-if="field.kind === 'select'"
                  :value="inspector.params[field.key]"
                  class="form-control mono"
                  @change="patchNode(inspector.node.id, { [field.key]: Number($event.target.value) })"
                >
                  <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <div v-else class="range-input-group">
                  <input
                    type="range"
                    :value="inspector.params[field.key]"
                    :min="field.min"
                    :max="field.max"
                    :step="field.step || 1"
                    class="range-slider"
                    @input="patchNode(inspector.node.id, { [field.key]: Number($event.target.value) })"
                  />
                  <span class="neurolab__field-value mono">{{ inspector.params[field.key] }}</span>
                </div>
              </label>
            </div>
            <p v-if="inspector.explanation" class="neurolab__inspector-hint">{{ inspector.explanation }}</p>
          </div>
        </Transition>
      </aside>

      <!-- ── Level 3: Center Interactive Animated Canvas ── -->
      <main class="neurolab__canvas-area">
        <div v-if="!workspace && isLoading" class="neurolab__loading">
          <span class="neurolab__spinner" />
          <p class="mono">加载实验计算环境…</p>
        </div>
        <NeuroLabCanvas
          v-else-if="workspace"
          :model="canvasModel"
          :state="labState"
          @select-node="selectNode"
          @select-channel="selectChannel"
          @select-region="selectRegion"
        />
      </main>
    </div>

    <!-- ── Level 4: EEG Scrubber Playback Control ── -->
    <NeuroLabScrubber
      v-if="selectedRun && labViewMode === 'workbench'"
      :duration-ms="durationMs"
      :playhead-ms="playheadMs"
      :is-playing="isPlaying"
      :events="canvasModel.events"
      @seek="seek"
      @toggle-play="togglePlay"
    />

    <!-- ── Level 4: Results Dock & AI Scientific Report ── -->
    <NeuroLabResultsDock
      v-if="selectedRun && labViewMode === 'workbench'"
      :instruments="instruments"
      :regions="canvasModel.brain?.regions || []"
      :active-tab="resultTab"
      :expanded="resultsExpanded"
      :selected-region-id="focus.regionId"
      @update:active-tab="resultTab = $event"
      @update:expanded="resultsExpanded = $event"
      @select-region="selectRegion"
    />
  </section>
</template>

<style scoped>
.neurolab {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  height: calc(100vh - var(--nav-height));
  background: var(--rk-bg);
  overflow: hidden;
}

.neurolab.is-fullscreen {
  height: 100vh;
}

/* ── Header Strip (Raft / RK Pixel Style) ── */
.neurolab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--rk-panel);
  border-bottom: 2px solid var(--rk-ink);
  z-index: 20;
}

.neurolab__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.neurolab__kicker {
  font-size: 10.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-ink);
}

.neurolab__header h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
  color: var(--rk-ink);
  letter-spacing: -0.01em;
}

/* Mode Switcher */
.mode-switcher-pills {
  display: flex;
  gap: 4px;
  background: var(--rk-white);
  padding: 2px;
  border: 1.5px solid var(--rk-ink);
}

.mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: none;
  background: transparent;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--rk-ink);
  cursor: pointer;
  transition: all 0.05s;
}

.mode-pill:hover {
  background: var(--rk-panel);
}

.mode-pill.active {
  background: var(--rk-yellow);
  box-shadow: 1px 1px 0 var(--rk-ink);
}

/* Explore */
.neurolab__explore {
  position: relative;
  width: min(340px, 30vw);
}

.neurolab__explore input {
  width: 100%;
  font-size: 11.5px;
  padding: 4px 8px;
}

.neurolab__spinner-sm {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
}

.neurolab__explore-dropdown {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  max-height: 280px;
  overflow-y: auto;
  border: 2px solid var(--rk-ink);
  background: var(--rk-white);
  box-shadow: var(--rk-shadow);
}

.neurolab__explore-dropdown button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid var(--rk-ink);
  background: transparent;
  color: var(--rk-ink);
  text-align: left;
  cursor: pointer;
}

.neurolab__explore-dropdown button:hover {
  background: var(--rk-yellow);
}

.neurolab__explore-dropdown strong {
  display: block;
  font-size: 12px;
  font-weight: 800;
}

.neurolab__explore-dropdown small {
  display: block;
  font-size: 10px;
  color: var(--rk-muted);
}

.neurolab__explore-dropdown em {
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  color: var(--rk-ink);
}

.neurolab__explore-empty {
  margin: 0;
  padding: 12px;
  font-size: 11px;
  color: var(--rk-muted);
  text-align: center;
}

.neurolab__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.neurolab__template-select {
  font-size: 11.5px;
  padding: 3px 8px;
}

.neurolab__btn-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 14px;
}

.neurolab__btn-run {
  font-size: 12px;
  padding: 4px 14px;
}

.neurolab__error {
  margin: 0;
  padding: 8px 16px;
  background: var(--rk-orange);
  border-bottom: 2px solid var(--rk-ink);
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ═════════════════════════════════════════════════════════════
   MODE 1: Overview & Guide Hub
   ═════════════════════════════════════════════════════════════ */
.neurolab__overview-hub {
  padding: 20px var(--shell-pad-x);
  overflow-y: auto;
  display: grid;
  gap: 20px;
  align-content: start;
}

.guide-hero-banner {
  display: grid;
  gap: 16px;
}

.banner-kicker {
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.banner-desc {
  font-size: 13.5px;
  line-height: 1.6;
  margin: 6px 0 0;
  max-width: 800px;
}

.workflow-steps-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--rk-white);
  padding: 12px 16px;
  border: 1.5px solid var(--rk-ink);
  box-shadow: var(--rk-shadow-sm);
  flex-wrap: wrap;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-num {
  width: 24px;
  height: 24px;
  background: var(--rk-yellow);
  border: 1px solid var(--rk-ink);
  font-size: 11px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.step-detail {
  display: flex;
  flex-direction: column;
}

.step-detail strong {
  font-size: 12px;
  font-weight: 900;
}

.step-detail small {
  font-size: 10px;
  color: var(--rk-muted);
}

.step-arrow {
  color: var(--rk-muted);
  font-size: 14px;
}

/* 4 Paradigms Cards */
.paradigm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.paradigm-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.paradigm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1.5px solid var(--rk-ink);
  padding-bottom: 6px;
}

.paradigm-badge {
  font-size: 10px;
  font-weight: 900;
  padding: 2px 6px;
  background: var(--rk-white);
  border: 1px solid var(--rk-ink);
}

.paradigm-diff {
  font-size: 10.5px;
  color: var(--rk-muted);
  font-weight: 700;
}

.paradigm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
  color: var(--rk-ink);
}

.paradigm-tag {
  font-size: 10.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.paradigm-hypo {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--rk-ink);
  margin: 0;
}

.paradigm-formula {
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  padding: 8px 10px;
  display: grid;
  gap: 2px;
}

.formula-label {
  font-size: 9.5px;
  font-weight: 800;
  color: var(--rk-muted);
}

.paradigm-formula code {
  font-size: 11px;
  font-weight: 800;
  color: var(--rk-ink);
}

.paradigm-pipeline-chain {
  display: grid;
  gap: 4px;
  background: var(--rk-white);
  padding: 8px 10px;
  border: 1.5px solid var(--rk-ink);
  font-size: 10.5px;
  font-weight: 700;
}

.paradigm-params-preview {
  display: grid;
  gap: 4px;
  font-size: 10.5px;
}

.param-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.param-name {
  color: var(--rk-muted);
}

.param-val {
  font-weight: 800;
}

.param-range {
  color: var(--rk-faint);
  font-size: 9.5px;
}

.paradigm-card-footer {
  margin-top: auto;
  padding-top: 8px;
}

.w-full {
  width: 100%;
}

/* ═════════════════════════════════════════════════════════════
   MODE 2: Workbench Layout
   ═════════════════════════════════════════════════════════════ */
.neurolab__body {
  display: grid;
  grid-template-columns: 270px 1fr;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

/* ── Sidebar (Pipeline & Inspector) ── */
.neurolab__sidebar {
  display: grid;
  grid-template-rows: auto auto 1fr;
  background: var(--rk-panel);
  border-right: 2px solid var(--rk-ink);
  overflow-y: auto;
}

.sidebar-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 2px solid var(--rk-ink);
  font-size: 11.5px;
  font-weight: 900;
}

.sidebar-head small {
  margin-left: auto;
  font-size: 10px;
  color: var(--rk-muted);
}

.neurolab__pipeline {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-bottom: 2px solid var(--rk-ink);
}

.neurolab__pipe-node {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  cursor: pointer;
  transition: all 0.05s;
}

.neurolab__pipe-node:hover {
  background: var(--rk-panel);
}

.neurolab__pipe-node.selected {
  background: var(--rk-yellow);
  border-width: 2px;
}

.neurolab__pipe-dot {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--rk-ink);
  background: var(--rk-panel);
  display: grid;
  place-items: center;
}

.neurolab__pipe-dot-inner {
  width: 8px;
  height: 8px;
  background: var(--rk-muted);
}

.neurolab__pipe-node.completed .neurolab__pipe-dot-inner {
  background: var(--rk-green);
}

.neurolab__pipe-node.running .neurolab__pipe-dot-inner {
  background: var(--rk-cyan);
  animation: pulseDot 1s infinite;
}

.neurolab__pipe-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
}

.neurolab__pipe-step {
  font-size: 10px;
  color: var(--rk-muted);
}

.neurolab__pipe-status {
  font-size: 9.5px;
  color: var(--rk-muted);
}

/* Node Inspector */
.neurolab__inspector {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--rk-white);
  border-top: 1.5px solid var(--rk-ink);
}

.neurolab__inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 800;
  border-bottom: 1.5px solid var(--rk-ink);
  padding-bottom: 6px;
}

.status-pill {
  padding: 1px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
  font-size: 9.5px;
}

.neurolab__inspector-fields {
  display: grid;
  gap: 8px;
}

.neurolab__field {
  display: grid;
  gap: 4px;
}

.neurolab__field-label {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--rk-muted);
}

.range-input-group {
  display: grid;
  grid-template-columns: 1fr 40px;
  gap: 8px;
  align-items: center;
}

.range-slider {
  width: 100%;
  accent-color: var(--rk-pink);
  cursor: pointer;
}

.neurolab__field-value {
  font-size: 11.5px;
  font-weight: 900;
  text-align: right;
}

.neurolab__inspector-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--rk-muted);
  margin: 0;
  padding: 6px 8px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
}

/* ── Center Canvas Area ── */
.neurolab__canvas-area {
  position: relative;
  min-height: 0;
  height: 100%;
  background: var(--rk-bg);
  overflow: hidden;
}

.neurolab__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  background: rgba(216, 215, 205, 0.85);
  font-weight: 800;
}

@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

@media (max-width: 860px) {
  .neurolab__body {
    grid-template-columns: 1fr;
  }
}
</style>
