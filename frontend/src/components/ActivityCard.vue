<template>
  <article class="activity-card" :data-type="activity.type">
    <div class="activity-card-head">
      <span class="activity-type">{{ activityTypeLabel(activity.type) }}</span>
      <span class="activity-status">{{ activity.status || 'draft' }}</span>
    </div>
    <h3>{{ activity.title }}</h3>
    <p>{{ activity.summary }}</p>
    <dl class="activity-meta">
      <div>
        <dt>工具</dt>
        <dd>{{ activity.provider || 'manual' }}</dd>
      </div>
      <div>
        <dt>时间</dt>
        <dd>{{ activity.estimated_minutes || 20 }} 分钟</dd>
      </div>
    </dl>
    <RouterLink v-if="coursePath" :to="coursePath" class="activity-card-link">
      打开课程工作区
    </RouterLink>
    <span v-else class="activity-card-link activity-card-link--disabled">
      等待课程关联
    </span>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { activityTypeLabel } from '../views/activityState';

const props = defineProps({
  activity: {
    type: Object,
    required: true
  }
});

const coursePath = computed(() => {
  const courseId = props.activity.course_id || props.activity.courseId;
  return courseId ? `/courses/${courseId}` : '';
});
</script>

<style scoped>
.activity-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line-medium);
  border-radius: var(--radius-md);
  background: rgba(17, 21, 26, 0.82);
}

.activity-card-head,
.activity-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.activity-type,
.activity-status {
  color: var(--text-3);
  font-size: 0.78rem;
  font-weight: 750;
}

.activity-type {
  color: var(--accent-cyan);
}

.activity-status {
  padding: 4px 8px;
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
}

.activity-card h3 {
  margin: 0;
  color: var(--text-1);
  font-size: 1rem;
}

.activity-card p {
  min-height: 1.5em;
  margin: 0;
  color: var(--text-3);
  line-height: 1.55;
}

.activity-meta {
  margin: 0;
  padding-top: 2px;
}

.activity-meta div {
  display: grid;
  gap: 3px;
}

.activity-meta dt {
  color: var(--text-4);
  font-size: 0.72rem;
  font-weight: 750;
}

.activity-meta dd {
  margin: 0;
  color: var(--text-2);
  font-size: 0.88rem;
}

.activity-card-link {
  justify-self: start;
  color: var(--accent-cyan);
  font-size: 0.86rem;
  font-weight: 750;
}

.activity-card-link--disabled {
  color: var(--text-4);
}
</style>
