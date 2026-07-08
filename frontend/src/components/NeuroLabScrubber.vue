<script setup>
const props = defineProps({
  durationMs: { type: Number, default: 4000 },
  playheadMs: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  events: { type: Array, default: () => [] }
});

const emit = defineEmits(['seek', 'toggle-play']);

function onSeek(event) {
  emit('seek', Number(event.target.value));
}

function format(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
</script>

<template>
  <div class="scrubber" data-testid="neurolab-scrubber">
    <button class="btn btn-primary scrubber__play" type="button" @click="emit('toggle-play')">
      {{ isPlaying ? '❚❚ 暂停' : '▶ 回放' }}
    </button>
    <div class="scrubber__track">
      <div class="scrubber__events" aria-hidden="true">
        <span
          v-for="event in events"
          :key="event.label"
          class="scrubber__event"
          :style="{ left: event.left + '%', width: event.width + '%' }"
          :title="event.label"
        />
      </div>
      <input
        class="scrubber__range"
        type="range"
        :min="0"
        :max="durationMs"
        :value="playheadMs"
        aria-label="EEG 回放时间轴"
        @input="onSeek"
      >
    </div>
    <span class="scrubber__time">{{ format(playheadMs) }} / {{ format(durationMs) }}</span>
  </div>
</template>

<style scoped>
.scrubber {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
}

.scrubber__track {
  position: relative;
  flex: 1;
  height: 28px;
  display: flex;
  align-items: center;
}

.scrubber__events {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scrubber__event {
  position: absolute;
  top: 0;
  height: 100%;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-left: 2px solid color-mix(in srgb, var(--primary) 45%, transparent);
}

.scrubber__range {
  width: 100%;
  margin: 0;
  accent-color: var(--primary);
}

.scrubber__time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-2);
  min-width: 8em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.scrubber__play {
  white-space: nowrap;
}
</style>
