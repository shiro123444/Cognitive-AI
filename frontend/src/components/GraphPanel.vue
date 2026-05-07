<template>
  <article class="panel graph-panel graph-workbench course-tool-panel">
    <header class="graph-toolbar graph-workbench-toolbar">
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
          aria-label="搜索概念、定义或类型"
        />
        <label class="graph-toggle">
          <input v-model="showEdgeLabels" type="checkbox" />
          <span>边标签</span>
        </label>
        <label class="graph-toggle">
          <input v-model="focusNeighbors" type="checkbox" :disabled="!selectedNodeId" />
          <span>聚焦邻域</span>
        </label>
      </div>
    </header>

    <div class="graph-stats" aria-label="知识图谱统计">
      <span>{{ stats.nodeCount }} 个节点</span>
      <span>{{ stats.edgeCount }} 条边</span>
      <span>{{ stats.typeCount }} 种类型</span>
      <span v-if="focusNeighbors && selectedNodeId">邻域模式</span>
    </div>

    <div v-if="typeOptions.length > 0" class="graph-type-filter" aria-label="按类型筛选">
      <button
        v-for="option in typeOptions"
        :key="option.type"
        type="button"
        class="graph-type-chip"
        :data-active="activeTypes.includes(option.type)"
        @click="toggleType(option.type)"
      >
        <span>{{ option.type }}</span>
        <span class="mono">{{ option.count }}</span>
      </button>
      <button
        v-if="activeTypes.length > 0"
        type="button"
        class="graph-type-chip graph-type-chip-clear"
        @click="activeTypes = []"
      >
        清除筛选
      </button>
    </div>

    <div class="graph-workbench-grid">
      <section class="graph-stage" aria-label="可交互知识图谱">
        <div class="graph-stage-tools" aria-label="图谱视图控制">
          <button type="button" aria-label="放大图谱" @click="zoomBy(1.2)">+</button>
          <button type="button" aria-label="缩小图谱" @click="zoomBy(0.84)">−</button>
          <button type="button" @click="resetZoom">重置</button>
        </div>

        <svg
          ref="svgRef"
          class="graph-svg"
          :viewBox="`0 0 ${svgBox.width} ${svgBox.height}`"
          role="img"
          aria-label="Course knowledge graph"
        ></svg>
        <div v-if="displayGraph.nodes.length === 0" class="graph-empty">
          <p>{{ emptyMessage }}</p>
        </div>
      </section>

      <aside class="graph-inspector" aria-live="polite">
        <section class="graph-detail">
          <button
            v-if="selected"
            type="button"
            class="graph-detail-close"
            aria-label="关闭图谱详情"
            @click="selected = null"
          >
            关闭
          </button>
          <p class="kicker">{{ selected ? selected.kind : 'Inspect' }}</p>
          <h3>{{ selected ? selectedTitle : '选择一个概念或关系' }}</h3>
          <p v-if="selectedBody">{{ selectedBody }}</p>
          <p v-else class="status-message">
            {{ selected ? '暂无定义或证据。' : '点击节点查看定义、连接概念和证据；点击关系查看边的来源说明。' }}
          </p>

          <div v-if="selected && selectionActions.length" class="graph-selection-actions">
            <button
              v-for="action in availableSelectionActions"
              :key="action.id"
              type="button"
              class="graph-neighbor"
              @click="runSelectionAction(action)"
            >
              <span>{{ action.label }}</span>
              <span class="mono" v-if="action.shortcut">{{ action.shortcut }}</span>
            </button>
          </div>
        </section>

        <section v-if="selectedNodeId" class="graph-neighborhood">
          <div class="graph-panel-heading">
            <p class="kicker">Neighborhood</p>
            <span class="mono">{{ connectedConcepts.length }} connected</span>
          </div>
          <button
            v-for="concept in connectedConcepts"
            :key="concept.id"
            type="button"
            class="graph-neighbor"
            @click="selectConcept(concept)"
          >
            <span>{{ concept.label || concept.name || concept.id }}</span>
            <span class="mono">{{ concept.type || 'concept' }}</span>
          </button>
        </section>

        <section class="graph-relations">
          <div class="graph-panel-heading">
            <p class="kicker">Relations</p>
            <span class="mono">{{ relationRows.length }}</span>
          </div>
          <button
            v-for="row in relationRows"
            :key="row.key"
            type="button"
            class="graph-relation-row"
            :data-active="row.key === selectedEdgeKey"
            @click="selectRelationship(row.edge)"
          >
            <span class="graph-relation-main">{{ row.sourceLabel }}</span>
            <span class="graph-relation-mid">{{ row.relationship }}</span>
            <span class="graph-relation-main">{{ row.targetLabel }}</span>
          </button>
          <p v-if="relationRows.length === 0" class="status-message">当前筛选下没有关系。</p>
        </section>
      </aside>
    </div>
  </article>
</template>

<script setup>
import * as d3 from 'd3';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  edgeEndpointId,
  filterGraph,
  graphNeighborhood,
  graphTypeOptions,
  relationshipRows,
  toGraphStats
} from './graphTransform';
import './EduFishGraph.css';

