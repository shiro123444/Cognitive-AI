<template>
  <GraphPanel
    v-if="useSvg"
    :graph="graph"
    :panel-kicker="panelKicker"
    :panel-title="panelTitle"
    :empty-message="emptyMessage"
    :selection-actions="selectionActions"
  />
  <LargeGraphPanel
    v-else
    :graph="graph"
    :panel-kicker="panelKicker"
    :panel-title="panelTitle"
    :width="width"
    :height="height"
  />
</template>

<script setup>
import { computed } from 'vue';
import GraphPanel from './GraphPanel.vue';
import LargeGraphPanel from './LargeGraphPanel.vue';

const props = defineProps({
  graph: { type: Object, required: true },
  panelKicker: { type: String, default: 'Knowledge Graph' },
  panelTitle: { type: String, default: '知识图谱' },
  emptyMessage: { type: String, default: '没有匹配的概念。' },
  selectionActions: { type: Array, default: () => [] },
  width: { type: Number, default: 800 },
  height: { type: Number, default: 560 },
  /** Node count threshold — SVG below, Canvas above. */
  canvasThreshold: { type: Number, default: 500 },
});

const useSvg = computed(() => {
  const nodeCount = Array.isArray(props.graph.nodes) ? props.graph.nodes.length : 0;
  return nodeCount < props.canvasThreshold;
});
</script>
