<template>
  <div class="agentos-workspace">
    <!-- Top System Header -->
    <header class="os-header">
      <div class="header-left">
        <div class="logo-box">
          <span class="logo-badge">AGENTOS</span>
          <span class="logo-title">Cognitive-AI // 7×24 全天候教育平台</span>
        </div>
      </div>

      <div class="header-center">
        <!-- Preset Selector -->
        <div class="preset-selector">
          <span class="selector-label">ROLE PRESET:</span>
          <select v-model="currentPresetId" @change="onPresetChange" class="select-preset">
            <option value="student-tutor">🎓 启发式 AI 助教 (Student Tutor)</option>
            <option value="teacher-studio">📊 课程与学情工作台 (Teacher Studio)</option>
            <option value="neurolab">🧪 脑与认知实验台 (NeuroLab 3D)</option>
            <option value="autonomous-pilot">⚡ 全自主学习领航员 (Autonomous Pilot)</option>
          </select>
        </div>

        <!-- Autonomous Takeover Switch -->
        <div class="auto-takeover-toggle" :class="{ active: autoTakeover }" @click="autoTakeover = !autoTakeover">
          <span class="toggle-icon">{{ autoTakeover ? '🤖' : '👤' }}</span>
          <span class="toggle-text">{{ autoTakeover ? 'Agent 自动接管中' : '手动协同模式' }}</span>
          <span class="status-light" :class="{ on: autoTakeover }"></span>
        </div>
      </div>

      <div class="header-right">
        <span class="runtime-tag">
          <span class="dot-live"></span>
          CORDIS V4 CORE
        </span>
      </div>
    </header>

    <!-- Main Dynamic Layout -->
    <main class="os-body">
      <!-- Left: Unified Stream Flow (主交互会话流) -->
      <section class="stream-panel">
        <div class="stream-messages" ref="messagesContainer">
          <!-- Initial Welcome Card -->
          <div class="message-card system-welcome">
            <div class="card-tag">SYSTEM INIT</div>
            <h3>欢迎进入 Cognitive-AI 全天候教育 AgentOS</h3>
            <p>
              已切换为<strong>【{{ currentPresetName }}】</strong>模式。无需繁琐的页面跳转与表单填报，在下方提出您的学习或教学目标，Agent 将自主调用知识图谱、3D 脑影像及交互测验卡片协同完成。
            </p>
          </div>

          <!-- Message Nodes -->
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="message-node"
            :class="msg.role"
          >
            <div class="message-avatar">
              {{ msg.role === 'user' ? '🧑' : '🤖' }}
            </div>
            <div class="message-content-wrapper">
              <div class="message-meta">
                <span class="meta-role">{{ msg.role === 'user' ? 'YOU' : 'AGENT' }}</span>
                <span class="meta-time">{{ msg.time }}</span>
              </div>

              <!-- Content text -->
              <div class="message-bubble" v-if="msg.content">
                <p style="white-space: pre-wrap; margin: 0;">{{ msg.content }}</p>
              </div>

              <!-- Tool Execution Badges -->
              <div v-if="msg.toolCalls?.length" class="tool-calls-container">
                <div v-for="tc in msg.toolCalls" :key="tc.id" class="tool-call-row">
                  <span class="tool-icon">⚙️</span>
                  <span class="tool-name">{{ tc.function.name }}</span>
                  <span class="tool-status">✓ 执行完毕已挂载槽位</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Streaming Chunk Indicator -->
          <div v-if="isStreaming" class="message-node assistant streaming">
            <div class="message-avatar">🤖</div>
            <div class="message-content-wrapper">
              <div class="message-meta"><span class="meta-role">AGENT (THINKING)</span></div>
              <div class="message-bubble">
                <p style="white-space: pre-wrap; margin: 0;">{{ currentStreamText }}</p>
                <span class="typing-cursor">▌</span>
              </div>
            </div>
          </div>

          <!-- Autonomous Takeover Status Banner -->
          <div v-if="isExecutingTools" class="autonomous-status-banner">
            <span class="banner-spinner"></span>
            <span>Agent 正在自主执行管线与多模态数据渲染...</span>
          </div>
        </div>

        <!-- Quick Intent Chips -->
        <div class="quick-chips">
          <span class="chips-label">快速意图:</span>
          <button class="chip-btn" @click="sendPrompt('探索海马体在陈述性记忆中的 3D 结构与神经定位')">
            🔬 探索海马体 3D 结构
          </button>
          <button class="chip-btn" @click="sendPrompt('生成海马体与 LTP 机制的概念拓扑知识图谱')">
            🕸️ 知识图谱推演
          </button>
          <button class="chip-btn" @click="sendPrompt('为我出一道关于顺行性遗忘的启发式测验题')">
            📝 启发式测验
          </button>
          <button class="chip-btn" @click="sendPrompt('分析当前班级在第 3 章突触可塑性上的知识盲区')">
            📊 教师学情分析
          </button>
          <button class="chip-btn" @click="sendPrompt('动态定义一个记忆抑制实验的神经电位监控插件')">
            ⚡ 动态定义插件
          </button>
        </div>

        <!-- Input Machine -->
        <div class="stream-input-box">
          <textarea
            v-model="inputPrompt"
            class="input-textarea"
            placeholder="输入您的学习或教学目标（支持自然语言、多步骤任务编排）..."
            rows="2"
            @keydown.enter.prevent="handleEnter"
          ></textarea>
          <button class="btn-send" :disabled="!inputPrompt.trim() || isStreaming" @click="submitPrompt">
            <span>发送</span>
            <span class="btn-subtext">⏎ Enter</span>
          </button>
        </div>
      </section>

      <!-- Right: Dynamic Client Slot Dock (动态工作区槽位系统) -->
      <section class="dock-panel">
        <div class="dock-tab-bar">
          <button
            v-for="tab in availableTabs"
            :key="tab.id"
            class="dock-tab"
            :class="{ active: activeSlotId === tab.id }"
            @click="activeSlotId = tab.id"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-title">{{ tab.name }}</span>
            <span v-if="slotDataMap[tab.id]" class="dot-has-data"></span>
          </button>
        </div>

        <!-- Slot Content Container -->
        <div class="dock-slot-content">
          <!-- 1. Knowledge Graph Slot -->
          <KnowledgeGraphSlot
            v-if="activeSlotId === 'slot:knowledge-graph'"
            :data="slotDataMap['slot:knowledge-graph']"
            @ask-node="(name) => sendPrompt(`请详细深入剖析概念【${name}】的神经生物学机制`)"
          />

          <!-- 2. NeuroLab 3D Slot -->
          <NeuroLabSlot
            v-else-if="activeSlotId === 'slot:neurolab-3d'"
            :data="slotDataMap['slot:neurolab-3d']"
          />

          <!-- 3. Quiz Slot -->
          <QuizSlot
            v-else-if="activeSlotId === 'slot:assignment-quiz'"
            :data="slotDataMap['slot:assignment-quiz']"
            @continue-explore="(topic) => sendPrompt(`针对【${topic}】继续出更深一层的递进思考题`)"
          />

          <!-- 4. Teacher Matrix Slot -->
          <TeacherMatrixSlot
            v-else-if="activeSlotId === 'slot:curriculum-matrix'"
            @auto-generate-lesson="sendPrompt('请自动生成针对第 3 章 Schaffer 侧支与 NMDA 受体的强化补充材料')"
          />

          <!-- 5. Cordis Live Widget Slot -->
          <CordisLiveWidgetSlot
            v-else-if="activeSlotId === 'slot:cordis-live-widget'"
            :data="slotDataMap['slot:cordis-live-widget']"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import KnowledgeGraphSlot from './slots/KnowledgeGraphSlot.vue';
