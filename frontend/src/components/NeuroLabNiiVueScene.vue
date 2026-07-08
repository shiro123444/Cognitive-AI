<script setup>
import { Niivue } from '@niivue/niivue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  model: {
    type: Object,
    required: true
  },
  cameraResetToken: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['scene-ready', 'scene-error']);

const canvas = ref(null);
const status = ref('booting');

let nv = null;
let prevImagesKey = '';

function applyCameraPreset() {
  if (!nv || !props.model?.cameraPreset) return;
  nv.setRenderAzimuthElevation(
    props.model.cameraPreset.azimuth,
    props.model.cameraPreset.elevation
  );
}

function imagesKey(images) {
  return (images || []).map((img) => img.url || img).join('|');
}

async function mountScene() {
  if (!canvas.value) return;

  const newKey = imagesKey(props.model?.images);

  if (nv && prevImagesKey === newKey) {
    applyCameraPreset();
    return;
  }

  status.value = 'booting';

  try {
    nv?.cleanup?.();
    nv = new Niivue({
      backColor: [0, 0, 0, 0],
      show3Dcrosshair: false,
      isOrientCube: false,
      crosshairWidth: 0
    });

    await nextTick();
    await nv.attachToCanvas(canvas.value);
    await nv.loadImages(props.model?.images || []);
    if (nv.setSliceType && nv.sliceTypeRender != null) {
      nv.setSliceType(nv.sliceTypeRender);
    }
    prevImagesKey = newKey;
    applyCameraPreset();

    status.value = 'ready';
    emit('scene-ready');
  } catch (error) {
    status.value = 'error';
    emit('scene-error', error?.message || 'niivue init failed');
  }
}

watch(() => props.model.sceneRevision, mountScene);
watch(() => props.cameraResetToken, applyCameraPreset);

onMounted(mountScene);

onBeforeUnmount(() => {
  nv?.cleanup?.();
});
</script>

<template>
  <div class="lab-niivue-scene" :data-state="status">
    <canvas ref="canvas" data-testid="niivue-canvas" />

    <div v-if="status === 'booting'" class="lab-niivue-scene__loading">
      <span class="lab-niivue-scene__spinner"></span>
      <p>Loading brain scene…</p>
    </div>

    <div v-if="status === 'error'" class="lab-niivue-scene__fallback" data-testid="niivue-fallback">
      <img src="/brain-hero.png" alt="" />
      <p>{{ model.fallbackLabel }}</p>
    </div>
  </div>
</template>

<style scoped>
.lab-niivue-scene {
  position: absolute;
  inset: 0;
}

.lab-niivue-scene canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.lab-niivue-scene__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  place-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.6);
  z-index: 1;
}

.lab-niivue-scene__spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border-default);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: sceneSpin 0.8s linear infinite;
}

.lab-niivue-scene__loading p {
  margin: 0;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

@keyframes sceneSpin {
  to { transform: rotate(360deg); }
}

.lab-niivue-scene__fallback {
  position: absolute;
  inset: 10% 12%;
  display: grid;
  place-items: center;
  gap: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: rgba(255, 255, 255, 0.84);
}

.lab-niivue-scene__fallback img {
  width: min(320px, 48%);
  opacity: 0.9;
}

.lab-niivue-scene__fallback p {
  margin: 0;
  color: var(--text-2);
  font-family: var(--font-mono);
}
</style>
