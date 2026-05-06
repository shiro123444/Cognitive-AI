# Teacher Dual Graph Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two teacher-home graph entries that deep-link into a single EduFish workspace, exposing both course knowledge graphs and teaching evidence graphs with anonymous student overlay support.

**Architecture:** Keep `/teacher/edufish` as the only teacher graph surface. Add minimal backend endpoints for overlay discovery and latest completed EduFish analyses, then reuse the existing course `GraphPanel` through a thin `TeacherGraphWorkspace` wrapper that is selected by `route.query.view`. Do not import MiroFish state or data semantics; only adopt local interaction affordances that fit the current codebase.

**Tech Stack:** Flask, SQLAlchemy, Vue 3, Vue Router, D3, Vitest, Pytest

---

## File Map

**Backend**

- Modify: `backend/app/api/graph.py`
  - Accept `user_id` on `/api/graph`
  - Add `/api/course-overlays`
- Modify: `backend/app/services/course_service.py`
  - Add stable overlay alias generation
  - Add overlay list query across scoped graph entities
- Modify: `backend/app/tests/test_graph_api.py`
  - Add API coverage for overlay list and merged graph loading
- Modify: `backend/app/tests/test_knowledge_scope.py`
  - Extend personal-scope coverage with stable alias assertions
- Modify: `backend/app/api/edu.py`
  - Add `/api/edu/analysis/latest`
- Modify: `backend/app/tests/test_edufish_api.py`
  - Add latest-analysis endpoint tests

**Frontend**

- Modify: `frontend/src/api/graph.js`
  - Support `user_id`
  - Add overlay list wrapper
- Modify: `frontend/src/api/course-workspace.test.js`
  - Cover graph wrapper options and overlay wrapper
- Modify: `frontend/src/api/edu.js`
  - Add latest-analysis wrapper
- Modify: `frontend/src/api/edu.test.js`
  - Cover latest-analysis wrapper
- Modify: `frontend/src/views/teacherStudioState.js`
  - Add the two new teacher homepage entries
- Modify: `frontend/src/api/teacher-studio.test.js`
  - Update homepage entry expectations
- Create: `frontend/src/views/teacherGraphWorkspaceState.js`
  - Query-mode resolution
  - Overlay option normalization
  - Shared empty-state copy
  - Shared query-building helpers
- Create: `frontend/src/views/teacherGraphWorkspaceState.test.js`
  - Unit coverage for the new helpers
- Modify: `frontend/src/components/GraphPanel.vue`
  - Allow configurable header labels, empty copy, and contextual selection actions
- Create: `frontend/src/components/TeacherGraphWorkspace.vue`
  - Load course overlays or latest evidence graph depending on mode
  - Render a thin toolbar above `GraphPanel`
  - Wire selection actions to route updates
- Modify: `frontend/src/views/EduFishStudioView.vue`
  - Resolve `route.query.view`
  - Render `TeacherGraphWorkspace` for `course-graph` and `evidence-graph`
  - Keep current animated EduFish stage for default mode
- Modify: `frontend/src/router/index.test.js`
  - Cover `teacher-edufish` query-mode resolution

---

### Task 1: Add Teacher Overlay Graph APIs

**Files:**
- Modify: `backend/app/api/graph.py`
- Modify: `backend/app/services/course_service.py`
- Modify: `backend/app/tests/test_graph_api.py`
- Modify: `backend/app/tests/test_knowledge_scope.py`

- [ ] **Step 1: Write the failing tests**

