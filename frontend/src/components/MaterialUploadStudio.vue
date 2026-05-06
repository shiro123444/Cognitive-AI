<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { uploadMaterialAsync, getJob } from '../api/materials';
import { listAgentRunEvents } from '../api/agentRuns';

const props = defineProps({
  courseId: { type: String, default: 'ai-intro' },
  scopeType: { type: String, default: 'course_global' },
  ownerId: { type: String, default: '' },
  mode: { type: String, default: 'teacher' }
});

const emit = defineEmits(['uploaded']);

const isDragOver = ref(false);
const fileInput = ref(null);

/* ── Upload queue ── */
const queue = ref([]);

const activeItem = computed(() =>
  queue.value.find(q => q.status === 'processing') || null
);

/* ── Pipeline stages ── */
const stages = [
  { key: 'extract', zh: '提取', en: 'EXTRACT', threshold: 10 },
  { key: 'chunk',   zh: '分块', en: 'CHUNK',   threshold: 40 },
  { key: 'embed',   zh: '嵌入', en: 'EMBED',   threshold: 70 },
  { key: 'index',   zh: '索引', en: 'INDEX',   threshold: 100 },
];

function stageStatus(stage) {
  const item = activeItem.value;
  if (!item) return 'waiting';
  if (item.status === 'error') return 'error';
  if (item.status === 'done') return 'done';
  const p = item.progress || 0;
  if (p >= stage.threshold) return 'done';
  if (p >= stage.threshold - 30) return 'active';
  return 'waiting';
}

/* ── Drag & drop ── */
function onDragOver(e) {
  e.preventDefault();
  isDragOver.value = true;
}
function onDragLeave() {
  isDragOver.value = false;
}
function onDrop(e) {
  e.preventDefault();
  isDragOver.value = false;
  addFiles(Array.from(e.dataTransfer.files));
}
function openPicker() {
  fileInput.value?.click();
}
function onFileChange(e) {
  addFiles(Array.from(e.target.files));
  e.target.value = '';
}

function addFiles(files) {
  for (const file of files) {
    queue.value.push({
      id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      filename: file.name,
      status: 'pending',
      jobId: null,
      runId: null,
      progress: 0,
      progressMessage: '',
      events: [],
      summary: null,
      error: null
    });
  }
  processNext();
}

/* ── Sequential upload ── */
let processing = false;

async function processNext() {
  if (processing) return;
  const next = queue.value.find(q => q.status === 'pending');
  if (!next) return;
  processing = true;
  next.status = 'uploading';
  try {
    const res = await uploadMaterialAsync(props.courseId, next.file, {
      scopeType: props.scopeType,
      ownerId: props.ownerId
    });
    next.jobId = res.job_id;
    next.runId = res.run_id;
    next.status = 'processing';
    next.progress = 0;
    next.progressMessage = 'Starting…';
    pollJob(next);
  } catch (err) {
    next.status = 'error';
    next.error = err.message || 'Upload failed';
    processing = false;
    processNext();
  }
}

const pollTimers = {};

async function pollRunEvents(item) {
  if (!item.runId) return;
  try {
    const events = await listAgentRunEvents(item.runId);
    item.events = Array.isArray(events) ? events : [];
    const latest = item.events[item.events.length - 1];
    if (latest) {
      item.progress = latest.progress || item.progress;
      item.progressMessage = latest.message || item.progressMessage;
    }
  } catch {
    // Job polling remains the source of truth if event polling temporarily fails.
  }
}

async function pollJob(item) {
  if (!item.jobId) return;
  try {
    const job = await getJob(item.jobId);
    await pollRunEvents(item);
    item.progress = job.progress || 0;
    item.progressMessage = job.progress_message || '';
    if (job.status === 'completed') {
      item.status = 'done';
      item.progress = 100;
      item.summary = job.result || null;
      processing = false;
      emit('uploaded', job);
      processNext();
      return;
    }
    if (job.status === 'failed') {
      item.status = 'error';
      item.error = job.error_message || 'Processing failed';
      processing = false;
      processNext();
      return;
    }
    pollTimers[item.id] = setTimeout(() => pollJob(item), 800);
  } catch {
    pollTimers[item.id] = setTimeout(() => pollJob(item), 1500);
  }
}

onBeforeUnmount(() => {
  Object.values(pollTimers).forEach(clearTimeout);
});

