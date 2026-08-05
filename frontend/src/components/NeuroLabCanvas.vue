<script setup>
import { computed, ref } from 'vue';
import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true
  },
  state: {
    type: String,
    default: 'ready'
  }
});

const emit = defineEmits(['select-node', 'select-channel', 'select-region']);
const cameraResetToken = ref(0);
const sceneError = ref('');

const selectedRegion = computed(() => (
  props.model.brain?.regions?.find((region) => region.isActive)
  || props.model.brain?.regions?.[0]
  || null
));

const stateLabel = computed(() => ({
  ready: '待运行',
  running: '处理中',
  completed: '结果已同步',
  error: '运行异常'
}[props.state] || '待运行'));

function resetCamera() {
  cameraResetToken.value += 1;
}

function onSceneError(message) {
  sceneError.value = message;
}

function bandValue(region, key) {
  if (!region?.hasData) return '--';
  return Number(region[key] || 0).toFixed(1);
}
</script>

<template>
  <section class="lab-canvas" :data-state="state">
    <section class="lab-canvas__evidence" aria-label="EEG 信号证据">
      <header class="lab-canvas__section-head">
        <div>
          <span class="lab-canvas__eyebrow">SIGNAL EVIDENCE</span>
          <h2>多通道回放</h2>
        </div>
        <span class="lab-canvas__state" :data-state="state">
          <i aria-hidden="true" />{{ stateLabel }}
        </span>
      </header>

      <div class="lab-canvas__channels">
        <button
          v-for="channel in model.channels"
          :key="channel.id"
          class="lab-canvas__channel"
          :class="{ active: channel.isActive }"
          type="button"
          :data-testid="`channel-${channel.id}`"
          @click="emit('select-channel', channel.id)"
        >
          <span class="lab-canvas__channel-meta">
            <strong>{{ channel.label }}</strong>
            <small v-if="channel.readout">{{ channel.readout }}</small>
            <small v-else-if="channel.hasData">α {{ channel.alpha.toFixed(1) }} · β {{ channel.beta.toFixed(1) }}</small>
            <small v-else>等待信号</small>
          </span>
          <span class="lab-canvas__wave-field">
            <span
              v-for="event in model.events"
              :key="`${channel.id}-${event.label}`"
              class="lab-canvas__event"
              :style="{ left: event.left, width: event.width }"
              aria-hidden="true"
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="50" x2="100" y2="50" class="lab-canvas__zero" />
              <polyline
                v-if="channel.points"
                :points="channel.points"
                class="lab-canvas__wave"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span v-if="state === 'running'" class="lab-canvas__scan" aria-hidden="true" />
          </span>
        </button>
      </div>

      <footer class="lab-canvas__time-axis" aria-hidden="true">
        <span>0.0s</span><span>1.0s</span><span>2.0s</span><span>3.0s</span><span>4.0s</span>
      </footer>
    </section>

    <section class="lab-canvas__spatial" aria-label="脑区空间映射">
      <header class="lab-canvas__section-head">
        <div>
          <span class="lab-canvas__eyebrow">SPATIAL CONTEXT</span>
          <h2>脑区联动</h2>
        </div>
        <span class="lab-canvas__mapping">{{ model.brain?.mappingLabel }}</span>
      </header>

      <div class="lab-canvas__brain-stage">
        <NeuroLabNiiVueScene
          :model="model.brain"
          :camera-reset-token="cameraResetToken"
          @scene-error="onSceneError"
        />

        <div v-if="selectedRegion" class="lab-canvas__readout" data-testid="selected-region-readout">
          <span>{{ selectedRegion.shortLabel }}</span>
          <strong>{{ selectedRegion.displayLabel || selectedRegion.label }}</strong>
          <dl>
            <div><dt>α</dt><dd>{{ bandValue(selectedRegion, 'alpha') }}</dd></div>
            <div><dt>β</dt><dd>{{ bandValue(selectedRegion, 'beta') }}</dd></div>
          </dl>
        </div>

        <button
          class="lab-canvas__camera-reset"
          data-testid="brain-reset"
          type="button"
          title="复位三维视角"
          aria-label="复位三维视角"
          @click="resetCamera"
        >
          ↺
        </button>

        <p v-if="sceneError" class="lab-canvas__scene-note">{{ sceneError }}</p>
      </div>

      <nav class="lab-canvas__regions" aria-label="选择脑区">
        <button
          v-for="region in model.brain?.regions || []"
          :key="region.id"
          :data-testid="`region-${region.id}`"
          type="button"
          :class="{ active: region.isActive }"
          @click="emit('select-region', region.id)"
        >
          <i :style="{ '--activity': region.intensity || 0 }" aria-hidden="true" />
          <span>
            <strong>{{ region.shortLabel }}</strong>
            <small>{{ region.displayLabel || region.label }}</small>
          </span>
        </button>
      </nav>
    </section>
  </section>
