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
          <span class="lab-canvas__eyebrow mono">
            <span class="sq sq-cyan" /> SIGNAL EVIDENCE
          </span>
          <h2>多通道回放</h2>
        </div>
        <span class="lab-canvas__state mono" :data-state="state">
          <span class="sq" :class="state === 'running' ? 'on' : state === 'completed' ? 'sq-green' : 'sq-yellow'" />
          {{ stateLabel }}
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
            <strong class="mono">{{ channel.label }}</strong>
            <small v-if="channel.readout" class="mono">{{ channel.readout }}</small>
            <small v-else-if="channel.hasData" class="mono">α {{ channel.alpha.toFixed(1) }} · β {{ channel.beta.toFixed(1) }}</small>
            <small v-else class="mono">等待信号</small>
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

      <footer class="lab-canvas__time-axis mono" aria-hidden="true">
        <span>0.0s</span><span>1.0s</span><span>2.0s</span><span>3.0s</span><span>4.0s</span>
      </footer>
    </section>

    <section class="lab-canvas__spatial" aria-label="脑区空间映射">
      <header class="lab-canvas__section-head">
        <div>
          <span class="lab-canvas__eyebrow mono">
            <span class="sq sq-pink" /> SPATIAL CONTEXT
          </span>
          <h2>3D 脑区联动</h2>
        </div>
        <span class="lab-canvas__mapping mono">{{ model.brain?.mappingLabel }}</span>
      </header>

      <div class="lab-canvas__brain-stage">
        <NeuroLabNiiVueScene
          :model="model.brain"
          :camera-reset-token="cameraResetToken"
          @scene-error="onSceneError"
        />

        <div v-if="selectedRegion" class="lab-canvas__readout" data-testid="selected-region-readout">
          <span class="mono">{{ selectedRegion.shortLabel }}</span>
          <strong>{{ selectedRegion.displayLabel || selectedRegion.label }}</strong>
          <dl class="mono">
            <div><dt>α</dt><dd>{{ bandValue(selectedRegion, 'alpha') }}</dd></div>
            <div><dt>β</dt><dd>{{ bandValue(selectedRegion, 'beta') }}</dd></div>
          </dl>
        </div>

        <button
          class="lab-canvas__camera-reset btn btn-subtle"
          data-testid="brain-reset"
          type="button"
          title="复位三维视角"
          aria-label="复位三维视角"
          @click="resetCamera"
        >
          ↺
        </button>

        <p v-if="sceneError" class="lab-canvas__scene-note mono">{{ sceneError }}</p>
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
          <span class="region-dot sq" :class="{ 'sq-pink': region.intensity > 0.5, 'sq-yellow': region.intensity <= 0.5 && region.intensity > 0 }" />
          <span>
            <strong class="mono">{{ region.shortLabel }}</strong>
            <small>{{ region.displayLabel || region.label }}</small>
          </span>
        </button>
      </nav>
    </section>
  </section>
</template>

<style scoped>
.lab-canvas {
  --alpha: var(--rk-orange);
  --beta: var(--rk-cyan);
  display: grid;
  grid-template-columns: minmax(420px, 1.35fr) minmax(340px, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--rk-bg);
}

.lab-canvas__evidence,
.lab-canvas__spatial {
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr) 24px;
  min-width: 0;
  min-height: 0;
}

.lab-canvas__evidence {
  border-right: 2px solid var(--rk-ink);
  background: var(--rk-white);
}

.lab-canvas__spatial {
  grid-template-rows: 42px minmax(0, 1fr) 42px;
  background: var(--rk-panel);
}

.lab-canvas__section-head {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px;
  border-bottom: 2px solid var(--rk-ink);
  background: var(--rk-panel);
}

.lab-canvas__section-head h2 {
  margin: 1px 0 0;
  font-size: 13px;
  font-weight: 900;
  color: var(--rk-ink);
}

.lab-canvas__eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-muted);
  font-size: 9px;
  font-weight: 800;
}

.lab-canvas__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-ink);
  font-size: 10.5px;
  font-weight: 800;
  background: var(--rk-white);
  padding: 2px 6px;
  border: 1px solid var(--rk-ink);
}

.lab-canvas__channels {
  display: grid;
  grid-template-rows: repeat(4, minmax(50px, 1fr));
  min-height: 0;
  overflow-y: auto;
}

