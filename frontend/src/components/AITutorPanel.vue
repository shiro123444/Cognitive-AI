<template>
  <section class="tutor-v2" :class="{ 'is-streaming': isStreaming }">
    <div class="tutor-stage">
      <div class="tutor-topline">
        <span class="top-dot" aria-hidden="true"></span>
        <span>AI 助教 · 研究伙伴</span>
      </div>

      <main class="tutor-workspace">
        <section class="tutor-command">
          <header class="hero-lockup">
            <h1 class="tutor-title">
              <span>AI 助教</span>
              <span>课程问答</span>
            </h1>
            <p class="tutor-subtitle">
              COURSE RAG<br>
              CITED ANSWERS<br>
              GRAPH CONTEXT
            </p>
          </header>

          <form class="composer" @submit.prevent="onSubmit">
            <span class="prompt-mark" aria-hidden="true">›</span>
            <textarea
              ref="inputRef"
              v-model="draft"
              class="composer-input"
              rows="2"
              :placeholder="isStreaming ? '正在生成回答...' : '输入课程问题，支持引用和知识图谱追问'"
              :disabled="isStreaming"
              @keydown.enter.prevent="onSubmit"
            ></textarea>
            <button
              type="submit"
              class="composer-submit"
              :disabled="!canSubmit"
              :aria-label="isStreaming ? '回答中' : '提问'"
            >
              {{ isStreaming ? '生成中' : '提问' }}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div class="signal-row" aria-hidden="true">
            <span class="signal-line"></span>
            <span class="signal-dot"></span>
            <span class="signal-label">AI PULSE</span>
            <span class="waveform" :class="{ 'is-active': isStreaming }">
              <svg viewBox="0 0 200 60" class="waveform-svg">
                <path ref="wavePathRef" class="wave-path active" d="M 0 30 L 200 30" />
              </svg>
            </span>
            <span class="signal-percent">{{ isStreaming ? '73.8%' : '00.0%' }}</span>
          </div>

          <dl class="context-matrix">
            <div>
              <dt>CONTEXT WINDOW</dt>
              <dd>128K TOKENS</dd>
            </div>
            <div>
              <dt>MODEL</dt>
              <dd>COURSE RAG TUTOR</dd>
            </div>
            <div>
              <dt>OBJECTIVE</dt>
              <dd>DEEP UNDERSTANDING</dd>
            </div>
            <div>
              <dt>STATUS</dt>
              <dd>{{ isStreaming ? 'GENERATING INSIGHTS...' : 'READY FOR QUESTION' }}</dd>
            </div>
          </dl>

          <section class="answer-stream" aria-live="polite">
            <div class="thread-label">
              <span class="thread-label-zh">ANSWER STREAM</span>
              <span class="thread-label-en">CONVERSATION TRACE</span>
            </div>

            <div v-if="messages.length === 0" class="thread-empty">
              <p>在上方输入问题，AI 助教会沿课程材料、知识图谱和引用证据生成回答。</p>
            </div>

            <ol v-else class="message-list">
              <li
                v-for="msg in messages"
                :key="msg.id"
                class="message"
                :class="`message-${msg.role}`"
              >
                <header class="msg-head">
                  <span class="msg-label">
                    {{ formatIndex(msg.index) }}
                    {{ msg.role === 'student' ? 'QUERY' : 'AI' }}
                    <span v-if="msg.timestamp" class="msg-time">{{ msg.timestamp }}</span>
                  </span>
                </header>

                <div v-if="msg.role === 'ai' && msg.toolCalls && msg.toolCalls.length > 0" class="msg-tools">
                  <div
                    v-for="(tool, ti) in msg.toolCalls"
                    :key="ti"
                    class="msg-tool"
                  >
                    <span class="msg-tool-name">{{ tool.name }}</span>
                    <span v-if="tool.query" class="msg-tool-query">{{ tool.query }}</span>
                  </div>
                </div>

                <div
                  v-if="msg.role === 'ai' && !msg.text && msg.status === 'thinking'"
                  class="thinking-dots"
                  aria-label="正在思考"
                >
                  <span class="dot dot-1">·</span>
                  <span class="dot dot-2">·</span>
                  <span class="dot dot-3">·</span>
                </div>

                <p v-else class="msg-body">
                  <span>{{ msg.text }}</span>
                  <span
                    v-if="msg.role === 'ai' && msg.status === 'streaming'"
                    class="stream-caret"
                    aria-hidden="true"
                  />
                </p>
              </li>
            </ol>
          </section>
        </section>

        <aside class="research-rail">
          <section class="rail-section course-switcher">
            <h2>COURSE INDEX</h2>
            <div class="course-switcher-head">
              <span>ACTIVE KNOWLEDGE BASE</span>
              <strong>{{ activeModeLabel }}</strong>
            </div>
            <div v-if="courseLoadError" class="course-load-error">{{ courseLoadError }}</div>
            <div v-else class="course-options">
              <button
                v-for="course in courses"
                :key="course.id"
                type="button"
                class="course-option"
                :class="{ 'is-active': course.id === activeCourseId }"
                @click="selectCourse(course.id)"
              >
                <span class="course-id">{{ course.id }}</span>
                <span class="course-title">{{ course.title }}</span>
              </button>
            </div>
            <p class="course-summary">{{ activeCourseSummary }}</p>
          </section>

          <section class="rail-section tool-calls">
            <h2>TOOL CALLS</h2>
            <ol v-if="toolCalls.length > 0" class="tool-timeline">
              <li
                v-for="(tool, idx) in toolCalls"
                :key="idx"
                class="tool-item"
                :class="{ 'is-done': tool.status === 'done' }"
              >
                <span class="tool-node" aria-hidden="true"></span>
                <span class="tool-index">{{ formatIndex(idx + 1) }}</span>
                <div class="tool-copy">
                  <strong>{{ tool.name }}</strong>
                  <span v-if="toolInput(tool)">input: {{ toolInput(tool) }}</span>
                  <span v-if="tool.summary">output: {{ tool.summary }}</span>
                </div>
                <time>{{ tool.status === 'done' ? 'done' : 'run' }}</time>
              </li>
            </ol>
            <ol v-else class="tool-timeline is-empty">
              <li class="tool-item">
                <span class="tool-node" aria-hidden="true"></span>
                <span class="tool-index">01</span>
                <div class="tool-copy">
                  <strong>standby</strong>
                  <span>waiting for query</span>
                </div>
                <time>idle</time>
              </li>
            </ol>
          </section>

          <section class="rail-section citations">
            <h2>CITATIONS</h2>
            <div class="citation-head">
              <span></span>
              <span>RELEVANCE</span>
            </div>
            <ol v-if="citations.length > 0" class="cite-list">
              <li
                v-for="(c, idx) in citations"
                :key="citationKey(c, idx)"
                class="cite-card"
              >
                <span class="cite-code">C{{ idx + 1 }}</span>
                <span class="cite-title">{{ citationDisplayTitle(c) }}</span>
                <span class="cite-connector" aria-hidden="true"></span>
                <span class="cite-score">{{ citationScore(idx) }}</span>
                <span v-if="citationSnippet(c)" class="cite-snippet">{{ citationSnippet(c) }}</span>
              </li>
            </ol>
            <div v-else class="cite-empty">
              <span>C1</span>
              <span>NO CITATION YET</span>
              <span>0.00</span>
            </div>
          </section>

          <section class="rail-section graph-overview">
            <h2>GRAPH OVERVIEW</h2>
            <div class="mini-graphs" aria-hidden="true">
              <span v-for="n in 5" :key="n" class="mini-graph" :class="`graph-${n}`">
                <svg viewBox="0 0 40 40">
                  <g class="graph-edges">
                    <line x1="20.0" y1="20.0" x2="20.0" y2="5.0" />
                    <line x1="20.0" y1="5.0" x2="33.0" y2="12.5" />
                    <line x1="20.0" y1="20.0" x2="33.0" y2="12.5" />
                    <line x1="33.0" y1="12.5" x2="33.0" y2="27.5" />
                    <line x1="20.0" y1="20.0" x2="33.0" y2="27.5" />
                    <line x1="33.0" y1="27.5" x2="20.0" y2="35.0" />
                    <line x1="20.0" y1="20.0" x2="20.0" y2="35.0" />
                    <line x1="20.0" y1="35.0" x2="7.0" y2="27.5" />
                    <line x1="20.0" y1="20.0" x2="7.0" y2="27.5" />
                    <line x1="7.0" y1="27.5" x2="7.0" y2="12.5" />
                    <line x1="20.0" y1="20.0" x2="7.0" y2="12.5" />
                    <line x1="7.0" y1="12.5" x2="20.0" y2="5.0" />
                  </g>
                  <g class="graph-nodes">
                    <circle cx="20.0" cy="5.0" r="2" class="node-1" />
                    <circle cx="33.0" cy="12.5" r="2" class="node-2" />
                    <circle cx="33.0" cy="27.5" r="2" class="node-3" />
                    <circle cx="20.0" cy="35.0" r="2" class="node-4" />
                    <circle cx="7.0" cy="27.5" r="2" class="node-5" />
                    <circle cx="7.0" cy="12.5" r="2" class="node-6" />
                    <circle cx="20.0" cy="20.0" r="2" class="node-0" />
                  </g>
                </svg>
              </span>
            </div>
            <div class="graph-legend">
              <span class="legend-1">QUERY</span>
              <span class="legend-2">PAPER</span>
              <span class="legend-3">CONCEPT</span>
              <span class="legend-4">METHOD</span>
              <span class="legend-5">RESULT</span>
            </div>
          </section>

          <div v-if="error" class="side-error">
            <span>ERROR</span>
            <strong>{{ error }}</strong>
          </div>
        </aside>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { listCourses } from '../api/courses';
