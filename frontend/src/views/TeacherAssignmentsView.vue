<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  archiveAssignment,
  createAssignment,
  gradeSubmission,
  listAssignments,
  listSubmissions,
  publishAssignment
} from '../api/assignments';
import { listCourses } from '../api/courses';
import {
  assignmentStatusLabel,
  assignmentTypeLabel,
  formatDueAt,
  submissionStatusLabel,
  validateGradeInput
} from './assignmentsViewState';

const ASSIGNMENT_TYPES = [
  { value: 'reading', label: '阅读' },
  { value: 'quiz', label: '测验' },
  { value: 'code_lab', label: '代码实验' },
  { value: 'experiment', label: '认知实验' },
  { value: 'reflection', label: '反思' },
  { value: 'upload', label: '作业上传' }
];

const loading = ref(true);
const errorMessage = ref('');

const courses = ref([]);
const assignments = ref([]);
const selectedId = ref(null);
const submissions = ref([]);
const submissionsLoading = ref(false);
const submissionsError = ref('');

const createOpen = ref(false);
const createForm = reactive({
  course_id: '',
  title: '',
  description: '',
  assignment_type: 'reading'
});
const createError = ref('');
const creating = ref(false);

const gradeDraft = reactive({});
const gradingId = ref(null);
const gradeError = reactive({});
const gradedFlash = ref(null);

const actionInFlight = ref(null);

const selectedAssignment = computed(
  () => assignments.value.find((a) => a.id === selectedId.value) || null
);

const pendingSubmissions = computed(
  () => submissions.value.filter((s) => s.status !== 'graded').length
);

const stats = computed(() => {
  let published = 0;
  let drafts = 0;
  let archived = 0;
  for (const a of assignments.value) {
    if (a.status === 'published') published += 1;
    else if (a.status === 'draft') drafts += 1;
    else if (a.status === 'archived') archived += 1;
  }
  return { published, drafts, archived };
});

function paddedIndex(n) {
  return String(n ?? 0).padStart(2, '0');
}

async function hydrate() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [c, a] = await Promise.all([listCourses(), listAssignments({})]);
    courses.value = c || [];
    assignments.value = a || [];
    if (courses.value.length && !createForm.course_id) {
      createForm.course_id = courses.value[0].id;
    }
    if (!selectedId.value && assignments.value.length) {
      selectedId.value = assignments.value[0].id;
    }
  } catch (err) {
    errorMessage.value = err?.message || '无法加载作业';
  } finally {
    loading.value = false;
  }
}

async function loadSubmissionsFor(assignmentId) {
  if (!assignmentId) {
    submissions.value = [];
    return;
  }
  submissionsLoading.value = true;
  submissionsError.value = '';
  try {
    submissions.value = (await listSubmissions(assignmentId)) || [];
  } catch (err) {
    submissionsError.value = err?.message || '无法加载提交';
    submissions.value = [];
  } finally {
    submissionsLoading.value = false;
  }
}

function openCreate() {
  createOpen.value = true;
  createError.value = '';
}

function closeCreate() {
  createOpen.value = false;
}

async function onCreate() {
  createError.value = '';
  if (!createForm.course_id || !createForm.title.trim()) {
    createError.value = '课程与标题为必填项';
    return;
  }
  creating.value = true;
  try {
    const created = await createAssignment({
      course_id: createForm.course_id,
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      assignment_type: createForm.assignment_type
    });
    assignments.value = [created, ...assignments.value];
    selectedId.value = created.id;
    createForm.title = '';
    createForm.description = '';
    createOpen.value = false;
  } catch (err) {
    createError.value = err?.message || '创建失败';
  } finally {
    creating.value = false;
  }
}

async function onPublish(assignmentId) {
  actionInFlight.value = `publish:${assignmentId}`;
  try {
    const updated = await publishAssignment(assignmentId);
    assignments.value = assignments.value.map((a) => (a.id === updated.id ? updated : a));
  } catch (err) {
    errorMessage.value = err?.message || '发布失败';
  } finally {
    actionInFlight.value = null;
  }
}

