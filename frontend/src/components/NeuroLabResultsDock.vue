<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import NeuroLabChart from './NeuroLabChart.vue';
import ScalpTopo from './ScalpTopo.vue';

const props = defineProps({
  instruments: { type: Object, required: true },
  regions: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'overview' },
  expanded: { type: Boolean, default: true },
  selectedRegionId: { type: String, default: '' }
});

const emit = defineEmits(['update:active-tab', 'update:expanded', 'select-region']);

const BASE_TABS = [
  { id: 'overview', label: '概览' },
  { id: 'spectrum', label: '频谱分析' },
  { id: 'spatial', label: '空间分布' },
  { id: 'ai', label: 'AI 解读' }
];

const NEURON_TABS = [
  { id: 'overview', label: '概览' },
  { id: 'ai', label: 'AI 解读' }
];

const ML_TABS = [
  { id: 'overview', label: '概览' },
  { id: 'ml', label: '训练细节' },
  { id: 'ai', label: 'AI 解读' }
];

const CLASSIFY_TABS = [
  { id: 'overview', label: '概览' },
  { id: 'classify', label: '分类结果' },
  { id: 'ai', label: 'AI 解读' }
];

const MAX_DOCK_HEIGHT = 310;
const MIN_DOCK_HEIGHT = 220;

/* On short viewports (1280x800) a fixed 310px dock starves the canvas above,
   so seed the height from the viewport and let the drag handle override it. */
function defaultDockHeight() {
  if (typeof window === 'undefined') return MAX_DOCK_HEIGHT;
  const fromViewport = Math.round(window.innerHeight * 0.32);
  return Math.max(MIN_DOCK_HEIGHT, Math.min(MAX_DOCK_HEIGHT, fromViewport));
}

const dockHeight = ref(defaultDockHeight());
const isResizing = ref(false);
let stopResize = null;

const tabs = computed(() => (
  props.instruments.neuron
    ? NEURON_TABS
    : props.instruments.eegClassify
      ? CLASSIFY_TABS
      : props.instruments.ml
        ? ML_TABS
        : BASE_TABS
));
const reportSections = computed(() => props.instruments.report?.sections || []);
const activeTabLabel = computed(() => (
  tabs.value.find((tab) => tab.id === props.activeTab)?.label || tabs.value[0].label
));
const mappedRegionCount = computed(() => props.regions.filter((region) => region.hasData).length);
const collapsedSummary = computed(() => (
  `${activeTabLabel.value} · ${mappedRegionCount.value > 0 ? `${mappedRegionCount.value} 个脑区已映射` : '结果已就绪'}`
));
const selectedRegion = computed(() => (
  props.regions.find((region) => region.id === props.selectedRegionId)
  || props.regions[0]
  || null
));

function setActiveTab(tabId) {
  emit('update:active-tab', tabId);
}

function toggleExpanded() {
  emit('update:expanded', !props.expanded);
}

function startResize(event) {
  if (!props.expanded || event.pointerType === 'touch') return;
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = dockHeight.value;
  isResizing.value = true;

  const onMove = (moveEvent) => {
    const maxHeight = Math.min(window.innerHeight * 0.48, 520);
    const nextHeight = startHeight - (moveEvent.clientY - startY);
    dockHeight.value = Math.round(Math.max(MIN_DOCK_HEIGHT, Math.min(maxHeight, nextHeight)));
  };

  const onEnd = () => {
    isResizing.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    stopResize = null;
  };

  stopResize = onEnd;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
}

onBeforeUnmount(() => stopResize?.());
</script>