import { askTutor, streamTutor } from '../api/tutor';
import { createRequestSequence } from './tutorState';

const COURSE_MODE_LABELS = {
  'ai-intro': 'AI ENGINEERING',
  'brain-cog-intro': 'COGNITIVE NEUROSCIENCE'
};

const props = defineProps({
  courseId: { type: String, default: '' },
  chapterId: { type: String, default: '' },
  initialQuestion: { type: String, default: '' },
  useStream: { type: Boolean, default: true }
});

const emit = defineEmits(['course-change']);

const messages = ref([]);
const draft = ref(props.initialQuestion || '');
const isStreaming = ref(false);
const error = ref('');
const requestSequence = createRequestSequence();
let abortController = null;
let messageCounter = 0;

const toolCalls = ref([]);
const citations = ref([]);
const courses = ref([]);
const selectedCourseId = ref(props.courseId || '');
const courseLoadError = ref('');
const tutorMetadata = ref(null);

const inputRef = ref(null);
const wavePathRef = ref(null);
let waveFrameId = null;
let wavePhase = 0;
let currentAmp = 6; // Initial idle amplitude

function animateWave() {
  if (wavePathRef.value) {
    wavePhase += 0.15; // Animation speed
    const targetAmp = isStreaming.value ? 25 : 6;
    currentAmp += (targetAmp - currentAmp) * 0.1; // Smooth interpolation

    let d = `M 0 30`;
    for (let x = 0; x <= 200; x += 2) {
      const dist = Math.abs(x - 100);
      let amp = 0;
      if (dist < 60) {
        amp = ((60 - dist) / 60) ** 2 * currentAmp;
      }
      const y = 30 + Math.sin(x * 0.2 - wavePhase) * amp;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    wavePathRef.value.setAttribute('d', d);
  }
  waveFrameId = requestAnimationFrame(animateWave);
}

const canSubmit = computed(() =>
  !isStreaming.value && draft.value.trim().length > 0
);

const activeCourseId = computed(() =>
  selectedCourseId.value || props.courseId || courses.value[0]?.id || ''
);

const activeCourse = computed(() =>
  courses.value.find((course) => course.id === activeCourseId.value) || null
);

const activeModeLabel = computed(() =>
  COURSE_MODE_LABELS[activeCourseId.value] || tutorMetadata.value?.course_mode || 'GENERAL COURSE'
);

const activeCourseSummary = computed(() => {
  const profile = tutorMetadata.value?.course_profile;
  if (profile?.retrieval_focus && activeCourseId.value === selectedCourseId.value) {
    return profile.retrieval_focus;
  }
  return activeCourse.value?.summary || '选择课程后，AI 助教会切换对应的 RAG 知识库和回答模式。';
});

onMounted(() => {
  loadTutorCourses();
  waveFrameId = requestAnimationFrame(animateWave);
});

watch(
  () => props.courseId,
  (next) => {
    if (typeof next === 'string' && next !== selectedCourseId.value) {
      selectedCourseId.value = next;
    }
  }
);

watch(
  () => [activeCourseId.value, props.chapterId],
  () => {
    cancelStream();
    messages.value = [];
    toolCalls.value = [];
    citations.value = [];
    error.value = '';
    tutorMetadata.value = null;
    messageCounter = 0;
  }
);

watch(
  () => props.initialQuestion,
  (next) => {
    if (typeof next === 'string' && next !== draft.value) {
      draft.value = next;
    }
  }
);

onBeforeUnmount(() => {
  cancelStream();
  if (waveFrameId) cancelAnimationFrame(waveFrameId);
});

async function loadTutorCourses() {
  courseLoadError.value = '';
  try {
    const result = await listCourses();
    courses.value = Array.isArray(result) ? result : [];
    if (!selectedCourseId.value && courses.value.length > 0) {
      const defaultCourse = courses.value.find((course) => course.id === 'ai-intro') || courses.value[0];
      selectCourse(defaultCourse.id);
    }
  } catch (caught) {
    courseLoadError.value = caught?.message || 'COURSE LOAD FAILED';
  }
}

function selectCourse(courseId) {
  if (!courseId || courseId === selectedCourseId.value) return;
  selectedCourseId.value = courseId;
  emit('course-change', courseId);
}

function cancelStream() {
  if (abortController) {
    try { abortController.abort(); } catch (_) { /* noop */ }
  }
  abortController = null;
  requestSequence.invalidate();
}

function nextIndex() {
  messageCounter += 1;
  return messageCounter;
}

function formatIndex(n) {
  return String(n).padStart(2, '0');
}

function formatTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function onSubmit() {
  if (!canSubmit.value) return;

  const question = draft.value.trim();
  draft.value = '';
  error.value = '';

  const studentMsg = {
    id: `m-${Date.now()}-s`,
    role: 'student',
    index: nextIndex(),
    text: question,
    status: 'done',
    timestamp: ''
  };
  messages.value.push(studentMsg);

  const aiMsg = {
    id: `m-${Date.now()}-a`,
    role: 'ai',
    index: nextIndex(),
    text: '',
    status: 'thinking',
    timestamp: formatTime(),
    toolCalls: []
  };
  messages.value.push(aiMsg);

  toolCalls.value = [];
  citations.value = [];

  isStreaming.value = true;
  const requestId = requestSequence.next();

  try {
    if (props.useStream) {
      await runStream(question, aiMsg, requestId);
    } else {
      await runNonStream(question, aiMsg, requestId);
    }
  } catch (caught) {
    if (requestSequence.isCurrent(requestId)) {
      error.value = caught?.message || '无法向导师提问。';
      aiMsg.text = aiMsg.text || '（回答中断）';
      aiMsg.status = 'done';
    }
  } finally {
    if (requestSequence.isCurrent(requestId)) {
      isStreaming.value = false;
    }
  }
}

async function runStream(question, aiMsg, requestId) {
  abortController = new AbortController();
  const payload = {
    question,
    course_id: activeCourseId.value || undefined,
    chapter_id: props.chapterId || undefined
  };

  await streamTutor(
    payload,
    {
      onToken: (chunk) => {
        if (!requestSequence.isCurrent(requestId)) return;
        if (aiMsg.status === 'thinking') aiMsg.status = 'streaming';
        aiMsg.text += chunk;
        scrollThreadToBottom();
      },
      onToolCall: ({ name, arguments: args }) => {
        if (!requestSequence.isCurrent(requestId)) return;
        const toolEntry = { name, args: args || {}, status: 'running', summary: '' };
        toolCalls.value.push(toolEntry);
        // Also attach to the message for inline display
        const query = args?.query || args?.concept_name || args?.chapter_id || '';
        aiMsg.toolCalls.push({ name, query });
      },
      onToolResult: ({ name, result_preview }) => {
        if (!requestSequence.isCurrent(requestId)) return;
        for (let i = toolCalls.value.length - 1; i >= 0; i--) {
          if (toolCalls.value[i].name === name && toolCalls.value[i].status === 'running') {
            toolCalls.value[i].status = 'done';
            toolCalls.value[i].summary = summarizeResult(result_preview);
            break;
          }
        }
      },
      onCitations: (list) => {
        if (!requestSequence.isCurrent(requestId)) return;
        citations.value = Array.isArray(list) ? list : [];
      },
      onMetadata: (metadata) => {
        if (!requestSequence.isCurrent(requestId)) return;
        tutorMetadata.value = metadata && typeof metadata === 'object' ? metadata : null;
      },
      onAnswer: (text) => {
        if (!requestSequence.isCurrent(requestId)) return;
        aiMsg.text = text || aiMsg.text;
        aiMsg.status = 'done';
        scrollThreadToBottom();
      },
      onError: (msg) => {
        if (!requestSequence.isCurrent(requestId)) return;
        error.value = msg || 'stream error';
      },
      onDone: () => {
        if (!requestSequence.isCurrent(requestId)) return;
        aiMsg.status = 'done';
      }
    },
    abortController.signal
  );
}

async function runNonStream(question, aiMsg, requestId) {
  const result = await askTutor({
    question,
    course_id: activeCourseId.value || undefined,
    chapter_id: props.chapterId || undefined
  });
  if (!requestSequence.isCurrent(requestId)) return;

  aiMsg.text = result?.answer || '';
  aiMsg.status = 'done';
  citations.value = Array.isArray(result?.citations) ? result.citations : [];
  tutorMetadata.value = {
    course_mode: result?.course_mode,
    course_profile: result?.course_profile
  };

  if (result?.insufficient_evidence || result?.insufficientEvidence) {
    error.value = '导师未能找到足够的支撑证据来给出完整回答。';
  }
}

function summarizeResult(preview) {
  if (typeof preview !== 'string') return '';
  const countMatch = preview.match(/['"]count['"]\s*:\s*(\d+)/);
  if (countMatch) return `${countMatch[1]} results`;
  if (preview.length > 60) return preview.slice(0, 60) + '…';
  return preview;
}

function citationKey(citation, idx) {
  if (citation && typeof citation === 'object') {
    return citation.id || citation.title || `cit-${idx}`;
  }
  return `cit-${idx}`;
}

function citationDisplayTitle(citation) {
  if (typeof citation === 'string') return citation;
  return citation?.title || citation?.source || '未命名引用';
}

function citationSnippet(citation) {
  if (typeof citation === 'string') return '';
  const snippet = citation?.snippet || citation?.text || '';
  if (snippet.length > 100) return snippet.slice(0, 100) + '…';
  return snippet;
}

function citationScore(idx) {
  return (0.91 - idx * 0.04).toFixed(2);
}

function toolInput(tool) {
  const args = tool?.args || {};
  return args.query || args.concept_name || args.chapter_id || args.course_id || '';
}

function scrollThreadToBottom() {
  nextTick(() => {
    const el = document.querySelector('.answer-stream');
    if (el) el.scrollTop = el.scrollHeight;
  });
}
</script>

<style scoped>
.tutor-v2 {
  position: relative;
  width: 100%;
  min-height: calc(100vh - var(--nav-height));
  background: var(--surface-0);
  color: var(--text-1);
  overflow: hidden;
}

.tutor-stage {
  position: relative;
  min-height: calc(100vh - var(--nav-height));
  padding: clamp(26px, 3vw, 44px) clamp(24px, 4.8vw, 68px);
}

.tutor-topline {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--text-1);
}

.top-dot {
  width: 8px;
  height: 8px;
  background: var(--text-1);
  border-radius: 50%;
}

.tutor-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(300px, 22vw, 430px);
  gap: clamp(54px, 8vw, 150px);
  align-items: start;
  margin-top: clamp(32px, 5vh, 64px);
}

.tutor-command {
  min-width: 0;
}

.hero-lockup {
  display: grid;
  grid-template-columns: minmax(520px, 820px) max-content;
  gap: clamp(72px, 7vw, 140px);
  align-items: end;
}

.tutor-title {
  display: grid;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(4rem, 7.2vw, 8.4rem);
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.96;
  color: var(--text-1);
}

.tutor-title span {
  display: block;
  width: max-content;
  transform: scaleX(0.82);
  transform-origin: left center;
}

.tutor-subtitle {
  margin: 0 0 clamp(12px, 1.3vw, 22px);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 2.25;
  color: var(--text-1);
}

.composer {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) max-content;
  align-items: start;
  width: min(100%, 820px);
  margin-top: clamp(44px, 6vh, 76px);
}

