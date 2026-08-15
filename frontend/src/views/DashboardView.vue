<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import gsap from 'gsap';

const mouseX = ref(0);
const mouseY = ref(0);

/* ── Deep In-Page Layer State ── */
const activeLayer = ref('graph'); // 'graph' | 'rag' | 'lab' | 'agent'

/* 1. Knowledge Graph Deep Layer State */
const graphNodes = [
  { id: 'lif', label: 'LIF 神经元动力学', category: '神经计算', formula: 'τ_m (dV/dt) = -(V - V_rest) + R*I(t)', target: 'hebb', desc: '模拟神经元膜电位积分与漏电发放机制' },
  { id: 'hebb', label: 'Hebbian 突触可塑性', category: '学习规则', formula: 'Δw_ij = η * x_i * y_j', target: 'perceptron', desc: '“一起激发的神经元连接在一起”的突触权重更新' },
  { id: 'perceptron', label: '多层感知机 (MLP)', category: '机器学习', formula: 'y = σ(W·x + b)', target: 'eeg', desc: '线性加权求和与非线性激活分类决策模型' },
  { id: 'eeg', label: 'EEG 脑电频段分析', category: '脑机接口', formula: 'PSD(f) = |FFT(x(t))|^2', target: 'memory', desc: 'Alpha (8-13Hz) 与 Beta (14-30Hz) 节律功率谱' },
  { id: 'memory', label: '海马体记忆联想回路', category: '认知科学', formula: 'E = -1/2 ∑∑ w_ij s_i s_j', target: 'lif', desc: '联想记忆与模式补全的吸引子动力学' }
];
const selectedGraphNode = ref(graphNodes[0]);

/* 2. RAG Deep Layer State */
const ragQueries = [
  {
    query: 'LIF 神经元阈值电位与膜电容的关系？',
    sim: '0.942',
    source: '脑机接口导论 · 第 3 章 §3.2',
    chunk: '在漏电积分-发放模型中，膜时间常数 τ_m = R_m * C_m 决定了膜电位随注入电流 I(t) 充放电的响应速度；当电位超过阈值 V_th 时触发脉冲。',
    verified: true
  },
  {
    query: '感知机收敛定理在何种条件下成立？',
    sim: '0.918',
    source: '人工智能导论 · 第 4 章 §4.1',
    chunk: '若训练数据集在特征空间中是严格线性可分的，则经过有限步迭代，感知机学习算法必然收敛于一个能够完全正确分类的超平面。',
    verified: true
  },
  {
    query: '闭眼静息状态下 EEG 哪种脑电波功率显著增强？',
    sim: '0.955',
    source: '脑与认知科学导论 · 第 6 章 §6.3',
    chunk: '枕叶后头部在闭眼清醒且处于放松状态时，Alpha 节律 (8~13 Hz) 功率谱密度出现显著峰值（枕叶 Alpha 阻断效应）。',
    verified: true
  }
];
const selectedRagQuery = ref(ragQueries[0]);

/* 3. NeuroLab Interactive In-Page Simulation */
const lifCurrent = ref(28); // Injection current pA
const lifThreshold = ref(-50); // Threshold mV
const isSimulatingSpikes = ref(true);
const stimulusPulseActive = ref(false);

const lifSimulationData = computed(() => {
  const dt = 0.5; // ms
  const totalSteps = 60;
  const vRest = -70;
  const vReset = -75;
  const tau = 10; // ms
  const r = 1.0;
  let v = vRest;
  const points = [];
  let spikeCount = 0;

  for (let i = 0; i < totalSteps; i++) {
    const time = i * dt;
    const inj = stimulusPulseActive.value ? lifCurrent.value * 2.2 : lifCurrent.value;
    const dv = (-(v - vRest) + r * (inj * 0.8)) / tau * dt;
    v += dv;

    if (v >= lifThreshold.value) {
      points.push({ x: (i / totalSteps) * 100, y: 10, isSpike: true }); // top spike
      v = vReset;
      spikeCount++;
    } else {
      // Map mV (-80 to -40) to Y% (90 to 20)
      const normY = 90 - ((v - (-80)) / 40) * 70;
      points.push({ x: (i / totalSteps) * 100, y: Math.max(15, Math.min(85, normY)), isSpike: false });
    }
  }

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  return {
    pathD,
    spikeFreq: Math.round((spikeCount / (totalSteps * dt / 1000))),
    points
  };
});