<template>
  <section
    class="result-dock"
    :class="{ 'is-expanded': expanded, 'is-collapsed': !expanded, 'is-resizing': isResizing }"
    :style="{ '--dock-height': `${expanded ? dockHeight : 42}px` }"
    data-testid="results-dock"
  >
    <button
      v-if="expanded"
      class="result-dock__resize-handle"
      type="button"
      title="调整结果区域高度"
      aria-label="调整结果区域高度"
      @pointerdown="startResize"
    />

    <header class="result-dock__header">
      <div class="result-dock__title">
        <span>实验结果</span>
        <small>{{ expanded ? 'RESULT WORKSPACE' : collapsedSummary }}</small>
      </div>

      <div v-if="expanded" class="result-dock__tabs" role="tablist" aria-label="实验结果视图">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="{ active: activeTab === tab.id }"
          :data-testid="`results-tab-${tab.id}`"
          @click="setActiveTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <button
        class="result-dock__toggle"
        type="button"
        :title="expanded ? '收起实验结果' : '展开实验结果'"
        :aria-label="expanded ? '收起实验结果' : '展开实验结果'"
        data-testid="results-toggle"
        @click="toggleExpanded"
      >
        <span class="result-dock__chevron" :class="{ 'is-expanded': expanded }" aria-hidden="true" />
      </button>
    </header>

    <div v-if="expanded" class="result-dock__content">
      <section v-show="activeTab === 'overview'" class="result-dock__panel result-dock__overview" role="tabpanel">
        <template v-if="instruments.neuron">
          <div class="result-dock__overview-evidence">
            <figure>
              <figcaption>Membrane Potential <span>膜电位 · mV</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.neuron.potential.option" height="100%" />
              </div>
            </figure>
            <figure>
              <figcaption>Spike Raster <span>动作电位时间序列</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.neuron.raster.option" height="100%" />
              </div>
            </figure>
          </div>

          <aside class="result-dock__summary" aria-label="神经元指标">
            <span class="result-dock__section-label">NEURON METRICS</span>
            <div>
              <strong>放电次数</strong>
              <p>{{ instruments.neuron.metrics.totalSpikes }} spikes</p>
            </div>
            <div>
              <strong>平均放电频率</strong>
              <p>{{ instruments.neuron.metrics.firingRate }} Hz</p>
            </div>
            <div>
              <strong>平均膜电位</strong>
              <p>{{ instruments.neuron.metrics.meanPotential ?? '--' }} mV</p>
            </div>
            <div>
              <strong>放电阈值</strong>
              <p>{{ instruments.neuron.metrics.thresholdMv ?? '--' }} mV</p>
            </div>
          </aside>
        </template>
        <template v-else-if="instruments.ml">
          <div class="result-dock__overview-evidence">
            <figure>
              <figcaption>Training Curves <span>loss / accuracy · 每轮</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.ml.curves.option" height="100%" />
              </div>
            </figure>
            <figure>
              <figcaption>Decision Boundary <span>数据点与线性边界</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.ml.boundary.option" height="100%" />
              </div>
            </figure>
          </div>

          <aside class="result-dock__summary" aria-label="训练指标">
            <span class="result-dock__section-label">TRAINING METRICS</span>
            <div>
              <strong>最终准确率</strong>
              <p>{{ instruments.ml.metrics.finalAccuracy }}</p>
            </div>
            <div>
              <strong>是否收敛</strong>
              <p>{{ instruments.ml.metrics.converged ? '已收敛' : '未收敛' }}</p>
            </div>
            <div>
              <strong>模型 / 数据集</strong>
              <p>{{ instruments.ml.metrics.model }} · {{ instruments.ml.metrics.dataset }}</p>
            </div>
            <div>
              <strong>最终损失</strong>
              <p>{{ instruments.ml.metrics.finalLoss }}</p>
            </div>
          </aside>
        </template>
        <template v-else-if="instruments.eegClassify">
          <div class="result-dock__overview-evidence">
            <figure>
              <figcaption>Confusion Matrix <span>真实 vs 预测 · count</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.eegClassify.confusionMatrix.option" height="100%" />
              </div>
            </figure>
            <figure>
              <figcaption>Sample PSD <span>单 trial 各通道频谱</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.eegClassify.samplePsd.option" height="100%" />
              </div>
            </figure>
          </div>

          <aside class="result-dock__summary" aria-label="分类指标">
            <span class="result-dock__section-label">CLASSIFY METRICS</span>
            <div>
              <strong>分类准确率</strong>
              <p>{{ instruments.eegClassify.metrics.accuracy }}</p>
            </div>
            <div>
              <strong>Cohen's κ</strong>
              <p>{{ instruments.eegClassify.metrics.kappa }}</p>
            </div>
            <div>
              <strong>分类器 / 数据集</strong>
              <p>{{ instruments.eegClassify.metrics.classifier }} · {{ instruments.eegClassify.metrics.dataset }}</p>
            </div>
            <div>
              <strong>测试样本</strong>
              <p>{{ instruments.eegClassify.metrics.nTest }} / {{ instruments.eegClassify.metrics.nTrain + instruments.eegClassify.metrics.nTest }}</p>
            </div>
          </aside>
        </template>
        <template v-else>
          <div class="result-dock__overview-evidence">
            <figure>
              <figcaption>PSD Spectrum <span>功率谱密度 · μV²/Hz</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.spectrum?.option" height="100%" />
              </div>
            </figure>
            <figure>
              <figcaption>Band Power <span>频带功率 · alpha / beta</span></figcaption>
              <div class="result-dock__chart-frame">
                <NeuroLabChart :option="instruments.bands?.option" height="100%" />
              </div>
            </figure>
          </div>

          <aside class="result-dock__summary" aria-label="AI 结果摘要">
            <span class="result-dock__section-label">RESULT SUMMARY</span>
            <div v-for="section in reportSections" :key="section.title">
              <strong>{{ section.title }}</strong>
              <p>{{ section.body }}</p>
            </div>
          </aside>
        </template>
      </section>

      <section
        v-if="!instruments.neuron && !instruments.ml && !instruments.eegClassify"
        v-show="activeTab === 'spectrum'"
        class="result-dock__panel result-dock__spectrum"
        role="tabpanel"
      >
        <figure class="result-dock__spectrogram">
          <figcaption>Spectrogram <span>时频能量分布</span></figcaption>
          <div v-if="instruments.spectrogram?.option" class="result-dock__chart-frame">
            <NeuroLabChart :option="instruments.spectrogram.option" height="100%" />
          </div>
          <p v-else class="result-dock__empty">暂无时频数据</p>
        </figure>
        <figure>
          <figcaption>PSD Spectrum <span>频率响应</span></figcaption>
          <div class="result-dock__chart-frame">
            <NeuroLabChart :option="instruments.spectrum?.option" height="100%" />
          </div>
        </figure>
      </section>

      <section
        v-if="!instruments.neuron && !instruments.ml && !instruments.eegClassify"
        v-show="activeTab === 'spatial'"
        class="result-dock__panel result-dock__spatial"
        role="tabpanel"
      >
        <figure class="result-dock__topography">
          <figcaption>Scalp Topography <span>α 频带空间分布</span></figcaption>
          <div class="result-dock__topography-frame">
            <ScalpTopo :regions="regions" band="alpha" />
          </div>
        </figure>

        <div class="result-dock__region-data">
          <div v-if="selectedRegion" class="result-dock__region-focus">
            <span>{{ selectedRegion.shortLabel }}</span>
            <strong>{{ selectedRegion.displayLabel || selectedRegion.label }}</strong>
            <dl>
              <div><dt>Alpha</dt><dd>{{ selectedRegion.hasData ? selectedRegion.alpha.toFixed(1) : '--' }}</dd></div>
              <div><dt>Beta</dt><dd>{{ selectedRegion.hasData ? selectedRegion.beta.toFixed(1) : '--' }}</dd></div>
            </dl>
          </div>
          <div class="result-dock__region-list" role="list" aria-label="脑区结果">
            <button
              v-for="region in regions"
              :key="region.id"
              type="button"
              :class="{ active: region.id === selectedRegionId }"
              @click="emit('select-region', region.id)"
            >
              <span>{{ region.shortLabel }}</span>
              <strong>{{ region.displayLabel || region.label }}</strong>
              <small>{{ region.hasData ? `α ${region.alpha.toFixed(1)} · β ${region.beta.toFixed(1)}` : '待运行' }}</small>
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="instruments.ml"
        v-show="activeTab === 'ml'"
        class="result-dock__panel result-dock__ml"
        role="tabpanel"
      >
        <figure class="result-dock__ml-boundary">
          <figcaption>Decision Boundary <span>决策边界 + 数据点 + 权重</span></figcaption>
          <div class="result-dock__chart-frame">
            <NeuroLabChart :option="instruments.ml.boundary.option" height="100%" />
          </div>
        </figure>
        <aside class="result-dock__summary" aria-label="模型权重">
          <span class="result-dock__section-label">MODEL WEIGHTS</span>
          <div>
            <strong>迭代轮数</strong>
            <p>{{ instruments.ml.metrics.epochs }} epochs</p>
          </div>
          <div>
            <strong>模型</strong>
            <p>{{ instruments.ml.metrics.model }}</p>
          </div>
          <div>
            <strong>数据集</strong>
            <p>{{ instruments.ml.metrics.dataset }}</p>
          </div>
          <div>
            <strong>收敛状态</strong>
            <p>{{ instruments.ml.metrics.converged ? '已收敛（线性可分）' : '未收敛（线性不可分）' }}</p>
          </div>
        </aside>
      </section>

      <section
        v-if="instruments.eegClassify"
        v-show="activeTab === 'classify'"
        class="result-dock__panel result-dock__classify"
        role="tabpanel"
      >
        <figure class="result-dock__classify-importance">
          <figcaption>Channel Importance <span>alpha / beta 通道权重绝对值</span></figcaption>
          <div class="result-dock__chart-frame">
            <NeuroLabChart :option="instruments.eegClassify.featureImportance.option" height="100%" />
          </div>
        </figure>
        <aside class="result-dock__summary" aria-label="分类器细节">
          <span class="result-dock__section-label">CLASSIFIER DETAILS</span>
          <div>
            <strong>分类器</strong>
            <p>{{ instruments.eegClassify.metrics.classifier }}</p>
          </div>
          <div>
            <strong>训练 / 测试</strong>
            <p>{{ instruments.eegClassify.metrics.nTrain }} / {{ instruments.eegClassify.metrics.nTest }}</p>
          </div>
          <div>
            <strong>通道</strong>
            <p>{{ (instruments.eegClassify.metrics.channelNames || []).join(', ') }}</p>
          </div>
          <div>
            <strong>提示</strong>
            <p>若 alpha 重要度集中在 Oz 通道，说明枕叶节律被有效识别。</p>
          </div>
        </aside>
      </section>

      <section v-show="activeTab === 'ai'" class="result-dock__panel result-dock__ai" role="tabpanel">
        <header>
          <span class="result-dock__section-label">AI EXPERIMENT INTERPRETATION</span>
          <h3>实验解释</h3>
        </header>
        <div class="result-dock__ai-sections">
          <article v-for="(section, index) in reportSections" :key="section.title">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <h4>{{ section.title }}</h4>
              <p>{{ section.body }}</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.result-dock {
  position: relative;
  z-index: 8;
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr);
  height: min(var(--dock-height), 38vh);
  min-height: 42px;
  border-top: 1px solid var(--border-default);
  background: var(--surface-0);
  transition: height var(--dur-2) var(--ease-out-expo);
}