.prompt-mark {
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: clamp(2.4rem, 3vw, 3.6rem);
  font-weight: 700;
  line-height: 1;
  margin-top: 0.02em;
  transition: transform var(--dur-2) var(--ease-out-expo);
}

.composer:hover .prompt-mark,
.composer:focus-within .prompt-mark {
  transform: translateX(4px);
}

.composer-input {
  width: 100%;
  min-width: 0;
  min-height: 96px;
  padding: 0 14px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: clamp(1.35rem, 1.7vw, 1.8rem);
  line-height: 1.45;
  letter-spacing: 0;
  overflow: hidden;
  resize: none;
}

.composer-input::placeholder {
  color: var(--text-1);
  opacity: 1;
}

.composer-input:disabled {
  cursor: progress;
}

.composer-submit {
  align-self: end;
  min-width: 92px;
  min-height: 44px;
  padding: 0 4px;
  border: none;
  border-bottom: 1px solid var(--text-1);
  background: transparent;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  cursor: pointer;
  text-align: center;
  transition: color var(--dur-2) ease, border-color var(--dur-2) ease;
}

.composer-submit:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
}

.composer:hover .composer-submit:not(:disabled),
.composer:focus-within .composer-submit:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
}

.composer-submit:disabled {
  color: var(--text-4);
  border-color: var(--border-strong);
  cursor: not-allowed;
}