async function onArchive(assignmentId) {
  actionInFlight.value = `archive:${assignmentId}`;
  try {
    const updated = await archiveAssignment(assignmentId);
    assignments.value = assignments.value.map((a) => (a.id === updated.id ? updated : a));
  } catch (err) {
    errorMessage.value = err?.message || '归档失败';
  } finally {
    actionInFlight.value = null;
  }
}

function ensureGradeDraft(submission) {
  if (!gradeDraft[submission.id]) {
    gradeDraft[submission.id] = {
      score: submission.score ?? '',
      feedback: submission.feedback ?? ''
    };
  }
  return gradeDraft[submission.id];
}

function updateGradeField(submissionId, field, value) {
  gradeDraft[submissionId] = {
    ...(gradeDraft[submissionId] || { score: '', feedback: '' }),
    [field]: value
  };
}

async function onGrade(submission) {
  const draft = ensureGradeDraft(submission);
  const validation = validateGradeInput(draft);
  if (validation) {
    gradeError[submission.id] = validation;
    return;
  }
  gradeError[submission.id] = '';
  gradingId.value = submission.id;
  try {
    const updated = await gradeSubmission(submission.id, {
      score: Number(draft.score),
      feedback: draft.feedback
    });
    submissions.value = submissions.value.map((s) => (s.id === updated.id ? updated : s));
    gradedFlash.value = updated.id;
    setTimeout(() => {
      if (gradedFlash.value === updated.id) gradedFlash.value = null;
    }, 1600);
  } catch (err) {
    gradeError[submission.id] = err?.message || '保存失败';
  } finally {
    gradingId.value = null;
  }
}

function selectAssignment(id) {
  selectedId.value = id;
}

function onKeydown(ev) {
  if (createOpen.value && ev.key === 'Escape') {
    closeCreate();
    return;
  }
  const target = ev.target;
  const isTyping =
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (!isTyping && !createOpen.value && (ev.key === 'n' || ev.key === 'N')) {
    ev.preventDefault();
    openCreate();
  }
}

watch(selectedId, (id) => {
  loadSubmissionsFor(id);
});