function triggerStimulusPulse() {
  stimulusPulseActive.value = true;
  setTimeout(() => {
    stimulusPulseActive.value = false;
  }, 240);
}

/* 4. Multi-Agent Studio Telemetry State */
const agentList = [
  { name: 'Tutor Agent', role: '知识问答与苏格拉底式引导', status: 'ACTIVE', color: 'green', latency: '42ms' },
  { name: 'KG Reasoner', role: '概念拓扑提取与跨章关联检索', status: 'READY', color: 'cyan', latency: '18ms' },
  { name: 'Pedagogical Simulator', role: '学习风险评估与干预推演', status: 'LIVE', color: 'yellow', latency: '120ms' },
  { name: 'Review Agent', role: '教师材料自动分块与抽取', status: 'IDLE', color: 'muted', latency: '0ms' }
];

function selectLayer(layerId) {
  activeLayer.value = layerId;
  gsap.fromTo('.layer-workspace',
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.2, ease: 'steps(2,end)' }
  );
}

function onMouseMove(e) {
  mouseX.value = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY.value = (e.clientY / window.innerHeight - 0.5) * 2;

  gsap.to('.parallax-fast', { x: mouseX.value * 20, y: mouseY.value * 20, duration: 0.8, ease: 'power2.out' });
  gsap.to('.parallax-slow', { x: mouseX.value * -12, y: mouseY.value * -12, duration: 1.2, ease: 'power2.out' });
  gsap.to('.brain-image', {
    x: mouseX.value * 10,
    y: mouseY.value * 10,
    rotationY: mouseX.value * 5,
    rotationX: -mouseY.value * 5,
    duration: 0.8,
    ease: 'power2.out'
  });
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);

  const tl = gsap.timeline();
  tl.fromTo('.hero-tag',
    { opacity: 0, x: -12 },
    { opacity: 1, x: 0, duration: 0.4, ease: 'steps(2,end)' }
  )
  .fromTo('.hero-title-line',
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'steps(2,end)' },
    '-=0.2'
  )
  .fromTo('.hero-desc',
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.3, ease: 'steps(2,end)' },
    '-=0.2'
  )
  .fromTo('.action-btn-group',
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.3 },
    '-=0.2'
  )
  .fromTo('.brain-image',
    { opacity: 0, scale: 0.96 },
    { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' },
    '-=0.3'
  );
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
});
</script>

