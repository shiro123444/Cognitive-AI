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
    <button class="scrubber__play" type="button" @click="emit('toggle-play')">
      {{ isPlaying ? '❚❚ 暂停' : '▶ 回放' }}
    </button>
    <div class="scrubber__track">
      <div class="scrubber__events" aria-hidden="true">
        <span
          v-for="event in events"
          :key="event.label"
          class="scrubber__event"
          :style="{ left: event.left, width: event.width }"
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
  gap: 12px;
  padding: 5px 16px;
  border-top: 1px solid var(--border-default);
  background: var(--surface-0);
}

.scrubber__play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 74px;
  min-height: 26px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
  transition: border-color var(--dur-1) ease, color var(--dur-1) ease;
}

.scrubber__play:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.scrubber__track {
  position: relative;
  flex: 1;
  height: 20px;
  display: flex;
  align-items: center;
}

.scrubber__events {
  position: absolute;
  inset-block: 6px;
  inset-inline: 0;
  pointer-events: none;
}

.scrubber__event {
  position: absolute;
  top: 0;
  height: 100%;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
}

/* Explicit track/thumb styling — accent-color alone renders a thick pale rail
   that visually outweighs the canvas above it. */
.scrubber__range {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 20px;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
}

.scrubber__range::-webkit-slider-runnable-track {
  height: 2px;
  background: var(--border-strong);
}

.scrubber__range::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  margin-top: -4.5px;
  border: 0;
  border-radius: 50%;
  background: var(--primary);
}

.scrubber__range::-moz-range-track {
  height: 2px;
  background: var(--border-strong);
}

.scrubber__range::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: 0;
  border-radius: 50%;
  background: var(--primary);
}

.scrubber__range:focus-visible {
  outline: 1px solid var(--primary);
  outline-offset: 2px;
}

.scrubber__time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-3);
  min-width: 7em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