.signal-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto auto auto;
  align-items: center;
  gap: 14px;
  margin-top: clamp(22px, 3vh, 36px);
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  cursor: crosshair;
  user-select: none;
}

.signal-line {
  position: relative;
  overflow: hidden;
  height: 1px;
  background: rgba(0, 0, 0, 0.58);
  transition: background var(--dur-2) ease;
}

.signal-line::after {
  content: "";
  position: absolute;
  top: 0;
  left: -18%;
  width: 18%;
  height: 1px;
  background: var(--primary);
  animation: pulseScan 4.8s linear infinite;
}

.signal-row:hover .signal-line {
  background: rgba(0, 0, 0, 0.76);
}

.signal-row:hover .signal-line::after {
  width: 26%;
  animation-duration: 1.8s;
}

.signal-dot {
  width: 9px;
  height: 9px;
  background: var(--primary);
  border-radius: 50%;
  animation: pulseDot 2.8s ease-in-out infinite;
}

.signal-row:hover .signal-dot {
  animation-duration: 1.1s;
}

.waveform {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 190px;
  height: 58px;
  opacity: 0.8;
  transition: opacity var(--dur-2) ease;
}

.waveform.is-active {
  opacity: 1;
}

.waveform-svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--primary);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wave-path.active {
  opacity: 0.9;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--primary) 4%, transparent));
  transition: filter var(--dur-2) ease;
}

