<template>
  <section class="teacher-graph-workspace">
    <header class="teacher-graph-toolbar">
      <div class="toolbar-copy">
        <p class="kicker">{{ modeLabel }}</p>
        <h2>{{ courseName }}</h2>
      </div>

      <div class="toolbar-controls">
        <div v-if="mode === 'course-graph'" class="scope-toggle">
          <button
            type="button"
            class="scope-chip"
            :class="{ active: scopeMode === 'global' }"
            @click="scopeMode = 'global'"
          >
            GLOBAL
          </button>
          <button
            type="button"
            class="scope-chip"
            :class="{ active: scopeMode === 'overlay' }"
            :disabled="overlayOptions.length === 0"
            @click="scopeMode = 'overlay'"
          >
            OVERLAY
          </button>
        </div>

        <label v-if="mode === 'course-graph' && scopeMode === 'overlay'" class="overlay-select">
          <span class="mono">STUDENT</span>
          <select v-model="selectedOverlayUserId">
            <option v-for="option in overlayOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </label>

        <div v-if="mode === 'evidence-graph'" class="evidence-actions">
          <button
            v-if="latestAnalysis?.report_id"
            type="button"
            class="scope-chip"
            @click="openReportPreview"
          >
            REPORT
          </button>
        </div>
      </div>
    </header>

    <AdaptiveGraphPanel
      :graph="graph"
      :panel-kicker="panelKicker"
      :panel-title="panelTitle"
      :empty-message="emptyMessage"
      :selection-actions="selectionActions"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdaptiveGraphPanel from './AdaptiveGraphPanel.vue';
import { getEduAnalysisGraph, getLatestEduAnalysis, getEduReportPreviewUrl } from '../api/edu';
import { getGraph, listCourseOverlays } from '../api/graph';
import {
  buildTeacherGraphQuery,
  buildTeacherOverlayOptions,
  teacherGraphEmptyMessage
} from '../views/teacherGraphWorkspaceState';

const props = defineProps({
  mode: {
    type: String,
    required: true
  },
  courseId: {
    type: String,
    required: true
  },
  graphCourseId: {
    type: String,
    required: true
  },
  courseName: {
    type: String,
    default: ''
  },
  overlayUserId: {
    type: String,
    default: ''
  }
});

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const graph = ref({ nodes: [], edges: [] });
const overlayOptions = ref([]);
const selectedOverlayUserId = ref(props.overlayUserId);
const scopeMode = ref('global');
const latestAnalysis = ref(null);

const modeLabel = computed(() => (
  props.mode === 'course-graph' ? 'COURSE KNOWLEDGE GRAPH' : 'EVIDENCE GRAPH'
));

const panelKicker = computed(() => (
  props.mode === 'course-graph' ? 'Knowledge Graph' : 'Evidence Graph'
));

const panelTitle = computed(() => (
  props.mode === 'course-graph' ? '课程知识图谱' : '教学证据图谱'
));

const emptyMessage = computed(() => teacherGraphEmptyMessage(props.mode, {
  overlay: props.mode === 'course-graph' && scopeMode.value === 'overlay',
  latestMissing: props.mode === 'evidence-graph' && !latestAnalysis.value
}));

const selectionActions = computed(() => {
  if (props.mode === 'course-graph') {
    return [
      {
        id: 'jump-evidence',
        label: '查看证据图谱 →',
        onClick: () => {
          router.push({
            path: '/teacher/edufish',
            query: buildTeacherGraphQuery('evidence-graph', props.courseId)
          });
        }
      }
    ];
  }

  return latestAnalysis.value?.report_id ? [
    {
      id: 'open-report',
      label: '打开质量报告 →',
      onClick: () => {
        window.open(getEduReportPreviewUrl(latestAnalysis.value.report_id), '_blank', 'noopener');
      }
    }
  ] : [];
});

async function loadCourseGraph() {
  loading.value = true;
  try {
    overlayOptions.value = buildTeacherOverlayOptions(await listCourseOverlays(props.graphCourseId));

    if (scopeMode.value === 'overlay' && !selectedOverlayUserId.value && overlayOptions.value.length > 0) {
      selectedOverlayUserId.value = overlayOptions.value[0].id;
    }

    graph.value = await getGraph(props.graphCourseId, selectedOverlayUserId.value && scopeMode.value === 'overlay'
      ? { userId: selectedOverlayUserId.value }
      : {});
  } catch {
    overlayOptions.value = [];
    graph.value = { nodes: [], edges: [] };
  } finally {
    loading.value = false;
  }
}

async function loadEvidenceGraph() {
  loading.value = true;
  try {
    latestAnalysis.value = await getLatestEduAnalysis(props.courseId);
    graph.value = latestAnalysis.value
      ? await getEduAnalysisGraph(latestAnalysis.value.analysis_id)
      : { nodes: [], edges: [] };
  } catch {
    latestAnalysis.value = null;
    graph.value = { nodes: [], edges: [] };
  } finally {
    loading.value = false;
  }
}

function openReportPreview() {
  if (!latestAnalysis.value?.report_id) return;
  window.open(getEduReportPreviewUrl(latestAnalysis.value.report_id), '_blank', 'noopener');
}

watch(
  () => [props.mode, props.courseId],
  async () => {
    if (props.mode === 'course-graph') {
      await loadCourseGraph();
      return;
    }
    await loadEvidenceGraph();
  },
  { immediate: true }
);

watch(
  () => [scopeMode.value, selectedOverlayUserId.value],
  async () => {
    if (props.mode !== 'course-graph') {
      return;
    }
    const nextOverlay = scopeMode.value === 'overlay' ? selectedOverlayUserId.value : '';
    if (
      route.query.view !== props.mode
      || route.query.course !== props.courseId
      || String(route.query.overlay || '') !== String(nextOverlay || '')
    ) {
      router.replace({
        path: '/teacher/edufish',
        query: buildTeacherGraphQuery(props.mode, props.courseId, { overlay: nextOverlay })
      });
    }
    await loadCourseGraph();
  }
);

onMounted(() => {
  if (props.mode === 'course-graph' && props.overlayUserId) {
    scopeMode.value = 'overlay';
    selectedOverlayUserId.value = props.overlayUserId;
  }
});
</script>

<style scoped>
.teacher-graph-workspace {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.teacher-graph-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.toolbar-copy h2 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 18px;
  line-height: 1.2;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.scope-toggle {
  display: inline-flex;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.scope-chip {
  padding: 6px 12px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.scope-chip.active {
  background: var(--primary);
  color: #fff;
}

.scope-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.overlay-select {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 0.16em;
}

.overlay-select select {
  min-width: 120px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  padding: 6px 10px;
  font-family: inherit;
}

.evidence-actions {
  display: flex;
  align-items: center;
}

@media (max-width: 980px) {
  .teacher-graph-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