function removeItem(id) {
  const idx = queue.value.findIndex(q => q.id === id);
  if (idx !== -1) {
    clearTimeout(pollTimers[id]);
    queue.value.splice(idx, 1);
  }
}

function clearDone() {
  queue.value = queue.value.filter(q => q.status !== 'done');
}

const hasDone = computed(() => queue.value.some(q => q.status === 'done'));
</script>

<template>
  <div class="upload-studio" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">

    <!-- Watermark: rotated, pinned to left edge, half-clipped -->
    <div class="upload-watermark" aria-hidden="true">UPLOAD</div>

    <!-- Header -->
    <header class="upload-header">
      <p class="upload-kicker">Material Studio</p>
      <h1 class="upload-title">上传材料</h1>
      <p class="upload-subtitle">Upload course materials — PDF, Markdown, or plain text.</p>
    </header>

    <!-- Three-column asymmetric: 58% / 22% / 20% whitespace -->
    <div class="upload-body">

      <!-- Column 1: Drop zone + queue -->
      <div class="col-main">
        <!-- Drop zone: no box, just corner marks -->
        <div
          class="drop-zone"
          :class="{ 'is-drag-over': isDragOver }"
          @click="openPicker"
          role="button"
          tabindex="0"
          @keydown.enter="openPicker"
        >
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".pdf,.md,.markdown,.txt,.text"
            class="sr-only"
            @change="onFileChange"
          />
          <!-- Corner marks -->
          <span class="corner-mark tl"></span>
          <span class="corner-mark tr"></span>
          <span class="corner-mark bl"></span>
          <span class="corner-mark br"></span>

          <div class="drop-content">
            <span class="drop-plus">+</span>
            <p class="drop-primary">拖拽文件到此处</p>
            <p class="drop-secondary">或点击选择文件</p>
          </div>
          <p class="drop-hint">PDF · Markdown · TXT — 50MB max</p>
        </div>

        <!-- Queue -->
        <div class="queue-section" v-if="queue.length > 0 || true">
          <div class="queue-head">
            <span class="queue-label">上传队列</span>
            <span class="queue-label-en">QUEUE</span>
            <button v-if="hasDone" class="queue-clear" @click="clearDone">清除</button>
          </div>

          <div v-if="queue.length === 0" class="queue-empty">
            暂无上传任务
          </div>

          <ul v-else class="queue-list">
            <li
              v-for="item in queue"
              :key="item.id"
              class="queue-item"
              :class="`is-${item.status}`"
            >
              <span class="queue-item-name">{{ item.filename }}</span>
              <span class="queue-item-status">
                <template v-if="item.status === 'error'">{{ item.error }}</template>
                <template v-else-if="item.status === 'done'">完成</template>
                <template v-else-if="item.progressMessage">{{ item.progressMessage }}</template>
                <template v-else-if="item.status === 'uploading'">上传中</template>
              </span>
              <span v-if="item.summary?.published" class="queue-item-summary">
                已发布 {{ item.summary.published_concepts || 0 }} 节点 · {{ item.summary.published_edges || 0 }} 关系
              </span>
              <span v-else-if="item.summary?.needs_review" class="queue-item-summary">
                已进入审核队列
              </span>
              <span v-if="item.status === 'processing' || item.status === 'uploading'" class="queue-item-pct">{{ item.progress }}%</span>
              <button class="queue-item-rm" @click.stop="removeItem(item.id)" aria-label="移除">×</button>
              <ol v-if="item.events?.length" class="agent-event-list">
                <li v-for="event in item.events.slice(-5)" :key="event.id">
                  <span>{{ event.event_type }}</span>
                  <strong>{{ event.progress }}%</strong>
                  <em>{{ event.message }}</em>
                </li>
              </ol>
            </li>
          </ul>
        </div>
      </div>

      <!-- Column 2: Pipeline -->
      <aside class="col-pipeline">
        <div class="pipeline-head">
          <span class="pipeline-label">处理进度</span>
          <span class="pipeline-label-en">PIPELINE</span>
        </div>

        <div class="pipeline-stages">
          <div
            v-for="(stage, i) in stages"
            :key="stage.key"
            class="pipeline-stage"
            :class="`is-${stageStatus(stage)}`"
          >
            <!-- The massive English word, pale and rotated -->
            <span class="stage-en" aria-hidden="true">{{ stage.en }}</span>
            <!-- Tiny Chinese + status -->
            <div class="stage-info">
              <span class="stage-dot"></span>
              <span class="stage-zh">{{ stage.zh }}</span>
              <span class="stage-status">
                <template v-if="stageStatus(stage) === 'waiting'">等待</template>
                <template v-else-if="stageStatus(stage) === 'active'">处理中</template>
                <template v-else-if="stageStatus(stage) === 'done'">✓</template>
                <template v-else>失败</template>
              </span>
            </div>
            <!-- Connecting hairline -->
            <span v-if="i < stages.length - 1" class="stage-line"></span>
          </div>
        </div>

        <div v-if="activeItem" class="pipeline-detail">
          <span class="detail-file">{{ activeItem.filename }}</span>
          <span v-if="activeItem.progressMessage" class="detail-msg">{{ activeItem.progressMessage }}</span>
        </div>
      </aside>

      <!-- Column 3: breathing space (empty) -->
      <div class="col-void" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.upload-studio {
  position: relative;
  min-height: calc(100vh - var(--nav-height));
  padding: clamp(56px, 8vw, 112px) var(--shell-pad-x) clamp(80px, 12vw, 160px);
  overflow: hidden;
}

