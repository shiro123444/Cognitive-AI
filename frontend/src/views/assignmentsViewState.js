/**
 * Pure state helpers for assignment views. Kept free of Vue/axios imports so
 * they can be unit-tested without a DOM or HTTP.
 */

const TYPE_LABELS = {
  reading: '阅读',
  quiz: '测验',
  code_lab: '代码实验',
  experiment: '认知实验',
  reflection: '反思',
  upload: '作业上传'
};

const STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
};

const SUBMISSION_STATUS_LABELS = {
  submitted: '已提交',
  graded: '已批改',
  returned: '已退回'
};

export function assignmentTypeLabel(type) {
  return TYPE_LABELS[type] || type || '未知';
}

export function assignmentStatusLabel(status) {
  return STATUS_LABELS[status] || status || '';
}

export function submissionStatusLabel(status) {
  return SUBMISSION_STATUS_LABELS[status] || status || '';
}

export function formatDueAt(iso) {
  if (!iso) return '无截止日期';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

export function indexSubmissionsByAssignment(submissions) {
  const map = new Map();
  for (const s of submissions || []) {
    if (!s?.assignment_id) continue;
    // First (most recent) wins — the API orders by submitted_at DESC.
    if (!map.has(s.assignment_id)) {
      map.set(s.assignment_id, s);
    }
  }
  return map;
}

export function validateSubmissionAnswer(answer) {
  const trimmed = (answer || '').trim();
  if (!trimmed) return '请填写作业内容后再提交';
  if (trimmed.length > 8000) return '内容过长（上限 8000 字）';
  return null;
}

export function validateGradeInput({ score, feedback }) {
  if (score === '' || score === null || score === undefined) {
    return '请填写分数';
  }
  const n = Number(score);
  if (Number.isNaN(n)) return '分数必须是数字';
  if (n < 0 || n > 100) return '分数需在 0 到 100 之间';
  if ((feedback || '').length > 2000) return '评语过长（上限 2000 字）';
  return null;
}

export function groupAssignmentsByCourse(assignments, courses) {
  const courseMap = new Map((courses || []).map((c) => [c.id, c]));
  const grouped = new Map();
  for (const a of assignments || []) {
    if (!grouped.has(a.course_id)) {
      grouped.set(a.course_id, {
        course: courseMap.get(a.course_id) || { id: a.course_id, title: a.course_id },
        assignments: []
      });
    }
    grouped.get(a.course_id).assignments.push(a);
  }
  return Array.from(grouped.values());
}