.waveform.is-active .wave-path.active {
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--primary) 7%, transparent));
}

@keyframes pulseScan {
  0% { transform: translateX(0); opacity: 0; }
  8%, 72% { opacity: 1; }
  100% { transform: translateX(650%); opacity: 0; }
}

@keyframes pulseDot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 34, 255, 0); transform: scale(1); }
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 8%, transparent); transform: scale(0.88); }
}

.context-matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(140px, 210px));
  gap: clamp(28px, 4vh, 54px) clamp(24px, 5vw, 86px);
  margin: clamp(56px, 9vh, 104px) 0 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.context-matrix dt,
.context-matrix dd {
  margin: 0;
}

.context-matrix dt {
  color: var(--text-1);
}

.context-matrix dd {
  margin-top: 8px;
  color: var(--text-4);
}

.context-matrix div:last-child dd {
  color: var(--primary);
}

.answer-stream {
  width: min(100%, 900px);
  max-height: 36vh;
  margin-top: clamp(46px, 8vh, 88px);
  overflow: auto;
  padding-right: 12px;
}

.thread-label {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.58);
}

.thread-label-zh {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--text-1);
}

.thread-label-en {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-4);
}

.thread-empty {
  padding: 28px 0 0;
}

.thread-empty p {
  margin: 0;
  max-width: 54ch;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-3);
}