.result-dock.is-resizing {
  transition: none;
  user-select: none;
}

.result-dock__resize-handle {
  position: absolute;
  z-index: 3;
  top: -5px;
  left: 50%;
  width: 72px;
  height: 10px;
  padding: 0;
  transform: translateX(-50%);
  border: 0;
  background: transparent;
  cursor: ns-resize;
}

.result-dock__resize-handle::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 20px;
  width: 32px;
  height: 2px;
  background: var(--border-strong);
}

.result-dock__header {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 36px;
  align-items: center;
  min-width: 0;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-1);
}

.result-dock__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.result-dock__title > span {
  font-size: 12px;
  font-weight: 600;
}

.result-dock__title small,
.result-dock__section-label {
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 8px;
}

.result-dock__title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-dock__tabs {
  display: flex;
  align-self: stretch;
  justify-content: center;
  min-width: 0;
}

.result-dock__tabs button {
  position: relative;
  min-width: 88px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
}

.result-dock__tabs button::after {
  content: '';
  position: absolute;
  right: 14px;
  bottom: 0;
  left: 14px;
  height: 2px;
  background: transparent;
}

.result-dock__tabs button:hover,
.result-dock__tabs button.active {
  color: var(--text-1);
}

.result-dock__tabs button.active::after {
  background: var(--primary);
}

