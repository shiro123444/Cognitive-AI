<template>
  <section class="edufish-os" @mousemove="trackPointer">
    <aside class="os-rail">
      <header class="brand-block">
        <RouterLink to="/teacher" class="back-link" aria-label="返回教师工作室">‹</RouterLink>
        <div>
          <h1>EDUFISH</h1>
          <p>教学质量</p>
        </div>
        <span class="brand-dot" aria-hidden="true"></span>
      </header>

      <nav class="system-nav" aria-label="EduFish system sections">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="nav-item"
          :class="{ active: item.id === activeSection }"
          @click="activateSection(item.id)"
        >
          <span class="nav-bullet" aria-hidden="true"></span>
          {{ item.label }}
        </button>
      </nav>

      <div class="rail-section course-switcher">
        <div class="section-head">
          <span>COURSE</span>
          <span>{{ selectedCourseIndex }}</span>
        </div>
        <button
          v-for="course in courseOptions"
          :key="course.id"
          type="button"
          class="course-option"
          :class="{ active: course.id === selectedCourseId }"
          @click="selectCourse(course.id)"
        >
          <span>{{ course.name }}</span>
          <small>{{ course.id }} / {{ course.teacher }}</small>
        </button>
      </div>

      <div class="rail-section">
        <div class="section-head">
          <span>MODEL</span>
          <span>v2.7</span>
        </div>
        <strong>EDUFISH ALPHA</strong>
        
        <label class="multi-agent-toggle">
          <input type="checkbox" v-model="enableMultiAgent" />
          <span class="toggle-text">启用多智能体协同分析</span>
        </label>
      </div>

      <div class="rail-section action-stack">
        <div class="section-head">
          <span>ACTIONS</span>
        </div>
        <button
          v-for="action in teacherActions"
          :key="action.id"
          type="button"
          class="action-row"
          :class="{ active: action.id === activeAction, 'agent-action': action.id === 'collect' }"
          :disabled="(action.id === 'run' && running) || (action.id === 'collect' && (collecting || running))"
          @click="handleAction(action.id)"
        >
          <span>{{ action.id === 'collect' && collecting ? 'AGENT 采集中…' : action.label }}</span>
          <small>{{ action.meta }}</small>
        </button>
      </div>

      <div class="rail-section status-grid">
        <div class="section-head">
          <span>STATUS</span>
        </div>
        <dl>
          <div>
            <dt>数据流</dt>
            <dd>{{ statusCounts.dataStreams }}</dd>
          </div>
          <div>
            <dt>最近同步</dt>
            <dd>{{ syncLabel }}</dd>
          </div>
          <div>
            <dt>可信度</dt>
            <dd>{{ pulseStrength }}%</dd>
          </div>
        </dl>
      </div>

      <div class="rail-index" aria-hidden="true">01</div>

      <footer class="rail-footer">
        <strong>EDUFISH OS</strong>
        <span>{{ statusMessage }}</span>
        <i aria-hidden="true"></i>
      </footer>
    </aside>

    <main class="os-stage">
      <div class="stage-watermark" aria-hidden="true">EF</div>
      <section class="pulse-panel" aria-label="AI Pulse">
        <div class="stage-label">
          <h2>AI PULSE</h2>
          <i aria-hidden="true"></i>
        </div>
        <div class="pulse-strength">
          <span>PULSE STRENGTH</span>
          <strong>{{ pulseStrength }}%</strong>
        </div>
        <svg class="pulse-svg" viewBox="0 0 1160 180" preserveAspectRatio="none" aria-hidden="true">
          <path
            v-for="wave in pulseWaves"
            :key="wave.id"
            class="pulse-wave"
            :style="{ animationDelay: `${wave.delay}s`, opacity: wave.opacity }"
            :d="wave.d"
          />
          <circle
            v-for="dot in pulseDots"
            :key="dot.id"
            class="pulse-dot"
            :cx="dot.x"
            :cy="dot.y"
            :r="dot.r"
            :style="{ animationDelay: `${dot.delay}s` }"
          />
        </svg>
      </section>

      <section class="evidence-stage" aria-label="Evidence Graph">
        <div class="graph-label">
          <h2>EVIDENCE GRAPH</h2>
          <i aria-hidden="true"></i>
          <p>{{ currentCourse.name }}<br>追踪反馈、风险与学习影响<br>之间的关系</p>
        </div>

        <svg
          :key="graphAnimationKey"
          class="evidence-svg"
          viewBox="0 0 1160 620"
          role="img"
          aria-label="EduFish evidence graph"
        >
          <g class="edge-layer">
            <line
              v-for="edge in graphEdges"
              :key="edge.id"
              :x1="edge.x1"
              :y1="edge.y1"
              :x2="edge.x2"
              :y2="edge.y2"
              :class="{ dashed: edge.dashed }"
              :style="{ animationDelay: `${edge.growthDelay || 0}s` }"
            />
          </g>

          <g
            v-for="node in graphNodes"
            :key="node.id"
            class="graph-node"
            :class="{ central: node.central, hollow: node.hollow, selected: node.id === selectedNodeId }"
            :style="{ 
              '--growth-delay': `${node.growthDelay || 0}s`,
              '--node-x': `${node.x}px`,
              '--node-y': `${node.y}px`,
              animationDelay: `${(node.x + node.y) % 3}s`
            }"
            tabindex="0"
            @mouseenter="hoverNode = node"
            @mouseleave="hoverNode = null"
            @click="selectNode(node)"
            @keydown.enter.prevent="selectNode(node)"
          >
            <circle class="node-halo" :r="node.central ? 19 : 0"></circle>
            <circle class="node-core" :r="node.central ? 8 : 3"></circle>
            <text class="node-title" x="22" y="4">{{ node.label }}</text>
            <text class="node-score" x="22" y="20">↑ {{ node.score }}%</text>
          </g>
        </svg>

        <aside class="teacher-detail" :class="{ active: activeNode }">
          <span>{{ activeNode ? activeNode.type : 'NODE DETAIL' }}</span>
          <strong>{{ activeNode ? activeNode.label : '点击图谱节点查看证据' }}</strong>
          <p>{{ activeNode ? activeNode.detail : '教师可以从这里判断某个风险来自哪些反馈、成绩或出勤信号。' }}</p>
          <button type="button" @click="handleAction('evidence')">查看证据链 →</button>
        </aside>

        <aside class="prediction-panel" aria-label="Prediction Panel">
          <header>
            <div>
              <h2>PREDICTION</h2>
              <p>教学干预推演</p>
            </div>
            <strong>{{ activeScenario.score }}%</strong>
          </header>
          <div class="scenario-list">
            <button
              v-for="scenario in predictionScenarios"
              :key="scenario.id"
              type="button"
              :class="{ active: scenario.id === activeScenarioId }"
              @click="selectScenario(scenario.id)"
            >
              <span>{{ scenario.name }}</span>
              <small>{{ scenario.delta }}</small>
            </button>
          </div>
          <svg class="prediction-growth" viewBox="0 0 260 96" aria-hidden="true">
            <path class="baseline" d="M 8 74 C 55 70, 85 64, 124 58 S 198 42, 252 30" />
            <path :key="activeScenario.id" class="growth-line" :d="activeScenario.path" />
            <circle
              v-for="point in activeScenario.points"
              :key="point.id"
              class="growth-point"
              :cx="point.x"
              :cy="point.y"
              r="3"
              :style="{ animationDelay: `${point.delay || 0}s` }"
            />
          </svg>
          <p class="prediction-copy">{{ activeScenario.copy }}</p>
          <button type="button" class="report-link" @click="handleAction('report')">
            {{ report ? '查看质量报告 →' : '生成质量报告 →' }}
          </button>
        </aside>

        <aside v-if="activeSection === 'report' || activeAction === 'report'" class="report-panel">
          <span>REPORT</span>
          <strong>{{ report?.title || '质量报告待生成' }}</strong>
          <p>{{ reportPreview }}</p>
          <div class="report-actions">
            <a v-if="report" :href="reportPreviewUrl" target="_blank" rel="noreferrer">在线预览 →</a>
            <a v-if="report" :href="reportPdfDownloadUrl">下载 PDF →</a>
            <button type="button" @click="handleAction('run')">重新分析 →</button>
          </div>
        </aside>

        <div
          v-if="hoverNode"
          class="node-popover"
          :style="{ left: `${pointer.x}px`, top: `${pointer.y}px` }"
        >
          <span>{{ hoverNode.type }}</span>
          <strong>{{ hoverNode.label }}</strong>
          <small>{{ hoverNode.evidence }} 条证据信号</small>
        </div>
      </section>

      <footer class="stage-footer">
        <div class="metric-line">
          <span>NODES</span>
          <strong>{{ footerMetrics.nodes }}</strong>
        </div>
        <div class="metric-divider"></div>
        <div class="metric-line">
          <span>RELATIONS</span>
          <strong>{{ footerMetrics.edges }}</strong>
        </div>
        <div class="metric-divider"></div>
        <div class="metric-line">
          <span>DENSITY</span>
          <strong>{{ footerMetrics.density }}</strong>
        </div>
        <div class="view-mode">
          <span>VIEW</span>
          <strong>KLEIN</strong>
          <i aria-hidden="true"></i>
        </div>
      </footer>
    </main>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import gsap from 'gsap';
