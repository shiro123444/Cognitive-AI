<script setup>
import { computed, ref } from 'vue';
import NeuroLabChart from './NeuroLabChart.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  }
});

const activeTab = ref('report');

const tabs = [
  { id: 'waveform', label: '波形' },
  { id: 'spectrum', label: '频谱' },
  { id: 'bands', label: '频带' },
  { id: 'events', label: '事件' },
  { id: 'report', label: '报告' }
];

const reportSections = computed(() => props.model?.report?.sections || []);
const eventRows = computed(() => props.model?.events?.rows || []);
</script>

<template>
  <section class="lab-instruments">
    <div class="lab-instrument-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :data-tab="tab.id"
        type="button"
        :class="{ active: tab.id === activeTab }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'waveform'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.waveform?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'spectrum'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.spectrum?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'bands'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.bands?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'events'" class="lab-instrument-panel">
      <table v-if="eventRows.length">
        <thead>
          <tr><th>阶段</th><th>开始</th><th>结束</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in eventRows" :key="`${row.label}-${row.start_ms}`">
            <td>{{ row.label }}</td>
            <td>{{ row.start_ms }} ms</td>
            <td>{{ row.end_ms }} ms</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无事件数据。</p>
    </div>
    <div v-else class="lab-instrument-panel">
      <article v-for="section in reportSections" :key="section.title">
        <h4>{{ section.title }}</h4>
        <p>{{ section.body }}</p>
      </article>
      <p v-if="!reportSections.length">运行实验后显示实验报告。</p>
    </div>
  </section>
</template>

<style scoped>
.lab-instruments {
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-1, #fff);
}

.lab-instrument-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.lab-instrument-tabs button {
  min-width: 64px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  background: var(--surface-0, #f8fafc);
  color: var(--text-2, #334155);
}

.lab-instrument-tabs button.active {
  border-color: var(--primary, #2563eb);
  color: var(--primary, #2563eb);
}

.lab-instrument-panel table {
  width: 100%;
  border-collapse: collapse;
}

.lab-instrument-panel th,
.lab-instrument-panel td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default, rgba(148, 163, 184, 0.24));
  text-align: left;
}

.lab-instrument-panel article + article {
  margin-top: 16px;
}
</style>