</template>

<style scoped>
.lab-canvas {
  --alpha: #c46a12;
  --beta: #087f78;
  display: grid;
  grid-template-columns: minmax(420px, 1.35fr) minmax(340px, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-0);
}

.lab-canvas__evidence,
.lab-canvas__spatial {
  display: grid;
  grid-template-rows: 46px minmax(0, 1fr) 28px;
  min-width: 0;
  min-height: 0;
}

.lab-canvas__evidence {
  border-right: 1px solid var(--border-default);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--border-default) 42%, transparent) 1px, transparent 1px) 0 0 / 56px 100%,
    var(--surface-0);
}

.lab-canvas__spatial {
  grid-template-rows: 46px minmax(0, 1fr) 48px;
  background: #f4f7fb;
}

.lab-canvas__section-head {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--border-default);
  background: color-mix(in srgb, var(--surface-0) 92%, transparent);
}

.lab-canvas__section-head h2 {
  margin: 1px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.lab-canvas__eyebrow {
  display: block;
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 9px;
}

.lab-canvas__state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.lab-canvas__state i {
  width: 7px;
  height: 7px;
  border: 1px solid var(--text-4);
  border-radius: 50%;
}

.lab-canvas__state[data-state="running"] {
  color: var(--primary);
}

.lab-canvas__state[data-state="running"] i {
  border-color: var(--primary);
  background: var(--primary);
  animation: statePulse 1.2s ease-in-out infinite;
}

.lab-canvas__state[data-state="completed"] {
  color: var(--beta);
}

.lab-canvas__state[data-state="completed"] i {
  border-color: var(--beta);
  background: var(--beta);
}

@keyframes statePulse {
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 14%, transparent); }
}

.lab-canvas__channels {
  display: grid;
  grid-template-rows: repeat(4, minmax(56px, 1fr));
  min-height: 0;
  overflow-y: auto;
}

.lab-canvas__channel {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: stretch;
  min-height: 56px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent);
  background: transparent;
  color: inherit;
  text-align: left;
  transition: background var(--dur-1) ease;
}

.lab-canvas__channel:hover,
.lab-canvas__channel.active {
  background: color-mix(in srgb, var(--primary) 4%, transparent);
}

.lab-canvas__channel.active .lab-canvas__channel-meta {
  border-left-color: var(--primary);
}

.lab-canvas__channel-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 8px 10px;
  border-left: 2px solid transparent;
}

.lab-canvas__channel-meta strong {
  font-family: var(--font-mono);
  font-size: 11px;
}

.lab-canvas__channel-meta small {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 9px;
  white-space: nowrap;
}

