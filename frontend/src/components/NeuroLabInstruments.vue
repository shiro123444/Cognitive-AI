<script setup>
import { computed } from 'vue';
import NeuroLabChart from './NeuroLabChart.vue';
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  },
  windows: {
    type: Object,
    default: () => ({
      metrics: { dock: 'bottom-left', expanded: false },
      assistant: { dock: 'bottom-right', expanded: true }
    })
  }
});

const emit = defineEmits(['update-window']);

const metrics = computed(() => props.model?.metrics || []);
const eventRows = computed(() => props.model?.events?.rows || []);
const assistantSections = computed(() => props.model?.assistantSections || []);

function patchWindow(key, patch) {
  emit('update-window', key, patch);
}
</script>

<template>
  <section class="lab-instruments-shell">
    <NeuroLabFloatingWindow
      title="实验读数"
      subtitle="Waveform / Metrics"
      :dock="windows.metrics.dock"
      :expanded="windows.metrics.expanded"
      @update:dock="patchWindow('metrics', { dock: $event })"
      @update:expanded="patchWindow('metrics', { expanded: $event })"
    >
      <div class="lab-instruments__metrics-grid">
        <article v-for="metric in metrics" :key="metric.id">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </div>
      <NeuroLabChart :option="model.waveform?.option" height="180px" />
    </NeuroLabFloatingWindow>

    <NeuroLabFloatingWindow
      title="分析与 AI 助教"
      subtitle="Spectrum / Events / Guidance"
      :dock="windows.assistant.dock"
      :expanded="windows.assistant.expanded"
      @update:dock="patchWindow('assistant', { dock: $event })"
      @update:expanded="patchWindow('assistant', { expanded: $event })"
    >
      <div class="lab-instruments__stack">
        <NeuroLabChart :option="model.spectrum?.option" height="140px" />
        <NeuroLabChart :option="model.bands?.option" height="140px" />

        <div class="lab-instruments__events">
          <h4>事件标记</h4>
          <div v-if="eventRows.length" class="lab-instruments__event-list">
            <article v-for="row in eventRows" :key="`${row.label}-${row.start_ms}`">
              <strong>{{ row.label }}</strong>
              <span>{{ row.start_ms }} - {{ row.end_ms }} ms</span>
            </article>
          </div>
          <p v-else>暂无事件数据。</p>
        </div>

        <div class="lab-instruments__assistant">
          <article v-for="section in assistantSections" :key="section.id">
            <h4>{{ section.title }}</h4>
            <p>{{ section.body }}</p>
          </article>
        </div>
      </div>
    </NeuroLabFloatingWindow>
  </section>
</template>

<style scoped>
.lab-instruments-shell {
  position: static;
}

.lab-instruments__metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.lab-instruments__metrics-grid article {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border-default);
  background: rgba(0, 34, 255, 0.04);
}

.lab-instruments__metrics-grid span {
  color: var(--text-3);
  font-size: 12px;
}

.lab-instruments__metrics-grid strong {
  font-size: 16px;
}

.lab-instruments__stack {
  display: grid;
  gap: 12px;
}

.lab-instruments__events,
.lab-instruments__assistant article {
  display: grid;
  gap: 8px;
}

.lab-instruments__events h4,
.lab-instruments__assistant h4 {
  margin: 0;
  font-size: 13px;
}

.lab-instruments__events p,
.lab-instruments__assistant p {
  margin: 0;
  color: var(--text-3);
  line-height: 1.6;
}

.lab-instruments__event-list {
  display: grid;
  gap: 8px;
}

.lab-instruments__event-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
}
</style>