import {
  collectAndAnalyze,
  createEduDataset,
  getEduAnalysis,
  getEduAnalysisGraph,
  getEduAnalysisPrediction,
  getEduAnalysisStatus,
  getEduReport,
  getEduReportPdfUrl,
  getEduReportPreviewUrl,
  listEduAnalyses,
  listEduDatasets,
  runEduAnalysis
} from '../api/edu';
import {
  buildEduFishAnalysisRequest,
  createEduFishDemoPayload,
  eduFishCourseOptions,
  fallbackPredictionScenarios,
  mapEduFishGraph,
  normalizePredictionScenarios
} from './edufishStudioState';

const navItems = [
  { id: 'overview', label: '总览' },
  { id: 'graph', label: '证据图谱' },
  { id: 'pulse', label: 'AI PULSE' },
  { id: 'insight', label: '分析洞察' },
  { id: 'prediction', label: '预测推演' },
  { id: 'report', label: '质量报告' }
];

const teacherActions = [
  { id: 'scope', label: '选择分析对象', meta: '课程 / 学期 / 院系' },
  { id: 'collect', label: 'AGENT 采集 →', meta: '全局感知 · 真实数据' },
  { id: 'run', label: 'RUN ANALYSIS →', meta: '执行分析流' },
  { id: 'evidence', label: '查看证据链', meta: '反馈 / 成绩 / 出勤' },
  { id: 'report', label: '生成质量报告', meta: '结论 / 风险 / 建议' }
];

const courseOptions = eduFishCourseOptions;
const selectedCourseId = ref(courseOptions[0].id);
const dataset = ref(null);
const analysis = ref(null);
const graphPayload = ref(null);
const prediction = ref(null);
const report = ref(null);
const jobStatus = ref(null);
const running = ref(false);
const collecting = ref(false);
const collectionSummary = ref(null);
const enableMultiAgent = ref(true);
const error = ref('');
const initialized = ref(false);
const activeSection = ref('overview');
const activeAction = ref('run');
const hoverNode = ref(null);
const selectedNodeId = ref('');
const activeScenarioId = ref(fallbackPredictionScenarios[0]?.id || 'lab-review');
const pointer = ref({ x: 0, y: 0 });
const graphAnimationKey = ref(0);
let pollTimer = null;