onMounted(async () => {
  await hydrate();
  if (selectedId.value) {
    await loadSubmissionsFor(selectedId.value);
  }
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <main class="teacher-assignments">
    <header class="page-hero">
      <div class="hero-side mono">
        <span class="hero-dot"></span>
        <span class="hero-side-label">TEACHER / GRADING</span>
      </div>

      <div class="hero-content">
        <h1 class="hero-title display">
          <span class="hero-title-line">作业批改</span>
          <span class="hero-title-line hero-title-accent">Control Surface</span>
        </h1>
        <div class="hero-separator"></div>
        <p class="hero-desc">
          创建与发布作业、监控课程提交情况、逐份打分与写评语。按 <kbd>N</kbd>
          新建作业，按 <kbd>Esc</kbd> 关闭弹窗。
        </p>
      </div>

      <aside class="hero-stats mono">
        <dl class="stat-grid">
          <div class="stat-cell stat-cell-primary">
            <dt>TO GRADE</dt>
            <dd>{{ paddedIndex(pendingSubmissions) }}</dd>
          </div>
          <div class="stat-cell">
            <dt>PUBLISHED</dt>
            <dd>{{ paddedIndex(stats.published) }}</dd>
          </div>
          <div class="stat-cell">
            <dt>DRAFT</dt>
            <dd>{{ paddedIndex(stats.drafts) }}</dd>
          </div>
        </dl>
        <button class="create-cta" type="button" @click="openCreate">
          <span class="cta-plus">+</span>
          <span class="cta-label">新建作业</span>
          <span class="cta-hint mono">N</span>
        </button>
      </aside>
    </header>

    <section v-if="errorMessage" class="status-block status-error" role="alert">
      {{ errorMessage }}
    </section>

    <section class="grading-layout">
      <aside class="rail">
        <header class="rail-head mono">
          <span class="rail-dot"></span>
          <span>作业列表</span>
          <span class="rail-count">{{ paddedIndex(assignments.length) }}</span>
        </header>
        <p v-if="loading" class="rail-empty mono">LOADING…</p>
        <p v-else-if="!assignments.length" class="rail-empty mono">
          EMPTY · 点击右上角新建
        </p>
        <ul v-else class="rail-list">
          <li v-for="(a, i) in assignments" :key="a.id">
            <button
              type="button"
              class="rail-row"
              :class="{ active: a.id === selectedId }"
              @click="selectAssignment(a.id)"
            >
              <span class="rail-index mono">{{ paddedIndex(i + 1) }}</span>
              <div class="rail-body">
                <span class="rail-title">{{ a.title }}</span>
                <div class="rail-meta mono">
                  <span class="rail-status" :data-status="a.status">
                    {{ assignmentStatusLabel(a.status) }}
                  </span>
                  <span class="rail-dot-sep">·</span>
                  <span>{{ a.submission_count }} 提交</span>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <section class="canvas">
        <template v-if="!selectedAssignment">
          <div class="canvas-empty">
            <span class="empty-num mono">00</span>
            <p class="empty-prompt">从左侧选择作业以查看提交与评分面板。</p>
          </div>
        </template>
        <template v-else>
          <header class="canvas-head">
            <div class="canvas-head-left mono">
              <span class="canvas-type-chip">{{ assignmentTypeLabel(selectedAssignment.assignment_type) }}</span>
              <span class="canvas-status" :data-status="selectedAssignment.status">
                <span class="canvas-status-dot"></span>
                {{ assignmentStatusLabel(selectedAssignment.status) }}
              </span>
              <span class="canvas-due">截止 · {{ formatDueAt(selectedAssignment.due_at) }}</span>
            </div>
            <h2 class="canvas-title display">{{ selectedAssignment.title }}</h2>
            <p v-if="selectedAssignment.description" class="canvas-desc">
              {{ selectedAssignment.description }}
            </p>
            <div class="canvas-actions">
              <button
                v-if="selectedAssignment.status === 'draft'"
                type="button"
                class="primary-btn"
                :disabled="actionInFlight === `publish:${selectedAssignment.id}`"
                @click="onPublish(selectedAssignment.id)"
              >
                <span class="btn-dot"></span>
                {{ actionInFlight === `publish:${selectedAssignment.id}` ? '发布中…' : '发布作业' }}
                <span class="btn-arrow">→</span>
              </button>
              <button
                v-if="selectedAssignment.status !== 'archived'"
                type="button"
                class="ghost-btn mono"
                :disabled="actionInFlight === `archive:${selectedAssignment.id}`"
                @click="onArchive(selectedAssignment.id)"
              >
                {{ actionInFlight === `archive:${selectedAssignment.id}` ? 'ARCHIVING…' : 'ARCHIVE' }}
              </button>
            </div>
          </header>

          <section class="canvas-submissions">
            <header class="subs-head mono">
              <span class="subs-head-dot"></span>
              <span class="subs-head-label">SUBMISSIONS</span>
              <span class="subs-count">{{ paddedIndex(submissions.length) }}</span>
            </header>

            <p v-if="submissionsLoading" class="rail-empty mono">LOADING SUBMISSIONS…</p>
            <p v-else-if="submissionsError" class="status-error" role="alert">
              {{ submissionsError }}
            </p>
            <div v-else-if="!submissions.length" class="subs-empty">
              <span class="empty-num mono">{{ selectedAssignment.status === 'published' ? '— ·' : '— ×' }}</span>
              <p>
                {{ selectedAssignment.status === 'published'
                  ? '还没有学生提交。把课程链接发给班级，提交会实时出现在这里。'
                  : '发布后才会收到提交。点击上方「发布作业」让它上线。' }}
              </p>
            </div>

            <ul v-else class="sub-list">
              <li
                v-for="(submission, i) in submissions"
                :key="submission.id"
                class="sub-card"
                :class="{
                  'is-graded': submission.status === 'graded',
                  'is-flash': gradedFlash === submission.id
                }"
              >
                <header class="sub-head">
                  <span class="sub-index mono">#{{ paddedIndex(i + 1) }}</span>
                  <span class="sub-author mono">{{ submission.student_id }}</span>
                  <span class="sub-status mono" :data-state="submission.status">
                    <span class="sub-status-dot"></span>
                    {{ submissionStatusLabel(submission.status) }}
                  </span>
                  <span class="sub-time mono">提交 {{ formatDueAt(submission.submitted_at) }}</span>
                </header>

                <pre class="sub-body">{{
                  submission.content?.answer || JSON.stringify(submission.content, null, 2) || '（空提交）'
                }}</pre>

                <form class="grade-form" @submit.prevent="onGrade(submission)">
                  <div class="grade-head mono">
                    <span class="grade-head-dot"></span>
                    <span>GRADE</span>
                  </div>
                  <div class="grade-inputs">
                    <label class="field field-score">
                      <span class="field-label mono">SCORE · 0–100</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        class="field-input score-input"
                        :value="(gradeDraft[submission.id]?.score ?? submission.score ?? '')"
                        @input="(e) => updateGradeField(submission.id, 'score', e.target.value)"
                      />
                    </label>
                    <label class="field field-feedback">
                      <span class="field-label mono">FEEDBACK</span>
                      <textarea
                        rows="3"
                        class="field-input"
                        :value="(gradeDraft[submission.id]?.feedback ?? submission.feedback ?? '')"
                        @input="(e) => updateGradeField(submission.id, 'feedback', e.target.value)"
                        placeholder="给学生的反馈。支持多段。"
                      ></textarea>
                    </label>
                  </div>
                  <p v-if="gradeError[submission.id]" class="inline-error" role="alert">
                    {{ gradeError[submission.id] }}
                  </p>
                  <div class="grade-actions">
                    <button type="submit" class="primary-btn" :disabled="gradingId === submission.id">
                      <span class="btn-dot"></span>
                      {{ gradingId === submission.id ? '保存中…' : '保存评分' }}
                      <span class="btn-arrow">→</span>
                    </button>
                    <span v-if="gradedFlash === submission.id" class="flash-note mono">
                      ✓ SAVED
                    </span>
                  </div>
                </form>
              </li>
            </ul>
          </section>
        </template>
      </section>
    </section>

    <!-- Create dialog -->
    <div v-if="createOpen" class="dialog-overlay" @click.self="closeCreate">
      <div class="dialog" role="dialog" aria-labelledby="new-assignment-title">
        <header class="dialog-head">
          <div class="dialog-head-left mono">
            <span class="dialog-dot"></span>
            <span>NEW / ASSIGNMENT</span>
          </div>
          <button type="button" class="dialog-close" @click="closeCreate" aria-label="关闭">×</button>
        </header>
        <h2 id="new-assignment-title" class="dialog-title display">Create Assignment</h2>
        <form class="dialog-form" @submit.prevent="onCreate">
          <div class="dialog-row">
            <label class="field">
              <span class="field-label mono">COURSE</span>
              <select v-model="createForm.course_id" class="field-input" :disabled="creating">
                <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label mono">TYPE</span>
              <select v-model="createForm.assignment_type" class="field-input" :disabled="creating">
                <option v-for="t in ASSIGNMENT_TYPES" :key="t.value" :value="t.value">
                  {{ t.label }}
                </option>
              </select>
            </label>
          </div>
          <label class="field">
            <span class="field-label mono">TITLE</span>
            <input
              v-model="createForm.title"
              type="text"
              class="field-input"
              placeholder="例如 Reading: 启发式搜索"
              :disabled="creating"
            />
          </label>
          <label class="field">
            <span class="field-label mono">DESCRIPTION</span>
            <textarea
              v-model="createForm.description"
              rows="4"
              class="field-input"
              placeholder="给学生的作业说明，可选…"
              :disabled="creating"
            ></textarea>
          </label>
          <p v-if="createError" class="inline-error" role="alert">{{ createError }}</p>
          <div class="dialog-actions">
            <button type="button" class="ghost-btn mono" @click="closeCreate" :disabled="creating">
              CANCEL · ESC
            </button>
            <button type="submit" class="primary-btn" :disabled="creating">
              <span class="btn-dot"></span>
              {{ creating ? '创建中…' : '创建为草稿' }}
              <span class="btn-arrow">→</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.teacher-assignments {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 72px) var(--shell-pad-x) var(--space-9);
  background: var(--surface-0);
  color: var(--text-1);
  display: grid;
  gap: 72px;
  max-width: var(--grid-max);
  margin: 0 auto;
}