/* ── Watermark: rotated 90°, pinned left, half-clipped ── */
.upload-watermark {
  position: absolute;
  left: -0.06em;
  bottom: clamp(60px, 10vw, 140px);
  transform: rotate(-90deg);
  transform-origin: left bottom;
  font-family: var(--font-display);
  font-size: clamp(12rem, 22vw, 26rem);
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--surface-2);
  line-height: 0.82;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  white-space: nowrap;
}

/* ── Header ── */
.upload-header {
  position: relative;
  z-index: 1;
  margin-bottom: clamp(48px, 8vw, 96px);
  max-width: 600px;
}

.upload-kicker {
  margin: 0 0 16px;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--text-4);
}

.upload-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(3rem, 6vw, 5.5rem);
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--text-1);
  line-height: 0.95;
}

.upload-subtitle {
  margin: 20px 0 0;
  font-size: 0.88rem;
  color: var(--text-4);
  line-height: 1.55;
  letter-spacing: 0.01em;
}

/* ── Three-column asymmetric layout ── */
.upload-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 58fr 22fr 20fr;
  gap: clamp(24px, 4vw, 56px);
  align-items: start;
}

/* ── Column 1: main ── */
.col-main {
  display: grid;
  gap: clamp(40px, 6vw, 72px);
}

/* ── Drop zone: no border, corner marks only ── */
.drop-zone {
  position: relative;
  display: grid;
  place-items: center;
  gap: 8px;
  padding: clamp(64px, 10vw, 120px) 32px clamp(48px, 6vw, 80px);
  cursor: pointer;
  min-height: 320px;
}

.drop-zone:hover .drop-plus,
.drop-zone.is-drag-over .drop-plus {
  color: var(--primary);
  transform: scale(1.06);
}

.drop-zone.is-drag-over .corner-mark {
  border-color: var(--primary);
}

/* Corner marks — L-shaped lines */
.corner-mark {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: var(--border-strong);
  border-style: solid;
  border-width: 0;
  transition: border-color var(--dur-2) ease;
}

.corner-mark.tl {
  top: 0; left: 0;
  border-top-width: 1px;
  border-left-width: 1px;
}

.corner-mark.tr {
  top: 0; right: 0;
  border-top-width: 1px;
  border-right-width: 1px;
}

.corner-mark.bl {
  bottom: 0; left: 0;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.corner-mark.br {
  bottom: 0; right: 0;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

.drop-content {
  display: grid;
  place-items: center;
  gap: 10px;
}

.drop-plus {
  font-family: var(--font-display);
  font-size: clamp(3rem, 6vw, 5rem);
  font-weight: 200;
  color: var(--text-4);
  line-height: 1;
  transition: color var(--dur-2) ease, transform var(--dur-2) ease;
}

.drop-primary {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.06em;
}

.drop-secondary {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-4);
  letter-spacing: 0.02em;
}

.drop-hint {
  margin: 16px 0 0;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--text-4);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

/* ── Queue ── */
.queue-section {
  display: grid;
  gap: 16px;
}

.queue-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.queue-label {
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--text-1);
}

.queue-label-en {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  color: var(--text-4);
}

