<template>
  <main class="chapter-flow-view">
    <div v-if="loading" class="chapter-flow-status" role="status">
      Loading chapter flow...
    </div>

    <div v-else-if="error" class="chapter-flow-status" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="chapter-flow-primary" @click="loadChapterFlow">
        Retry
      </button>
    </div>

    <section v-else class="chapter-flow-shell">
      <aside class="chapter-flow-identity">
        <RouterLink class="chapter-flow-back" :to="chapterIdentity.backPath">
          Back to syllabus
        </RouterLink>
        <p class="chapter-flow-course">{{ chapterIdentity.courseLabel }}</p>
        <p class="chapter-flow-kicker">CHAPTER {{ chapterIdentity.chapterNumber }}</p>
        <h1>{{ chapterIdentity.title }}</h1>
        <div class="chapter-flow-rule" aria-hidden="true"></div>
        <p class="chapter-flow-description">{{ chapterIdentity.description }}</p>

        <div class="chapter-flow-progress" aria-label="Chapter progress">
          <div class="chapter-flow-progress-head">
            <span>CHAPTER PROGRESS</span>
            <span>{{ chapterProgress }}%</span>
          </div>
          <div class="chapter-flow-progress-track">
            <span :style="{ width: `${chapterProgress}%` }"></span>
          </div>
        </div>

        <RouterLink class="chapter-flow-graph-link mono" :to="`/courses/${props.courseId}/graph`">
          OPEN KNOWLEDGE GRAPH
        </RouterLink>
      </aside>

      <section class="chapter-flow-main" aria-label="Chapter activities">
        <button
          v-for="activity in activityFlow"
          :key="activity.id"
          type="button"
          :class="['chapter-flow-step', { 'is-active': activity.id === activeActivity?.id }]"
          :aria-pressed="activity.id === activeActivity?.id"
          @click="activateActivity(activity.id)"
        >
          <span class="chapter-flow-step-number">{{ stepNumber(activity.order) }}</span>
          <span class="chapter-flow-step-line" aria-hidden="true"></span>
          <span class="chapter-flow-step-copy">
            <span class="chapter-flow-step-title">{{ activity.displayTitle }}</span>
            <span class="chapter-flow-step-meta">{{ activityMeta(activity) }}</span>
            <span class="chapter-flow-step-summary">{{ activity.summary }}</span>
            <span class="chapter-flow-step-launch">
              {{ activity.launchLabel }}
              <span aria-hidden="true">-&gt;</span>
            </span>
          </span>
        </button>

        <article v-if="activeActivity" class="chapter-flow-detail">
          <p class="chapter-flow-detail-label">ACTIVE ACTIVITY</p>
          <h2>{{ activeActivity.displayTitle }}</h2>
          <p>{{ activeActivity.summary }}</p>
          <dl>
            <div>
              <dt>Type</dt>
              <dd>{{ formatType(activeActivity.type) }}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{{ durationLabel(activeActivity) }}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{{ sourceLabel(activeActivity) }}</dd>
            </div>
          </dl>
          <button type="button" class="chapter-flow-primary" @click="launchActivity(activeActivity)">
            {{ activeActivity.launchLabel }}
          </button>
        </article>
      </section>

      <ChapterConceptTrace :trace="conceptTrace" />
    </section>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { listCourseActivities } from '../api/activities';
import { getChapter, getCourse } from '../api/courses';
import { getGraph } from '../api/graph';
import ChapterConceptTrace from '../components/ChapterConceptTrace.vue';
import {
  buildActivityFlow,
  buildChapterIdentity,
  buildConceptTrace,
  findActiveActivity,
  progressFromActivities
} from './chapterActivityFlowState';

const props = defineProps({
  courseId: {
    type: String,
    required: true
  },
  chapterId: {
    type: String,
    required: true
  }
});