const props = defineProps({
  graph: {
    type: Object,
    default: () => ({ nodes: [], edges: [] })
  },
  panelKicker: {
    type: String,
    default: 'Knowledge Graph'
  },
  panelTitle: {
    type: String,
    default: '知识图谱'
  },
  emptyMessage: {
    type: String,
    default: '没有匹配的概念。'
  },
  selectionActions: {
    type: Array,
    default: () => []
  }
});

const svgRef = ref(null);
const svgBox = ref({ width: 680, height: 420 });
const search = ref('');
const selected = ref(null);
const showEdgeLabels = ref(false);
const focusNeighbors = ref(false);
const activeTypes = ref([]);
let simulation = null;
let zoomBehavior = null;
let rootGroup = null;

const typeOptions = computed(() => graphTypeOptions(props.graph));
const visibleGraph = computed(() => filterGraph(props.graph, search.value, activeTypes.value));
const selectedNodeId = computed(() =>
  selected.value?.kind === 'Concept' ? selected.value.item.id : ''
);
const displayGraph = computed(() => {
  if (focusNeighbors.value && selectedNodeId.value) {
    return graphNeighborhood(visibleGraph.value, selectedNodeId.value);
  }

  return visibleGraph.value;
});
const stats = computed(() => toGraphStats(displayGraph.value));
const relationRows = computed(() => relationshipRows(displayGraph.value));
const nodeLabelById = computed(() => {
  const labels = new Map();
  visibleGraph.value.nodes.forEach((node) => {
    labels.set(node.id, node.label || node.name || node.id);
  });
  return labels;
});
const nodeById = computed(() => {
  const nodes = new Map();
  visibleGraph.value.nodes.forEach((node) => {
    nodes.set(node.id, node);
  });
  return nodes;
});

const availableSelectionActions = computed(() => {
  if (!selected.value || !Array.isArray(props.selectionActions)) {
    return [];
  }
  return props.selectionActions.filter((action) => {
    if (typeof action.when === 'function') {
      return action.when(selected.value);
    }
    return true;
  });
});

const selectedEdgeKey = computed(() => {
  if (selected.value?.kind !== 'Relationship') {
    return '';
  }
  return edgeKey(selected.value.item);
});

const selectedTitle = computed(() => {
  if (!selected.value) {
    return '';
  }

  if (selected.value.kind === 'Concept') {
    return selected.value.item.label || selected.value.item.name || selected.value.item.id;
  }

  const source = nodeLabelById.value.get(edgeEndpointId(selected.value.item.source)) || edgeEndpointId(selected.value.item.source);
  const target = nodeLabelById.value.get(edgeEndpointId(selected.value.item.target)) || edgeEndpointId(selected.value.item.target);
  const relationship = selected.value.item.relationship || selected.value.item.label || 'relates to';
  return `${source} ${relationship} ${target}`;
});

const selectedBody = computed(() => {
  if (!selected.value) {
    return '';
  }

  if (selected.value.kind === 'Relationship') {
    return selected.value.item.evidence || selected.value.item.definition || selected.value.item.description || '';
  }

  return selected.value.item.definition || selected.value.item.description || selected.value.item.evidence || '';
});

const connectedConcepts = computed(() => {
  if (!selectedNodeId.value) {
    return [];
  }

  const seen = new Set();
  return visibleGraph.value.edges
    .flatMap((edge) => {
      const source = edgeEndpointId(edge.source);
      const target = edgeEndpointId(edge.target);
      if (source === selectedNodeId.value) return [target];
      if (target === selectedNodeId.value) return [source];
      return [];
    })
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => nodeById.value.get(id))
    .filter(Boolean);
});

onMounted(() => {
  drawGraph();
  const stage = svgRef.value?.closest('.graph-stage');
  if (stage) {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          svgBox.value = { width: Math.floor(width), height: Math.floor(height) };
        }
      }
    });
    ro.observe(stage);
  }
});
onBeforeUnmount(stopSimulation);

watch([displayGraph, showEdgeLabels], () => {
  drawGraph();
});

watch(selected, () => {
  nextTick(applySelectionStyles);
});

function toggleType(type) {
  if (activeTypes.value.includes(type)) {
    activeTypes.value = activeTypes.value.filter((active) => active !== type);
  } else {
    activeTypes.value = [...activeTypes.value, type];
  }
  selected.value = null;
}

function stopSimulation() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
}

function edgeKey(edge) {
  const source = edgeEndpointId(edge.source);
  const target = edgeEndpointId(edge.target);
  return edge.id || `${source}->${target}:${edge.relationship || edge.label || ''}`;
}

function selectConcept(node) {
  selected.value = { kind: 'Concept', item: node };
}

function selectRelationship(edge) {
  selected.value = { kind: 'Relationship', item: edge };
}

function runSelectionAction(action) {
  if (typeof action.onClick === 'function') {
    action.onClick(selected.value);
  }
}