.result-dock__toggle {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-3);
}

.result-dock__toggle:hover {
  color: var(--primary);
}

.result-dock__chevron {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(2px) rotate(225deg);
  transition: transform var(--dur-2) var(--ease-out-expo);
}

.result-dock__chevron.is-expanded {
  transform: translateY(-2px) rotate(45deg);
}

.result-dock.is-collapsed .result-dock__header {
  grid-template-columns: minmax(0, 1fr) 36px;
  border-bottom: 0;
}

.result-dock__content {
  min-height: 0;
  overflow: auto;
}

.result-dock__panel {
  min-width: 0;
  height: 100%;
  min-height: 214px;
}

.result-dock figure {
  display: grid;
  grid-template-rows: 30px minmax(160px, 1fr);
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 10px 14px 12px;
}

.result-dock figcaption {
  align-self: center;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
}

.result-dock figcaption span {
  margin-left: 6px;
  color: var(--text-4);
  font-family: inherit;
  font-size: 8px;
  font-weight: 400;
}

.result-dock__chart-frame {
  min-width: 0;
  min-height: 160px;
}

.result-dock__overview {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(270px, 0.8fr);
}

.result-dock__overview-evidence {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.result-dock__overview-evidence figure + figure,
.result-dock__summary,
.result-dock__spectrum figure + figure,
.result-dock__region-data {
  border-left: 1px solid var(--border-default);
}

.result-dock__summary {
  min-width: 0;
  padding: 16px 18px;
  overflow: auto;
  background: var(--surface-1);
}

.result-dock__summary > div {
  margin-top: 12px;
}

.result-dock__summary strong {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
}

.result-dock__summary p {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.55;
}

.result-dock__spectrum {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
}

.result-dock__empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  margin: 0;
  color: var(--text-4);
  font-size: 11px;
}

