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
const submittingId = ref(null);
const submitError = reactive({});

const submissionIndex = computed(() => indexSubmissionsByAssignment(submissions.value));
const grouped = computed(() => groupAssignmentsByCourse(assignments.value, courses.value));

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
  } catch (err) {
    submitError[assignmentId] = err?.message || '提交失败，请稍后再试';
  } finally {
    submittingId.value = null;
  }
}

onMounted(hydrate);
</script>

<template>
  <main class="my-assignments">
    <header class="page-head">
      <span class="page-tag mono">MY ASSIGNMENTS</span>
      <h1 class="page-title display">我的作业</h1>
      <p class="page-sub">教师发布的作业会出现在这里。支持文字回答，提交后可以继续修改并再次提交。</p>
    </header>

    <section v-if="loading" class="status-block">加载中…</section>
    <section v-else-if="errorMessage" class="status-block status-error" role="alert">
      {{ errorMessage }}
    </section>
    <section v-else-if="!assignments.length" class="status-block">
      暂时没有已发布的作业。请联系教师或稍后再看。
    </section>

    <section
      v-for="block in grouped"
      :key="block.course.id"
      class="course-block"
    >
      <header class="course-head">
        <span class="course-id mono">{{ block.course.id }}</span>
        <h2 class="course-title">{{ block.course.title }}</h2>
      </header>

      <ul class="assignment-list">
        <li
          v-for="assignment in block.assignments"
          :key="assignment.id"
          class="assignment-card"
        >
          <div class="assignment-meta">
            <span class="chip chip-type">{{ assignmentTypeLabel(assignment.assignment_type) }}</span>
            <span class="chip chip-status">{{ assignmentStatusLabel(assignment.status) }}</span>
            <span class="due mono">截止：{{ formatDueAt(assignment.due_at) }}</span>
          </div>
          <h3 class="assignment-title">{{ assignment.title }}</h3>
          <p class="assignment-desc">{{ assignment.description || '（无作业说明）' }}</p>

          <div class="submission-state">
            <template v-if="submissionIndex.get(assignment.id)">
              <span class="chip chip-submission">
                {{ submissionStatusLabel(submissionIndex.get(assignment.id).status) }}
              </span>
              <span v-if="submissionIndex.get(assignment.id).score !== null" class="score mono">
                分数 {{ submissionIndex.get(assignment.id).score }}
              </span>
              <span v-if="submissionIndex.get(assignment.id).feedback" class="feedback">
                教师评语：{{ submissionIndex.get(assignment.id).feedback }}
              </span>
            </template>
            <template v-else>
              <span class="chip chip-submission chip-muted">尚未提交</span>
            </template>
          </div>

          <form class="submit-form" @submit.prevent="onSubmit(assignment.id)">
            <label class="field">
              <span class="field-label">你的回答</span>
              <textarea
                rows="4"
                :value="ensureDraft(assignment.id)"
                @input="(e) => (draftByAssignment[assignment.id] = e.target.value)"
                placeholder="在此输入你对该作业的回答…"
                class="field-input"
              ></textarea>
            </label>
            <p v-if="submitError[assignment.id]" class="inline-error" role="alert">
              {{ submitError[assignment.id] }}
            </p>
            <button class="submit-btn" type="submit" :disabled="submittingId === assignment.id">
              {{ submittingId === assignment.id ? '提交中…' : '提交作业' }}
            </button>
          </form>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.my-assignments {
  max-width: 960px;
  margin: 0 auto;
  padding: calc(var(--nav-height) + 56px) 24px 96px;
  color: var(--text-1);
  display: grid;
  gap: 40px;
}

.page-head {
  display: grid;
  gap: 12px;
  max-width: 720px;
}

.page-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--text-3);
}

.page-title {
  font-family: var(--font-display);
  font-size: clamp(32px, 3.5vw, 46px);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.page-sub {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-3);
  margin: 0;
}

.status-block {
  padding: 24px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  font-size: 14px;
  color: var(--text-3);
}

.status-error {
  color: #b3261e;
  background: rgba(179, 38, 30, 0.06);
  border-left: 2px solid #b3261e;
}

.course-block {
  display: grid;
  gap: 16px;
}

.course-head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.course-id {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--text-3);
}

.course-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-1);
}

.assignment-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 18px;
}

.assignment-card {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 24px;
  display: grid;
  gap: 12px;
}

.assignment-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}

.chip {
  padding: 4px 10px;
  border: 1px solid var(--border-subtle);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--text-1);
}

.chip-type {
  background: var(--surface-2, rgba(0, 0, 0, 0.04));
}

.chip-status {
  color: var(--text-3);
}

.chip-submission {
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  border-color: var(--text-1);
}

.chip-muted {
  background: transparent;
  color: var(--text-3);
  border-color: var(--border-subtle);
}

.due {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.08em;
}

.assignment-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.assignment-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-2, var(--text-3));
  white-space: pre-wrap;
}

.submission-state {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.score {
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--text-1);
}

.feedback {
  font-size: 13px;
  color: var(--text-3);
  padding-left: 12px;
  border-left: 2px solid var(--border-subtle);
}

.submit-form {
  display: grid;
  gap: 10px;
  margin-top: 6px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
}

.field-input {
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  padding: 12px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-1);
  resize: vertical;
  transition: border-color var(--dur-2) ease;
}

.field-input:focus {
  outline: none;
  border-color: var(--text-1);
}

.inline-error {
  margin: 0;
  font-size: 13px;
  color: #b3261e;
}

.submit-btn {
  justify-self: start;
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  padding: 12px 22px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  border: none;
  cursor: pointer;
  transition: opacity var(--dur-2) ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
