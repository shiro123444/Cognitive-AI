<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { listAssignments, listMySubmissions, submitAssignment } from '../api/assignments';
import { listCourses } from '../api/courses';
import {
  assignmentStatusLabel,
  assignmentTypeLabel,
  formatDueAt,
  groupAssignmentsByCourse,
  indexSubmissionsByAssignment,
  submissionStatusLabel,
  validateSubmissionAnswer
} from './assignmentsViewState';

const loading = ref(true);
const errorMessage = ref('');
const courses = ref([]);
const assignments = ref([]);
const submissions = ref([]);

const draftByAssignment = reactive({});
const expandedId = ref(null);
const submittingId = ref(null);
const submitError = reactive({});
const justSubmittedId = ref(null);

const submissionIndex = computed(() => indexSubmissionsByAssignment(submissions.value));
const grouped = computed(() => groupAssignmentsByCourse(assignments.value, courses.value));

const pendingCount = computed(() => {
  let n = 0;
  for (const a of assignments.value) {
    if (!submissionIndex.value.has(a.id)) n += 1;
  }
  return n;
});

const gradedCount = computed(
  () => submissions.value.filter((s) => s.status === 'graded').length
);

async function hydrate() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [c, a, s] = await Promise.all([
      listCourses(),
      listAssignments({ status: 'published' }),
      listMySubmissions()
    ]);
    courses.value = c || [];
    assignments.value = a || [];
    submissions.value = s || [];
  } catch (err) {
    errorMessage.value = err?.message || '无法加载作业';
  } finally {
    loading.value = false;
  }
}

function existingAnswer(assignmentId) {
  const sub = submissionIndex.value.get(assignmentId);
  if (!sub) return '';
  const raw = sub.content?.answer;
  return typeof raw === 'string' ? raw : '';
}

function ensureDraft(assignmentId) {
  if (draftByAssignment[assignmentId] === undefined) {
    draftByAssignment[assignmentId] = existingAnswer(assignmentId);
  }
  return draftByAssignment[assignmentId];
}

function toggleExpand(assignmentId) {
  expandedId.value = expandedId.value === assignmentId ? null : assignmentId;
  ensureDraft(assignmentId);
}

async function onSubmit(assignmentId) {
  const value = draftByAssignment[assignmentId] ?? '';
  const validation = validateSubmissionAnswer(value);
  if (validation) {
    submitError[assignmentId] = validation;
    return;
  }
  submitError[assignmentId] = '';
  submittingId.value = assignmentId;
  try {
    const submission = await submitAssignment(assignmentId, { answer: value.trim() });
    submissions.value = [submission, ...submissions.value.filter((s) => s.id !== submission.id)];
    draftByAssignment[assignmentId] = value.trim();
    justSubmittedId.value = assignmentId;
    setTimeout(() => {
      if (justSubmittedId.value === assignmentId) justSubmittedId.value = null;
    }, 1800);
  } catch (err) {
    submitError[assignmentId] = err?.message || '提交失败，请稍后再试';
  } finally {
    submittingId.value = null;
  }
}

function paddedIndex(n) {
  return String(n).padStart(2, '0');
}

onMounted(hydrate);
</script>