<template>
  <div class="dashboard">
    <!-- Main Hero Container -->
    <main class="hero-container container">
      <!-- Left Content -->
      <div class="hero-content">
        <div class="side-indicator mono">
          <span class="num">01</span>
          <div class="line"></div>
          <span class="num">04</span>
        </div>

        <div class="content-wrapper">
          <div class="hero-tag">
            <span class="sq sq-yellow"></span>
            <span class="tag-text mono">AI × NEUROSCIENCE × COGNITION</span>
          </div>

          <h1 class="hero-title display">
            <span class="hero-title-line">AI 与脑认知科学</span>
            <span class="hero-title-sub">课程智能体教学平台</span>
          </h1>

          <div class="hero-separator"></div>

          <p class="hero-desc">
            面向人工智能与脑认知导论的知识图谱驱动、RAG 增强与多 Agent 协作工作台。
          </p>

          <div class="action-btn-group">
            <RouterLink to="/courses/ai-intro" class="btn btn-primary">
              进入课程学习 <span class="arrow">→</span>
            </RouterLink>
            <RouterLink to="/lab" class="btn btn-yellow">
              NeuroLab 实验台
            </RouterLink>
            <RouterLink to="/tutor" class="btn btn-cyan">
              AI 助教问答
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Right Visual (Image & Geometry) -->
      <div class="hero-visual">
        <div class="visual-decor">
          <div class="pixel-square-decor d1 parallax-fast"></div>
          <div class="pixel-square-decor d2 parallax-slow"></div>
          <div class="pixel-square-decor d3 parallax-fast"></div>

          <svg class="connecting-lines" width="100%" height="100%" preserveAspectRatio="none">
            <line x1="20%" y1="60%" x2="40%" y2="20%" stroke="var(--rk-ink)" stroke-width="1.5" stroke-dasharray="4 4" />
            <line x1="40%" y1="20%" x2="80%" y2="30%" stroke="var(--rk-ink)" stroke-width="1.5" />
            <line x1="60%" y1="80%" x2="80%" y2="30%" stroke="var(--rk-ink)" stroke-width="1.5" stroke-dasharray="4 4" />
            <line x1="20%" y1="60%" x2="60%" y2="80%" stroke="var(--rk-ink)" stroke-width="1.5" />
          </svg>

          <!-- Nodes -->
          <div class="node n1 parallax-slow"></div>
          <div class="node n2 parallax-fast"></div>
          <div class="node n3 parallax-slow"></div>
          <div class="node n4 parallax-fast"></div>
        </div>

        <!-- Interactive Brain Image Wrapper -->
        <div class="scene-wrapper">
          <img src="/brain-hero.png" alt="Brain Geometry" class="brain-image" draggable="false" />
        </div>

        <div class="floating-badge t1 mono parallax-text">
          <span class="sq on" /> NEURAL DYNAMICS
        </div>
        <div class="floating-badge t2 mono parallax-text">
          <span class="sq sq-cyan" /> MULTI-AGENT
        </div>
        <div class="floating-badge t3 mono parallax-text">
          <span class="sq sq-pink" /> RAG REASONING
        </div>
      </div>
    </main>

    <!-- ══════ Deep In-Page Interactive Section (同页面加深层次交互) ══════ -->
    <section class="deep-interactive-section container">
      <!-- Layer Selector Tabs -->
      <div class="layer-tabs-strip">
        <div class="layer-tabs-header">
          <span class="layer-kicker mono">
            <span class="sq sq-yellow" /> WORKBENCH EXPLORATION DOCK
          </span>
          <h2 class="layer-title">核心体系同页交互探索</h2>
        </div>

        <div class="layer-tabs-nav" role="tablist">
          <button
            type="button"
            class="layer-tab-btn"
            :class="{ active: activeLayer === 'graph' }"
            @click="selectLayer('graph')"
          >
            <span class="tab-index mono">01</span>
            <span class="tab-name">知识图谱拓扑</span>
          </button>
          <button
            type="button"
            class="layer-tab-btn"
            :class="{ active: activeLayer === 'rag' }"
            @click="selectLayer('rag')"
          >
            <span class="tab-index mono">02</span>
            <span class="tab-name">RAG 溯源推理</span>
          </button>
          <button
            type="button"
            class="layer-tab-btn"
            :class="{ active: activeLayer === 'lab' }"
            @click="selectLayer('lab')"
          >
            <span class="tab-index mono">03</span>
            <span class="tab-name">NeuroLab 动力学</span>
          </button>
          <button
            type="button"
            class="layer-tab-btn"
            :class="{ active: activeLayer === 'agent' }"
            @click="selectLayer('agent')"
          >
            <span class="tab-index mono">04</span>
            <span class="tab-name">智能体推演协同</span>
          </button>
        </div>
      </div>

      <!-- Deep Workspace Container -->
      <div class="layer-workspace">
        <!-- ── Layer 01: Knowledge Graph Trace ── -->
        <div v-if="activeLayer === 'graph'" class="layer-card">
          <div class="layer-left">
            <div class="layer-card-head">
              <span class="sq sq-yellow" />
              <strong>概念节点拓扑网络</strong>
              <small class="mono">D3.JS / TOPOLOGY</small>
            </div>
            <p class="layer-card-desc">
              点击下方概念节点，直接在当前页面查看神经动力学、突触学习与认知计算的关联推理与数学形式化表述：
            </p>

            <div class="concept-node-grid">
              <button
                v-for="node in graphNodes"
                :key="node.id"
                type="button"
                class="concept-node-btn"
                :class="{ selected: selectedGraphNode.id === node.id }"
                @click="selectedGraphNode = node"
              >
                <span class="node-chip mono">{{ node.category }}</span>
                <strong>{{ node.label }}</strong>
              </button>
            </div>

            <div class="layer-actions">
              <RouterLink to="/courses/ai-intro/graph" class="btn btn-yellow btn-sm">
                查看全景知识图谱 <span class="arrow">→</span>
              </RouterLink>
            </div>
          </div>

          <div class="layer-right">
            <div class="inspector-box">
              <div class="inspector-title mono">
                <span>CONCEPT INSPECTOR</span>
                <span class="sq sq-cyan" />
              </div>
              <h4 class="inspector-name">{{ selectedGraphNode.label }}</h4>
              <p class="inspector-desc">{{ selectedGraphNode.desc }}</p>
              <div class="inspector-formula mono">
                <span class="formula-label">动力学 / 数学表述:</span>
                <code>{{ selectedGraphNode.formula }}</code>
              </div>
              <div class="inspector-meta mono">
                <span>领域: {{ selectedGraphNode.category }}</span>
                <span>目标关联: {{ selectedGraphNode.target }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Layer 02: RAG Provenance ── -->
        <div v-else-if="activeLayer === 'rag'" class="layer-card">
          <div class="layer-left">
            <div class="layer-card-head">
              <span class="sq sq-pink" />
              <strong>教学材料向量检索与证据链溯源</strong>
              <small class="mono">RAG RETRIEVAL · CITATION</small>
            </div>
            <p class="layer-card-desc">
              选择学术探究问题，在当前页面直接观察向量检索匹配度、教材原文章节与严格溯源引用段落：
            </p>

            <div class="rag-query-list">
              <button
                v-for="item in ragQueries"
                :key="item.query"
                type="button"
                class="rag-query-btn"
                :class="{ selected: selectedRagQuery.query === item.query }"
                @click="selectedRagQuery = item"
              >
                <span class="sq sq-pink" />
                <span class="query-text">{{ item.query }}</span>
                <span class="sim-badge mono">Sim: {{ item.sim }}</span>
              </button>
            </div>

            <div class="layer-actions">
              <RouterLink to="/tutor" class="btn btn-primary btn-sm">
                进入 AI 助教深入对话 <span class="arrow">→</span>
              </RouterLink>
            </div>
          </div>

          <div class="layer-right">
            <div class="inspector-box">
              <div class="inspector-title mono">
                <span>EVIDENCE CHUNK & PROVENANCE</span>
                <span class="badge-verified mono">VERIFIED CITATION</span>
              </div>
              <div class="source-tag mono">
                <span class="sq sq-green" /> 来源: {{ selectedRagQuery.source }}
              </div>
              <blockquote class="citation-quote">
                “{{ selectedRagQuery.chunk }}”
              </blockquote>
              <div class="inspector-meta mono">
                <span>向量余弦相似度: {{ selectedRagQuery.sim }}</span>
                <span>状态: 真实教材验证通过</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Layer 03: NeuroLab Simulation ── -->
        <div v-else-if="activeLayer === 'lab'" class="layer-card">
          <div class="layer-left">
            <div class="layer-card-head">
              <span class="sq sq-cyan" />
              <strong>LIF 神经元动力学实时仿真</strong>
              <small class="mono">LIF DYNAMICS · SPIKE WAVE</small>
            </div>
            <p class="layer-card-desc">
              直接在当前仪表盘调节注入电流 $I_{inj}$ 与阈值电位 $V_{th}$，实时观测膜电位充放电与动作电位脉冲序列发放：
            </p>

            <div class="sim-controls">
              <label class="sim-control-row">
                <span class="mono">注入电流 (I_inj): <strong>{{ lifCurrent }} pA</strong></span>
                <input v-model.number="lifCurrent" type="range" min="5" max="45" step="1" class="range-slider" />
              </label>

              <label class="sim-control-row">
                <span class="mono">发放阈值 (V_th): <strong>{{ lifThreshold }} mV</strong></span>
                <input v-model.number="lifThreshold" type="range" min="-60" max="-40" step="1" class="range-slider" />
              </label>
            </div>

            <div class="layer-actions">
              <button type="button" class="btn btn-cyan btn-sm" @click="triggerStimulusPulse">
                ⚡ 触发刺激脉冲
              </button>
              <RouterLink to="/lab" class="btn btn-yellow btn-sm">
                进入 NeuroLab 完整实验台 <span class="arrow">→</span>
              </RouterLink>
            </div>
          </div>

          <div class="layer-right">
            <div class="inspector-box sim-canvas-box">
              <div class="inspector-title mono">
                <span>LIVE POTENTIAL WAVE V(t)</span>
                <span class="mono freq-tag">Spike Freq: {{ lifSimulationData.spikeFreq }} Hz</span>
              </div>

              <!-- Real-time SVG Waveform -->
              <div class="wave-screen">
                <svg class="wave-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <!-- Grid lines -->
                  <line x1="0" y1="25" x2="100" y2="25" stroke="#c7c5bc" stroke-width="0.5" stroke-dasharray="2 2" />
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#c7c5bc" stroke-width="0.5" stroke-dasharray="2 2" />
                  <line x1="0" y1="75" x2="100" y2="75" stroke="#c7c5bc" stroke-width="0.5" stroke-dasharray="2 2" />

                  <!-- Threshold marker -->
                  <line
                    x1="0"
                    :y1="90 - ((lifThreshold - (-80)) / 40) * 70"
                    x2="100"
                    :y2="90 - ((lifThreshold - (-80)) / 40) * 70"
                    stroke="var(--rk-orange)"
                    stroke-width="1"
                    stroke-dasharray="2 2"
                  />

                  <!-- Wave Path -->
                  <path
                    :d="lifSimulationData.pathD"
                    fill="none"
                    stroke="var(--rk-ink)"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>

              <div class="inspector-meta mono">
                <span>静息电位: -70 mV</span>
                <span>重置电位: -75 mV</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Layer 04: Multi-Agent & Teacher Studio ── -->
        <div v-else-if="activeLayer === 'agent'" class="layer-card">
          <div class="layer-left">
            <div class="layer-card-head">
              <span class="sq sq-green" />
              <strong>多智能体协同编排与教学质量分析</strong>
              <small class="mono">MULTI-AGENT PIPELINE</small>
            </div>
            <p class="layer-card-desc">
              查看教学智能体集群运行状态，支持概念自动提取、课堂问答干预与学生学情风险推演：
            </p>

            <div class="agent-grid">
              <div v-for="agent in agentList" :key="agent.name" class="agent-row">
                <div class="agent-info">
                  <span class="sq" :class="`sq-${agent.color}`" />
                  <strong>{{ agent.name }}</strong>
                  <span class="agent-role">{{ agent.role }}</span>
                </div>
                <div class="agent-meta mono">
                  <span class="status-chip">{{ agent.status }}</span>
                  <span class="latency-chip">{{ agent.latency }}</span>
                </div>
              </div>
            </div>

            <div class="layer-actions">
              <RouterLink to="/teacher" class="btn btn-yellow btn-sm">
                进入教师工作室 <span class="arrow">→</span>
              </RouterLink>
              <RouterLink to="/teacher/edufish" class="btn btn-primary btn-sm">
                EduFish 教学推演分析 <span class="arrow">→</span>
              </RouterLink>
            </div>
          </div>

          <div class="layer-right">
            <div class="inspector-box">
              <div class="inspector-title mono">
                <span>ORCHESTRATION TOPOLOGY</span>
                <span class="sq on" />
              </div>
              <div class="orchestration-preview mono">
                <div class="orch-step">1. 学生交互 / 提问流输入</div>
                <div class="orch-arrow">↓</div>
                <div class="orch-step">2. RAG 知识图谱检索 & 概念判定</div>
                <div class="orch-arrow">↓</div>
                <div class="orch-step">3. 启发式助教引导 + 学习风险评估</div>
              </div>
              <div class="inspector-meta mono">
                <span>编排协议: Protocol v1alpha1</span>
                <span>协同模式: Auto Supervisor</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--rk-bg);
  display: flex;
  flex-direction: column;
  padding-bottom: 48px;
}

