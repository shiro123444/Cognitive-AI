<script setup>
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

const props = defineProps({
  node: {
    type: Object,
    default: null
  },
  params: {
    type: Object,
    default: () => ({})
  },
  explanation: {
    type: String,
    default: ''
  },
  statusLabel: {
    type: String,
    default: 'Ready'
  },
  windowState: {
    type: Object,
    default: () => ({ dock: 'top-right', expanded: true })
  }
});

const emit = defineEmits(['patch-node', 'update-window']);

function updateField(key, rawValue) {
  const value = rawValue === '' ? rawValue : Number(rawValue);
  emit('patch-node', props.node.id, { [key]: Number.isNaN(value) ? rawValue : value });
}

function patchWindow(patch) {
  emit('update-window', patch);
}
</script>

<template>
  <NeuroLabFloatingWindow
    title="参数控制"
    :subtitle="node?.label || '未选择节点'"
    :dock="windowState.dock"
    :expanded="windowState.expanded"
    @update:dock="patchWindow({ dock: $event })"
    @update:expanded="patchWindow({ expanded: $event })"
  >
    <div v-if="node" class="lab-inspector">
      <div class="lab-inspector__status">
        <span>{{ node.type }}</span>
        <strong>{{ statusLabel }}</strong>
      </div>

      <div v-if="node.editable" class="lab-inspector__fields">
        <label v-for="field in node.fields" :key="field.key">
          <span>{{ field.label }}</span>
          <select
            v-if="field.kind === 'select'"
            :value="params[field.key]"
            @change="updateField(field.key, $event.target.value)"
          >
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input
            v-else
            :value="params[field.key]"
            :min="field.min"
            :max="field.max"
            :step="field.step || 1"
            type="number"
            @input="updateField(field.key, $event.target.value)"
          >
        </label>
      </div>

      <p class="lab-inspector__hint">{{ explanation || '运行实验后显示该节点的 AI 解释。' }}</p>
    </div>

    <p v-else class="lab-inspector__empty">请选择一个节点以查看参数和节点说明。</p>
  </NeuroLabFloatingWindow>
</template>

<style scoped>
.lab-inspector {
  display: grid;
  gap: 16px;
}

.lab-inspector__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-3);
}

.lab-inspector__status strong {
  color: var(--text-1);
  font-family: var(--font-mono);
}

.lab-inspector__fields {
  display: grid;
  gap: 12px;
}

.lab-inspector__fields label {
  display: grid;
  gap: 6px;
}

.lab-inspector__fields input,
.lab-inspector__fields select {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
}

.lab-inspector__hint,
.lab-inspector__empty {
  margin: 0;
  color: var(--text-3);
  line-height: 1.7;
}
</style>
