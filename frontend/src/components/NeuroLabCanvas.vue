<script setup>
import { computed } from 'vue';
import { VueFlow } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import NeuroLabNode from './NeuroLabNode.vue';

const props = defineProps({
  workspace: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node']);

const nodeTypes = {
  experiment: NeuroLabNode
};

const flowNodes = computed(() => (
  props.workspace.nodes.map((node, index) => ({
    id: node.id,
    type: 'experiment',
    position: { x: 120 + index * 220, y: 120 },
    data: {
      label: node.label,
      status: node.status,
      type: node.type
    }
  }))
));

const flowEdges = computed(() => props.workspace.edges);

function handleNodeClick({ node }) {
  emit('select-node', node.id);
}
</script>

<template>
  <div class="lab-canvas">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      fit-view-on-init
      class="lab-canvas-surface"
      @node-click="handleNodeClick"
    >
      <MiniMap pannable zoomable />
    </VueFlow>
  </div>
</template>

<style scoped>
.lab-canvas {
  min-height: 360px;
}

.lab-canvas-surface {
  min-height: 360px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-0, #f8fafc);
}
</style>