/* ══════ Hero ══════ */
.hero-container {
  display: grid;
  grid-template-columns: 48% 52%;
  min-height: calc(100vh - var(--nav-height) - 340px);
  position: relative;
  align-items: center;
}

.hero-content {
  display: flex;
  position: relative;
  padding: 36px 0 24px;
  z-index: 10;
}

.side-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28px;
  margin-right: 24px;
  color: var(--rk-muted);
  font-size: 10.5px;
  font-weight: 800;
}

.side-indicator .line {
  width: 2px;
  flex: 1;
  background: var(--rk-ink);
  margin: 10px 0;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding: 3px 8px;
  border: 1.5px solid var(--rk-ink);
  background: var(--rk-panel);
  box-shadow: 1px 1px 0 var(--rk-ink);
  width: fit-content;
}

.hero-tag .tag-text {
  color: var(--rk-ink);
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: 11px;
}

.hero-title {
  font-size: clamp(2.2rem, 3.8vw, 3.4rem);
  color: var(--rk-ink);
  margin-bottom: 14px;
  line-height: 1.05;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-title-sub {
  font-size: clamp(1.1rem, 1.8vw, 1.6rem);
  font-weight: 700;
  color: var(--rk-muted);
  letter-spacing: 0.02em;
}

.hero-separator {
  width: 44px;
  height: 3.5px;
  background: var(--rk-yellow);
  border: 1.5px solid var(--rk-ink);
  margin-bottom: 16px;
}

.hero-desc {
  font-size: 14px;
  color: var(--rk-ink);
  line-height: 1.65;
  max-width: 460px;
  margin-bottom: 24px;
}

.action-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ══════ Visual Decor & Brain ══════ */
.hero-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}