const currentCourse = computed(() => (
  courseOptions.find((course) => course.id === selectedCourseId.value) || courseOptions[0]
));

const selectedCourseIndex = computed(() => (
  String(courseOptions.findIndex((course) => course.id === selectedCourseId.value) + 1).padStart(2, '0')
));

const statusMessage = computed(() => {
  if (error.value) return error.value;
  if (running.value) return jobStatus.value?.progress_message || '正在执行课程质量分析';
  if (analysis.value?.status === 'completed') return `${currentCourse.value.name} 分析已完成`;
  if (dataset.value) return '数据集已就绪，等待分析';
  return initialized.value ? '等待数据初始化' : '正在连接 EduFish API';
});

const syncLabel = computed(() => {
  if (running.value) return `${jobStatus.value?.progress || 0}%`;
  if (analysis.value?.updated_at) return '刚刚';
  if (dataset.value?.updated_at) return '已同步';
  return '未同步';
});

const qualityOverview = computed(() => analysis.value?.summary?.quality_overview || {});

const pulseStrength = computed(() => {
  if (prediction.value?.baseline_score) return prediction.value.baseline_score;
  const quality = qualityOverview.value;
  const values = [];
  if (quality.avg_feedback_rating != null) values.push(Number(quality.avg_feedback_rating) / 5 * 100);
  if (quality.avg_grade != null) values.push(Number(quality.avg_grade));
  if (quality.avg_attendance_rate != null) values.push(Number(quality.avg_attendance_rate));
  if (quality.pass_rate != null) values.push(Number(quality.pass_rate));
  if (!values.length) return 78;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
});

const statusCounts = computed(() => {
  const counts = analysis.value?.metrics?.counts || dataset.value?.record_counts || {};
  const used = ['courses', 'teachers', 'students', 'feedback', 'grades', 'attendance']
    .filter((key) => Number(counts[key] || 0) > 0).length;
  return {
    dataStreams: `${used} / 6`
  };
});

const fallbackGraphNodes = [
  { id: 'impact', label: '学习影响', type: 'Outcome', score: 86, evidence: 124, x: 585, y: 315, growthDelay: 0, central: true, detail: '综合学生反馈、成绩趋势和出勤变化后，当前课程整体影响处于较高水平。' },
  { id: 'engagement', label: '学生参与度', type: 'Signal', score: 74, evidence: 42, x: 350, y: 170, growthDelay: 0.14, detail: '课堂互动和课后练习参与稳定，但讨论区参与存在分化。' },
  { id: 'feedback', label: '反馈质量', type: 'Evidence', score: 68, evidence: 37, x: 810, y: 170, growthDelay: 0.28, detail: '学生反馈集中在节奏、案例解释和实验复盘三类主题。' },
  { id: 'peer', label: '同伴互动', type: 'Signal', score: 61, evidence: 18, x: 1080, y: 225, growthDelay: 0.42, hollow: true, detail: '小组协作信号偏弱，建议增加同伴互评和课堂协作任务。' },
  { id: 'clarity', label: '内容清晰度', type: 'Evidence', score: 81, evidence: 56, x: 300, y: 440, growthDelay: 0.56, detail: '多数学生认为概念讲解清楚，但部分抽象章节需要更多示例。' },
  { id: 'material', label: '材料设计', type: 'Artifact', score: 57, evidence: 22, x: 195, y: 545, growthDelay: 0.7, hollow: true, detail: '课件和实验说明存在跳跃，材料结构需要重新分层。' },
  { id: 'assessment', label: '考核匹配度', type: 'Assessment', score: 72, evidence: 48, x: 790, y: 465, growthDelay: 0.84, detail: '作业与课程目标基本一致，期末考核对实践能力覆盖不足。' },
  { id: 'outcome', label: '学习达成', type: 'Outcome', score: 69, evidence: 31, x: 950, y: 575, growthDelay: 0.98, hollow: true, detail: '学习达成处于观察区间，建议追踪低参与学生的后续表现。' }
];

const fallbackGraphEdges = [
  { id: 'e1', x1: 585, y1: 315, x2: 350, y2: 170, growthDelay: 0.16 },
  { id: 'e2', x1: 585, y1: 315, x2: 810, y2: 170, growthDelay: 0.28 },
  { id: 'e3', x1: 810, y1: 170, x2: 1080, y2: 225, growthDelay: 0.4, dashed: true },
  { id: 'e4', x1: 585, y1: 315, x2: 300, y2: 440, growthDelay: 0.52 },
  { id: 'e5', x1: 300, y1: 440, x2: 195, y2: 545, growthDelay: 0.64, dashed: true },
  { id: 'e6', x1: 585, y1: 315, x2: 790, y2: 465, growthDelay: 0.76 },
  { id: 'e7', x1: 790, y1: 465, x2: 950, y2: 575, growthDelay: 0.88, dashed: true }
];

const mappedGraph = computed(() => {
  if (!graphPayload.value?.nodes?.length) {
    return { nodes: fallbackGraphNodes, edges: fallbackGraphEdges };
  }
  return mapEduFishGraph(graphPayload.value);
});

const graphNodes = computed(() => mappedGraph.value.nodes);
const graphEdges = computed(() => mappedGraph.value.edges);