.lab-canvas__wave-field {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.lab-canvas__wave-field svg {
  position: absolute;
  inset: 10px 0;
  width: 100%;
  height: calc(100% - 20px);
  overflow: visible;
}

.lab-canvas__zero {
  stroke: color-mix(in srgb, var(--text-4) 28%, transparent);
  stroke-width: 0.55;
  stroke-dasharray: 1.5 2.5;
}

.lab-canvas__wave {
  fill: none;
  stroke: color-mix(in srgb, var(--text-2) 92%, transparent);
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lab-canvas__channel.active .lab-canvas__wave {
  stroke: var(--primary);
  stroke-width: 1.6;
}

/* Event spans are annotations, not fills: a thin cap rule marks the window so
   the waveform underneath stays the dominant read instead of a beige block. */
.lab-canvas__event {
  position: absolute;
  inset-block: 6px;
  border-left: 1px dashed color-mix(in srgb, var(--alpha) 55%, transparent);
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--alpha) 44%, transparent) 0 2px,
      transparent 2px
    ),
    color-mix(in srgb, var(--alpha) 3%, transparent);
}

.lab-canvas__scan {
  position: absolute;
  inset-block: 5px;
  left: 0;
  width: 1px;
  background: var(--primary);
  box-shadow: 6px 0 14px color-mix(in srgb, var(--primary) 26%, transparent);
  animation: scanSignal 2.2s linear infinite;
}

@keyframes scanSignal {
  to { left: 100%; }
}

.lab-canvas__time-axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 88px;
  padding-right: 8px;
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 9px;
}

.lab-canvas__mapping {
  color: var(--text-3);
  font-size: 10px;
}

.lab-canvas__brain-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.lab-canvas__readout {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 3;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  padding-left: 9px;
  border-left: 2px solid var(--primary);
  pointer-events: none;
}

.lab-canvas__readout > span {
  grid-row: 1 / 3;
  align-self: center;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

.lab-canvas__readout > strong {
  font-size: 11px;
  font-weight: 600;
}

.lab-canvas__readout dl {
  display: flex;
  gap: 10px;
  margin: 0;
}

.lab-canvas__readout dl div {
  display: flex;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 9px;
}

.lab-canvas__readout dt {
  color: var(--text-4);
}

.lab-canvas__readout dd {
  margin: 0;
  color: var(--text-2);
}

.lab-canvas__camera-reset {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--text-3) 26%, transparent);
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-2);
  font-size: 17px;
  transition: border-color var(--dur-1) ease, color var(--dur-1) ease;
}

.lab-canvas__camera-reset:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.lab-canvas__scene-note {
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 3;
  margin: 0;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 9px;
}

.lab-canvas__regions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--border-default);
  background: var(--surface-0);
}

.lab-canvas__regions button {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 8px;
  border: 0;
  border-right: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-3);
  text-align: left;
}

.lab-canvas__regions button:last-child {
  border-right: 0;
}

.lab-canvas__regions button:hover,
.lab-canvas__regions button.active {
  color: var(--text-1);
  background: color-mix(in srgb, var(--primary) 4%, transparent);
}

.lab-canvas__regions button.active {
  box-shadow: inset 0 2px 0 var(--primary);
}

.lab-canvas__regions i {
  width: 7px;
  height: 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 38%, var(--text-4));
  border-radius: 50%;
  background: color-mix(in srgb, var(--primary) calc(var(--activity) * 100%), var(--surface-0));
}

.lab-canvas__regions span {
  display: grid;
  min-width: 0;
}

.lab-canvas__regions strong {
  font-family: var(--font-mono);
  font-size: 9px;
}

.lab-canvas__regions small {
  overflow: hidden;
  color: var(--text-4);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .lab-canvas {
    grid-template-columns: minmax(360px, 1.15fr) minmax(300px, 1fr);
  }

  .lab-canvas__regions small {
    display: none;
  }
}

@media (max-width: 760px) {
  .lab-canvas {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(258px, 1.05fr) minmax(250px, 0.95fr);
    overflow-y: auto;
  }

  .lab-canvas__evidence {
    border-right: 0;
    border-bottom: 1px solid var(--border-default);
  }

  .lab-canvas__channel {
    min-height: 44px;
  }

  .lab-canvas__mapping {
    max-width: 7em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lab-canvas__state[data-state="running"] i,
  .lab-canvas__scan {
    animation: none;
  }
}
</style>