```python
from app.db import db
from app.models import Concept, GraphEdge
from app.services.seed_data import seed_courses


def test_graph_endpoint_can_merge_student_overlay_when_user_id_is_present(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-overlay-plan",
                course_id="ai-intro",
                label="Overlay Review Plan",
                definition="Student-specific reinforcement plan.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            GraphEdge(
                id="edge-overlay-plan",
                course_id="ai-intro",
                source_id="concept-search",
                target_id="concept-overlay-plan",
                relationship="reinforces",
                evidence="Teacher-only overlay evidence.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

    res = client.get("/api/graph?course_id=ai-intro&user_id=student-1")
    payload = res.get_json()["data"]

    assert res.status_code == 200
    assert "concept-overlay-plan" in {node["id"] for node in payload["nodes"]}
    assert "edge-overlay-plan" in {edge["id"] for edge in payload["edges"]}


def test_course_overlays_endpoint_returns_stable_aliases(client, app):
    with app.app_context():
        seed_courses()
        db.session.add(
            Concept(
                id="concept-overlay-private",
                course_id="ai-intro",
                label="Private Overlay Concept",
                definition="Hidden until teacher selects the overlay.",
                scope_type="student_personal",
                owner_id="student-2",
            )
        )
        db.session.commit()

    res = client.get("/api/course-overlays?course_id=ai-intro")
    payload = res.get_json()["data"]

    assert res.status_code == 200
    assert payload == [
        {
            "user_id": "student-2",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        }
    ]
```

- [ ] **Step 2: Run the targeted backend tests to verify they fail**

Run:

```bash
cd backend
uv run pytest app/tests/test_graph_api.py app/tests/test_knowledge_scope.py -q
```

Expected:

- `test_graph_endpoint_can_merge_student_overlay_when_user_id_is_present` fails because `/api/graph` ignores `user_id`
- `test_course_overlays_endpoint_returns_stable_aliases` fails with `404` because `/api/course-overlays` does not exist

- [ ] **Step 3: Implement the minimal API and service changes**

```python
# backend/app/api/graph.py
from flask import jsonify, request

from app.api import api_bp
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses


@api_bp.get("/graph")
def get_graph():
    if not CourseService.list_courses():
        seed_courses()
    course_id = request.args.get("course_id")
    user_id = request.args.get("user_id", "").strip()
    include_personal = bool(user_id)
    return jsonify({
        "success": True,
        "data": CourseService.get_graph(
            course_id=course_id,
            owner_id=user_id,
            include_personal=include_personal,
        ),
    })


@api_bp.get("/course-overlays")
def get_course_overlays():
    course_id = request.args.get("course_id", "").strip()
    if not course_id:
        return jsonify({"success": False, "error": "course_id is required"}), 400
    return jsonify({"success": True, "data": CourseService.list_course_overlays(course_id)})
```

```python
# backend/app/services/course_service.py
from app.models import Chapter, Concept, Course, GraphEdge, LearningActivity, Material, QuizItem


class CourseService:
    @staticmethod
    def _stable_overlay_aliases(owner_ids):
        return {
            owner_id: f"学生-{index:02d}"
            for index, owner_id in enumerate(sorted(owner_ids), start=1)
        }

    @staticmethod
    def list_course_overlays(course_id):
        owner_ids = set()

        for model in (Concept, GraphEdge, Material):
            rows = model.query.filter_by(
                course_id=course_id,
                scope_type="student_personal",
            ).all()
            owner_ids.update(row.owner_id for row in rows if row.owner_id)

        alias_map = CourseService._stable_overlay_aliases(owner_ids)
        return [
            {
                "user_id": owner_id,
                "student_alias": alias_map[owner_id],
                "scope_type": "student_personal",
            }
            for owner_id in sorted(owner_ids)
        ]
```

- [ ] **Step 4: Re-run the targeted backend tests**

Run:

```bash
cd backend
uv run pytest app/tests/test_graph_api.py app/tests/test_knowledge_scope.py -q
```

Expected:

- All targeted overlay and scope tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/graph.py backend/app/services/course_service.py backend/app/tests/test_graph_api.py backend/app/tests/test_knowledge_scope.py
git commit -m "feat: add teacher overlay graph endpoints"
```

---

### Task 2: Add Latest Completed Evidence Graph Endpoint

**Files:**
- Modify: `backend/app/api/edu.py`
- Modify: `backend/app/tests/test_edufish_api.py`

- [ ] **Step 1: Write the failing test for latest analysis lookup**

```python
def test_edufish_latest_analysis_endpoint_returns_latest_completed_course_analysis(client):
    dataset_response = client.post("/api/edu/datasets", json=sample_education_payload())
    dataset_id = dataset_response.get_json()["data"]["dataset_id"]

    first_run = client.post("/api/edu/analysis/run", json={
        "dataset_id": dataset_id,
        "template_id": "course-quality",
        "audience_role": "school_admin",
        "scope": {
            "course_id": "AI101",
            "course_name": "人工智能导论",
        },
    }).get_json()["data"]

    second_run = client.post("/api/edu/analysis/run", json={
        "dataset_id": dataset_id,
        "template_id": "course-quality",
        "audience_role": "school_admin",
        "scope": {
            "course_id": "AI101",
            "course_name": "人工智能导论",
        },
    }).get_json()["data"]

    latest = client.get("/api/edu/analysis/latest?course_id=AI101")
    payload = latest.get_json()["data"]

    assert latest.status_code == 200
    assert payload["analysis_id"] == second_run["analysis_id"]
    assert payload["report_id"] == second_run["report_id"]
    assert payload["status"] == "completed"
    assert payload["scope"]["course_id"] == "AI101"
```

- [ ] **Step 2: Run the targeted EduFish API test file**

Run:

```bash
cd backend
uv run pytest app/tests/test_edufish_api.py -q
```

Expected:

- The new latest-analysis test fails because `/api/edu/analysis/latest` does not exist

- [ ] **Step 3: Implement the endpoint with the simplest correct query**

```python
# backend/app/api/edu.py
@api_bp.get("/edu/analysis/latest")
def get_latest_edufish_analysis():
    course_id = request.args.get("course_id", "").strip()
    if not course_id:
        return _error("course_id is required", 400)

    analyses = EduAnalysis.query.order_by(EduAnalysis.updated_at.desc()).all()
    for analysis in analyses:
        serialized = EduStorageService.serialize_analysis(analysis)
        if serialized["status"] != "completed":
            continue
        if (serialized.get("scope") or {}).get("course_id") != course_id:
            continue
        return jsonify({
            "success": True,
            "data": {
                "analysis_id": serialized["analysis_id"],
                "report_id": serialized["report_id"],
                "status": serialized["status"],
                "scope": serialized["scope"],
                "summary": serialized["summary"],
            },
        })

    return _error(f"completed analysis not found for course: {course_id}", 404)
```

- [ ] **Step 4: Re-run the targeted EduFish API tests**

Run:

```bash
cd backend
uv run pytest app/tests/test_edufish_api.py -q
```

Expected:

- All EduFish API tests pass, including the new latest-analysis test

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/edu.py backend/app/tests/test_edufish_api.py
git commit -m "feat: add latest completed edufish analysis endpoint"
```

---

### Task 3: Extend Frontend API Wrappers and Teacher Homepage Entries

**Files:**
- Modify: `frontend/src/api/graph.js`
- Modify: `frontend/src/api/course-workspace.test.js`
- Modify: `frontend/src/api/edu.js`
- Modify: `frontend/src/api/edu.test.js`
- Modify: `frontend/src/views/teacherStudioState.js`
- Modify: `frontend/src/api/teacher-studio.test.js`

- [ ] **Step 1: Write the failing frontend wrapper and entry tests**

```javascript
it('loads graph overlays and optional user-scoped graph data', async () => {
  apiClient.get.mockResolvedValueOnce({ nodes: [], edges: [] });
  apiClient.get.mockResolvedValueOnce([{ user_id: 'student-1', student_alias: '学生-01' }]);

  await expect(getGraph('ai-intro', { userId: 'student-1' })).resolves.toEqual({ nodes: [], edges: [] });
  await expect(listCourseOverlays('ai-intro')).resolves.toEqual([{ user_id: 'student-1', student_alias: '学生-01' }]);

  expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/graph', {
    params: { course_id: 'ai-intro', user_id: 'student-1' },
  });
  expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/course-overlays', {
    params: { course_id: 'ai-intro' },
  });
});

it('loads the latest completed EduFish analysis by course id', async () => {
  apiClient.get.mockResolvedValueOnce({ analysis_id: 'edu_an_2' });

  await expect(getLatestEduAnalysis('AI101')).resolves.toEqual({ analysis_id: 'edu_an_2' });

  expect(apiClient.get).toHaveBeenCalledWith('/api/edu/analysis/latest', {
    params: { course_id: 'AI101' },
  });
});

it('expands teacher studio entries to include both graph entry points', () => {
  expect(teacherStudioEntries()).toEqual([
    { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
    { label: 'COURSE KNOWLEDGE GRAPH', to: '/teacher/edufish?view=course-graph' },
    { label: 'EVIDENCE GRAPH', to: '/teacher/edufish?view=evidence-graph' },
    { label: 'MODEL CONFIG', to: '/teacher/model-config' },
  ]);
});
```

