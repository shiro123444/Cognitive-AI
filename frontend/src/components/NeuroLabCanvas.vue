<script setup>
const props = defineProps({
  model: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node', 'select-channel', 'select-region']);

function gridTrack(count) {
  return Array.from({ length: count }, (_, index) => index + 1);
}
</script>

<template>
  <section class="lab-canvas">
    <div class="lab-canvas__grid">
      <span
        v-for="column in gridTrack(model.gridColumns || 12)"
        :key="`col-${column}`"
        class="lab-canvas__grid-column"
        :style="{ left: `${(column / (model.gridColumns || 12)) * 100}%` }"
      />
      <span
        v-for="row in gridTrack(model.gridRows || 8)"
        :key="`row-${row}`"
        class="lab-canvas__grid-row"
        :style="{ top: `${(row / (model.gridRows || 8)) * 100}%` }"
      />
    </div>

    <div class="lab-canvas__wave-bed">
      <button
        v-for="channel in model.channels"
        :key="channel.id"
        :data-testid="`channel-${channel.id}`"
        class="lab-canvas__channel"
        :class="{ active: channel.isActive }"
        type="button"
        @click="emit('select-channel', channel.id)"
      >
        <span class="lab-canvas__channel-label">{{ channel.label }}</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline :points="channel.points" />
        </svg>
      </button>

      <span
        v-for="event in model.events"
        :key="`${event.label}-${event.left}`"
        class="lab-canvas__event"
        :style="{ left: event.left, width: event.width }"
      >
        {{ event.label }}
      </span>
    </div>

    <svg class="lab-canvas__brain" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M18,40 C18,20 34,12 50,12 C66,12 82,20 82,40 C82,66 66,82 50,82 C34,82 18,66 18,40 Z" />
      <path d="M50,12 L50,82" />
      <path d="M24,36 C36,34 44,30 50,22 C56,30 64,34 76,36" />
      <path d="M22,52 C34,50 42,52 50,60 C58,52 66,50 78,52" />
    </svg>

    <button
      v-for="region in model.regions"
      :key="region.id"
      :data-testid="`region-${region.id}`"
      class="lab-canvas__region"
      :class="{ active: region.isActive }"
      type="button"
      :style="{
        left: `${region.x}%`,
        top: `${region.y}%`,
        '--region-scale': `${0.88 + region.intensity * 0.34}`
      }"
      @click="emit('select-region', region.id)"
    >
      <span>{{ region.label }}</span>
    </button>

    <button
      v-for="node in model.pipeline"
      :key="node.id"
      :data-testid="`pipeline-${node.id}`"
      class="lab-canvas__node"
      :class="[node.status, { selected: node.isSelected }]"
      type="button"
      :style="{ left: `${node.x}%`, top: `${node.y}%` }"
      @click="emit('select-node', node.id)"
    >
      <strong>{{ node.label }}</strong>
      <small>{{ node.statusLabel }}</small>
    </button>
  </section>
</template>

<style scoped>
.lab-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  border: 1px solid var(--border-default);
  background:
    radial-gradient(circle at 55% 46%, rgba(0, 34, 255, 0.08), transparent 26%),
    linear-gradient(135deg, rgba(0, 34, 255, 0.04), transparent 34%),
    var(--surface-0);
}

.lab-canvas__grid-column,
.lab-canvas__grid-row {
  position: absolute;
  background: rgba(0, 0, 0, 0.06);
}

.lab-canvas__grid-column {
  top: 0;
  bottom: 0;
  width: 1px;
}

.lab-canvas__grid-row {
  left: 0;
  right: 0;
  height: 1px;
}

.lab-canvas__wave-bed {
  position: absolute;
  right: 8%;
  bottom: 6%;
  left: 8%;
  display: grid;
  gap: 12px;
}

.lab-canvas__channel {
  position: relative;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: center;
  min-height: 68px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.52);
  text-align: left;
}

.lab-canvas__channel.active {
  border-color: rgba(0, 34, 255, 0.36);
  background: rgba(0, 34, 255, 0.06);
}

.lab-canvas__channel svg {
  width: 100%;
  height: 42px;
}

.lab-canvas__channel polyline {
  fill: none;
  stroke: var(--primary);
  stroke-width: 2.4;
}

.lab-canvas__channel-label {
  font-family: var(--font-mono);
  font-size: 12px;
}

.lab-canvas__event {
  position: absolute;
  bottom: -14px;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid rgba(0, 34, 255, 0.28);
  background: rgba(0, 34, 255, 0.08);
  font-size: 11px;
}

.lab-canvas__brain {
  position: absolute;
  top: 16%;
  right: 27%;
  bottom: 27%;
  left: 27%;
  width: 46%;
  height: 46%;
  stroke: rgba(0, 0, 0, 0.42);
  stroke-width: 1.3;
  fill: rgba(255, 255, 255, 0.16);
}

.lab-canvas__region {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--region-scale));
  min-width: 110px;
  min-height: 52px;
  padding: 0 12px;
  border: 1px solid rgba(0, 34, 255, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.lab-canvas__region.active {
  border-color: rgba(0, 34, 255, 0.52);
  box-shadow: 0 0 0 8px rgba(0, 34, 255, 0.08);
}

.lab-canvas__node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 4px;
  width: 160px;
  min-height: 68px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
}

.lab-canvas__node.selected,
.lab-canvas__node.running,
.lab-canvas__node.completed {
  border-color: rgba(0, 34, 255, 0.48);
}

.lab-canvas__node strong,
.lab-canvas__node small {
  display: block;
}
</style>