.visual-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pixel-square-decor {
  position: absolute;
  border: 2px solid var(--rk-ink);
}

.pixel-square-decor.d1 {
  top: 12%;
  right: 14%;
  width: 24px;
  height: 24px;
  background: var(--rk-yellow);
}

.pixel-square-decor.d2 {
  bottom: 18%;
  left: 10%;
  width: 18px;
  height: 18px;
  background: var(--rk-pink);
}

.pixel-square-decor.d3 {
  top: 42%;
  left: 18%;
  width: 12px;
  height: 12px;
  background: var(--rk-cyan);
}

.node {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--rk-ink);
  border: 1.5px solid var(--rk-white);
}

.node.n1 { top: 20%; left: 40%; }
.node.n2 { top: 30%; right: 20%; }
.node.n3 { bottom: 20%; left: 60%; }
.node.n4 { bottom: 40%; left: 20%; }

.scene-wrapper {
  position: relative;
  z-index: 2;
  width: min(380px, 85%);
  display: flex;
  justify-content: center;
}

.brain-image {
  width: 100%;
  height: auto;
  filter: drop-shadow(4px 4px 0 var(--rk-ink));
  user-select: none;
}

.floating-badge {
  position: absolute;
  z-index: 3;
  padding: 3px 8px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1.5px 1.5px 0 var(--rk-ink);
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 5px;
}