const activeNode = computed(() => (
  hoverNode.value
  || graphNodes.value.find((node) => node.id === selectedNodeId.value)
  || graphNodes.value[0]
  || null
));

const predictionScenarios = computed(() => {
  const normalized = normalizePredictionScenarios(prediction.value || {});
  return normalized.length ? normalized : fallbackPredictionScenarios;
});

const activeScenario = computed(() => (
  predictionScenarios.value.find((scenario) => scenario.id === activeScenarioId.value) || predictionScenarios.value[0]
));

const footerMetrics = computed(() => {
  const nodes = graphNodes.value.length;
  const edges = graphEdges.value.length;
  const density = nodes > 1 ? (edges / (nodes * (nodes - 1))).toFixed(2) : '0.00';
  return { nodes: String(nodes).padStart(2, '0'), edges: String(edges).padStart(2, '0'), density };
});

const reportPreview = computed(() => {
  if (!report.value?.sections?.length) {
    return report.value?.markdown_content?.slice(0, 120) || '点击 RUN ANALYSIS 后，系统会把证据图谱、风险信号和教学建议生成可审查报告。';
  }
  return report.value.sections[0].content.replace(/[#*_>`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
});

const reportPreviewUrl = computed(() => (
  report.value?.report_id ? getEduReportPreviewUrl(report.value.report_id) : '#'
));

const reportPdfDownloadUrl = computed(() => (
  report.value?.report_id ? getEduReportPdfUrl(report.value.report_id) : '#'
));

function onStageParallax(e) {
  const mx = (e.clientX / window.innerWidth - 0.5) * 2;
  const my = (e.clientY / window.innerHeight - 0.5) * 2;
  gsap.to('.stage-watermark', {
    x: mx * -20,
    y: my * -12,
    duration: 2.5,
    ease: 'power2.out'
  });
}

onMounted(() => {
  initializeWorkspace();
  window.addEventListener('mousemove', onStageParallax);

  // Staggered entrance animation
  const tl = gsap.timeline({ delay: 0.15 });
  tl.fromTo('.brand-block',
    { opacity: 0, x: -10 },
    { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out' }
  )
  .fromTo('.nav-item',
    { opacity: 0, x: -6 },
    { opacity: 1, x: 0, duration: 0.45, stagger: 0.035, ease: 'expo.out' },
    '-=0.3'
  )
  .fromTo('.stage-label, .graph-label',
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out' },
    '-=0.2'
  )
  .fromTo('.pulse-strength strong',
    { opacity: 0, scale: 0.8 },
    { opacity: 1, scale: 1, duration: 1, ease: 'expo.out' },
    '-=0.5'
  )
  .fromTo('.stage-watermark',
    { opacity: 0, scale: 0.92 },
    { opacity: 1, scale: 1, duration: 1.8, ease: 'power2.out' },
    '-=0.8'
  )
  .fromTo('.teacher-detail, .prediction-panel',
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out' },
    '-=1'
  );

  // Continuous watermark breathing
  gsap.to('.stage-watermark', {
    scale: 1.035,
    duration: 8,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut'
  });

  // Subtle evidence graph breathing
  gsap.to('.evidence-svg', {
    scale: 1.006,
    duration: 10,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
    transformOrigin: 'center center'
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onStageParallax);
  if (pollTimer) {
    clearTimeout(pollTimer);
  }
});

function trackPointer(event) {
  pointer.value = {
    x: Math.min(event.clientX + 18, window.innerWidth - 220),
    y: Math.min(event.clientY + 18, window.innerHeight - 96)
  };
}

function activateSection(sectionId) {
  activeSection.value = sectionId;
  if (sectionId === 'graph') {
    activeAction.value = 'evidence';
    selectNode(graphNodes.value[0]);
  } else if (sectionId === 'prediction') {
    activeAction.value = 'run';
  } else if (sectionId === 'report') {
    activeAction.value = 'report';
  }
}

async function selectCourse(courseId) {
  if (selectedCourseId.value === courseId && analysis.value) {
    return;
  }
  selectedCourseId.value = courseId;
  activeAction.value = 'scope';
  activeSection.value = 'graph';
  selectedNodeId.value = '';
  analysis.value = null;
  graphPayload.value = null;
  graphAnimationKey.value += 1;
  prediction.value = null;
  report.value = null;
  await hydrateExistingOrRun();
}

function selectNode(node) {
  if (!node) return;
  selectedNodeId.value = node.id;
  activeSection.value = 'graph';
  activeAction.value = 'evidence';
}

function selectScenario(scenarioId) {
  activeScenarioId.value = scenarioId;
  activeSection.value = 'prediction';
}

async function handleAction(actionId) {
  activeAction.value = actionId;
  if (actionId === 'scope') {
    activeSection.value = 'overview';
    return;
  }
  if (actionId === 'collect') {
    await runAgentCollection();
    return;
  }
  if (actionId === 'run') {
    activeSection.value = 'pulse';
    await runCurrentAnalysis({ force: true });
    return;
  }
  if (actionId === 'evidence') {
    activeSection.value = 'graph';
    selectNode(activeNode.value || graphNodes.value[0]);
    return;
  }
  if (actionId === 'report') {
    activeSection.value = 'report';
    if (!report.value && analysis.value?.report_id) {
      report.value = await getEduReport(analysis.value.report_id);
    }
  }
}

async function runAgentCollection() {
  if (collecting.value || running.value) return;
  collecting.value = true;
  running.value = true;
  error.value = '';
  report.value = null;
  activeSection.value = 'pulse';
  try {
    const result = await collectAndAnalyze({
      course_id: currentCourse.value.id,
      time_range_days: 30,
      audience_role: 'school_admin',
    });
    const data = result;
    collectionSummary.value = data.collection_summary || null;

    if (data.status === 'no_data') {
      error.value = data.message || '没有找到学生学习数据';
      return;
    }

    if (data.status === 'queued' && data.job_id) {
      dataset.value = { dataset_id: data.dataset_id };
      jobStatus.value = {
        id: data.job_id,
        progress: 0,
        progress_message: 'Agent 数据采集完成，正在分析'
      };
      await waitForJob(data.job_id);
      await loadAnalysisResources(data.analysis_id, data.report_id);
    }
  } catch (caughtError) {
    error.value = caughtError?.message || 'Agent 数据采集失败';
  } finally {
    collecting.value = false;
    running.value = false;
  }
}

async function initializeWorkspace() {
  try {
    await ensureDataset();
    await hydrateExistingOrRun();
  } catch (caughtError) {
    error.value = caughtError?.message || 'EduFish 初始化失败';
  } finally {
    initialized.value = true;
  }
}

async function ensureDataset() {
  if (dataset.value?.dataset_id) {
    return dataset.value;
  }
  const listed = await listEduDatasets(12);
  const existing = (listed?.datasets || []).find((item) => (
    item.name === 'EduFish 教学质量演示数据集'
    || (item.school_name === '示范大学' && Number(item.record_counts?.courses || 0) >= 2)
  ));
  if (existing) {
    dataset.value = existing;
    return existing;
  }
  dataset.value = await createEduDataset({
    ...createEduFishDemoPayload(),
    dataset_name: 'EduFish 教学质量演示数据集'
  });
  return dataset.value;
}

async function hydrateExistingOrRun() {
  const currentDataset = await ensureDataset();
  const listed = await listEduAnalyses(12);
  const existing = (listed?.analyses || []).find((item) => (
    item.dataset_id === currentDataset.dataset_id
    && item.status === 'completed'
    && item.scope?.course_id === currentCourse.value.id
  ));
  if (existing) {
    await loadAnalysisResources(existing.analysis_id, existing.report_id);
    return;
  }
  await runCurrentAnalysis();
}

async function runCurrentAnalysis() {
  if (running.value) return;
  running.value = true;
  error.value = '';
  report.value = null;
  try {
    const currentDataset = await ensureDataset();
    const request = buildEduFishAnalysisRequest(currentDataset.dataset_id, currentCourse.value);
    const queued = await runEduAnalysis(request);
    jobStatus.value = {
      id: queued.job_id,
      progress: 0,
      progress_message: '分析任务已进入队列'
    };
    await waitForJob(queued.job_id);
    await loadAnalysisResources(queued.analysis_id, queued.report_id);
  } catch (caughtError) {
    error.value = caughtError?.message || '分析任务失败';
  } finally {
    running.value = false;
  }
}

async function waitForJob(jobId, attempt = 0) {
  const status = await getEduAnalysisStatus(jobId);
  jobStatus.value = status;
  if (status.status === 'completed') {
    return status;
  }
  if (status.status === 'failed') {
    throw new Error(status.error_message || 'EduFish analysis failed');
  }
  if (attempt >= 30) {
    throw new Error('分析任务超时，请稍后刷新状态');
  }
  await new Promise((resolve) => {
    pollTimer = setTimeout(resolve, 650);
  });
  return waitForJob(jobId, attempt + 1);
}

async function loadAnalysisResources(analysisId, reportId) {
  const [analysisResult, graphResult, predictionResult] = await Promise.all([
    getEduAnalysis(analysisId),
    getEduAnalysisGraph(analysisId),
    getEduAnalysisPrediction(analysisId)
  ]);
  analysis.value = analysisResult;
  graphPayload.value = graphResult;
  graphAnimationKey.value += 1;
  prediction.value = predictionResult;
  const scenarios = normalizePredictionScenarios(predictionResult);
  if (scenarios.length) {
    activeScenarioId.value = scenarios[0].id;
  }
  const nextReportId = reportId || analysisResult.report_id;
  if (nextReportId) {
    report.value = await getEduReport(nextReportId);
  }
  selectNode(graphNodes.value[0]);
}

const pulseWaves = Array.from({ length: 13 }, (_, index) => {
  const offset = index * 4.2;
  return {
    id: `wave-${index}`,
    delay: index * 0.18,
    opacity: 0.12 + index * 0.018,
    d: [
      `M 0 ${96 + offset}`,
      `C 135 ${72 - offset * 0.35}, 225 ${70 - offset}, 320 ${94 + offset * 0.4}`,
      `S 485 ${120 + offset * 0.15}, 590 ${96 - offset * 0.25}`,
      `S 715 ${52 + offset * 0.3}, 815 ${94 + offset * 0.2}`,
      `S 920 ${126 - offset * 0.1}, 1015 ${96 + offset * 0.05}`,
      `S 1110 ${78 + offset * 0.2}, 1160 ${92 + offset * 0.1}`
    ].join(' ')
  };
});

const pulseDots = [
  { id: 'pd-1', x: 54, y: 96, r: 1.5, delay: 0 },
  { id: 'pd-2', x: 86, y: 96, r: 1.5, delay: 0.2 },
  { id: 'pd-3', x: 116, y: 95, r: 1.5, delay: 0.4 },
  { id: 'pd-4', x: 345, y: 78, r: 2, delay: 0.1 },
  { id: 'pd-5', x: 500, y: 94, r: 2.4, delay: 0.35 },
  { id: 'pd-6', x: 1156, y: 100, r: 2, delay: 0.6 }
];

</script>

<style scoped>
.edufish-os {
  --klein: #0022ff;
  --ink: #06070a;
  --muted: #777b84;
  --hairline: rgba(0, 0, 0, 0.16);
  --faint: rgba(0, 34, 255, 0.12);
  position: relative;
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 78% 16%, rgba(0, 34, 255, 0.035), transparent 24%),
    linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%);
  color: var(--ink);
  font-family: var(--font-mono);
}

.os-stage {
  position: relative;
  z-index: 2;
}

.multi-agent-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  cursor: pointer;
}

.multi-agent-toggle input {
  accent-color: var(--klein);
}

.toggle-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ink);
}


