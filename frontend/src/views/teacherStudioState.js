export function reviewItemCreatedMessage(created) {
  return `已创建审核条目 ${created?.review_item_id || ''}`.trim();
}

export function teacherStudioEntries() {
  return [
    { label: '进入 EDUFISH 工作台', to: '/teacher/edufish' },
    { label: '课程知识图谱', to: '/teacher/edufish?view=course-graph' },
    { label: '证据图谱', to: '/teacher/edufish?view=evidence-graph' },
    { label: '模型配置', to: '/teacher/model-config' }
  ];
}

export function createReviewActionTracker() {
  const pending = new Set();

  return {
    start(id) {
      if (!id || pending.has(id)) {
        return false;
      }
      pending.add(id);
      return true;
    },
    finish(id) {
      pending.delete(id);
    },
    isPending(id) {
      return pending.has(id);
    }
  };
}
