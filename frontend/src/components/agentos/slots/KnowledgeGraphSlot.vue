<template>
  <div class="slot-container knowledge-graph-slot">
    <div class="slot-header">
      <div class="header-left">
        <span class="slot-badge">KNOWLEDGE GRAPH</span>
        <span class="slot-title">动态概念关系拓扑</span>
      </div>
      <div class="header-right">
        <span class="node-count-badge">{{ nodes.length }} 概念节点</span>
        <button class="btn-icon" @click="resetZoom" title="重置视角">⟲</button>
      </div>
    </div>

    <div class="graph-viewport" ref="viewportRef">
      <svg ref="svgRef" class="d3-svg"></svg>

      <div v-if="selectedNode" class="node-detail-floating">
        <div class="detail-header">
          <strong>{{ selectedNode.name }}</strong>
          <span class="category-tag">{{ selectedNode.category }}</span>
        </div>
        <p class="detail-desc">与核心记忆编码和神经回路高度关联。</p>
        <button class="btn-ask-node" @click="$emit('ask-node', selectedNode.name)">
          💬 让 Agent 深入剖析该概念
        </button>
      </div>
    </div>

    <div class="graph-legend">
      <span class="legend-item"><span class="dot structure"></span> 脑区结构</span>
      <span class="legend-item"><span class="dot function"></span> 认知功能</span>
      <span class="legend-item"><span class="dot mechanism"></span> 生理机制</span>
      <span class="legend-item"><span class="dot molecular"></span> 分子/受体</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({ nodes: [], links: [] }),
  },
});

defineEmits(['ask-node']);

const svgRef = ref(null);
const viewportRef = ref(null);
const selectedNode = ref(null);
let simulation = null;
let zoomBehavior = null;

const nodes = ref([]);
const links = ref([]);

const CATEGORY_COLORS = {
  BrainStructure: '#d5658a',
  CognitiveFunction: '#29b8d4',
  Mechanism: '#d9b63f',
  Molecular: '#9b72cf',
  Subfield: '#e87551',
  default: '#69b56b',
};

function initGraph() {
  if (!svgRef.value || !viewportRef.value) return;

  const width = viewportRef.value.clientWidth || 500;
  const height = viewportRef.value.clientHeight || 420;

  const rawNodes = props.data?.nodes?.length
    ? JSON.parse(JSON.stringify(props.data.nodes))
    : [
        { id: '1', name: '海马体 (Hippocampus)', category: 'BrainStructure', radius: 26 },
        { id: '2', name: '陈述性记忆', category: 'CognitiveFunction', radius: 22 },
        { id: '3', name: '长时程增强 (LTP)', category: 'Mechanism', radius: 20 },
        { id: '4', name: '齿状回 (DG)', category: 'Subfield', radius: 18 },
        { id: '5', name: 'CA3 区', category: 'Subfield', radius: 18 },
        { id: '6', name: 'NMDA 受体', category: 'Molecular', radius: 16 },
        { id: '7', name: '前额叶皮层 (PFC)', category: 'BrainStructure', radius: 22 },
      ];

  const rawLinks = props.data?.links?.length
    ? JSON.parse(JSON.stringify(props.data.links))
    : [
        { source: '1', target: '2', label: '主要支持' },
        { source: '1', target: '3', label: '生理机制' },
        { source: '1', target: '4', label: '包含亚区' },
        { source: '4', target: '5', label: '苔藓纤维' },
        { source: '3', target: '6', label: '依赖受体' },
        { source: '1', target: '7', label: '回路投射' },
      ];

  nodes.value = rawNodes;
  links.value = rawLinks;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('class', 'graph-root');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.4, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  simulation = d3.forceSimulation(rawNodes)
    .force('link', d3.forceLink(rawLinks).id((d) => d.id).distance(85))
    .force('charge', d3.forceManyBody().strength(-240))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius((d) => (d.radius || 20) + 8));

  // Draw links
  const link = g.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(rawLinks)
    .enter()
    .append('line')
    .attr('stroke', '#171713')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,2');

  // Draw nodes
  const node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(rawNodes)
    .enter()
    .append('g')
    .attr('class', 'node-group')
    .call(
      d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    )
    .on('click', (event, d) => {
      selectedNode.value = d;
    });

  // Node circle with hard border
  node.append('circle')
    .attr('r', (d) => d.radius || 20)
    .attr('fill', (d) => CATEGORY_COLORS[d.category] || CATEGORY_COLORS.default)
    .attr('stroke', '#171713')
    .attr('stroke-width', 2);

  // Node text
  node.append('text')
    .text((d) => d.name)
    .attr('text-anchor', 'middle')
    .attr('dy', (d) => (d.radius || 20) + 14)
    .attr('font-size', '10px')
    .attr('font-weight', '700')
    .attr('fill', '#171713');

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

function resetZoom() {
  if (svgRef.value && zoomBehavior) {
    d3.select(svgRef.value).transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
  }
}

onMounted(() => {
  nextTick(initGraph);
});

watch(() => props.data, () => {
  nextTick(initGraph);
}, { deep: true });
</script>

<style scoped>
.slot-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 4px 4px 0 var(--rk-ink, #171713);
  border-radius: 4px;
  overflow: hidden;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--rk-panel, #e4e3dc);
  border-bottom: 2px solid var(--rk-ink, #171713);
}

.slot-badge {
  font-size: 9px;
  font-weight: 800;
  background: var(--rk-yellow, #d9b63f);
  color: var(--rk-ink, #171713);
  padding: 2px 6px;
  border: 1.5px solid var(--rk-ink, #171713);
  margin-right: 8px;
}

.slot-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--rk-ink, #171713);
}

.node-count-badge {
  font-size: 10px;
  font-weight: 700;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 2px 8px;
  margin-right: 6px;
}

.btn-icon {
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  cursor: pointer;
  padding: 2px 8px;
  font-weight: bold;
}

.btn-icon:hover {
  background: var(--rk-yellow, #d9b63f);
}

.graph-viewport {
  flex: 1;
  position: relative;
  min-height: 380px;
  background: #fbfbf9;
}

.d3-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.d3-svg:active {
  cursor: grabbing;
}

.node-detail-floating {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 3px 3px 0 var(--rk-ink, #171713);
  padding: 10px 14px;
  z-index: 10;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.category-tag {
  font-size: 10px;
  background: var(--rk-panel, #e4e3dc);
  padding: 2px 6px;
  border: 1px solid var(--rk-ink, #171713);
}

.detail-desc {
  font-size: 11px;
  color: var(--rk-muted, #6b6a61);
  margin: 0 0 8px 0;
}

.btn-ask-node {
  width: 100%;
  background: var(--rk-pink, #d5658a);
  color: #ffffff;
  border: 1.5px solid var(--rk-ink, #171713);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
  padding: 6px;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
}

.btn-ask-node:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--rk-ink, #171713);
}

.graph-legend {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: var(--rk-panel, #e4e3dc);
  border-top: 1.5px solid var(--rk-ink, #171713);
  font-size: 10px;
  font-weight: 700;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--rk-ink, #171713);
}

.dot.structure { background: #d5658a; }
.dot.function { background: #29b8d4; }
.dot.mechanism { background: #d9b63f; }
.dot.molecular { background: #9b72cf; }
</style>