.lab-canvas__channel {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: stretch;
  min-height: 50px;
  padding: 0;
  border: 0;
  border-bottom: 1.5px solid var(--rk-ink);
  background: var(--rk-white);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.05s;
}

.lab-canvas__channel:hover {
  background: rgba(217, 182, 63, 0.1);
}

.lab-canvas__channel.active {
  background: rgba(217, 182, 63, 0.22);
}

.lab-canvas__channel.active .lab-canvas__channel-meta {
  background: var(--rk-yellow);
  border-right: 2px solid var(--rk-ink);
}

.lab-canvas__channel-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 6px 8px;
  border-right: 1.5px solid var(--rk-ink);
  background: var(--rk-panel);
}

.lab-canvas__channel-meta strong {
  font-size: 11px;
  font-weight: 900;
  color: var(--rk-ink);
}

.lab-canvas__channel-meta small {
  color: var(--rk-muted);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.lab-canvas__wave-field {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: var(--rk-white);
}

.lab-canvas__wave-field svg {
  position: absolute;
  inset: 6px 0;
  width: 100%;
  height: calc(100% - 12px);
  overflow: visible;
}

.lab-canvas__zero {
  stroke: #c7c5bc;
  stroke-width: 0.8;
  stroke-dasharray: 2 2;
}

.lab-canvas__wave {
  fill: none;
  stroke: var(--rk-ink);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lab-canvas__channel.active .lab-canvas__wave {
  stroke: var(--rk-pink);
  stroke-width: 2.2;
}

.lab-canvas__event {
  position: absolute;
  inset-block: 4px;
  border-left: 2px dashed var(--rk-orange);
  background: rgba(232, 117, 81, 0.12);
}

.lab-canvas__scan {
  position: absolute;
  inset-block: 2px;
  left: 0;
  width: 2px;
  background: var(--rk-pink);
  box-shadow: 2px 0 0 var(--rk-ink);
  animation: scanSignal 2s linear infinite;
}

@keyframes scanSignal {
  to { left: 100%; }
}

.lab-canvas__time-axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 96px;
  padding-right: 8px;
  color: var(--rk-muted);
  font-size: 9px;
  font-weight: 800;
  background: var(--rk-panel);
  border-top: 1px solid var(--rk-ink);
}

.lab-canvas__mapping {
  color: var(--rk-muted);
  font-size: 10px;
  font-weight: 800;
}

.lab-canvas__brain-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--rk-white);
  border-bottom: 2px solid var(--rk-ink);
}

.lab-canvas__readout {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  padding: 6px 8px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  pointer-events: none;
}

.lab-canvas__readout > span {
  grid-row: 1 / 3;
  align-self: center;
  color: var(--rk-ink);
  background: var(--rk-yellow);
  padding: 2px 4px;
  font-size: 10px;
  font-weight: 900;
  border: 1px solid var(--rk-ink);
}

.lab-canvas__readout > strong {
  font-size: 11px;
  font-weight: 900;
}

.lab-canvas__readout dl {
  display: flex;
  gap: 8px;
  margin: 0;
  font-size: 9px;
}

.lab-canvas__readout dt {
  color: var(--rk-muted);
  font-weight: 800;
}

.lab-canvas__readout dd {
  margin: 0;
  color: var(--rk-ink);
  font-weight: 900;
}

.lab-canvas__camera-reset {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 14px;
}

.lab-canvas__scene-note {
  position: absolute;
  right: 10px;
  bottom: 8px;
  z-index: 3;
  margin: 0;
  color: var(--rk-muted);
  font-size: 9px;
}

.lab-canvas__regions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--rk-panel);
}

.lab-canvas__regions button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px;
  border: 0;
  border-right: 1.5px solid var(--rk-ink);
  background: transparent;
  color: var(--rk-ink);
  text-align: left;
  cursor: pointer;
}

.lab-canvas__regions button:last-child {
  border-right: 0;
}

.lab-canvas__regions button:hover {
  background: var(--rk-white);
}

.lab-canvas__regions button.active {
  background: var(--rk-yellow);
}

.region-dot {
  width: 8px;
  height: 8px;
}

.lab-canvas__regions span {
  display: grid;
  min-width: 0;
}

.lab-canvas__regions strong {
  font-size: 9.5px;
  font-weight: 900;
}

.lab-canvas__regions small {
  overflow: hidden;
  color: var(--rk-muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .lab-canvas {
    grid-template-columns: 1fr;
  }
}
</style>