.result-dock__spatial {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.4fr);
}

.result-dock__topography-frame {
  width: min(250px, 100%);
  height: 100%;
  min-height: 190px;
  margin: 0 auto;
}

.result-dock__region-data {
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) minmax(0, 1.3fr);
  min-width: 0;
}

.result-dock__region-focus {
  display: grid;
  align-content: center;
  padding: 18px 24px;
  background: var(--surface-1);
}

.result-dock__region-focus > span {
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}

.result-dock__region-focus > strong {
  margin-top: 3px;
  font-size: 16px;
}

.result-dock__region-focus dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 18px 0 0;
  background: var(--border-default);
}

.result-dock__region-focus dl div {
  padding: 10px;
  background: var(--surface-0);
}

.result-dock__region-focus dt {
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 9px;
}

.result-dock__region-focus dd {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 15px;
}

.result-dock__region-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  min-width: 0;
  overflow: auto;
}

.result-dock__region-list button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 3px 8px;
  min-width: 0;
  padding: 14px;
  border: 0;
  border-right: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-3);
  text-align: left;
}

.result-dock__region-list button.active {
  box-shadow: inset 2px 0 0 var(--primary);
  background: color-mix(in srgb, var(--primary) 4%, transparent);
  color: var(--text-1);
}

.result-dock__region-list span {
  grid-row: 1 / 3;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.result-dock__region-list strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-dock__region-list small {
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 9px;
}

.result-dock__ml {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.85fr);
}

