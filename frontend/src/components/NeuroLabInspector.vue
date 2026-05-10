<script setup>
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
  }
});

const emit = defineEmits(['patch-node']);

function updateField(key, rawValue) {
  const value = rawValue === '' ? rawValue : Number(rawValue);
  emit('patch-node', props.node.id, { [key]: Number.isNaN(value) ? rawValue : value });
}
</script>

<template>
  <aside class="lab-inspector">
    <template v-if="node">
      <header class="lab-inspector-header">
        <h3>{{ node.label }}</h3>
        <p>{{ node.type }}</p>
      </header>

      <div v-if="node.editable" class="lab-inspector-form">
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

      <p class="lab-inspector-explanation">{{ explanation || '运行实验后显示该节点的 AI 解释。' }}</p>
    </template>

    <p v-else class="lab-inspector-empty">请选择一个节点。</p>
  </aside>
</template>

<style scoped>
.lab-inspector {
  display: grid;
  gap: 16px;
  align-content: start;
  padding: 20px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-1, #fff);
}

.lab-inspector-header h3,
.lab-inspector-header p {
  margin: 0;
}

.lab-inspector-header {
  display: grid;
  gap: 8px;
}

.lab-inspector-form {
  display: grid;
  gap: 14px;
}

.lab-inspector-form label {
  display: grid;
  gap: 8px;
}

.lab-inspector-form input,
.lab-inspector-form select {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-0, #f8fafc);
}

.lab-inspector-explanation,
.lab-inspector-empty {
  margin: 0;
  color: var(--text-3, #64748b);
  line-height: 1.6;
}
</style>
