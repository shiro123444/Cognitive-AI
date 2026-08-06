<template>
  <article class="panel graph-panel graph-workbench">
    <header class="graph-toolbar">
      <div>
        <p class="kicker">{{ panelKicker }}</p>
        <h2>{{ panelTitle }}</h2>
      </div>
      <div class="graph-controls">
        <input
          v-model="search"
          class="graph-search"
          type="search"
          placeholder="搜索概念、定义或类型"
          aria-label="搜索概念"
        />
        <label class="graph-toggle">
          <input v-model="showEdgeLabels" type="checkbox" />
          <span>边标签</span>
        </label>
      </div>
    </header>

    <div class="graph-stats" aria-label="图谱统计">
      <span>{{ stats.nodeCount }} 个节点</span>
      <span>{{ stats.edgeCount }} 条边</span>
      <span>{{ stats.typeCount }} 种类型</span>
    </div>

    <div class="graph-workbench-grid">
      <section class="graph-stage" aria-label="交互式知识图谱">
        <div class="graph-stage-tools">
          <button type="button" aria-label="放大" @click="zoomBy(1.2)">+</button>
          <button type="button" aria-label="缩小" @click="zoomBy(0.8)">-</button>
          <button type="button" @click="resetView">重置</button>
        </div>

        <canvas
          ref="canvasRef"
          class="graph-canvas"
          :style="{ width: '100%', height: '100%' }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @wheel.prevent="onWheel"
        ></canvas>

        <div v-if="displayGraph.nodes.length === 0" class="graph-empty">
          <p>没有匹配的概念。</p>
        </div>
      </section>

      <aside class="graph-inspector" aria-live="polite">
        <section class="graph-detail">
          <button
            v-if="selected"
            type="button"
            class="graph-detail-close"
            aria-label="关闭详情"
            @click="selected = null"
          >
            关闭
          </button>
          <p class="kicker">{{ selected ? selected.kind : 'Inspect' }}</p>
          <h3>{{ selectedTitle }}</h3>
          <p v-if="selectedBody">{{ selectedBody }}</p>
          <p v-else class="status-message">点击节点查看定义和关联概念。</p>
        </section>

        <section v-if="selectedNodeId" class="graph-neighborhood">
          <div class="graph-panel-heading">
            <p class="kicker">Neighborhood</p>
            <span class="mono">{{ connectedNodes.length }} 关联</span>
          </div>
          <button
            v-for="node in connectedNodes"
            :key="node.id"
            type="button"
            class="graph-neighbor"
            @click="selectNode(node)"
          >
            <span>{{ node.label || node.name || node.id }}</span>
            <span class="mono">{{ node.type || 'concept' }}</span>
          </button>
        </section>
      </aside>
    </div>
  </article>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CanvasRenderer } from '../graph/CanvasRenderer';
import { filterGraph, graphTypeOptions, toGraphStats } from './graphTransform';
import LayoutWorker from '../graph/layout.worker.js?worker&inline';
import './EduFishGraph.css';

const props = defineProps({
  graph: { type: Object, default: () => ({ nodes: [], edges: [] }) },
  panelKicker: { type: String, default: 'Knowledge Graph' },
  panelTitle: { type: String, default: '知识图谱' },
  width: { type: Number, default: 800 },
  height: { type: Number, default: 560 },
});

const canvasRef = ref(null);
const search = ref('');
const showEdgeLabels = ref(false);
const selected = ref(null);
let renderer = null;
let worker = null;
let pointerState = { mode: 'idle', sx: 0, sy: 0, tx: 0, ty: 0, k: 1 };

// Graph data
const visibleGraph = computed(() => filterGraph(props.graph, search.value, []));
const displayGraph = computed(() => visibleGraph.value);
const stats = computed(() => toGraphStats(displayGraph.value));

const nodeById = computed(() => {
  const m = new Map();
  displayGraph.value.nodes.forEach((n) => m.set(n.id, n));
  return m;
});

const selectedNodeId = computed(() =>
  selected.value?.kind === 'Concept' ? selected.value.item.id : ''
);

const selectedTitle = computed(() => {
  if (!selected.value) return '选择一个概念';
  if (selected.value.kind === 'Concept') {
    return selected.value.item.label || selected.value.item.name || selected.value.item.id;
  }
  return '关系';
});

const selectedBody = computed(() => {
  if (!selected.value) return '';
  return selected.value.item.definition || selected.value.item.description || '';
});

const connectedNodes = computed(() => {
  if (!selectedNodeId.value) return [];
  const seen = new Set();
  const results = [];
  for (const edge of displayGraph.value.edges) {
    const sid = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const tid = typeof edge.target === 'object' ? edge.target.id : edge.target;
    let other;
    if (sid === selectedNodeId.value) other = tid;
    else if (tid === selectedNodeId.value) other = sid;
    else continue;
    if (seen.has(other)) continue;
    seen.add(other);
    const node = nodeById.value.get(other);
    if (node) results.push(node);
  }
  return results;
});

// ---- lifecycle ----

onMounted(() => initCanvas());
onBeforeUnmount(() => destroy());

function initCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  renderer = new CanvasRenderer(canvas, {
    width: w,
    height: h,
    nodeRadius: 12,
    onSelectNode: (node) => { selectNode(node); },
    onSelectEdge: (edge) => { selected.value = { kind: 'Relationship', item: edge }; },
  });

  renderer.setGraph(props.graph);

  // Center view
  const tx = w / 2;
  const ty = h / 2;
  pointerState = { mode: 'idle', sx: 0, sy: 0, tx, ty, k: 1 };
  renderer.setTransform(tx, ty, 1);
  renderer.requestDraw();

  // Init layout worker
  initWorker();
}

