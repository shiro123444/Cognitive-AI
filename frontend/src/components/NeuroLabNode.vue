<script setup>
import { Handle, Position } from '@vue-flow/core';

defineProps({
  data: {
    type: Object,
    required: true
  }
});
</script>

<template>
  <div class="node-card" :data-status="data.status">
    <Handle type="target" :position="Position.Left" />
    <div class="node-header">
      <strong>{{ data.label }}</strong>
      <span class="node-status">{{ data.status }}</span>
    </div>
    <p class="node-kind">{{ data.type }}</p>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.node-card {
  min-width: 180px;
  padding: 14px 16px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-1, #fff);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.node-header strong {
  color: var(--text-1, #0f172a);
  font-size: 14px;
  line-height: 1.4;
}

.node-status,
.node-kind {
  margin: 0;
  color: var(--text-3, #64748b);
  font-size: 12px;
}
</style>
