<template>
  <div ref="container" class="feature-particles-container">
    <div
      v-for="label in dataLabels"
      :key="label.id"
      class="data-label mono"
      :style="{
        transform: `translate(${label.x}px, ${label.y}px)`,
        opacity: label.visible ? 0.5 : 0
      }"
    >
      {{ label.text }}
    </div>
    <div v-if="type === 'network'" class="network-caption mono" aria-hidden="true">
      MATERIAL → CHUNK → EMBED → GRAPH
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import * as THREE from 'three';
import { createReferenceNetworkLayout } from './featureNetworkLayout';
import { particleStyleFor } from './featureParticlesConfig';

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: v => ['cloud', 'organic', 'network'].includes(v)
  },
  emphasis: {
    type: Boolean,
    default: false
  }
});

const container = ref(null);
let scene, camera, renderer, animationId;
let meshGroup;
let startTime = 0;
const dataLabels = shallowRef([]);

const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);

// Network-specific state
let networkLayout = null;
let faintLineMesh = null;
let majorLineMesh = null;
let blueLineMesh = null;
let focusNodeMesh = null;
let focusGlow = null;

onMounted(() => {
  startTime = performance.now();
  initScene();
  createParticles();
  animate();
  container.value.addEventListener('mousemove', onMouseMove);
  container.value.addEventListener('mouseleave', onMouseLeave);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  if (container.value) {
    container.value.removeEventListener('mousemove', onMouseMove);
    container.value.removeEventListener('mouseleave', onMouseLeave);
  }
  if (renderer) renderer.dispose();
});

function onMouseMove(event) {
  const rect = container.value.getBoundingClientRect();
  targetMouse.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
}
function onMouseLeave() { targetMouse.set(0, 0); }

function initScene() {
  scene = new THREE.Scene();
  scene.background = null;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  // network 视图把相机拉远，让团块在容器中央留出大量呼吸空间
  camera.position.z = props.type === 'network' ? 12 : 16;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  const ro = new ResizeObserver(() => {
    if (!container.value) return;
    const cw = container.value.clientWidth;
    const ch = container.value.clientHeight;
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch);
  });
  ro.observe(container.value);
}

function createParticles() {
  if (props.type === 'cloud') createCloud();
  else if (props.type === 'organic') createOrganic();
  else if (props.type === 'network') createNetwork();
}

function createCloud() {
  const style = particleStyleFor('cloud', props.emphasis);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(style.count * 3);
  for (let i = 0; i < style.count; i++) {
    const r = style.radius * Math.cbrt(Math.random());
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i*3] = r*Math.sin(p)*Math.cos(t);
    pos[i*3+1] = r*Math.sin(p)*Math.sin(t);
    pos[i*3+2] = r*Math.cos(p);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  meshGroup = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x0022ff,
    size: style.size,
    transparent: true,
    opacity: style.opacity
  }));
  scene.add(meshGroup);
}

function createOrganic() {
  const style = particleStyleFor('organic', props.emphasis);
  const geo = new THREE.SphereGeometry(3, 32, 32);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', geo.getAttribute('position'));
  pg.setAttribute('originalPosition', geo.getAttribute('position').clone());
  meshGroup = new THREE.Points(pg, new THREE.PointsMaterial({
    color: 0x0022ff,
    size: style.size,
    transparent: true,
    opacity: style.opacity
  }));
  scene.add(meshGroup);
}

function createNetwork() {
  networkLayout = createReferenceNetworkLayout({ seed: 20260505 });
  meshGroup = new THREE.Group();
  meshGroup.scale.set(0.95, 0.95, 1);
  meshGroup.position.set(0, 0, 0);
  scene.add(meshGroup);

  faintLineMesh = createLineMesh(networkLayout.faintEdges, 0x888888, 0.065);
  majorLineMesh = createLineMesh(networkLayout.majorEdges, 0x9ca3af, 0.32);
  blueLineMesh  = createLineMesh(networkLayout.blueEdges,  0x1677ff, 0.92);
  meshGroup.add(faintLineMesh);
  meshGroup.add(majorLineMesh);
  meshGroup.add(blueLineMesh);

  const nodeBuckets = [
    { key: 'small', size: 0.022, color: 0x6e737a, opacity: 0.42 },
    { key: 'medium', size: 0.038, color: 0x111111, opacity: 0.68 },
    { key: 'large', size: 0.052, color: 0x000000, opacity: 0.84 },
  ];
  for (const bucket of nodeBuckets) {
    const positions = nodePositions((node) => node.size === bucket.key);
    if (positions.length === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    meshGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: bucket.color,
      size: bucket.size,
      transparent: true,
      opacity: bucket.opacity,
      sizeAttenuation: true,
    })));
  }

  const focus = networkLayout.nodes[networkLayout.focusIndex];
  const focusGeo = new THREE.BufferGeometry();
  focusGeo.setAttribute('position', new THREE.Float32BufferAttribute([focus.x, focus.y, focus.z + 0.03], 3));
  focusNodeMesh = new THREE.Points(focusGeo, new THREE.PointsMaterial({
    color: 0x1677ff,
    size: 0.16,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
  }));
  meshGroup.add(focusNodeMesh);

  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, 'rgba(60, 140, 255, 1.0)');
  grad.addColorStop(0.04, 'rgba(40, 120, 255, 0.95)');
  grad.addColorStop(0.12, 'rgba(20, 100, 255, 0.6)');
  grad.addColorStop(0.3, 'rgba(0, 60, 255, 0.18)');
  grad.addColorStop(0.55, 'rgba(0, 34, 255, 0.04)');
  grad.addColorStop(1, 'rgba(0, 34, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const glowTex = new THREE.CanvasTexture(canvas);
  focusGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  focusGlow.position.set(focus.x, focus.y, focus.z);
  focusGlow.scale.set(2.8, 2.8, 1);
  meshGroup.add(focusGlow);

  dataLabels.value = [];
}