.result-dock__ml-boundary figure + aside,
.result-dock__ml aside {
  border-left: 1px solid var(--border-default);
}

.result-dock__classify {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.85fr);
}

.result-dock__classify-importance figure + aside,
.result-dock__classify aside {
  border-left: 1px solid var(--border-default);
}

.result-dock__ai {
  display: grid;
  grid-template-columns: minmax(180px, 0.45fr) minmax(0, 1.55fr);
}

.result-dock__ai > header {
  display: grid;
  align-content: start;
  padding: 20px;
  border-right: 1px solid var(--border-default);
  background: var(--surface-1);
}

.result-dock__ai h3 {
  margin: 5px 0 0;
  font-size: 18px;
}

.result-dock__ai-sections {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
}

.result-dock__ai article {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  padding: 20px;
  border-right: 1px solid var(--border-default);
}

.result-dock__ai article > span {
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 10px;
}

.result-dock__ai h4 {
  margin: 0 0 8px;
  font-size: 13px;
}

.result-dock__ai p {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-line;
}

@media (max-width: 900px) {
  .result-dock__header {
    grid-template-columns: 120px minmax(0, 1fr) 36px;
  }

  .result-dock__title small {
    display: none;
  }

  .result-dock__tabs button {
    min-width: 72px;
    padding-inline: 8px;
  }

  .result-dock__overview,
  .result-dock__spectrum {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 640px) {
  .result-dock.is-expanded {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 90;
    height: 72vh;
    max-height: 720px;
    box-shadow: 0 -12px 32px rgba(21, 28, 48, 0.12);
  }

  .result-dock__resize-handle {
    display: none;
  }

  .result-dock__header {
    grid-template-columns: minmax(0, 1fr) 36px;
    grid-template-rows: 38px 38px;
    padding: 0 8px 0 12px;
  }

  .result-dock__tabs {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: stretch;
    border-top: 1px solid var(--border-default);
  }

  .result-dock__tabs button {
    flex: 1;
    min-width: 0;
    padding: 0 4px;
    font-size: 10px;
  }

  .result-dock__toggle {
    grid-column: 2;
    grid-row: 1;
  }

  .result-dock.is-expanded {
    grid-template-rows: 76px minmax(0, 1fr);
  }

  .result-dock__overview,
  .result-dock__spectrum,
  .result-dock__spatial,
  .result-dock__ml,
  .result-dock__classify,
  .result-dock__ai,
  .result-dock__overview-evidence,
  .result-dock__region-data,
  .result-dock__ai-sections {
    grid-template-columns: 1fr;
    height: auto;
  }

  .result-dock figure {
    grid-template-rows: 28px 160px;
    padding: 8px 12px 10px;
  }

  .result-dock__chart-frame {
    height: 160px;
    min-height: 160px;
  }

  .result-dock__overview-evidence figure + figure,
  .result-dock__summary,
  .result-dock__spectrum figure + figure,
  .result-dock__region-data,
  .result-dock__ai > header {
    border-left: 0;
    border-top: 1px solid var(--border-default);
  }

  .result-dock__summary {
    min-height: 160px;
  }

  .result-dock__region-list {
    grid-template-columns: 1fr;
  }

  .result-dock__ai > header {
    border-right: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .result-dock {
    transition: none;
  }
}
</style>