/* ── Hero (mirrors MyAssignments) ─────── */
.page-hero {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  column-gap: 48px;
  align-items: start;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding-top: 18px;
}

.hero-dot {
  width: 10px;
  height: 10px;
  background: var(--primary);
  display: block;
}

.hero-side-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 10px;
  letter-spacing: 0.32em;
  color: var(--text-3);
}

.hero-content {
  display: grid;
  gap: 20px;
  max-width: 760px;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(3rem, 5.5vw, 5.5rem);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.02em;
  margin: 0;
  display: grid;
  gap: 6px;
}

.hero-title-line {
  display: block;
}

.hero-title-accent {
  color: var(--primary);
  font-style: italic;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.hero-separator {
  width: 56px;
  height: 2px;
  background: var(--primary);
}

.hero-desc {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-3);
  margin: 0;
  max-width: 580px;
}

.hero-desc kbd {
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0 2px;
}

.hero-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 260px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  margin: 0;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
}

.stat-cell {
  padding: 18px 14px 18px 0;
  display: grid;
  gap: 6px;
  border-right: 1px solid var(--border-default);
}

.stat-cell:last-child {
  border-right: none;
  padding-right: 0;
}

.stat-cell-primary {
  background: var(--primary-soft);
  padding-left: 14px;
}