.message-list {
  display: grid;
  gap: 0;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.message {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  padding: 14px 0;
  border-top: 1px dotted var(--border-strong);
  animation: msgEnter 280ms var(--ease-out-expo);
}

.message:first-child {
  border-top: none;
}

.msg-head {
  margin: 0;
}

.msg-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--text-4);
}

.msg-time {
  display: block;
  margin-top: 6px;
  font-weight: 500;
  letter-spacing: 0.12em;
}

.msg-tools {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.msg-tool {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-4);
}

.msg-tool-name {
  color: var(--primary);
}

.msg-tool-query {
  color: var(--text-4);
}

.msg-body {
  grid-column: 2;
  margin: 0;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-1);
  word-break: break-word;
  white-space: pre-wrap;
}

.stream-caret {
  display: inline-block;
  width: 2px;
  height: 0.9em;
  margin-left: 4px;
  vertical-align: -1px;
  background: var(--primary);
  animation: caretBlink 1s steps(1) infinite;
}

@keyframes caretBlink {
  0%, 60% { opacity: 1; }
  61%, 100% { opacity: 0; }
}

/* Thinking dots */
.thinking-dots {
  grid-column: 2;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-3);
  line-height: 1;
}

.thinking-dots .dot {
  animation: dotBreath 1.4s ease-in-out infinite;
}
.thinking-dots .dot-2 { animation-delay: 200ms; }
.thinking-dots .dot-3 { animation-delay: 400ms; }