import NeuroLabSlot from './slots/NeuroLabSlot.vue';
import QuizSlot from './slots/QuizSlot.vue';
import TeacherMatrixSlot from './slots/TeacherMatrixSlot.vue';
import CordisLiveWidgetSlot from './slots/CordisLiveWidgetSlot.vue';

const currentPresetId = ref('student-tutor');
const autoTakeover = ref(true);
const inputPrompt = ref('');
const isStreaming = ref(false);
const isExecutingTools = ref(false);
const currentStreamText = ref('');
const messagesContainer = ref(null);

const activeSlotId = ref('slot:knowledge-graph');

const PRESET_NAMES = {
  'student-tutor': '启发式 AI 助教',
  'teacher-studio': '课程与学情工作台',
  'neurolab': '脑与认知实验台',
  'autonomous-pilot': '全自主学习领航员',
};

const currentPresetName = computed(() => PRESET_NAMES[currentPresetId.value] || 'AI 助教');

const availableTabs = [
  { id: 'slot:knowledge-graph', name: '知识图谱', icon: '🕸️' },
  { id: 'slot:neurolab-3d', name: '3D 脑影像', icon: '🧠' },
  { id: 'slot:assignment-quiz', name: '交互测验', icon: '📝' },
  { id: 'slot:curriculum-matrix', name: '学情矩阵', icon: '📊' },
  { id: 'slot:cordis-live-widget', name: '动态微应用', icon: '⚡' },
];