- [ ] **Step 2: Run the focused frontend tests and confirm they fail**

Run:

```bash
cd frontend
npx vitest run src/api/course-workspace.test.js src/api/edu.test.js src/api/teacher-studio.test.js
```

Expected:

- Failures for missing `listCourseOverlays` and `getLatestEduAnalysis`
- Failure for outdated `teacherStudioEntries()` expectations

- [ ] **Step 3: Implement the wrapper and entry changes**

```javascript
// frontend/src/api/graph.js
import apiClient from './client';

export function getGraph(courseId, options = {}) {
  const params = { course_id: courseId };
  if (options.userId) {
    params.user_id = options.userId;
  }
  return apiClient.get('/api/graph', { params });
}

export function listCourseOverlays(courseId) {
  return apiClient.get('/api/course-overlays', {
    params: { course_id: courseId },
  });
}
```

```javascript
// frontend/src/api/edu.js
export function getLatestEduAnalysis(courseId) {
  return apiClient.get('/api/edu/analysis/latest', {
    params: { course_id: courseId },
  });
}
```

```javascript
// frontend/src/views/teacherStudioState.js
export function teacherStudioEntries() {
  return [
    { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
    { label: 'COURSE KNOWLEDGE GRAPH', to: '/teacher/edufish?view=course-graph' },
    { label: 'EVIDENCE GRAPH', to: '/teacher/edufish?view=evidence-graph' },
    { label: 'MODEL CONFIG', to: '/teacher/model-config' },
  ];
}
```

- [ ] **Step 4: Re-run the focused frontend tests**

Run:

```bash
cd frontend
npx vitest run src/api/course-workspace.test.js src/api/edu.test.js src/api/teacher-studio.test.js
```

Expected:

- All wrapper and homepage entry tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/graph.js frontend/src/api/course-workspace.test.js frontend/src/api/edu.js frontend/src/api/edu.test.js frontend/src/views/teacherStudioState.js frontend/src/api/teacher-studio.test.js
git commit -m "feat: wire teacher graph entries and api wrappers"
```

---

### Task 4: Create Teacher Graph Workspace Helpers and Extend GraphPanel

**Files:**
- Create: `frontend/src/views/teacherGraphWorkspaceState.js`
- Create: `frontend/src/views/teacherGraphWorkspaceState.test.js`
- Modify: `frontend/src/components/GraphPanel.vue`

- [ ] **Step 1: Write the failing helper tests**

```javascript
import { describe, expect, it } from 'vitest';
import {
  buildTeacherGraphQuery,
  buildTeacherOverlayOptions,
  resolveTeacherGraphView,
  teacherGraphEmptyMessage,
} from './teacherGraphWorkspaceState';

describe('teacher graph workspace state', () => {
  it('normalizes teacher graph query modes', () => {
    expect(resolveTeacherGraphView('course-graph')).toBe('course-graph');
    expect(resolveTeacherGraphView('evidence-graph')).toBe('evidence-graph');
    expect(resolveTeacherGraphView('report')).toBe('default');
  });

  it('preserves backend aliases when building overlay options', () => {
    expect(buildTeacherOverlayOptions([
      { user_id: 'student-1', student_alias: '学生-01' },
    ])).toEqual([
      { id: 'student-1', label: '学生-01' },
    ]);
  });

  it('builds compact query payloads for graph navigation', () => {
    expect(buildTeacherGraphQuery('course-graph', 'AI101', { overlay: 'student-1' })).toEqual({
      view: 'course-graph',
      course: 'AI101',
      overlay: 'student-1',
    });
  });

  it('returns concise empty-state copy per mode', () => {
    expect(teacherGraphEmptyMessage('course-graph', { overlay: false })).toContain('知识图谱');
    expect(teacherGraphEmptyMessage('evidence-graph', { latestMissing: true })).toContain('NO COMPLETED ANALYSIS');
  });
});
```

- [ ] **Step 2: Run the new helper test file to confirm it fails**

Run:

```bash
cd frontend
npx vitest run src/views/teacherGraphWorkspaceState.test.js
```

Expected:

- Fail because `teacherGraphWorkspaceState.js` does not exist yet

- [ ] **Step 3: Implement the helper module and GraphPanel extension**

```javascript
// frontend/src/views/teacherGraphWorkspaceState.js
const TEACHER_GRAPH_VIEWS = new Set(['course-graph', 'evidence-graph']);