function initWorker() {
  try {
    worker = new LayoutWorker();
    worker.onmessage = (e) => {
      if (e.data.type === 'tick' && renderer) {
        renderer.updatePositions(e.data.positions);
        renderer.requestDraw();
      }
    };
    worker.postMessage({
      type: 'init',
      nodes: props.graph.nodes,
      edges: props.graph.edges,
      width: props.width,
      height: props.height,
    });
  } catch {
    // Worker not available — fall through, positions come from graph data
  }
}

function destroy() {
  renderer?.destroy();
  worker?.postMessage({ type: 'stop' });
  worker?.terminate();
}

// ---- pointer events ----

function onPointerDown(e) {
  if (!renderer) return;
  const canvas = canvasRef.value;
  canvas.setPointerCapture(e.pointerId);

  // Hit test: check for node drag first
  const hitNode = renderer.hitTestNode(e.clientX, e.clientY);
  if (hitNode) {
    pointerState = {
      mode: 'drag-node',
      sx: e.clientX,
      sy: e.clientY,
      tx: pointerState.tx,
      ty: pointerState.ty,
      k: pointerState.k,
      node: hitNode,
    };
    selectNode(hitNode);
    // Notify worker of drag start
    const pos = renderer.screenToGraph(e.clientX, e.clientY);
    worker?.postMessage({ type: 'drag', nodeId: hitNode.id, x: pos.x, y: pos.y });
    return;
  }

  // Pan
  pointerState = {
    mode: 'pan',
    sx: e.clientX,
    sy: e.clientY,
    tx: pointerState.tx,
    ty: pointerState.ty,
    k: pointerState.k,
  };
}

function onPointerMove(e) {
  if (!renderer || pointerState.mode === 'idle') return;

  if (pointerState.mode === 'drag-node') {
    const dx = e.clientX - pointerState.sx;
    const dy = e.clientY - pointerState.sy;
    const pos = renderer.screenToGraph(e.clientX, e.clientY);
    worker?.postMessage({
      type: 'drag',
      nodeId: pointerState.node.id,
      x: pos.x,
      y: pos.y,
    });
    return;
  }

  if (pointerState.mode === 'pan') {
    const tx = pointerState.tx + (e.clientX - pointerState.sx);
    const ty = pointerState.ty + (e.clientY - pointerState.sy);
    renderer.setTransform(tx, ty, pointerState.k);
    renderer.requestDraw();
  }
}

function onPointerUp(e) {
  if (pointerState.mode === 'drag-node' && pointerState.node) {
    worker?.postMessage({ type: 'release', nodeId: pointerState.node.id });
  }
  if (pointerState.mode !== 'idle') {
    pointerState.tx = renderer?.transform?.x ?? pointerState.tx;
    pointerState.ty = renderer?.transform?.y ?? pointerState.ty;
  }
  pointerState.mode = 'idle';
  pointerState.node = null;
}

function onWheel(e) {
  if (!renderer) return;
  const scale = e.deltaY < 0 ? 1.1 : 0.9;
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const { x: tx, y: ty, k } = renderer.transform;
  const newK = Math.max(0.1, Math.min(5, k * scale));
  const newTx = mx - (mx - tx) * (newK / k);
  const newTy = my - (my - ty) * (newK / k);

  pointerState.tx = newTx;
  pointerState.ty = newTy;
  pointerState.k = newK;
  renderer.setTransform(newTx, newTy, newK);
  renderer.requestDraw();
}

function zoomBy(factor) {
  if (!renderer) return;
  const canvas = canvasRef.value;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const { x: tx, y: ty, k } = renderer.transform;
  const newK = Math.max(0.1, Math.min(5, k * factor));
  const cx = w / 2;
  const cy = h / 2;
  const newTx = cx - (cx - tx) * (newK / k);
  const newTy = cy - (cy - ty) * (newK / k);

  pointerState.tx = newTx;
  pointerState.ty = newTy;
  pointerState.k = newK;
  renderer.setTransform(newTx, newTy, newK);
  renderer.requestDraw();
}

function resetView() {
  if (!renderer) return;
  const canvas = canvasRef.value;
  const tx = canvas.clientWidth / 2;
  const ty = canvas.clientHeight / 2;
  pointerState.tx = tx;
  pointerState.ty = ty;
  pointerState.k = 1;
  renderer.setTransform(tx, ty, 1);
  renderer.requestDraw();
}

function selectNode(node) {
  selected.value = { kind: 'Concept', item: node };
  if (renderer) {
    renderer.selectedNodeId = node.id;
    renderer.requestDraw();
  }
}

// ---- watch graph data changes ----

watch(
  () => props.graph,
  (g) => {
    if (!renderer) return;
    renderer.setGraph(g);
    renderer.requestDraw();
    worker?.postMessage({
      type: 'init',
      nodes: g.nodes,
      edges: g.edges,
      width: props.width,
      height: props.height,
    });
  },
  { deep: true }
);

watch(selected, () => {
  if (!renderer) return;
  renderer.selectedNodeId = selectedNodeId.value;
  renderer.requestDraw();
});
</script>

<style scoped>
.graph-canvas {
  display: block;
  cursor: grab;
  touch-action: none;
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--primary) 2%, transparent), transparent 60%);
}
.graph-canvas:active {
  cursor: grabbing;
}
</style>