const slotDataMap = ref({
  'slot:knowledge-graph': null,
  'slot:neurolab-3d': null,
  'slot:assignment-quiz': null,
  'slot:curriculum-matrix': null,
  'slot:cordis-live-widget': null,
});

const messages = ref([
  {
    role: 'assistant',
    content: '你好！我是 Cognitive-AI 认知智能体。你可以随时提问概念机制、要求进行 3D 脑区定位或开展启发式探究测试。',
    time: '12:00',
  },
]);

function onPresetChange() {
  if (currentPresetId.value === 'neurolab') {
    activeSlotId.value = 'slot:neurolab-3d';
  } else if (currentPresetId.value === 'teacher-studio') {
    activeSlotId.value = 'slot:curriculum-matrix';
  } else {
    activeSlotId.value = 'slot:knowledge-graph';
  }
}

function handleEnter(e) {
  if (!e.shiftKey) {
    submitPrompt();
  }
}

function sendPrompt(text) {
  inputPrompt.value = text;
  submitPrompt();
}

async function submitPrompt() {
  const text = inputPrompt.value.trim();
  if (!text || isStreaming.value) return;

  messages.value.push({
    role: 'user',
    content: text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  inputPrompt.value = '';
  isStreaming.value = true;
  currentStreamText.value = '';
  isExecutingTools.value = false;

  await nextTick();
  scrollToBottom();

  // Call Runtime API (or simulate full autonomous DSH agent loop if backend offline)
  try {
    const res = await fetch('http://localhost:4000/api/v2/agent/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'current_session',
        userInput: text,
        presetId: currentPresetId.value,
        stream: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const lastEvent = data.events?.filter((e) => e.type === 'assistant/message')?.pop();
      const toolEvents = data.events?.filter((e) => e.type === 'tool/call') || [];

      // Update slots from session state
      if (data.slots) {
        Object.assign(slotDataMap.value, data.slots);
      }

      // Auto switch slot if tool called
      if (text.includes('脑') || text.includes('海马') || text.includes('3D')) {
        activeSlotId.value = 'slot:neurolab-3d';
      } else if (text.includes('图谱') || text.includes('关系')) {
        activeSlotId.value = 'slot:knowledge-graph';
      } else if (text.includes('测验') || text.includes('题')) {
        activeSlotId.value = 'slot:assignment-quiz';
      } else if (text.includes('学情') || text.includes('分析')) {
        activeSlotId.value = 'slot:curriculum-matrix';
      } else if (text.includes('动态') || text.includes('插件')) {
        activeSlotId.value = 'slot:cordis-live-widget';
      }

      messages.value.push({
        role: 'assistant',
        content: lastEvent?.payload?.content || '任务已自主执行完毕，相关可视化与数据已同步挂载至右侧工作区。',
        toolCalls: lastEvent?.payload?.tool_calls || toolEvents.map((te) => ({ function: { name: te.payload.toolName } })),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } else {
      throw new Error('API request failed');
    }
  } catch {
    // Local AgentOS fallback simulation
    await simulateAgentTurn(text);
  } finally {
    isStreaming.value = false;
    isExecutingTools.value = false;
    currentStreamText.value = '';
    await nextTick();
    scrollToBottom();
  }
}

async function simulateAgentTurn(text) {
  isExecutingTools.value = true;
  let reply = '';
  let tool = null;

  if (text.includes('脑') || text.includes('海马') || text.includes('3D')) {
    tool = 'neurolab_visualize_nii';
    slotDataMap.value['slot:neurolab-3d'] = {
      structure: '海马体 (Hippocampus)',
      mniCoordinates: [24, -18, -16],
      description: 'Agent 已自主完成 MNI152 标准脑空间定位，自动高亮内侧颞叶海马切片并加载体素热力图。',
    };
    activeSlotId.value = 'slot:neurolab-3d';
    reply = `已为您完成【海马体 (Hippocampus)】的 3D 神经结构定位。\n海马体作为内侧颞叶的核心脑区，主要通过三突触回路（Perforant Path -> DG -> CA3 -> CA1）参与情景记忆与陈述性记忆的编码。\n右侧工作区已自动挂载横断、冠状与矢状切片。`;
  } else if (text.includes('图谱') || text.includes('关系')) {
    tool = 'knowledge_graph_query';
    activeSlotId.value = 'slot:knowledge-graph';
    reply = `已为您动态抽取并组装【陈述性记忆与海马回路】的概念拓扑图谱。\n您可以直接在右侧图谱中拖拽节点或点击任意概念继续展开。`;
  } else if (text.includes('测验') || text.includes('题')) {
    tool = 'quiz_generate';
    activeSlotId.value = 'slot:assignment-quiz';
    reply = `已为您生成一道关于内侧颞叶记忆机制的启发式测评题，请在右侧卡片选择您的答案。`;
  } else if (text.includes('学情') || text.includes('分析')) {
    activeSlotId.value = 'slot:curriculum-matrix';
    reply = `已为您生成 2026 春季班在第 3 章突触可塑性上的学情分析矩阵。数据显示多数学生在 LTP 诱导机制上需要补充讲解。`;
  } else if (text.includes('动态') || text.includes('插件')) {
    tool = 'cordis_define';
    slotDataMap.value['slot:cordis-live-widget'] = {
      name: '记忆抑制实时监控微应用',
      dynId: 'dyn-mem-inhib',
      purpose: '实时捕获学生在抑制任务中的反应时与脑电 ERP 幅度',
    };
    activeSlotId.value = 'slot:cordis-live-widget';
    reply = `已通过 Cordis 动态沙箱成功编译并挂载微应用【记忆抑制实时监控】！零停机、无副作用残留，已广播至右侧槽位。`;
  } else {
    reply = `【Cognitive-AI AgentOS 回复】：\n已接收目标「${text}」。\n在 Cordis 微内核架构下，所有步骤均已自动化处理，您可以随时切换上方角色 Preset 或开启全自主领航。`;
  }

  messages.value.push({
    role: 'assistant',
    content: reply,
    toolCalls: tool ? [{ id: 'tc1', function: { name: tool } }] : [],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}
</script>

<style scoped>
.agentos-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--rk-bg, #d8d7cd);
  color: var(--rk-ink, #171713);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  overflow: hidden;
}

/* Header */
.os-header {
  height: 52px;
  background: var(--rk-panel, #e4e3dc);
  border-bottom: 2px solid var(--rk-ink, #171713);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
}

.logo-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-badge {
  background: var(--rk-ink, #171713);
  color: var(--rk-yellow, #d9b63f);
  font-weight: 900;
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 2px;
}

.logo-title {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.preset-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selector-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-muted, #6b6a61);
}

.select-preset {
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
  padding: 4px 10px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}

.auto-takeover-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s ease;
}

.auto-takeover-toggle.active {
  background: var(--rk-yellow, #d9b63f);
}

.toggle-text {
  font-size: 11px;
  font-weight: 800;
}

.status-light {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rk-faint, #a8a49a);
  border: 1px solid var(--rk-ink, #171713);
}

.status-light.on {
  background: var(--rk-green, #69b56b);
  box-shadow: 0 0 6px var(--rk-green, #69b56b);
}

.runtime-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 3px 8px;
}

.dot-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rk-green, #69b56b);
}

/* Body */
.os-body {
  flex: 1;
  display: grid;
  grid-template-columns: 460px 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

/* Stream Panel (Left) */
.stream-panel {
  display: flex;
  flex-direction: column;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 4px 4px 0 var(--rk-ink, #171713);
  border-radius: 4px;
  overflow: hidden;
}

.stream-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.system-welcome {
  background: var(--rk-panel, #e4e3dc);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 12px;
  border-radius: 3px;
}

.card-tag {
  font-size: 9px;
  font-weight: 900;
  background: var(--rk-ink, #171713);
  color: #ffffff;
  display: inline-block;
  padding: 1px 5px;
  margin-bottom: 6px;
}

.system-welcome h3 {
  font-size: 13px;
  font-weight: 800;
  margin: 0 0 6px 0;
}

.system-welcome p {
  font-size: 11.5px;
  line-height: 1.5;
  margin: 0;
}

.message-node {
  display: flex;
  gap: 10px;
}

.message-avatar {
  font-size: 18px;
  flex-shrink: 0;
}

.message-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-meta {
  display: flex;
  gap: 8px;
  font-size: 9.5px;
  font-weight: 800;
  color: var(--rk-muted, #6b6a61);
}

.message-bubble {
  background: var(--rk-panel, #e4e3dc);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 3px;
}

.message-node.user .message-bubble {
  background: #f0f9ff;
  border-color: #0284c7;
}

.tool-calls-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.tool-call-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid var(--rk-ink, #171713);
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 2px;
}

.tool-name {
  font-family: 'JetBrains Mono', monospace;
  color: #0284c7;
}

.tool-status {
  color: var(--rk-green, #69b56b);
  margin-left: auto;
}

.autonomous-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--rk-yellow, #d9b63f);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 800;
}

.banner-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid #171713;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  background: var(--rk-panel, #e4e3dc);
  border-top: 1.5px solid var(--rk-ink, #171713);
  align-items: center;
}

.chips-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-muted, #6b6a61);
}

.chip-btn {
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 3px 8px;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}

.chip-btn:hover {
  background: var(--rk-yellow, #d9b63f);
}

.stream-input-box {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: var(--rk-panel, #e4e3dc);
  border-top: 2px solid var(--rk-ink, #171713);
}

.input-textarea {
  flex: 1;
  border: 2px solid var(--rk-ink, #171713);
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  resize: none;
  outline: none;
  background: var(--rk-white, #ffffff);
}

.btn-send {
  background: var(--rk-pink, #d5658a);
  color: #ffffff;
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 3px 3px 0 var(--rk-ink, #171713);
  padding: 0 16px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.btn-send:hover:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-subtext {
  font-size: 8px;
  opacity: 0.8;
}

/* Dock Panel (Right) */
.dock-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dock-tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.dock-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--rk-panel, #e4e3dc);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  position: relative;
}

.dock-tab.active {
  background: var(--rk-white, #ffffff);
  border-bottom-color: var(--rk-white, #ffffff);
  box-shadow: 3px 3px 0 var(--rk-ink, #171713);
}

.dot-has-data {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rk-pink, #d5658a);
}

.dock-slot-content {
  flex: 1;
  overflow: hidden;
}
</style>