function drawGraph() {
  if (!svgRef.value) {
    return;
  }

  stopSimulation();
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const width = svgBox.value.width;
  const height = svgBox.value.height;
  const nodes = displayGraph.value.nodes.map((node) => ({ ...node }));
  const edges = displayGraph.value.edges.map((edge) => ({
    ...edge,
    source: edgeEndpointId(edge.source),
    target: edgeEndpointId(edge.target)
  }));

  if (nodes.length === 0) {
    return;
  }

  const layoutRadius = Math.min(width, height) * 0.24;
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
    node.x = width / 2 + Math.cos(angle) * layoutRadius;
    node.y = height / 2 + Math.sin(angle) * layoutRadius;
  });

  rootGroup = svg.append('g').attr('class', 'graph-canvas');
  zoomBehavior = d3.zoom()
    .scaleExtent([0.65, 2.6])
    .on('zoom', (event) => {
      rootGroup.attr('transform', event.transform);
    });
  svg.call(zoomBehavior).on('dblclick.zoom', null);

  const links = rootGroup
    .append('g')
    .attr('class', 'graph-links')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('class', 'graph-link')
    .attr('stroke-width', 1.8)
    .on('click', (event, edge) => {
      event.stopPropagation();
      selectRelationship(edge);
    });

  const linkLabels = rootGroup
    .append('g')
    .attr('class', 'graph-edge-labels')
    .selectAll('text')
    .data(showEdgeLabels.value ? edges : [])
    .join('text')
    .text((edge) => edge.relationship || edge.label || '')
    .attr('text-anchor', 'middle');

  const nodeGroups = rootGroup
    .append('g')
    .attr('class', 'graph-nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'graph-node')
    .attr('data-type', (node) => node.type || 'concept')
    .attr('data-node-id', (node) => node.id)
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded))
    .on('click', (event, node) => {
      event.stopPropagation();
      selectConcept(node);
    });

  nodeGroups
    .append('circle')
    .attr('r', (node) => node.type ? 23 : 19);

  nodeGroups
    .append('text')
    .attr('y', 34)
    .attr('text-anchor', 'middle')
    .text((node) => node.label || node.name || node.id);

  svg.on('click', () => {
    selected.value = null;
  });

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id((node) => node.id).distance(96).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-170))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(58))
    .on('tick', () => {
      nodes.forEach((node) => {
        node.x = Math.max(116, Math.min(width - 116, node.x));
        node.y = Math.max(58, Math.min(height - 68, node.y));
      });

      links
        .attr('x1', (edge) => edge.source.x)
        .attr('y1', (edge) => edge.source.y)
        .attr('x2', (edge) => edge.target.x)
        .attr('y2', (edge) => edge.target.y);

      linkLabels
        .attr('x', (edge) => (edge.source.x + edge.target.x) / 2)
        .attr('y', (edge) => (edge.source.y + edge.target.y) / 2);

      nodeGroups.attr('transform', (node) => `translate(${node.x},${node.y})`);
    });

  applySelectionStyles();
}

function applySelectionStyles() {
  if (!rootGroup) {
    return;
  }

  const activeNode = selectedNodeId.value;
  const activeEdge = selectedEdgeKey.value;
  const connectedIds = new Set(connectedConcepts.value.map((node) => node.id));

  rootGroup.selectAll('.graph-node')
    .classed('is-selected', (node) => activeNode && node.id === activeNode)
    .classed('is-connected', (node) => activeNode && connectedIds.has(node.id))
    .classed('is-dimmed', (node) => activeNode && node.id !== activeNode && !connectedIds.has(node.id));

  rootGroup.selectAll('.graph-link')
    .classed('is-selected', (edge) => activeEdge && edgeKey(edge) === activeEdge)
    .classed('is-connected', (edge) => {
      if (!activeNode) return false;
      return edgeEndpointId(edge.source) === activeNode || edgeEndpointId(edge.target) === activeNode;
    })
    .classed('is-dimmed', (edge) => {
      if (!activeNode) return false;
      return edgeEndpointId(edge.source) !== activeNode && edgeEndpointId(edge.target) !== activeNode;
    });
}

function zoomBy(scale) {
  if (!svgRef.value || !zoomBehavior) {
    return;
  }
  d3.select(svgRef.value).transition().duration(180).call(zoomBehavior.scaleBy, scale);
}

function resetZoom() {
  if (!svgRef.value || !zoomBehavior) {
    return;
  }
  d3.select(svgRef.value).transition().duration(220).call(zoomBehavior.transform, d3.zoomIdentity);
}

function dragStarted(event, node) {
  if (!event.active && simulation) {
    simulation.alphaTarget(0.3).restart();
  }
  node.fx = node.x;
  node.fy = node.y;
}

function dragged(event, node) {
  node.fx = event.x;
  node.fy = event.y;
}

function dragEnded(event, node) {
  if (!event.active && simulation) {
    simulation.alphaTarget(0);
  }
  node.fx = null;
  node.fy = null;
}
</script>
