<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

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

const actionInFlight = ref(null);

const selectedAssignment = computed(
  () => assignments.value.find((a) => a.id === selectedId.value) || null
);

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

function seedGradeDraft(submission) {
  if (gradeDraft[submission.id]) return;
  gradeDraft[submission.id] = {
    score: submission.score ?? '',
    feedback: submission.feedback ?? ''
  };
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

async function onGrade(submission) {
  seedGradeDraft(submission);
  const draft = gradeDraft[submission.id];
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
  } catch (err) {
    gradeError[submission.id] = err?.message || '保存失败';
  } finally {
    gradingId.value = null;
  }
}

function selectAssignment(id) {
  selectedId.value = id;
}

watch(selectedId, (id) => {
  loadSubmissionsFor(id);
});

onMounted(async () => {
  await hydrate();
  if (selectedId.value) {
    await loadSubmissionsFor(selectedId.value);
  }
});
</script>

<template>
  <main class="teacher-assignments">
    <header class="page-head">
      <span class="page-tag mono">TEACHER / GRADING</span>
      <h1 class="page-title display">作业批改</h1>
      <p class="page-sub">在这里创建、发布作业，查看学生提交并即时打分。</p>
    </header>

    <section v-if="errorMessage" class="status-block status-error" role="alert">
      {{ errorMessage }}
    </section>

    <section class="create-block">
      <h2 class="block-title">新建作业</h2>
      <form class="create-form" @submit.prevent="onCreate">
        <label class="field">
          <span class="field-label">课程</span>
          <select v-model="createForm.course_id" class="field-input" :disabled="creating">
            <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">类型</span>
          <select v-model="createForm.assignment_type" class="field-input" :disabled="creating">
            <option v-for="t in ASSIGNMENT_TYPES" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </label>
        <label class="field field-wide">
          <span class="field-label">标题</span>
          <input
            v-model="createForm.title"
            type="text"
            class="field-input"
            placeholder="例如 Reading: 启发式搜索"
            :disabled="creating"
          />
        </label>
        <label class="field field-wide">
          <span class="field-label">作业说明</span>
          <textarea
            v-model="createForm.description"
            rows="3"
            class="field-input"
            placeholder="给学生的作业说明，可选…"
            :disabled="creating"
          ></textarea>
        </label>
        <p v-if="createError" class="inline-error" role="alert">{{ createError }}</p>
        <button type="submit" class="primary-btn" :disabled="creating">
          {{ creating ? '创建中…' : '创建为草稿' }}
        </button>
      </form>
    </section>

    <section class="grading-layout">
      <aside class="assignment-list-aside">
        <h2 class="block-title">作业列表</h2>
        <p v-if="loading" class="muted">加载中…</p>
        <ul v-else class="assignment-list">
          <li v-if="!assignments.length" class="muted">暂无作业</li>
          <li v-for="a in assignments" :key="a.id">
            <button
              type="button"
              class="assignment-row"
              :class="{ active: a.id === selectedId }"
              @click="selectAssignment(a.id)"
            >
              <span class="row-title">{{ a.title }}</span>
              <span class="row-meta">
                <span class="chip chip-status" :data-status="a.status">
                  {{ assignmentStatusLabel(a.status) }}
                </span>
                <span class="muted mono">{{ a.submission_count }} 提交</span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <section class="assignment-detail">
        <template v-if="!selectedAssignment">
          <p class="muted">从左侧选择作业以查看提交。</p>
        </template>
        <template v-else>
          <header class="detail-head">
            <div class="detail-meta">
              <span class="chip chip-type">{{ assignmentTypeLabel(selectedAssignment.assignment_type) }}</span>
              <span class="chip chip-status" :data-status="selectedAssignment.status">
                {{ assignmentStatusLabel(selectedAssignment.status) }}
              </span>
              <span class="muted mono">截止 {{ formatDueAt(selectedAssignment.due_at) }}</span>
            </div>
            <h2 class="detail-title">{{ selectedAssignment.title }}</h2>
            <p v-if="selectedAssignment.description" class="detail-desc">
              {{ selectedAssignment.description }}
            </p>
            <div class="detail-actions">
              <button
                v-if="selectedAssignment.status === 'draft'"
                type="button"
                class="primary-btn"
                :disabled="actionInFlight === `publish:${selectedAssignment.id}`"
                @click="onPublish(selectedAssignment.id)"
              >
                {{ actionInFlight === `publish:${selectedAssignment.id}` ? '发布中…' : '发布作业' }}
              </button>
              <button
                v-if="selectedAssignment.status !== 'archived'"
                type="button"
                class="ghost-btn"
                :disabled="actionInFlight === `archive:${selectedAssignment.id}`"
                @click="onArchive(selectedAssignment.id)"
              >
                {{ actionInFlight === `archive:${selectedAssignment.id}` ? '归档中…' : '归档' }}
              </button>
            </div>
          </header>

          <section class="submissions-section">
            <div class="submissions-head">
              <h3 class="block-title">学生提交 ({{ submissions.length }})</h3>
            </div>
            <p v-if="submissionsLoading" class="muted">加载中…</p>
            <p v-else-if="submissionsError" class="status-error" role="alert">
              {{ submissionsError }}
            </p>
            <p v-else-if="!submissions.length" class="muted">
              {{ selectedAssignment.status === 'published' ? '还没有学生提交。' : '发布后才能收到提交。' }}
            </p>

            <ul v-else class="submission-list">
              <li v-for="submission in submissions" :key="submission.id" class="submission-card">
                <header class="submission-head">
                  <span class="submission-author mono">{{ submission.student_id }}</span>
                  <span class="chip chip-submission">
                    {{ submissionStatusLabel(submission.status) }}
                  </span>
                  <span class="muted mono">
                    提交 {{ formatDueAt(submission.submitted_at) }}
                  </span>
                </header>
                <pre class="submission-body">{{
                  submission.content?.answer || JSON.stringify(submission.content, null, 2) || '（空提交）'
                }}</pre>

                <form class="grade-form" @submit.prevent="onGrade(submission)">
                  <div class="grade-inputs">
                    <label class="field field-score">
                      <span class="field-label">分数 (0-100)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        class="field-input"
                        :value="gradeDraft[submission.id]?.score ?? (submission.score ?? '')"
                        @input="(e) => (gradeDraft[submission.id] = { ...(gradeDraft[submission.id] || {}), score: e.target.value, feedback: gradeDraft[submission.id]?.feedback ?? submission.feedback ?? '' })"
                      />
                    </label>
                    <label class="field field-wide">
                      <span class="field-label">评语</span>
                      <textarea
                        rows="2"
                        class="field-input"
                        :value="gradeDraft[submission.id]?.feedback ?? (submission.feedback ?? '')"
                        @input="(e) => (gradeDraft[submission.id] = { ...(gradeDraft[submission.id] || {}), feedback: e.target.value, score: gradeDraft[submission.id]?.score ?? submission.score ?? '' })"
                        placeholder="给学生的反馈…"
                      ></textarea>
                    </label>
                  </div>
                  <p v-if="gradeError[submission.id]" class="inline-error" role="alert">
                    {{ gradeError[submission.id] }}
                  </p>
                  <button type="submit" class="primary-btn" :disabled="gradingId === submission.id">
                    {{ gradingId === submission.id ? '保存中…' : '保存评分' }}
                  </button>
                </form>
              </li>
            </ul>
          </section>
        </template>
      </section>
    </section>
  </main>