function createLineMesh(edges, color, opacity) {
  const positions = [];
  for (const edge of edges) {
    const source = networkLayout.nodes[edge.source];
    const target = networkLayout.nodes[edge.target];
    positions.push(source.x, source.y, source.z, target.x, target.y, target.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  }));
}

function nodePositions(predicate) {
  const positions = [];
  for (const node of networkLayout.nodes) {
    if (!predicate(node)) continue;
    positions.push(node.x, node.y, node.z + 0.01);
  }
  return positions;
}

function initDataLabels() {
  if (props.type !== 'network' || !networkLayout) return;
  const labels = [];
  const labelTexts = [
    'lat: 42.361', 'lng: -71.057', 'σ: 0.0042',
    'node: 0x7F2A', 'δt: 12.4ms', 'syn: 1,847',
    'freq: 40Hz', 'amp: 0.73mV',
  ];
  const edgeNodes = networkLayout.nodes.filter(n => n.role === 'hull');
  for (let i = 0; i < 5; i++) {
    const node = edgeNodes[Math.floor(i * edgeNodes.length / 5)];
    labels.push({
      id: `dl-${i}`,
      text: labelTexts[i % labelTexts.length],
      baseX: node.x,
      baseY: node.y,
      x: 0, y: 0,
      visible: false,
      phase: i * 1.2,
    });
  }
  dataLabels.value = labels;
}

function updateDataLabels(time) {
  if (!dataLabels.value.length || !container.value) return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  const fov = camera.fov * Math.PI / 180;
  const scale = h / (2 * Math.tan(fov / 2) * camera.position.z);
  const cx = w / 2, cy = h / 2;

  const updated = dataLabels.value.map(label => {
    const worldX = label.baseX * 0.95;
    const worldY = label.baseY * 0.95;
    const drift = Math.sin(time * 0.3 + label.phase) * 0.15;
    return {
      ...label,
      x: cx + (worldX + drift) * scale,
      y: cy - worldY * scale,
      visible: true,
    };
  });
  dataLabels.value = updated;
}

// ═══════════════════════════════════════════
//   Main animation loop
// ═══════════════════════════════════════════
function animate() {
  animationId = requestAnimationFrame(animate);
  const time = (performance.now() - startTime) / 1000;
  mouse.lerp(targetMouse, 0.04);

  if (!meshGroup) { renderer.render(scene, camera); return; }

  if (props.type === 'cloud') {
    meshGroup.rotation.y = time * 0.1 + mouse.x * 0.5;
    meshGroup.rotation.x = mouse.y * 0.5;
  }
  else if (props.type === 'organic') {
    const style = particleStyleFor('organic', props.emphasis);
    const pos = meshGroup.geometry.attributes.position;
    const orig = meshGroup.geometry.attributes.originalPosition;
    for (let i = 0; i < pos.count; i++) {
      const x = orig.getX(i), y = orig.getY(i), z = orig.getZ(i);
      const n = Math.sin(x*1.5+time)*Math.cos(y*1.5+time*0.8)*style.deformation;
      pos.setXYZ(i, x*(1+n), y*(1+n), z*(1+n));
    }
    pos.needsUpdate = true;
    meshGroup.rotation.y = time * 0.2;
    meshGroup.rotation.x = mouse.y * 0.5;
    meshGroup.rotation.z = -mouse.x * 0.5;
  }
  else if (props.type === 'network') {
    const driftX = 0 + mouse.x * 0.09 + Math.sin(time * 0.18) * 0.015;
    const driftY = 0 + mouse.y * 0.06 + Math.cos(time * 0.16) * 0.012;
    const breath = 0.95 + Math.sin(time * 0.42) * 0.005;
    meshGroup.position.x += (driftX - meshGroup.position.x) * 0.035;
    meshGroup.position.y += (driftY - meshGroup.position.y) * 0.035;
    meshGroup.scale.setScalar(breath);
    meshGroup.rotation.set(0, 0, 0);

    if (faintLineMesh) {
      faintLineMesh.material.opacity = 0.06 + Math.sin(time * 0.55) * 0.01;
    }
    if (majorLineMesh) {
      majorLineMesh.material.opacity = 0.30 + Math.sin(time * 0.72 + 1.1) * 0.04;
    }
    if (blueLineMesh) {
      blueLineMesh.material.opacity = 0.88 + Math.sin(time * 1.15) * 0.06;
    }
    if (focusNodeMesh) {
      focusNodeMesh.material.size = 0.14 + Math.sin(time * 1.35) * 0.012;
    }
    if (focusGlow) {
      const pulse = 1 + Math.sin(time * 1.05) * 0.08;
      focusGlow.scale.set(2.8 * pulse, 2.8 * pulse, 1);
      focusGlow.material.opacity = 0.88 + Math.sin(time * 1.3 + 0.4) * 0.08;
    }
    updateDataLabels(time);
  }

  renderer.render(scene, camera);
}
</script>

<style scoped>
.feature-particles-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: auto;
  cursor: crosshair;
}
.data-label {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #777;
  pointer-events: none;
  white-space: nowrap;
  transition: opacity 0.8s ease;
  text-transform: uppercase;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.network-caption {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  color: var(--text-4);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1;
  opacity: 0.72;
  pointer-events: none;
  white-space: nowrap;
}
</style>