.queue-clear {
  margin-left: auto;
  border: none;
  background: none;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--primary);
  cursor: pointer;
  text-transform: uppercase;
}

.queue-empty {
  padding: 24px 0;
  color: var(--text-4);
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  border-top: 1px solid var(--border-subtle);
}

.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
  border-top: 1px solid var(--border-subtle);
}

.queue-item {
  display: grid;
  grid-template-columns: 1fr auto auto auto 24px;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.queue-item-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item-status {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--text-4);
  letter-spacing: 0.04em;
}

.queue-item.is-error .queue-item-status {
  color: #c41;
}

.queue-item.is-done .queue-item-status {
  color: var(--primary);
}

.queue-item-summary {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.queue-item-pct {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--primary);
  min-width: 32px;
  text-align: right;
}

.queue-item-rm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--text-4);
  font-size: 1.1rem;
  cursor: pointer;
  transition: color var(--dur-1) ease;
}

.queue-item-rm:hover {
  color: var(--text-1);
}

.agent-event-list {
  grid-column: 1 / -1;
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--border-subtle);
  list-style: none;
}

.agent-event-list li {
  display: grid;
  grid-template-columns: 120px 48px 1fr;
  gap: 12px;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-4);
}

.agent-event-list strong {
  color: var(--primary);
  font-weight: 800;
}

.agent-event-list em {
  color: var(--text-3);
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
}

/* ── Column 2: Pipeline ── */
.col-pipeline {
  position: sticky;
  top: calc(var(--nav-height) + 56px);
  display: grid;
  gap: 28px;
}

.pipeline-head {
  display: grid;
  gap: 6px;
}

.pipeline-label {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--text-1);
}

.pipeline-label-en {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  color: var(--text-4);
}

.pipeline-stages {
  display: grid;
  gap: 0;
}

.pipeline-stage {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 18px 0 18px 0;
  min-height: 80px;
}

/* Massive English text — pale, behind content */
.stage-en {
  position: absolute;
  top: 50%;
  left: -4px;
  transform: translateY(-50%);
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--surface-2);
  line-height: 1;
  pointer-events: none;
  user-select: none;
  transition: color var(--dur-2) ease;
  white-space: nowrap;
}

.pipeline-stage.is-active .stage-en {
  color: var(--primary-soft);
}

.pipeline-stage.is-done .stage-en {
  color: var(--border-default);
}

.stage-info {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.stage-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-strong);
  flex-shrink: 0;
  transition: background var(--dur-2) ease, box-shadow var(--dur-2) ease;
}

.pipeline-stage.is-active .stage-dot {
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.pipeline-stage.is-done .stage-dot {
  background: var(--primary);
}

.pipeline-stage.is-error .stage-dot {
  background: #c41;
}

.stage-zh {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.08em;
}

.stage-status {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-4);
  letter-spacing: 0.06em;
}

.pipeline-stage.is-active .stage-status {
  color: var(--primary);
  font-weight: 700;
}

.pipeline-stage.is-done .stage-status {
  color: var(--primary);
}

/* Connecting hairline */
.stage-line {
  display: block;
  width: 1px;
  height: 18px;
  background: var(--border-default);
  margin-left: 2px;
  margin-top: 2px;
}

/* Pipeline detail */
.pipeline-detail {
  display: grid;
  gap: 6px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.detail-file {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-msg {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-4);
  letter-spacing: 0.04em;
}

/* ── Column 3: void — pure whitespace ── */
.col-void {
  min-height: 1px;
}

/* ── Responsive ── */
@media (max-width: 1000px) {
  .upload-body {
    grid-template-columns: 1fr 240px;
  }

  .col-void {
    display: none;
  }
}

@media (max-width: 720px) {
  .upload-body {
    grid-template-columns: 1fr;
  }

  .col-pipeline {
    position: static;
  }

  .pipeline-stages {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .pipeline-stage {
    min-height: auto;
    padding: 12px 0;
    text-align: center;
  }

  .stage-en {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    font-size: 1.2rem;
    margin-bottom: 6px;
  }

  .stage-info {
    justify-content: center;
  }

  .stage-line {
    display: none;
  }

  .upload-watermark {
    font-size: clamp(8rem, 30vw, 14rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop-plus,
  .corner-mark,
  .stage-dot,
  .stage-en {
    transition: none;
  }
}
</style>
