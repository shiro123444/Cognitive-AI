<template>
  <section class="course-graph-view container">
    <header class="course-graph-header">
      <RouterLink class="course-graph-back mono" :to="`/courses/${courseId}`">
        Back to course
      </RouterLink>
      <p class="course-graph-kicker mono">KNOWLEDGE GRAPH / 学生知识图谱</p>
      <h1 class="display">{{ course?.title || courseId }}</h1>
      <div class="course-graph-rule" aria-hidden="true"></div>
      <p class="course-graph-desc">
        查看课程概念关系、定义和证据链，支持搜索、筛选、邻域聚焦与节点检查。
      </p>
      <div class="course-graph-links mono">
        <RouterLink :to="`/courses/${courseId}`">SYLLABUS</RouterLink>
        <RouterLink v-if="firstChapterId" :to="`/courses/${courseId}/chapters/${firstChapterId}`">
          CHAPTER FLOW
        </RouterLink>
      </div>
    </header>

    <div v-if="loading" class="panel">
      <p class="status-message">正在加载知识图谱…</p>
    </div>

    <div v-else-if="error" class="panel">
      <p class="status-message error">{{ error }}</p>
      <button type="button" class="btn btn-outline" @click="loadWorkspace">重试</button>
    </div>

    <GraphPanel v-else :graph="graph" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import GraphPanel from '../components/GraphPanel.vue';
import { getCourse } from '../api/courses';
import { getGraph } from '../api/graph';

const props = defineProps({
  courseId: {
    type: String,
    required: true
  }
});

const course = ref(null);
const graph = ref({ nodes: [], edges: [] });
const loading = ref(false);
const error = ref('');
let requestId = 0;

const firstChapterId = computed(() => {
  const chapters = Array.isArray(course.value?.chapters) ? course.value.chapters : [];
  return chapters[0]?.id || '';
});

watch(
  () => props.courseId,
  () => {
    loadWorkspace();
  },
  { immediate: true }
);

async function loadWorkspace() {
  const currentRequestId = requestId + 1;
  requestId = currentRequestId;
  loading.value = true;
  error.value = '';

  try {
    const [courseResult, graphResult] = await Promise.all([
      getCourse(props.courseId),
      getGraph(props.courseId)
    ]);

    if (currentRequestId !== requestId) {
      return;
    }

    course.value = courseResult || null;
    graph.value = graphResult || { nodes: [], edges: [] };
  } catch (caughtError) {
    if (currentRequestId !== requestId) {
      return;
    }
    course.value = null;
    graph.value = { nodes: [], edges: [] };
    error.value = caughtError?.message || '无法加载知识图谱。';
  } finally {
    if (currentRequestId === requestId) {
      loading.value = false;
    }
  }
}
</script>

<style scoped>
.course-graph-view {
  padding-top: calc(var(--nav-height) + 56px);
  padding-bottom: 96px;
}

.course-graph-header {
  display: grid;
  gap: 18px;
  margin-bottom: 40px;
}

.course-graph-back,
.course-graph-links a {
  width: fit-content;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--primary);
  color: var(--primary);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.course-graph-kicker {
  margin: 0;
  color: var(--text-1);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.course-graph-header h1 {
  margin: 0;
  color: var(--text-1);
  font-size: clamp(2.8rem, 5vw, 4.8rem);
  line-height: 0.98;
}

.course-graph-rule {
  width: 38px;
  height: 2px;
  background: var(--primary);
}

.course-graph-desc {
  max-width: 42rem;
  margin: 0;
  color: var(--text-3);
  font-size: 1rem;
  line-height: 1.8;
}

.course-graph-links {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

@media (max-width: 768px) {
  .course-graph-view {
    padding-top: calc(var(--nav-height) + 40px);
    padding-bottom: 72px;
  }

  .course-graph-header h1 {
    font-size: clamp(2.2rem, 11vw, 3.6rem);
  }

  .course-graph-links {
    gap: 12px;
  }
}
</style>