.os-rail {
  position: relative;
  min-height: 100vh;
  padding: 34px 30px 24px;
  border-right: 1px solid var(--hairline);
  background: rgba(255, 255, 255, 0.86);
}

.os-rail > :not(.rail-index) {
  position: relative;
  z-index: 1;
}

.brand-block {
  display: grid;
  grid-template-columns: 18px 1fr 8px;
  align-items: start;
  gap: 12px;
  min-height: 76px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--ink);
  font-size: 20px;
  line-height: 1;
  transition: color 240ms ease, transform 240ms ease;
}

.back-link:hover {
  color: var(--klein);
  transform: translateX(-2px);
}

.brand-block h1 {
  margin: 0 0 4px;
  font-size: 14px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0;
}

.brand-block p,
.rail-footer span,
.rail-section small,
.system-nav,
.stage-footer,
.pulse-strength {
  font-size: 8px;
  line-height: 1.8;
  letter-spacing: 0;
  color: var(--muted);
}

.brand-dot,
.active-status i {
  width: 7px;
  height: 7px;
  margin-top: 3px;
  border-radius: 50%;
  background: var(--klein);
  box-shadow: 0 0 0 0 rgba(0, 34, 255, 0.28);
  animation: bluePing 3.6s ease-in-out infinite;
}