<template>
  <main class="my-assignments">
    <header class="page-hero">
      <div class="hero-side mono">
        <span class="hero-dot"></span>
        <span class="hero-side-label">STUDENT / WORKBENCH</span>
      </div>

      <div class="hero-content">
        <h1 class="hero-title display">
          <span class="hero-title-line">我的作业</span>
          <span class="hero-title-line hero-title-accent">Workbench</span>
        </h1>
        <div class="hero-separator"></div>
        <p class="hero-desc">
          教师发布的作业集中在这里。支持多次提交，批改后会在同一张卡上显示分数与评语。
        </p>
      </div>

      <aside class="hero-stats mono">
        <dl class="stat-grid">
          <div class="stat-cell stat-cell-primary">
            <dt>PENDING</dt>
            <dd>{{ paddedIndex(pendingCount) }}</dd>
          </div>
          <div class="stat-cell">
            <dt>TOTAL</dt>
            <dd>{{ paddedIndex(assignments.length) }}</dd>
          </div>
          <div class="stat-cell">
            <dt>GRADED</dt>
            <dd>{{ paddedIndex(gradedCount) }}</dd>
          </div>
        </dl>
      </aside>
    </header>

    <section v-if="loading" class="status-block">LOADING…</section>
    <section v-else-if="errorMessage" class="status-block status-error" role="alert">
      {{ errorMessage }}
    </section>
    <section v-else-if="!assignments.length" class="status-block">
      暂时没有已发布的作业。请联系教师，或稍后再回到这里。
    </section>

    <section
      v-for="(block, blockIndex) in grouped"
      :key="block.course.id"
      class="course-block"
    >
      <header class="course-head">
        <div class="course-head-left mono">
          <span class="course-index">{{ paddedIndex(blockIndex + 1) }}</span>
          <span class="course-divider"></span>
          <span class="course-id">{{ block.course.id }}</span>
        </div>
        <h2 class="course-title display">{{ block.course.title }}</h2>
      </header>

      <ul class="assignment-list">
        <li
          v-for="(assignment, i) in block.assignments"
          :key="assignment.id"
          class="assignment-row"
          :class="{
            'is-open': expandedId === assignment.id,
            'is-graded': submissionIndex.get(assignment.id)?.status === 'graded',
            'is-submitted': submissionIndex.get(assignment.id)?.status === 'submitted',
            'is-pending': !submissionIndex.get(assignment.id),
            'is-flash': justSubmittedId === assignment.id
          }"
        >
          <button
            class="row-head"
            type="button"
            :aria-expanded="expandedId === assignment.id"
            @click="toggleExpand(assignment.id)"
          >
            <span class="row-number mono">{{ paddedIndex(i + 1) }}</span>

            <div class="row-body">
              <div class="row-meta mono">
                <span class="chip chip-type">{{ assignmentTypeLabel(assignment.assignment_type) }}</span>
                <span class="chip chip-pulse" :data-state="submissionIndex.get(assignment.id)?.status || 'pending'">
                  <span class="chip-dot"></span>
                  {{ submissionIndex.get(assignment.id)
                    ? submissionStatusLabel(submissionIndex.get(assignment.id).status)
                    : '尚未提交' }}
                </span>
                <span class="due">截止 · {{ formatDueAt(assignment.due_at) }}</span>
              </div>
              <h3 class="row-title display">{{ assignment.title }}</h3>

              <div
                v-if="submissionIndex.get(assignment.id)?.feedback || submissionIndex.get(assignment.id)?.score != null"
                class="row-inline-grade"
              >
                <span v-if="submissionIndex.get(assignment.id).score != null" class="score-tag mono">
                  <span class="score-label">SCORE</span>
                  <span class="score-value">{{ submissionIndex.get(assignment.id).score }}</span>
                </span>
                <span v-if="submissionIndex.get(assignment.id).feedback" class="row-feedback">
                  {{ submissionIndex.get(assignment.id).feedback }}
                </span>
              </div>
            </div>

            <span class="row-caret mono" aria-hidden="true">
              {{ expandedId === assignment.id ? '—' : '+' }}
            </span>
          </button>

          <div v-if="expandedId === assignment.id" class="row-detail">
            <div class="detail-side mono">
              <span class="detail-side-label">PROMPT</span>
              <span class="detail-side-line"></span>
            </div>

            <div class="detail-content">
              <p class="detail-desc">{{ assignment.description || '（无作业说明）' }}</p>

              <form class="submit-form" @submit.prevent="onSubmit(assignment.id)">
                <div class="form-head mono">
                  <span class="form-head-dot"></span>
                  <span class="form-head-label">YOUR ANSWER</span>
                  <span class="form-head-hint">{{ (ensureDraft(assignment.id) || '').length }} / 8000</span>
                </div>
                <textarea
                  rows="6"
                  :value="ensureDraft(assignment.id)"
                  @input="(e) => (draftByAssignment[assignment.id] = e.target.value)"
                  :placeholder="submissionIndex.get(assignment.id) ? '可以修改后重新提交…' : '在这里写下你对该作业的回答…'"
                  class="field-textarea"
                ></textarea>

                <p v-if="submitError[assignment.id]" class="inline-error" role="alert">
                  {{ submitError[assignment.id] }}
                </p>

                <div class="form-actions">
                  <button class="primary-btn" type="submit" :disabled="submittingId === assignment.id">
                    <span class="btn-dot"></span>
                    {{ submittingId === assignment.id
                      ? '提交中…'
                      : (submissionIndex.get(assignment.id) ? '重新提交' : '提交作业') }}
                    <span class="btn-arrow">→</span>
                  </button>
                  <span v-if="justSubmittedId === assignment.id" class="flash-note mono">
                    ✓ SUBMITTED · {{ new Date().toLocaleTimeString('zh-CN', { hour12: false }) }}
                  </span>
                </div>
              </form>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.my-assignments {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 72px) var(--shell-pad-x) var(--space-9);
  background: var(--surface-0);
  color: var(--text-1);
  display: grid;
  gap: 72px;
  max-width: var(--grid-max);
  margin: 0 auto;
}

/* ── Hero ─────────────────────────────── */
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

.hero-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 240px;
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

