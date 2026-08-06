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
let prevAssetsKey = '';
let connectomeMesh = null;

function applyCameraPreset() {
  if (!nv || !props.model?.cameraPreset) return;
  nv.setRenderAzimuthElevation(
    props.model.cameraPreset.azimuth,
    props.model.cameraPreset.elevation
  );
  if (nv.setScale && props.model.cameraPreset.scale != null) {
    nv.setScale(props.model.cameraPreset.scale);
  }
}

function applyConnectome() {
  if (!nv) return;
  try {
    if (connectomeMesh && nv.removeMesh) {
      nv.removeMesh(connectomeMesh);
      connectomeMesh = null;
    }
    if (!props.model?.connectome || !nv.loadConnectomeAsMesh || !nv.addMesh) return;
    connectomeMesh = nv.loadConnectomeAsMesh(props.model.connectome);
    nv.addMesh(connectomeMesh);
    nv.drawScene?.();
  } catch {
    connectomeMesh = null;
  }
}

function applyMeshAppearance() {
  if (!nv?.meshes?.length) return;
  (props.model?.meshes || []).forEach((descriptor, index) => {
    const mesh = nv.meshes[index];
    if (!mesh) return;
    if (descriptor.rgba255 && nv.setMeshProperty) {
      nv.setMeshProperty(mesh.id, 'rgba255', new Uint8Array(descriptor.rgba255));
    }
    if (descriptor.opacity != null && nv.setMeshProperty) {
      nv.setMeshProperty(mesh.id, 'opacity', descriptor.opacity);
    }
    if (descriptor.meshShaderIndex != null && nv.setMeshShader) {
      nv.setMeshShader(mesh.id, descriptor.meshShaderIndex);
    }
  });
}

function assetsKey(model) {
  const urls = [...(model?.volumes || []), ...(model?.meshes || [])]
    .map((asset) => asset.url || asset)
    .join('|');
  return `${urls}|overlay:${Boolean(model?.connectome)}`;
}

async function mountScene() {
  if (!canvas.value) return;

  const newKey = assetsKey(props.model);

  // Preserve the user's camera while the replay updates the data overlay.
  if (nv && prevAssetsKey === newKey) {
    applyConnectome();
    return;
  }

  status.value = 'booting';

  try {
    nv?.cleanup?.();
    connectomeMesh = null;
    nv = new Niivue({
      backColor: [0.955, 0.968, 0.985, 1],
      show3Dcrosshair: false,
      isOrientCube: false,
      crosshairWidth: 0
    });

    await nextTick();
    await nv.attachToCanvas(canvas.value);
    if (props.model?.volumes?.length) {
      await nv.loadVolumes(props.model.volumes);
    }
    if (props.model?.meshes?.length) {
      await nv.loadMeshes(props.model.meshes);
      applyMeshAppearance();
    }
    if (nv.setSliceType && nv.sliceTypeRender != null) {
      nv.setSliceType(nv.sliceTypeRender);
    }
    prevAssetsKey = newKey;
    applyCameraPreset();
    applyConnectome();

    status.value = 'ready';
    emit('scene-ready');
  } catch (error) {
    status.value = 'error';
    emit('scene-error', error?.message || 'niivue init failed');
  }
}

// Expose the nv instance + connectome refresh so parents can drive runtime
// updates (e.g. scrubber) without re-mounting the WebGL scene.
defineExpose({
  getNv: () => nv,
  refreshConnectome: applyConnectome
});

watch(() => props.model.sceneRevision, mountScene);
watch(() => props.cameraResetToken, applyCameraPreset);

onMounted(mountScene);

onBeforeUnmount(() => {
  nv?.cleanup?.();
  connectomeMesh = null;
});
</script>

<template>
  <div class="lab-niivue-scene" :data-state="status">
    <canvas ref="canvas" data-testid="niivue-canvas" />

    <div v-if="status === 'booting'" class="lab-niivue-scene__loading">
      <span class="lab-niivue-scene__spinner"></span>
      <p>正在建立脑表面...</p>
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
  background: #f4f7fb;
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
  background: rgba(244, 247, 251, 0.78);
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
  inset: 12%;
  display: grid;
  place-items: center;
  gap: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: #f4f7fb;
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