.stat-cell dt {
  font-size: 9px;
  letter-spacing: 0.24em;
  color: var(--text-3);
  margin: 0;
}

.stat-cell dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 700;
  color: var(--text-1);
  line-height: 1;
}

.stat-cell-primary dd {
  color: var(--primary);
}

.create-cta {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: var(--text-1);
  color: var(--text-inverse);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  transition: background var(--dur-2) ease, transform var(--dur-2) ease;
}

.create-cta:hover {
  background: var(--primary);
  transform: translateY(-2px);
}

.cta-plus {
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
}

.cta-hint {
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid currentColor;
  font-size: 10px;
  letter-spacing: 0.14em;
}

/* ── Status ─────────────────────────── */
.status-block {
  padding: 24px 32px;
  background: var(--surface-1);
  border-left: 2px solid var(--primary);
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.status-error {
  color: #b3261e;
  background: rgba(179, 38, 30, 0.06);
  border-left-color: #b3261e;
  padding: 14px 18px;
  font-size: 13px;
}

/* ── Grading layout ─────────────────── */
.grading-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 56px;
  align-items: start;
}

/* ── Rail ────────────────────────────── */
.rail {
  position: sticky;
  top: calc(var(--nav-height) + 24px);
  display: grid;
  gap: 16px;
  border-left: 1px solid var(--border-default);
  padding-left: 24px;
}

.rail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.rail-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
}

.rail-count {
  margin-left: auto;
  color: var(--text-1);
  font-weight: 700;
}