@keyframes dotBreath {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 1; }
}

@keyframes msgEnter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.research-rail {
  position: sticky;
  top: calc(var(--nav-height) + 30px);
  display: grid;
  gap: clamp(24px, 4vh, 44px);
  align-content: start;
  min-width: 0;
  font-family: var(--font-mono);
}

.rail-section {
  display: grid;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.24);
}

.rail-section h2 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-1);
}

.course-switcher {
  gap: 14px;
}

.course-switcher-head {
  display: grid;
  gap: 5px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--text-4);
}

.course-switcher-head strong {
  color: var(--primary);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.course-options {
  display: grid;
  gap: 0;
}

.course-option {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 9px 0;
  border: none;
  border-top: 1px dotted var(--border-strong);
  background: transparent;
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: left;
  cursor: pointer;
}

.course-option:hover,
.course-option.is-active {
  color: var(--text-1);
}

.course-option.is-active .course-id {
  color: var(--primary);
}

.course-id {
  white-space: nowrap;
}

.course-option.is-active .course-id::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  background: var(--primary);
  border-radius: 50%;
}

.course-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.course-summary,
.course-load-error {
  margin: 0;
  color: var(--text-4);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1.65;
}

.course-load-error {
  color: #c41;
}

.tool-timeline,
.cite-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}

.tool-item {
  position: relative;
  display: grid;
  grid-template-columns: 18px 38px minmax(0, 1fr) 42px;
  gap: 12px;
  min-height: 74px;
  color: var(--text-1);
  animation: citeEnter 280ms var(--ease-out-expo);
}

.tool-item::before {
  content: "";
  position: absolute;
  left: 7px;
  top: 15px;
  bottom: -15px;
  width: 1px;
  border-left: 1px dotted var(--border-strong);
}

.tool-item:last-child::before {
  display: none;
}

.tool-node {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  background: var(--surface-0);
  border: 1px solid var(--text-1);
  transform: rotate(45deg);
}

.tool-item.is-done .tool-node {
  background: var(--primary);
  border-color: var(--primary);
}

.tool-index,
.tool-copy,
.tool-item time {
  font-size: 10px;
  line-height: 1.45;
}

.tool-index {
  font-weight: 800;
}

.tool-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.tool-copy strong {
  font-size: 10px;
  letter-spacing: 0.08em;
}

.tool-copy span,
.tool-item time {
  color: var(--text-4);
}

.tool-copy span {
  overflow-wrap: anywhere;
}

.citation-head {
  display: grid;
  grid-template-columns: 1fr 70px;
  color: var(--text-4);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.cite-card {
  position: relative;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) minmax(28px, 96px) 40px;
  gap: 10px;
  align-items: start;
  min-height: 54px;
  font-size: 10px;
  line-height: 1.35;
  animation: citeEnter 280ms var(--ease-out-expo);
}

.cite-code {
  font-weight: 800;
}

.cite-title {
  display: block;
  min-width: 0;
  font-weight: 700;
  color: var(--text-1);
}

.cite-connector {
  position: relative;
  top: 9px;
  height: 1px;
  border-top: 1px dotted var(--border-strong);
}

.cite-score {
  color: var(--text-1);
  text-align: right;
}

.cite-snippet {
  grid-column: 2 / -1;
  margin-top: -18px;
  color: var(--text-4);
  font-size: 9px;
  line-height: 1.5;
  max-width: 32ch;
}

.cite-empty {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 40px;
  gap: 10px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
}

@keyframes citeEnter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.graph-overview {
  cursor: crosshair;
}

.graph-overview:hover .mini-graph {
  opacity: 1;
}

.mini-graphs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  padding: 2px 0;
  perspective: 600px;
}

.mini-graph {
  display: block;
  height: 38px;
  opacity: 0.6;
  transition: opacity var(--dur-2) ease, transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-style: preserve-3d;
  cursor: pointer;
}