.system-nav {
  display: grid;
  gap: 8px;
  padding: 24px 0 24px;
}

.rail-title {
  margin-bottom: 16px;
  color: var(--ink);
  font-weight: 800;
}

.nav-item {
  display: grid;
  grid-template-columns: 8px 1fr;
  align-items: center;
  gap: 10px;
  min-height: 16px;
  border: 0;
  background: transparent;
  color: #2d3038;
  font: inherit;
  font-weight: 700;
  text-align: left;
  transition: color 240ms ease, transform 240ms ease;
}

.nav-item:hover,
.nav-item.active {
  color: var(--ink);
  transform: translateX(3px);
}

.nav-bullet {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.nav-item.active .nav-bullet {
  background: var(--klein);
}

.rail-section {
  padding: 20px 0;
  border-top: 1px solid var(--hairline);
}

.section-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
  color: #2b2f37;
  font-size: 8px;
  font-weight: 800;
}

.rail-section strong {
  display: block;
  margin-bottom: 5px;
  font-size: 9px;
  font-weight: 900;
  line-height: 1.6;
}

.course-switcher {
  display: grid;
  gap: 7px;
}

.course-option {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 0 8px 12px;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
  color: #242832;
  text-align: left;
  transition: border-color 220ms ease, color 220ms ease, transform 220ms ease;
}

.course-option span {
  font-size: 10px;
  font-weight: 900;
  line-height: 1.45;
}

.course-option small {
  font-size: 8px;
  line-height: 1.45;
}

.course-option:hover,
.course-option.active {
  border-color: var(--klein);
  color: var(--klein);
  transform: translateX(4px);
}

.action-stack {
  padding: 16px 0;
}

.action-row {
  display: grid;
  width: 100%;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.055);
  color: #20242d;
  text-align: left;
  transition: color 220ms ease, transform 220ms ease, border-color 220ms ease;
}

.action-row span {
  font-size: 9px;
  font-weight: 900;
  line-height: 1.5;
}

.action-row small {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.5;
}

.action-row:hover,
.action-row.active {
  color: var(--klein);
  transform: translateX(4px);
  border-color: rgba(0, 34, 255, 0.32);
}

.action-row:disabled {
  cursor: wait;
  opacity: 0.55;
}

.action-row.agent-action {
  border-color: rgba(74, 108, 247, 0.18);
  background: linear-gradient(135deg, rgba(74, 108, 247, 0.04), rgba(0, 34, 255, 0.02));
  border-radius: 3px;
  margin: 2px 0;
  padding: 6px 4px;
}

.action-row.agent-action span {
  background: linear-gradient(90deg, #4a6cf7, var(--klein));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.action-row.agent-action:hover,
.action-row.agent-action.active {
  background: linear-gradient(135deg, rgba(74, 108, 247, 0.08), rgba(0, 34, 255, 0.04));
  border-color: rgba(74, 108, 247, 0.35);
}

.action-row.agent-action:disabled {
  animation: agentPulse 1.8s ease-in-out infinite;
}

@keyframes agentPulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.85; }
}

.status-grid dl {
  display: grid;
  gap: 7px;
}

.status-grid dl div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  font-size: 8px;
}

.status-grid dt {
  color: var(--muted);
}

.status-grid dd {
  margin: 0;
  color: #262a33;
}

.active-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--klein);
}

.active-status i {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0;
}

.rail-index {
  position: absolute;
  left: 28px;
  bottom: 18px;
  z-index: 0;
  color: rgba(0, 0, 0, 0.04);
  font-family: var(--font-display);
  font-size: clamp(6rem, 9vw, 8rem);
  font-weight: 300;
  line-height: 0.8;
  animation: railBreath 8s ease-in-out infinite;
}

