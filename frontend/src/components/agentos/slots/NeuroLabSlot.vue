<template>
  <div class="slot-container neurolab-slot">
    <div class="slot-header">
      <div class="header-left">
        <span class="slot-badge badge-cyan">NEUROLAB 3D</span>
        <span class="slot-title">{{ structureTitle }}</span>
      </div>
      <div class="header-right">
        <span class="mni-badge">MNI: [{{ coords[0] }}, {{ coords[1] }}, {{ coords[2] }}]</span>
      </div>
    </div>

    <!-- Interactive Slice Viewport -->
    <div class="neuro-canvas-grid">
      <!-- Axial Slice -->
      <div class="slice-card">
        <div class="slice-label">AXIAL (横断面 Z: {{ coords[2] }})</div>
        <div class="slice-canvas-wrapper">
          <canvas ref="axialCanvas" width="180" height="180"></canvas>
          <div class="crosshair-h" :style="{ top: `${(coords[1] + 70) * 1.2}px` }"></div>
          <div class="crosshair-v" :style="{ left: `${(coords[0] + 70) * 1.2}px` }"></div>
        </div>
      </div>

      <!-- Coronal Slice -->
      <div class="slice-card">
        <div class="slice-label">CORONAL (冠状面 Y: {{ coords[1] }})</div>
        <div class="slice-canvas-wrapper">
          <canvas ref="coronalCanvas" width="180" height="180"></canvas>
          <div class="crosshair-h" :style="{ top: `${(coords[2] + 70) * 1.2}px` }"></div>
          <div class="crosshair-v" :style="{ left: `${(coords[0] + 70) * 1.2}px` }"></div>
        </div>
      </div>

      <!-- Sagittal Slice -->
      <div class="slice-card">
        <div class="slice-label">SAGITTAL (矢状面 X: {{ coords[0] }})</div>
        <div class="slice-canvas-wrapper">
          <canvas ref="sagittalCanvas" width="180" height="180"></canvas>
          <div class="crosshair-h" :style="{ top: `${(coords[2] + 70) * 1.2}px` }"></div>
          <div class="crosshair-v" :style="{ left: `${(coords[1] + 70) * 1.2}px` }"></div>
        </div>
      </div>

      <!-- Volume Stat Card -->
      <div class="stats-card">
        <div class="slice-label">NEURO STATS</div>
        <div class="stat-row">
          <span>激活强度 (t-stat)</span>
          <strong class="stat-highlight">4.82 (p < 0.001)</strong>
        </div>
        <div class="stat-row">
          <span>体素体量 (Voxels)</span>
          <strong>4,280 mm³</strong>
        </div>
        <div class="stat-row">
          <span>神经图谱配准</span>
          <strong>MNI152 Non-linear</strong>
        </div>
        <div class="color-select-box">
          <span>热力图伪彩:</span>
          <select v-model="selectedColormap" @change="renderSlices" class="select-rk">
            <option value="warm">Warm (热力红黄)</option>
            <option value="cool">Cool (冷调蓝青)</option>
            <option value="plasma">Plasma (高对比紫色)</option>
          </select>
        </div>
      </div>
    </div>

    <div class="slot-footer">
      <p class="footer-desc">{{ descriptionText }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});

const axialCanvas = ref(null);
const coronalCanvas = ref(null);
const sagittalCanvas = ref(null);
const selectedColormap = ref('warm');

const structureTitle = computed(() => props.data?.structure || '海马体 (Hippocampus)');
const coords = computed(() => props.data?.mniCoordinates || [24, -18, -16]);
const descriptionText = computed(() => props.data?.description || '已自动完成 MNI 空间切片配准与高亮渲染。');

function drawBrainSlice(canvas, type) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#171713';
  ctx.fillRect(0, 0, w, h);

  // Draw simulated skull & brain contour
  ctx.fillStyle = '#3a3a34';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw cortical folds
  ctx.strokeStyle = '#55554c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(w / 2 + (i - 2) * 18, h / 2, 28 - i * 3, 0, Math.PI);
    ctx.stroke();
  }

  // Draw activation hotspot (e.g. hippocampus region)
  const heatX = w / 2 + (coords.value[0] * 0.8);
  const heatY = h / 2 + (coords.value[1] * 0.8);

  const grad = ctx.createRadialGradient(heatX, heatY, 2, heatX, heatY, 22);
  if (selectedColormap.value === 'warm') {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffcc00');
    grad.addColorStop(0.7, '#ff3300');
    grad.addColorStop(1, 'transparent');
  } else if (selectedColormap.value === 'cool') {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#00ffff');
    grad.addColorStop(0.8, '#0044ff');
    grad.addColorStop(1, 'transparent');
  } else {
    grad.addColorStop(0, '#ffff00');
    grad.addColorStop(0.5, '#cc00cc');
    grad.addColorStop(0.9, '#440088');
    grad.addColorStop(1, 'transparent');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(heatX, heatY, 22, 0, Math.PI * 2);
  ctx.fill();
}

function renderSlices() {
  drawBrainSlice(axialCanvas.value, 'axial');
  drawBrainSlice(coronalCanvas.value, 'coronal');
  drawBrainSlice(sagittalCanvas.value, 'sagittal');
}

onMounted(() => {
  renderSlices();
});

watch(() => props.data, () => {
  renderSlices();
}, { deep: true });
</script>

<style scoped>
.slot-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 4px 4px 0 var(--rk-ink, #171713);
  border-radius: 4px;
  overflow: hidden;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--rk-panel, #e4e3dc);
  border-bottom: 2px solid var(--rk-ink, #171713);
}

.badge-cyan {
  font-size: 9px;
  font-weight: 800;
  background: var(--rk-cyan, #29b8d4);
  color: #ffffff;
  padding: 2px 6px;
  border: 1.5px solid var(--rk-ink, #171713);
  margin-right: 8px;
}

.slot-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--rk-ink, #171713);
}

.mni-badge {
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 2px 8px;
}

.neuro-canvas-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
  background: #f4f3ee;
  flex: 1;
}

.slice-card {
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.slice-label {
  font-size: 9px;
  font-weight: 800;
  color: var(--rk-muted, #6b6a61);
  margin-bottom: 4px;
  width: 100%;
}

.slice-canvas-wrapper {
  position: relative;
  border: 1px solid #000000;
}

.crosshair-h {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(41, 184, 212, 0.7);
  pointer-events: none;
}

.crosshair-v {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(41, 184, 212, 0.7);
  pointer-events: none;
}

.stats-card {
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  padding-bottom: 3px;
  border-bottom: 1px dashed #d8d7cd;
}

.stat-highlight {
  color: var(--rk-pink, #d5658a);
  font-weight: bold;
}

.color-select-box {
  margin-top: 4px;
  font-size: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.select-rk {
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 3px 6px;
  font-size: 10px;
  background: var(--rk-panel, #e4e3dc);
  font-weight: bold;
}

.slot-footer {
  padding: 8px 12px;
  background: var(--rk-panel, #e4e3dc);
  border-top: 1.5px solid var(--rk-ink, #171713);
}

.footer-desc {
  margin: 0;
  font-size: 11px;
  color: var(--rk-ink, #171713);
  font-weight: 500;
}
</style>