.floating-badge.t1 { top: 10%; left: 10%; }
.floating-badge.t2 { top: 48%; right: 4%; }
.floating-badge.t3 { bottom: 10%; left: 26%; }

/* ══════ Deep Interactive In-Page Layer Section ══════ */
.deep-interactive-section {
  margin-top: 24px;
  display: grid;
  gap: 16px;
}

.layer-tabs-strip {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: 2px solid var(--rk-ink);
  padding-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.layer-kicker {
  font-size: 10.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-muted);
}

.layer-title {
  font-size: 18px;
  font-weight: 900;
  color: var(--rk-ink);
  margin: 4px 0 0;
}

.layer-tabs-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.layer-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow-sm);
  color: var(--rk-ink);
  font-weight: 800;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.05s;
}

.layer-tab-btn:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--rk-ink);
  background: var(--rk-panel);
}

.layer-tab-btn.active {
  background: var(--rk-yellow);
  box-shadow: none;
  transform: translate(2px, 2px);
}

.tab-index {
  font-size: 10px;
  color: var(--rk-muted);
}

/* ══════ Layer Workspace ══════ */
.layer-workspace {
  background: var(--rk-panel);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow);
  padding: 24px;
}

.layer-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

.layer-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.layer-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 900;
}

.layer-card-head small {
  margin-left: auto;
  font-size: 10px;
  color: var(--rk-muted);
}

