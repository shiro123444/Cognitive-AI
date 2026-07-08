<script setup>
import { ref } from 'vue';
import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node', 'select-channel', 'select-region']);
const cameraResetToken = ref(0);
const sceneError = ref('');

function resetCamera() {
  cameraResetToken.value += 1;
}

function onSceneError(message) {
  sceneError.value = message;
}
</script>

<template>
  <section class="lab-canvas">
    <NeuroLabNiiVueScene
      :model="model.brain"
      :camera-reset-token="cameraResetToken"
      @scene-error="onSceneError"
    />

    <button class="lab-canvas__camera-reset" data-testid="brain-reset" type="button" @click="resetCamera">
      Reset View
    </button>

    <p v-if="sceneError" class="lab-canvas__scene-note">{{ sceneError }}</p>

    <button
      v-for="(region, index) in model.brain?.regions || model.regions || []"
      :key="region.id"
      :data-testid="`region-${region.id}`"
      class="lab-canvas__region"
      :class="{ active: region.isActive }"
      type="button"
      :style="{
        left: `${region.screen?.x ?? region.x}%`,
        top: `${region.screen?.y ?? region.y}%`,
        '--region-scale': `${0.88 + (region.intensity || 0) * 0.34}`,
        '--region-intensity': region.intensity || 0,
        '--region-delay': `${index * 80}ms`
      }"
      @click="emit('select-region', region.id)"
    >
      <span class="lab-canvas__region-halo" aria-hidden="true" />
      <span class="lab-canvas__region-head">
        <strong>{{ region.shortLabel || region.label }}</strong>
        <span v-if="region.alpha != null" class="lab-canvas__region-intensity" :style="{ '--intensity': region.intensity || 0 }" />
      </span>
      <small>{{ region.summary || region.label }}</small>
      <span v-if="region.alpha != null" class="lab-canvas__region-bars">
        <span class="lab-canvas__region-bar-row">
          <span class="lab-canvas__region-bar-label">α</span>
          <span class="lab-canvas__region-bar-track">
            <span class="lab-canvas__region-bar-fill alpha" :style="{ width: `${Math.min(region.alpha * 10, 100)}%` }" />
          </span>
          <span class="lab-canvas__region-bar-value">{{ region.alpha.toFixed(1) }}</span>
        </span>
        <span class="lab-canvas__region-bar-row">
          <span class="lab-canvas__region-bar-label">β</span>
          <span class="lab-canvas__region-bar-track">
            <span class="lab-canvas__region-bar-fill beta" :style="{ width: `${Math.min(region.beta * 10, 100)}%` }" />
          </span>
          <span class="lab-canvas__region-bar-value">{{ region.beta.toFixed(1) }}</span>
        </span>
      </span>
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
    radial-gradient(circle at 50% 56%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 40%),
    var(--surface-0);
}

.lab-canvas__camera-reset {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 3;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  transition: border-color var(--dur-1) ease, color var(--dur-1) ease;
}

.lab-canvas__camera-reset:hover {
  border-color: color-mix(in srgb, var(--primary) 36%, transparent);
  color: var(--primary);
}

.lab-canvas__scene-note {
  position: absolute;
  top: 58px;
  right: 18px;
  z-index: 3;
  margin: 0;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

/* ── Brain regions ── */
.lab-canvas__region {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%) scale(var(--region-scale));
  display: grid;
  gap: 4px;
  min-width: 118px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
  border-left: 3px solid var(--text-4);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(240, 244, 255, 0.82));
  text-align: left;
  transition:
    transform 220ms var(--ease-out-expo),
    box-shadow 220ms ease,
    border-color 220ms ease,
    border-left-color 220ms ease;
  opacity: 0;
  animation: regionEnter 520ms var(--ease-out-expo) forwards;
  animation-delay: var(--region-delay, 0ms);
}

@keyframes regionEnter {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 6px)) scale(calc(var(--region-scale) * 0.94)); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(var(--region-scale)); }
}

.lab-canvas__region:hover {
  transform: translate(-50%, -50%) scale(calc(var(--region-scale) * 1.03));
  border-color: color-mix(in srgb, var(--primary) 32%, transparent);
}

.lab-canvas__region:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 32%, transparent);
}

.lab-canvas__region.active {
  border-color: color-mix(in srgb, var(--primary) 52%, transparent);
  border-left-color: var(--primary);
  box-shadow: var(--lab-glow-region);
  transform: translate(-50%, -50%) scale(calc(var(--region-scale) * 1.06));
}

.lab-canvas__region:active {
  transform: translate(-50%, -50%) scale(calc(var(--region-scale) * 0.96));
}

.lab-canvas__region-halo {
  position: absolute;
  inset: -8px;
  border-radius: var(--radius-md);
  background: radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%);
  opacity: 0;
  transition: opacity 260ms ease;
  pointer-events: none;
}

.lab-canvas__region.active .lab-canvas__region-halo {
  opacity: 1;
  animation: regionHalo 2.4s ease-in-out infinite;
}

@keyframes regionHalo {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

.lab-canvas__region-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.lab-canvas__region strong {
  font-size: 12px;
  letter-spacing: 0.02em;
}

.lab-canvas__region-intensity {
  width: 20px;
  height: 4px;
  background: linear-gradient(
    90deg,
    var(--primary) calc(var(--intensity, 0) * 100%),
    color-mix(in srgb, var(--primary) 12%, transparent) 0
  );
  transition: background var(--dur-2) ease;
}

.lab-canvas__region small {
  display: block;
  font-size: 10px;
  color: var(--text-3);
}

.lab-canvas__region-bars {
  display: grid;
  gap: 3px;
  margin-top: 4px;
  font-family: var(--font-mono);
}

.lab-canvas__region-bar-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: var(--text-3);
}

.lab-canvas__region-bar-label {
  color: var(--text-4);
}

.lab-canvas__region-bar-track {
  position: relative;
  height: 4px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  overflow: hidden;
}

.lab-canvas__region-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 0;
  transition: width 600ms var(--ease-out-expo);
}

.lab-canvas__region-bar-fill.alpha {
  background: var(--primary);
}

.lab-canvas__region-bar-fill.beta {
  background: color-mix(in srgb, var(--primary) 42%, transparent);
}

.lab-canvas__region-bar-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .lab-canvas__region {
    animation: none;
    opacity: 1;
  }
  .lab-canvas__region.active .lab-canvas__region-halo {
    animation: none;
  }
  .lab-canvas__region:hover,
  .lab-canvas__region.active {
    transform: translate(-50%, -50%);
  }
}
</style>