</template>

<style scoped>
.teacher-assignments {
  max-width: 1180px;
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
  padding: 16px 20px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  font-size: 14px;
  color: var(--text-3);
}

.status-error {
  color: #b3261e;
  background: rgba(179, 38, 30, 0.06);
  border-left: 2px solid #b3261e;
  padding: 10px 14px;
  font-size: 13px;
}

.muted {
  color: var(--text-3);
  font-size: 13px;
}

.block-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
  margin: 0 0 14px;
}

.create-block {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 28px;
}

.create-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-wide {
  grid-column: 1 / -1;
}

.field-score {
  max-width: 180px;
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
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-1);
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
  grid-column: 1 / -1;
}

.primary-btn {
  justify-self: start;
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  border: none;
  cursor: pointer;
  transition: opacity var(--dur-2) ease;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost-btn {
  background: transparent;
  color: var(--text-1);
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color var(--dur-2) ease;
}

.ghost-btn:hover:not(:disabled) {
  border-color: var(--text-1);
}

.grading-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

.assignment-list-aside {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 20px;
  position: sticky;
  top: calc(var(--nav-height) + 24px);
}

.assignment-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.assignment-row {
  width: 100%;
  display: grid;
  gap: 6px;
  padding: 12px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: background var(--dur-2) ease, border-color var(--dur-2) ease;
}

.assignment-row:hover {
  background: var(--surface-2, rgba(0, 0, 0, 0.04));
}

.assignment-row.active {
  background: var(--surface-0);
  border-color: var(--text-1);
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.row-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}

.chip {
  padding: 3px 8px;
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

.chip-status[data-status='published'] {
  border-color: var(--text-1);
  color: var(--text-1);
}

.chip-status[data-status='archived'] {
  background: var(--surface-2, rgba(0, 0, 0, 0.04));
  color: var(--text-3);
}

.chip-submission {
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  border-color: var(--text-1);
}

.assignment-detail {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 28px;
  display: grid;
  gap: 24px;
}

.detail-head {
  display: grid;
  gap: 10px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 18px;
}

.detail-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.detail-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}

.detail-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-2, var(--text-3));
  margin: 0;
  white-space: pre-wrap;
}

.detail-actions {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}

.submissions-section {
  display: grid;
  gap: 16px;
}

.submissions-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.submission-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 14px;
}

.submission-card {
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  padding: 20px;
  display: grid;
  gap: 14px;
}

.submission-head {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
}

.submission-author {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-1);
  font-weight: 700;
}

.submission-body {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 14px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
}

.grade-form {
  display: grid;
  gap: 10px;
}

.grade-inputs {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 14px;
}

@media (max-width: 900px) {
  .create-form {
    grid-template-columns: 1fr;
  }

  .grading-layout {
    grid-template-columns: 1fr;
  }

  .assignment-list-aside {
    position: static;
  }

  .grade-inputs {
    grid-template-columns: 1fr;
  }
}
</style>