/* ── Status + Empty ─────────────────── */
.status-block {
  padding: 28px 32px;
  background: var(--surface-1);
  border-left: 2px solid var(--primary);
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.status-error {
  color: var(--status-error);
  background: rgba(179, 38, 30, 0.06);
  border-left-color: var(--status-error);
}

/* ── Course block ────────────────────── */
.course-block {
  display: grid;
  gap: 28px;
}

.course-head {
  display: grid;
  grid-template-columns: 56px 1fr;
  column-gap: 48px;
  align-items: end;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 14px;
}

.course-head-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.course-index {
  font-size: 44px;
  font-weight: 800;
  color: var(--primary);
  line-height: 1;
  letter-spacing: -0.02em;
}

.course-divider {
  width: 22px;
  height: 1px;
  background: var(--text-1);
}

.course-id {
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.course-title {
  font-size: clamp(1.5rem, 2.2vw, 2rem);
  font-weight: 700;
  margin: 0;
  color: var(--text-1);
  letter-spacing: -0.01em;
}

/* ── Row ─────────────────────────────── */
.assignment-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0;
}

.assignment-row {
  border-top: 1px solid var(--border-default);
  transition: background var(--dur-2) ease;
}

.assignment-row:last-child {
  border-bottom: 1px solid var(--border-default);
}

.assignment-row.is-open {
  background: var(--surface-1);
}

.assignment-row.is-flash {
  animation: flash-row 1.8s var(--ease-out-expo);
}

@keyframes flash-row {
  0% { background: var(--primary-soft); }
  100% { background: var(--surface-1); }
}

.row-head {
  width: 100%;
  display: grid;
  grid-template-columns: 56px 1fr auto;
  column-gap: 48px;
  align-items: start;
  padding: 28px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: color var(--dur-2) ease;
}

.row-head:hover .row-title {
  color: var(--primary);
}

.row-number {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.08em;
  padding-top: 6px;
}

.assignment-row.is-pending .row-number {
  color: var(--primary);
}

.row-body {
  display: grid;
  gap: 14px;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.chip {
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-1);
  background: var(--surface-0);
  text-transform: uppercase;
}

.chip-type {
  background: var(--text-1);
  color: var(--text-inverse);
  border-color: var(--text-1);
}

.chip-pulse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chip-dot {
  width: 6px;
  height: 6px;
  background: var(--text-3);
  display: inline-block;
}

.chip-pulse[data-state='submitted'] {
  border-color: var(--primary);
  color: var(--primary);
}

.chip-pulse[data-state='submitted'] .chip-dot {
  background: var(--primary);
  animation: pulse 1.6s ease-in-out infinite;
}

.chip-pulse[data-state='graded'] {
  background: var(--primary);
  color: var(--text-inverse);
  border-color: var(--primary);
}

.chip-pulse[data-state='graded'] .chip-dot {
  background: var(--text-inverse);
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.due {
  color: var(--text-3);
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

.row-title {
  font-size: clamp(1.25rem, 1.8vw, 1.75rem);
  font-weight: 700;
  margin: 0;
  color: var(--text-1);
  letter-spacing: -0.01em;
  line-height: 1.2;
  transition: color var(--dur-2) ease;
}

.row-inline-grade {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 4px;
}

.score-tag {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border: 1px solid var(--primary);
  color: var(--primary);
}

.score-label {
  font-size: 9px;
  letter-spacing: 0.24em;
}

.score-value {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.row-feedback {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-3);
  flex: 1;
  border-left: 2px solid var(--border-default);
  padding-left: 12px;
}

.row-caret {
  align-self: center;
  font-size: 24px;
  font-weight: 400;
  color: var(--text-3);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-default);
  transition: background var(--dur-2) ease, border-color var(--dur-2) ease, color var(--dur-2) ease;
}

.row-head:hover .row-caret {
  border-color: var(--text-1);
  color: var(--text-1);
}

.assignment-row.is-open .row-caret {
  background: var(--primary);
  color: var(--text-inverse);
  border-color: var(--primary);
}

/* ── Detail panel ────────────────────── */
.row-detail {
  display: grid;
  grid-template-columns: 56px 1fr;
  column-gap: 48px;
  padding: 0 0 48px;
}

.detail-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.detail-side-label {
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--primary);
}

.detail-side-line {
  width: 1px;
  flex: 1;
  background: var(--border-default);
}

.detail-content {
  display: grid;
  gap: 28px;
  max-width: 760px;
}

.detail-desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text-2);
  white-space: pre-wrap;
}

.submit-form {
  display: grid;
  gap: 12px;
}

.form-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--text-3);
}

.form-head-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
}

.form-head-label {
  color: var(--text-1);
}

.form-head-hint {
  margin-left: auto;
  color: var(--text-3);
}

.field-textarea {
  background: var(--surface-0);
  border: 1px solid var(--border-default);
  padding: 18px 20px;
  font-size: 15px;
  line-height: 1.7;
  font-family: inherit;
  color: var(--text-1);
  resize: vertical;
  transition: border-color var(--dur-2) ease;
  min-height: 160px;
}

.field-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.inline-error {
  margin: 0;
  font-size: 13px;
  color: var(--status-error);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

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

.flash-note {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--primary);
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

  .course-head,
  .row-head,
  .row-detail {
    grid-template-columns: 32px 1fr;
    column-gap: 20px;
  }

  .row-head {
    grid-template-columns: 32px 1fr auto;
  }

  .course-index {
    font-size: 28px;
  }

  .row-caret {
    width: 36px;
    height: 36px;
  }
}
</style>