.rail-empty {
  padding: 18px 0;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--text-4);
}

.rail-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
}

.rail-row {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 16px;
  padding: 14px 0;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-default);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: color var(--dur-2) ease;
}

.rail-list li:last-child .rail-row {
  border-bottom: 1px solid var(--border-default);
}

.rail-row:hover .rail-title {
  color: var(--primary);
}

.rail-row.active {
  padding-left: 12px;
  margin-left: -12px;
  background: var(--primary-soft);
  border-top-color: transparent;
  border-left: 2px solid var(--primary);
}

.rail-row.active + li .rail-row {
  border-top-color: transparent;
}

.rail-index {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.1em;
  padding-top: 2px;
}

.rail-row.active .rail-index {
  color: var(--primary);
  font-weight: 700;
}

.rail-body {
  display: grid;
  gap: 6px;
}

.rail-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-1);
  transition: color var(--dur-2) ease;
}

.rail-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-3);
}

.rail-status[data-status='published'] {
  color: var(--primary);
}

.rail-status[data-status='archived'] {
  color: var(--text-4);
}

.rail-dot-sep {
  color: var(--text-4);
}

/* ── Canvas ────────────────────────── */
.canvas {
  display: grid;
  gap: 56px;
}

.canvas-empty {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 24px;
  align-items: center;
  padding: 80px 0;
}

.empty-num {
  font-size: 60px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: -0.02em;
  line-height: 1;
}

.empty-prompt {
  font-size: 16px;
  color: var(--text-3);
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}

.canvas-head {
  display: grid;
  gap: 18px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-default);
}

.canvas-head-left {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-3);
}

.canvas-type-chip {
  padding: 5px 10px;
  background: var(--text-1);
  color: var(--text-inverse);
  letter-spacing: 0.14em;
}

.canvas-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border-default);
  color: var(--text-1);
  letter-spacing: 0.14em;
}

.canvas-status-dot {
  width: 6px;
  height: 6px;
  background: var(--text-3);
}

.canvas-status[data-status='published'] {
  border-color: var(--primary);
  color: var(--primary);
}

.canvas-status[data-status='published'] .canvas-status-dot {
  background: var(--primary);
  animation: pulse 1.6s ease-in-out infinite;
}

.canvas-status[data-status='archived'] {
  color: var(--text-4);
}

@keyframes pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.canvas-due {
  color: var(--text-3);
}

.canvas-title {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.canvas-desc {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-2);
  margin: 0;
  max-width: 760px;
  white-space: pre-wrap;
}

.canvas-actions {
  display: flex;
  gap: 14px;
  margin-top: 6px;
}

/* ── Submissions ──────────────────── */
.canvas-submissions {
  display: grid;
  gap: 20px;
}

.subs-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.subs-head-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
}

.subs-head-label {
  color: var(--text-1);
}

.subs-count {
  margin-left: auto;
  font-weight: 700;
  color: var(--text-1);
}

.subs-empty {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 24px;
  align-items: center;
  padding: 40px 0;
}

.subs-empty p {
  margin: 0;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.6;
}

.sub-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0;
}

.sub-card {
  border-top: 1px solid var(--border-default);
  padding: 28px 0;
  display: grid;
  gap: 18px;
  transition: background var(--dur-2) ease;
}

.sub-list li:last-child .sub-card {
  border-bottom: 1px solid var(--border-default);
}

.sub-card.is-flash {
  animation: flash-sub 1.6s var(--ease-out-expo);
}

@keyframes flash-sub {
  0% { background: var(--primary-soft); }
  100% { background: transparent; }
}

.sub-head {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
  letter-spacing: 0.1em;
}

.sub-index {
  font-weight: 700;
  color: var(--primary);
}

.sub-author {
  color: var(--text-1);
  font-weight: 600;
}

.sub-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--border-default);
  color: var(--text-1);
  letter-spacing: 0.14em;
}