const course = ref(null);
const chapter = ref(null);
const activities = ref([]);
const graph = ref(null);
const loading = ref(false);
const error = ref('');
const activeActivityId = ref('');
let loadRequestId = 0;
const EMPTY_GRAPH = { nodes: [], edges: [] };

const courseChapters = computed(() => (
  Array.isArray(course.value?.chapters) ? course.value.chapters : []
));

const chapterIndex = computed(() => {
  const index = courseChapters.value.findIndex((item) => item?.id === props.chapterId);
  return index >= 0 ? index : 0;
});

const chapterIdentity = computed(() => buildChapterIdentity({
  course: course.value || { id: props.courseId },
  chapter: chapter.value || { id: props.chapterId },
  chapterIndex: chapterIndex.value
}));

const activityFlow = computed(() => buildActivityFlow({
  chapter: chapter.value || { id: props.chapterId },
  activities: activities.value
}));

const chapterProgress = computed(() => progressFromActivities(activityFlow.value));

const activeActivity = computed(() => findActiveActivity(activityFlow.value, activeActivityId.value));

const conceptTrace = computed(() => buildConceptTrace(
  graph.value || {},
  activeActivity.value?.linked_concept_ids || []
));

watch(
  activityFlow,
  (flow) => {
    if (!flow.length) {
      activeActivityId.value = '';
      return;
    }

    if (!flow.some((item) => item?.id === activeActivityId.value)) {
      activeActivityId.value = flow[0].id;
    }
  },
  { immediate: true }
);

watch(
  () => [props.courseId, props.chapterId],
  () => {
    loadChapterFlow();
  },
  { immediate: true }
);

function activateActivity(activityId) {
  activeActivityId.value = activityId;
}

function launchActivity(activity) {
  if (!activity?.id) return;
  activeActivityId.value = activity.id;
}

function stepNumber(order) {
  return String(order || 1).padStart(2, '0');
}

function formatType(type) {
  return String(type || 'activity').replace(/_/g, ' ').toUpperCase();
}

function durationLabel(activity) {
  const minutes = Number(activity?.estimated_minutes);
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} MIN` : 'OPEN';
}

function sourceLabel(activity) {
  const source = activity?.source || activity?.status || 'activity';
  const provider = activity?.provider;
  return [source, provider].filter(Boolean).join(' / ');
}

function activityMeta(activity) {
  return [
    durationLabel(activity),
    formatType(activity?.type),
    sourceLabel(activity)
  ].filter(Boolean).join(' / ');
}

async function loadChapterFlow() {
  const requestId = loadRequestId + 1;
  loadRequestId = requestId;
  loading.value = true;
  error.value = '';
  course.value = null;
  chapter.value = null;
  activities.value = [];
  graph.value = EMPTY_GRAPH;

  getGraph(props.courseId)
    .then((graphResult) => {
      if (requestId === loadRequestId) {
        graph.value = graphResult || EMPTY_GRAPH;
      }
    })
    .catch(() => {
      if (requestId === loadRequestId) {
        graph.value = EMPTY_GRAPH;
      }
    });

  try {
    const [
      courseResult,
      chapterResult,
      activityResult
    ] = await Promise.all([
      getCourse(props.courseId),
      getChapter(props.chapterId),
      listCourseActivities(props.courseId)
    ]);

    if (requestId !== loadRequestId) return;

    course.value = courseResult || null;
    chapter.value = chapterResult || null;
    activities.value = Array.isArray(activityResult) ? activityResult : [];
  } catch (caughtError) {
    if (requestId === loadRequestId) {
      error.value = caughtError?.message || 'Unable to load chapter activity flow.';
    }
  } finally {
    if (requestId === loadRequestId) {
      loading.value = false;
    }
  }
}
</script>

<style scoped>
.chapter-flow-graph-link {
  display: inline-flex;
  width: fit-content;
  margin-top: 24px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--primary, #0022ff);
  color: var(--primary, #0022ff);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
</style>
