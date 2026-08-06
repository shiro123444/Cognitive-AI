const TEACHER_GRAPH_VIEWS = new Set(['course-graph', 'evidence-graph']);

export function resolveTeacherGraphView(view) {
  return TEACHER_GRAPH_VIEWS.has(view) ? view : 'default';
}

export function buildTeacherOverlayOptions(items = []) {
  return items.map((item) => ({
    id: item.user_id,
    label: item.student_alias
  }));
}

export function buildTeacherGraphQuery(view, courseId, extra = {}) {
  const query = {
    view,
    course: courseId
  };

  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query[key] = value;
    }
  });

  return query;
}

export function teacherGraphEmptyMessage(mode, context = {}) {
  if (mode === 'evidence-graph' && context.latestMissing) {
    return 'NO COMPLETED ANALYSIS';
  }

  if (mode === 'course-graph' && context.overlay) {
    return '该学生暂无个性化训练痕迹。';
  }

  if (mode === 'course-graph') {
    return '没有可显示的知识图谱。';
  }

  return '没有可显示的证据图谱。';
}