export function resolveTeacherGraphView(view) {
  return TEACHER_GRAPH_VIEWS.has(view) ? view : 'default';
}

export function buildTeacherOverlayOptions(items = []) {
  return items.map((item) => ({
    id: item.user_id,
    label: item.student_alias,
  }));
}

export function buildTeacherGraphQuery(view, courseId, extra = {}) {
  const query = { view, course: courseId };
  Object.entries(extra).forEach(([key, value]) => {
    if (value) query[key] = value;
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
  return '没有可显示的知识图谱。';
}
```

```vue
<!-- frontend/src/components/GraphPanel.vue -->
<script setup>
const props = defineProps({
  graph: { type: Object, default: () => ({ nodes: [], edges: [] }) },
  panelKicker: { type: String, default: 'Knowledge Graph' },
  panelTitle: { type: String, default: '知识图谱' },
  emptyMessage: { type: String, default: '没有匹配的概念。' },
  selectionActions: { type: Array, default: () => [] },
});

const availableSelectionActions = computed(() => {
  if (!selected.value) return [];
  return props.selectionActions.filter((action) => action.when?.(selected.value) ?? true);
});

function runSelectionAction(action) {
  action.onClick?.(selected.value);
}
</script>

<template>
  <article class="panel graph-panel graph-workbench course-tool-panel">
    <header class="graph-toolbar graph-workbench-toolbar">
      <div>
        <p class="kicker">{{ panelKicker }}</p>
        <h2>{{ panelTitle }}</h2>
      </div>
      ...
    </header>
    ...
    <div v-if="displayGraph.nodes.length === 0" class="graph-empty">
      <p>{{ emptyMessage }}</p>
    </div>
    ...
    <section class="graph-detail">
      ...
      <div v-if="availableSelectionActions.length" class="graph-detail-actions">
        <button
          v-for="action in availableSelectionActions"
          :key="action.id"
          type="button"
          class="graph-neighbor"
          @click="runSelectionAction(action)"
        >
          {{ action.label }}
        </button>
      </div>
    </section>
  </article>
</template>
```

- [ ] **Step 4: Re-run the helper tests**

Run:

```bash
cd frontend
npx vitest run src/views/teacherGraphWorkspaceState.test.js
```

Expected:

- The helper test file passes

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/teacherGraphWorkspaceState.js frontend/src/views/teacherGraphWorkspaceState.test.js frontend/src/components/GraphPanel.vue
git commit -m "feat: add teacher graph workspace helpers"
```

---

### Task 5: Build the Teacher Graph Workspace and Integrate Query-Driven EduFish Modes

**Files:**
- Create: `frontend/src/components/TeacherGraphWorkspace.vue`
- Modify: `frontend/src/views/EduFishStudioView.vue`
- Modify: `frontend/src/router/index.test.js`

- [ ] **Step 1: Write the failing route-level test for teacher graph query modes**

```javascript
it('resolves teacher edufish graph query modes without changing the route name', () => {
  const route = router.resolve('/teacher/edufish?view=course-graph&course=AI101');
  expect(route.name).toBe('teacher-edufish');
  expect(route.query.view).toBe('course-graph');
  expect(route.query.course).toBe('AI101');
});
```

- [ ] **Step 2: Run the route test and a focused build guard**

Run:

```bash
cd frontend
npx vitest run src/router/index.test.js
```

Expected:

- The new route-query assertion fails because the test does not exist yet, or EduFish query behavior is not wired in the component layer

- [ ] **Step 3: Implement the workspace wrapper and EduFish integration**

```vue
<!-- frontend/src/components/TeacherGraphWorkspace.vue -->
<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import GraphPanel from './GraphPanel.vue';
import { getGraph, listCourseOverlays } from '../api/graph';
import { getEduAnalysisGraph, getLatestEduAnalysis } from '../api/edu';
import {
  buildTeacherGraphQuery,
  buildTeacherOverlayOptions,
  teacherGraphEmptyMessage,
} from '../views/teacherGraphWorkspaceState';

const props = defineProps({
  mode: { type: String, required: true },
  courseId: { type: String, required: true },
  courseName: { type: String, default: '' },
  overlayUserId: { type: String, default: '' },
});

const router = useRouter();
const graph = ref({ nodes: [], edges: [] });
const overlays = ref([]);
const latest = ref(null);
const loading = ref(false);
const selectedOverlay = ref(props.overlayUserId);

const emptyMessage = computed(() =>
  teacherGraphEmptyMessage(props.mode, {
    overlay: Boolean(selectedOverlay.value),
    latestMissing: props.mode === 'evidence-graph' && !latest.value,
  })
);

const selectionActions = computed(() => [
  {
    id: 'open-evidence',
    label: '查看证据图谱 →',
    when: (selection) => props.mode === 'course-graph' && selection.kind !== 'Relationship',
    onClick: () => router.push({
      path: '/teacher/edufish',
      query: buildTeacherGraphQuery('evidence-graph', props.courseId),
    }),
  },
  {
    id: 'open-report',
    label: '跳到质量报告 →',
    when: () => props.mode === 'evidence-graph' && Boolean(latest.value?.report_id),
    onClick: () => router.push({
      path: '/teacher/edufish',
      query: { ...buildTeacherGraphQuery('evidence-graph', props.courseId), panel: 'report' },
    }),
  },
]);

watch(
  () => [props.mode, props.courseId, selectedOverlay.value],
  async () => {
    loading.value = true;
    if (props.mode === 'course-graph') {
      overlays.value = buildTeacherOverlayOptions(await listCourseOverlays(props.courseId));
      graph.value = await getGraph(props.courseId, selectedOverlay.value ? { userId: selectedOverlay.value } : {});
      latest.value = null;
    } else {
      latest.value = await getLatestEduAnalysis(props.courseId);
      graph.value = latest.value ? await getEduAnalysisGraph(latest.value.analysis_id) : { nodes: [], edges: [] };
      overlays.value = [];
    }
    loading.value = false;
  },
  { immediate: true }
);
</script>
```

```vue
<!-- frontend/src/views/EduFishStudioView.vue -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TeacherGraphWorkspace from '../components/TeacherGraphWorkspace.vue';
import { buildTeacherGraphQuery, resolveTeacherGraphView } from './teacherGraphWorkspaceState';

const route = useRoute();
const router = useRouter();
const workspaceView = computed(() => resolveTeacherGraphView(String(route.query.view || '')));
const overlayUserId = computed(() => String(route.query.overlay || ''));

watch(
  () => route.query.course,
  (courseId) => {
    if (courseId && courseOptions.some((course) => course.id === courseId)) {
      selectedCourseId.value = String(courseId);
    }
  },
  { immediate: true }
);

watch(selectedCourseId, (courseId) => {
  if (workspaceView.value === 'default') return;
  router.replace({
    path: '/teacher/edufish',
    query: buildTeacherGraphQuery(workspaceView.value, courseId, { overlay: overlayUserId.value }),
  });
});
</script>

<template>
  <section class="edufish-os" @mousemove="trackPointer">
    <aside class="os-rail">...</aside>

    <main class="os-stage">
      <TeacherGraphWorkspace
        v-if="workspaceView !== 'default'"
        :mode="workspaceView"
        :course-id="selectedCourseId"
        :course-name="currentCourse.name"
        :overlay-user-id="overlayUserId"
      />

      <template v-else>
        <div class="stage-watermark" aria-hidden="true">EF</div>
        <section class="pulse-panel" aria-label="AI Pulse">...</section>
        <section class="evidence-stage" aria-label="Evidence Graph">...</section>
        <footer class="stage-footer">...</footer>
      </template>
    </main>
  </section>
</template>
```

- [ ] **Step 4: Run the route test, full frontend tests, and a production build**

Run:

```bash
cd frontend
npx vitest run src/router/index.test.js
npm test
npm run build
```

Expected:

- Route query test passes
- Full frontend suite stays green
- Production build succeeds without new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TeacherGraphWorkspace.vue frontend/src/views/EduFishStudioView.vue frontend/src/router/index.test.js
git commit -m "feat: add teacher dual graph workspace modes"
```

---

### Task 6: Final End-to-End Verification

**Files:**
- No new code
- Verify all files touched in Tasks 1-5

- [ ] **Step 1: Run the full backend test suite**

Run:

```bash
cd backend
uv run pytest app/tests -q
```

Expected:

- Full backend suite passes

- [ ] **Step 2: Run the full frontend test suite**

Run:

```bash
cd frontend
npm test
```

Expected:

- Full frontend suite passes

- [ ] **Step 3: Run the production frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected:

- Build succeeds
- Any chunk-size warning is noted but no fatal build errors are introduced

- [ ] **Step 4: Manually verify the three core URLs**

Run:

```bash
google-chrome --headless --disable-gpu --no-sandbox --dump-dom http://localhost:3000/teacher
google-chrome --headless --disable-gpu --no-sandbox --dump-dom "http://localhost:3000/teacher/edufish?view=course-graph&course=AI101"
google-chrome --headless --disable-gpu --no-sandbox --dump-dom "http://localhost:3000/teacher/edufish?view=evidence-graph&course=AI101"
```

Expected:

- Teacher homepage contains `COURSE KNOWLEDGE GRAPH` and `EVIDENCE GRAPH`
- `course-graph` mode renders the graph workbench
- `evidence-graph` mode renders the graph workbench instead of the animated default stage

- [ ] **Step 5: Commit the verification-passed state**

```bash
git add backend/app/api/graph.py backend/app/services/course_service.py backend/app/tests/test_graph_api.py backend/app/tests/test_knowledge_scope.py backend/app/api/edu.py backend/app/tests/test_edufish_api.py frontend/src/api/graph.js frontend/src/api/course-workspace.test.js frontend/src/api/edu.js frontend/src/api/edu.test.js frontend/src/views/teacherStudioState.js frontend/src/api/teacher-studio.test.js frontend/src/views/teacherGraphWorkspaceState.js frontend/src/views/teacherGraphWorkspaceState.test.js frontend/src/components/GraphPanel.vue frontend/src/components/TeacherGraphWorkspace.vue frontend/src/views/EduFishStudioView.vue frontend/src/router/index.test.js
git commit -m "feat: add teacher dual graph workspaces"
```

---

## Spec Coverage Check

This plan implements every approved requirement from `docs/superpowers/specs/2026-05-06-teacher-dual-graph-entry-design.md`:

1. Teacher homepage gets two new graph entries: Task 3
2. Both entries deep-link into the existing EduFish shell: Tasks 3 and 5
3. Course knowledge graph uses anonymous student overlays: Tasks 1, 3, 4, and 5
4. Evidence graph uses latest completed course analysis: Tasks 2 and 5
5. Both graph modes support browsing plus jump actions: Tasks 4 and 5
6. MiroFish state is not imported; only local interaction hooks are added: Task 4

No approved spec section is left without an implementation task.

## Placeholder Scan

No `TBD`, `TODO`, “handle appropriately”, or deferred pseudocode markers remain in this plan. Every code-touching step contains concrete file paths, code blocks, commands, and expected outcomes.

## Type Consistency Check

The implementation plan consistently uses these names across tasks:

1. Backend overlay endpoint: `/api/course-overlays`
2. Backend latest-analysis endpoint: `/api/edu/analysis/latest`
3. Frontend graph modes: `course-graph` and `evidence-graph`
4. Frontend helper module: `teacherGraphWorkspaceState.js`
5. Frontend wrapper component: `TeacherGraphWorkspace.vue`

---

Plan complete and saved to `docs/superpowers/plans/2026-05-06-teacher-dual-graph-entry.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