@keyframes railBreath {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.rail-footer {
  display: grid;
  gap: 3px;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.rail-footer strong {
  font-size: 8px;
}

.rail-footer i,
.stage-label i,
.graph-label i,
.view-mode i {
  display: block;
  width: 13px;
  height: 2px;
  margin-top: 12px;
  background: var(--klein);
}

.os-stage {
  position: relative;
  min-width: 0;
  min-height: 100vh;
  padding: 36px 38px 46px 32px;
}

.pulse-panel {
  position: relative;
  height: 205px;
}

.stage-label h2,
.graph-label h2 {
  margin: 0;
  font-size: clamp(14px, 1.4vw, 20px);
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.pulse-strength {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: baseline;
  gap: 17px;
}

.pulse-strength strong {
  color: var(--klein);
  font-family: var(--font-display, var(--font-body));
  font-size: clamp(2.5rem, 4vw, 4rem);
  font-weight: 300;
  letter-spacing: -0.03em;
}

.pulse-svg {
  position: absolute;
  left: 30px;
  right: 0;
  top: 55px;
  width: calc(100% - 30px);
  height: 122px;
}

.pulse-wave {
  fill: none;
  stroke: var(--klein);
  stroke-width: 0.8;
  stroke-linecap: round;
  stroke-dasharray: 620 760;
  animation: pulseTravel 8s ease-in-out infinite;
}

.pulse-dot {
  fill: var(--klein);
  transform-origin: center;
  animation: dotBreath 4.5s ease-in-out infinite;
}

.evidence-stage {
  position: relative;
  height: calc(100vh - 300px);
  min-height: 560px;
}

.graph-label {
  position: absolute;
  top: 8px;
  left: 0;
  z-index: 3;
}

.graph-label p {
  margin: 24px 0 0;
  color: var(--muted);
  font-size: 8px;
  line-height: 1.7;
  font-weight: 700;
}

.evidence-svg {
  position: absolute;
  inset: 25px 0 0;
  width: 100%;
  height: calc(100% - 30px);
  overflow: visible;
  will-change: transform;
}

.teacher-detail {
  position: absolute;
  left: 0;
  bottom: 70px;
  display: grid;
  gap: 7px;
  width: 230px;
  padding-left: 16px;
  border-left: 2px solid rgba(0, 34, 255, 0.4);
  opacity: 0.58;
  transition: opacity 220ms ease, transform 220ms ease;
}

.teacher-detail.active {
  opacity: 1;
  transform: translateX(4px);
}

.teacher-detail span,
.prediction-panel header p,
.prediction-copy,
.scenario-list small {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.6;
}

.teacher-detail strong {
  color: var(--ink);
  font-size: 11px;
  line-height: 1.55;
}

.teacher-detail p {
  margin: 0;
  color: #4d525b;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.65;
}

.teacher-detail button {
  width: fit-content;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--klein);
  color: var(--klein);
  font-size: 8px;
  font-weight: 900;
}

.report-link {
  width: fit-content;
  margin-top: 12px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--klein);
  color: var(--klein);
  font-size: 8px;
  font-weight: 900;
}

.report-panel {
  position: absolute;
  right: 324px;
  bottom: 78px;
  display: grid;
  gap: 7px;
  width: 240px;
  padding: 0 0 0 18px;
  border-left: 1px solid rgba(0, 34, 255, 0.32);
  background: rgba(255, 255, 255, 0.78);
  animation: panelIn 420ms var(--ease-out-expo) both;
}

.report-panel span {
  color: var(--muted);
  font-size: 8px;
  font-weight: 800;
  line-height: 1.5;
}

.report-panel strong {
  color: var(--ink);
  font-size: 10px;
  line-height: 1.55;
}

.report-panel p {
  margin: 0;
  color: #4d525b;
  font-family: var(--font-body);
  font-size: 11px;
  line-height: 1.65;
}

.report-panel button {
  width: fit-content;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--klein);
  color: var(--klein);
  font-size: 8px;
  font-weight: 900;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
}

.report-actions a,
.report-actions button {
  width: fit-content;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--klein);
  color: var(--klein);
  font-size: 8px;
  font-weight: 900;
}

.prediction-panel {
  position: absolute;
  right: 0;
  bottom: 70px;
  width: 286px;
  padding: 18px 0 0 20px;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
}

.prediction-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.prediction-panel h2 {
  margin: 0 0 3px;
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
}

.prediction-panel header strong {
  color: var(--klein);
  font-family: var(--font-display, var(--font-body));
  font-size: clamp(2rem, 3.5vw, 3rem);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.03em;
}

.scenario-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  margin-bottom: 14px;
}

.scenario-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  color: #30343d;
  text-align: left;
}

.scenario-list span {
  font-size: 9px;
  font-weight: 900;
}

.scenario-list button.active {
  color: var(--klein);
  border-color: rgba(0, 34, 255, 0.28);
}

.prediction-growth {
  width: 100%;
  height: 96px;
  margin: 0 0 10px;
}

.prediction-growth path {
  fill: none;
  stroke-linecap: round;
}

.baseline {
  stroke: rgba(0, 0, 0, 0.12);
  stroke-width: 1;
  stroke-dasharray: 3 5;
}

.growth-line {
  stroke: var(--klein);
  stroke-width: 1.6;
  stroke-dasharray: 340;
  stroke-dashoffset: 340;
  animation: growthDraw 1.5s var(--ease-out-expo) forwards;
}

.growth-point {
  fill: #fff;
  stroke: var(--klein);
  stroke-width: 1.5;
  opacity: 0;
  animation: pointIn 520ms var(--ease-out-expo) forwards;
}

.prediction-copy {
  margin: 0;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.75;
  color: #4d525b;
}

