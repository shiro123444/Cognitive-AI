export function reviewItemCreatedMessage(created) {
  return `已创建审核条目 ${created?.review_item_id || ''}`.trim();
}

export function teacherStudioEntries() {
  return [
    { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
    { label: 'COURSE KNOWLEDGE GRAPH', to: '/teacher/edufish?view=course-graph' },
    { label: 'EVIDENCE GRAPH', to: '/teacher/edufish?view=evidence-graph' },
    { label: 'MODEL CONFIG', to: '/teacher/model-config' }
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