.layer-card-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--rk-ink);
  margin: 0;
}

.layer-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

/* ── Concept Nodes ── */
.concept-node-grid {
  display: grid;
  gap: 8px;
}

.concept-node-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  cursor: pointer;
  text-align: left;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--rk-ink);
  transition: all 0.05s;
}

.concept-node-btn:hover {
  background: var(--rk-panel);
}

.concept-node-btn.selected {
  background: var(--rk-yellow);
  border-width: 2px;
}

.node-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
}

/* ── Inspector Box ── */
.inspector-box {
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow-sm);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inspector-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-muted);
  border-bottom: 1.5px solid var(--rk-ink);
  padding-bottom: 6px;
}

.inspector-name {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: var(--rk-ink);
}

.inspector-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--rk-ink);
}

.inspector-formula {
  background: var(--rk-panel);
  border: 1.5px solid var(--rk-ink);
  padding: 10px;
  display: grid;
  gap: 4px;
}

.formula-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--rk-muted);
}

.inspector-formula code {
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
}

.inspector-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--rk-muted);
  border-top: 1px solid var(--rk-ink);
  padding-top: 8px;
}

/* ── RAG Queries ── */
.rag-query-list {
  display: grid;
  gap: 8px;
}

.rag-query-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
  transition: all 0.05s;
}

.rag-query-btn:hover {
  background: var(--rk-panel);
}

.rag-query-btn.selected {
  background: rgba(213, 101, 138, 0.15);
  border-color: var(--rk-pink);
  border-width: 2px;
}

.query-text {
  flex: 1;
}

.sim-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
}

.badge-verified {
  padding: 2px 6px;
  background: var(--rk-green);
  border: 1px solid var(--rk-ink);
  font-size: 9px;
  font-weight: 800;
  color: var(--rk-ink);
}

.source-tag {
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.citation-quote {
  margin: 0;
  padding: 10px 14px;
  background: var(--rk-panel);
  border-left: 4px solid var(--rk-pink);
  border-top: 1px solid var(--rk-ink);
  border-right: 1px solid var(--rk-ink);
  border-bottom: 1px solid var(--rk-ink);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--rk-ink);
  font-style: italic;
}

/* ── Simulation Controls ── */
.sim-controls {
  display: grid;
  gap: 12px;
  background: var(--rk-white);
  padding: 14px;
  border: 1.5px solid var(--rk-ink);
}

.sim-control-row {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
}

.range-slider {
  width: 100%;
  accent-color: var(--rk-cyan);
  cursor: pointer;
}

.sim-canvas-box {
  background: var(--rk-panel);
}

.freq-tag {
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-ink);
}

.wave-screen {
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  height: 160px;
  position: relative;
  overflow: hidden;
}

.wave-svg {
  width: 100%;
  height: 100%;
}

/* ── Multi-Agent List ── */
.agent-grid {
  display: grid;
  gap: 8px;
}

.agent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 800;
}

.agent-role {
  font-size: 11px;
  color: var(--rk-muted);
  font-weight: normal;
}

.agent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
}

.status-chip {
  padding: 2px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
}

.latency-chip {
  padding: 2px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
  color: var(--rk-muted);
}

.orchestration-preview {
  display: grid;
  gap: 8px;
  padding: 12px;
  background: var(--rk-panel);
  border: 1.5px solid var(--rk-ink);
  font-size: 11.5px;
  font-weight: 800;
}

.orch-step {
  padding: 6px 10px;
  background: var(--rk-white);
  border: 1px solid var(--rk-ink);
}

.orch-arrow {
  text-align: center;
  color: var(--rk-muted);
  font-size: 14px;
}

@media (max-width: 960px) {
  .hero-container {
    grid-template-columns: 1fr;
  }
  .layer-card {
    grid-template-columns: 1fr;
  }
}
</style>