.edge-layer line {
  stroke: rgba(0, 0, 0, 0.18);
  stroke-width: 1;
  stroke-dasharray: 900;
  stroke-dashoffset: 900;
  transform-box: fill-box;
  transform-origin: center;
  animation: edgeGrow 1.2s var(--ease-out-expo) both;
}

.edge-layer line.dashed {
  stroke-dasharray: 4 5;
  stroke-dashoffset: 0;
  animation:
    edgeGrow 1.2s var(--ease-out-expo) both,
    dashDrift 18s linear infinite;
}

.graph-node {
  cursor: crosshair;
  opacity: 0;
  animation: nodeFade 720ms var(--ease-out-expo) both;
  animation-delay: var(--growth-delay);
}

.graph-node .node-core,
.graph-node .node-halo {
  transform-box: fill-box;
  transform-origin: center;
  animation: nodeCoreGrow 720ms var(--ease-out-expo) both;
  animation-delay: var(--growth-delay);
}

.node-halo {
  fill: rgba(0, 34, 255, 0.05);
  stroke: rgba(0, 34, 255, 0.28);
  stroke-width: 1;
  animation: haloBreath 4.8s ease-in-out infinite;
}

.node-core {
  fill: var(--klein);
  stroke: #ffffff;
  stroke-width: 2;
  transition: r 220ms ease, fill 220ms ease, stroke 220ms ease;
}

.graph-node.hollow .node-core {
  fill: #ffffff;
  stroke: var(--klein);
  stroke-width: 1.5;
}

.graph-node:hover .node-core {
  r: 6;
  fill: var(--klein);
}

.graph-node.selected .node-core {
  r: 7;
  fill: var(--klein);
}

.graph-node.selected .node-title {
  fill: var(--klein);
}

.node-title {
  fill: #20242d;
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
}

.node-score {
  fill: var(--klein);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
}

.node-popover {
  position: fixed;
  z-index: 20;
  display: grid;
  gap: 3px;
  width: 180px;
  padding: 12px 14px;
  border-left: 2px solid var(--klein);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}

.node-popover span,
.node-popover small {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.5;
}

.node-popover strong {
  color: var(--ink);
  font-size: 10px;
}

.stage-footer {
  position: absolute;
  left: 32px;
  right: 38px;
  bottom: 28px;
  display: flex;
  align-items: center;
  gap: 36px;
}

.metric-line {
  display: flex;
  align-items: center;
  gap: 42px;
  color: #30343d;
  font-weight: 800;
}

.metric-line strong,
.view-mode strong {
  color: var(--klein);
  font-weight: 900;
}

.metric-divider {
  width: 1px;
  height: 10px;
  background: var(--hairline);
}

.view-mode {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 28px;
  color: #30343d;
  font-weight: 800;
}

.view-mode i {
  width: 10px;
  margin: 0;
}

@keyframes pulseTravel {
  0% {
    stroke-dashoffset: 480;
    transform: translateX(-18px);
  }
  50% {
    stroke-dashoffset: 60;
    transform: translateX(14px);
  }
  100% {
    stroke-dashoffset: -260;
    transform: translateX(-18px);
  }
}

@keyframes dotBreath {
  0%, 100% {
    opacity: 0.35;
    transform: scale(0.82);
  }
  45% {
    opacity: 1;
    transform: scale(1.16);
  }
}

@keyframes edgeGrow {
  0% {
    opacity: 0;
    stroke-dashoffset: 900;
  }
  100% {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}

@keyframes dashDrift {
  to { stroke-dashoffset: -140; }
}

@keyframes nodeFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes nodeCoreGrow {
  from {
    transform: scale(0.24);
  }
  72% {
    transform: scale(1.08);
  }
  to {
    transform: scale(1);
  }
}

@keyframes haloBreath {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes bluePing {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 34, 255, 0.25); }
  45% { box-shadow: 0 0 0 7px rgba(0, 34, 255, 0); }
}

@keyframes growthDraw {
  to { stroke-dashoffset: 0; }
}

@keyframes pointIn {
  from {
    opacity: 0;
    transform: scale(0.2);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 980px) {
  .edufish-os {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .os-rail {
    min-height: auto;
    padding: 24px;
    border-right: 0;
    border-bottom: 1px solid var(--hairline);
  }

  .system-nav,
  .rail-section,
  .rail-index,
  .rail-footer {
    display: none;
  }

  .os-stage {
    min-height: 760px;
    padding: 28px 20px 70px;
  }

  .pulse-panel {
    height: 170px;
  }

  .evidence-stage {
    min-height: 520px;
  }

  .stage-footer {
    left: 20px;
    right: 20px;
    gap: 16px;
    overflow-x: auto;
  }

  .teacher-detail,
  .prediction-panel,
  .report-panel {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    width: 100%;
    margin-top: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse-wave,
  .pulse-dot,
  .edge-layer line,
  .graph-node,
  .node-halo,
  .brand-dot,
  .active-status i,
  .growth-line,
  .growth-point {
    animation: none;
  }
}

.graph-node {
  transform: translate(var(--node-x), var(--node-y));
  animation: floatNode 6s ease-in-out infinite;
  transform-origin: center;
}

@keyframes floatNode {
  0%, 100% { transform: translate(var(--node-x), var(--node-y)) translateY(0px); }
  50% { transform: translate(var(--node-x), var(--node-y)) translateY(-4px); }
}

/* ══════ Stage Watermark ══════ */
.stage-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: clamp(14rem, 24vw, 22rem);
  font-weight: 200;
  color: rgba(0, 34, 255, 0.04);
  line-height: 1;
  letter-spacing: -0.04em;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  font-family: var(--font-display, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
  will-change: transform;
}
</style>