.sub-status-dot {
  width: 5px;
  height: 5px;
  background: var(--text-3);
}

.sub-status[data-state='submitted'] {
  border-color: var(--primary);
  color: var(--primary);
}

.sub-status[data-state='submitted'] .sub-status-dot {
  background: var(--primary);
  animation: pulse 1.6s ease-in-out infinite;
}

.sub-status[data-state='graded'] {
  background: var(--primary);
  color: var(--text-inverse);
  border-color: var(--primary);
}

.sub-status[data-state='graded'] .sub-status-dot {
  background: var(--text-inverse);
}

.sub-time {
  margin-left: auto;
  color: var(--text-3);
}

.sub-body {
  background: var(--surface-1);
  padding: 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
  border-left: 2px solid var(--border-default);
  color: var(--text-1);
}

.grade-form {
  display: grid;
  gap: 12px;
}

.grade-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.grade-head-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
}

.grade-inputs {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 14px;
  align-items: start;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--text-3);
}

.field-input {
  background: var(--surface-0);
  border: 1px solid var(--border-default);
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-1);
  transition: border-color var(--dur-2) ease;
}

.field-input:focus {
  outline: none;
  border-color: var(--primary);
}

.score-input {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.inline-error {
  margin: 0;
  font-size: 13px;
  color: #b3261e;
}

.grade-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* ── Buttons ────────────────────────── */
.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: var(--primary);
  color: var(--text-inverse);
  padding: 14px 26px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  border: none;
  cursor: pointer;
  text-transform: uppercase;
  transition: transform var(--dur-2) ease, background var(--dur-2) ease;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background: var(--primary-hover);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-dot {
  width: 6px;
  height: 6px;
  background: var(--text-inverse);
}

.btn-arrow {
  transition: transform var(--dur-2) ease;
}

.primary-btn:hover:not(:disabled) .btn-arrow {
  transform: translateX(4px);
}

.ghost-btn {
  background: transparent;
  color: var(--text-1);
  padding: 14px 22px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  border: 1px solid var(--border-default);
  cursor: pointer;
  transition: border-color var(--dur-2) ease, color var(--dur-2) ease;
}

.ghost-btn:hover:not(:disabled) {
  border-color: var(--text-1);
  color: var(--text-1);
}

.flash-note {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--primary);
}

/* ── Dialog ────────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  padding: 32px;
  z-index: 200;
  animation: overlay-in 0.25s var(--ease-out-expo);
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog {
  width: min(100%, 640px);
  background: var(--surface-0);
  border: 1px solid var(--text-1);
  padding: 40px;
  display: grid;
  gap: 24px;
  max-height: calc(100vh - 64px);
  overflow: auto;
  animation: dialog-in 0.35s var(--ease-out-expo);
}

@keyframes dialog-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.dialog-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
}

.dialog-close {
  background: transparent;
  border: 1px solid var(--border-default);
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: var(--text-1);
  transition: border-color var(--dur-2) ease;
}

.dialog-close:hover {
  border-color: var(--text-1);
}

.dialog-title {
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
}

.dialog-form {
  display: grid;
  gap: 18px;
}

.dialog-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.dialog-actions {
  display: flex;
  gap: 14px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}

@media (max-width: 1024px) {
  .grading-layout {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .rail {
    position: static;
    border-left: none;
    padding-left: 0;
    border-top: 1px solid var(--border-default);
    padding-top: 20px;
  }
}

@media (max-width: 900px) {
  .page-hero {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .hero-side {
    flex-direction: row;
    padding: 0;
  }

  .hero-side-label {
    writing-mode: horizontal-tb;
    transform: none;
  }

  .hero-stats {
    min-width: 0;
  }

  .dialog-row,
  .grade-inputs {
    grid-template-columns: 1fr;
  }

  .canvas-empty,
  .subs-empty {
    grid-template-columns: 1fr;
  }
}
</style>