.mini-graph svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.graph-edges {
  transform-origin: 20px 20px;
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.graph-nodes {
  transform-origin: 20px 20px;
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.graph-edges line {
  stroke: var(--text-4);
  stroke-width: 0.5;
  opacity: 0.5;
  transition: stroke var(--dur-2) ease, opacity var(--dur-2) ease;
}

.graph-nodes circle {
  fill: var(--surface-0);
  stroke: var(--text-4);
  stroke-width: 1;
  transition: fill var(--dur-2) ease, stroke var(--dur-2) ease, transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: center center;
}

.mini-graph:hover {
  opacity: 1;
  transform: translateZ(10px) rotateX(15deg) rotateY(-15deg);
}
.mini-graph:hover .graph-edges {
  transform: scale(1.15) rotate(5deg);
}
.mini-graph:hover .graph-nodes {
  transform: scale(1.15) rotate(5deg);
}

.mini-graph:hover .graph-edges line {
  stroke: var(--primary);
  opacity: 0.8;
}
.mini-graph:hover .graph-nodes circle {
  stroke: var(--primary);
  transform: scale(1.3);
}

.graph-1 .node-1 { fill: var(--primary); stroke: var(--primary); }
.graph-2 .node-2 { fill: var(--primary); stroke: var(--primary); }
.graph-3 .node-3 { fill: var(--primary); stroke: var(--primary); }
.graph-4 .node-4 { fill: var(--primary); stroke: var(--primary); }
.graph-5 .node-0 { fill: var(--primary); stroke: var(--primary); }

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--text-1);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.graph-legend span::before {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 5px;
  border: 1px solid var(--text-4);
  border-radius: 50%;
  vertical-align: 1px;
}

.graph-legend .legend-1::before { background: var(--primary); border-color: var(--primary); }
.graph-legend .legend-2::before { background: var(--primary); border-color: var(--primary); }
.graph-legend .legend-3::before { background: var(--primary); border-color: var(--primary); }
.graph-legend .legend-4::before { background: var(--primary); border-color: var(--primary); }
.graph-legend .legend-5::before { background: var(--primary); border-color: var(--primary); }

.side-error {
  display: grid;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid rgba(196, 65, 17, 0.45);
  font-size: 10px;
  color: #c41;
}

.cite-list .cite-card:nth-child(1) { animation-delay: 0ms; }
.cite-list .cite-card:nth-child(2) { animation-delay: 60ms; }
.cite-list .cite-card:nth-child(3) { animation-delay: 120ms; }

@media (max-width: 1120px) {
  .tutor-workspace {
    grid-template-columns: 1fr;
    gap: 54px;
  }

  .research-rail {
    position: static;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
  }

  .hero-lockup {
    grid-template-columns: minmax(0, 1fr);
  }

  .tutor-subtitle {
    margin-top: 22px;
  }
}

@media (max-width: 760px) {
  .tutor-stage {
    padding: 22px 18px 42px;
  }

  .tutor-workspace,
  .research-rail {
    grid-template-columns: 1fr;
  }

  .tutor-title {
    font-size: clamp(3rem, 15vw, 4.4rem);
  }

  .tutor-title span {
    transform: scaleX(0.82);
  }

  .composer {
    grid-template-columns: 24px minmax(0, 1fr);
    margin-top: 58px;
  }

  .composer-submit {
    grid-column: 2;
    justify-self: end;
    margin-top: 8px;
    min-width: 96px;
  }

  .composer-input {
    min-height: 90px;
    font-size: 1.18rem;
  }

  .signal-row {
    grid-template-columns: minmax(80px, 1fr) auto auto;
  }

  .waveform,
  .signal-percent {
    display: none;
  }

  .context-matrix {
    grid-template-columns: 1fr 1fr;
  }

  .answer-stream {
    max-height: none;
  }

  .message {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .msg-body,
  .msg-tools,
  .thinking-dots {
    grid-column: 1;
  }

  .mini-graphs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .signal-line::after,
  .signal-dot,
  .stream-caret,
  .thinking-dots .dot,
  .waveform::after,
  .waveform i,
  .mini-graph,
  .mini-graph::before,
  .mini-graph::after,
  .mini-graph i {
    animation: none;
    opacity: 1;
  }
  .message,
  .cite-card,
  .tool-item {
    animation: none;
  }
}
</style>
