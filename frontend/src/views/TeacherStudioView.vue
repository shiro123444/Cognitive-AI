<template>
  <div class="teacher-studio-view" @mousemove="trackPointer">
    <section class="studio-hero">
      <div class="hero-left">
        <header class="hero-header">
          <span class="indicator mono">
            <span class="sq sq-yellow" /> TEACHER CONTROL STUDIO
          </span>
        </header>

        <div class="watermark-percent mono" aria-hidden="true">EDUFISH</div>

        <div class="upload-content teacher-entry-content">
          <div class="process-tag mono">
            <span class="sq sq-pink" /> 教师工作台控制中心
          </div>
          <h1 class="upload-title display">Studio</h1>
          <p class="upload-desc">课程知识图谱审核、材料智能提取、模型参数配置与教学质量分析推演入口。</p>
          <div class="studio-entry-stack">
            <RouterLink
              v-for="entry in entries"
              :key="entry.to"
              :to="entry.to"
              class="studio-entry"
            >
              <span class="entry-label">{{ entry.label }}</span>
              <span class="entry-arrow">→</span>
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="hero-right">
        <header class="hero-header-right">
          <span class="indicator mono">
            <span class="sq sq-cyan" /> TEACHING INTELLIGENCE SURFACE
          </span>
        </header>

        <div class="network-container">
          <span class="ambient-readout ar-tl mono">SYS.STATUS / READY</span>
          <span class="ambient-readout ar-tr mono">MULTI-AGENT / P1.5</span>
          <span class="ambient-readout ar-bl mono">RAG RETRIEVAL · KNOWLEDGE GRAPH</span>
          <span class="ambient-readout ar-br mono">EDUFISH v1.0</span>

          <div class="network-stage" aria-hidden="true">
            <div class="parallax-layer" :style="parallaxStyle">
              <img src="/neural-network.jpg" alt="" class="network-image" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { teacherStudioEntries } from './teacherStudioState';

const entries = teacherStudioEntries();

const pointer = reactive({ x: 0, y: 0 });
const targetPointer = reactive({ x: 0, y: 0 });

let animationFrame;

function trackPointer(event) {
  targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  targetPointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  
  if (!animationFrame) {
    animationFrame = requestAnimationFrame(updatePointer);
  }
}

function updatePointer() {
  pointer.x += (targetPointer.x - pointer.x) * 0.08;
  pointer.y += (targetPointer.y - pointer.y) * 0.08;
  
  if (Math.abs(targetPointer.x - pointer.x) > 0.001 || Math.abs(targetPointer.y - pointer.y) > 0.001) {
    animationFrame = requestAnimationFrame(updatePointer);
  } else {
    animationFrame = null;
  }
}

const parallaxStyle = computed(() => ({
  transform: `translate(${pointer.x * -16}px, ${pointer.y * -16}px)`,
  width: '100%',
  height: '100%'
}));
</script>

<style scoped>
.teacher-studio-view {
  min-height: calc(100vh - var(--nav-height));
  background: var(--rk-bg);
  color: var(--rk-ink);
  display: flex;
  flex-direction: column;
}

/* ══════ Hero Section (Split Layout) ══════ */
.studio-hero {
  display: grid;
  grid-template-columns: 36% 64%;
  grid-template-rows: 1fr;
  min-height: calc(100vh - var(--nav-height));
  box-sizing: border-box;
}

.hero-left {
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--rk-panel);
  border-right: 2px solid var(--rk-ink);
}

.hero-right {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--rk-white);
  overflow: hidden;
  border-left: 1px solid var(--rk-ink);
}

.hero-header-right {
  position: absolute;
  top: 16px;
  left: 20px;
  z-index: 10;
  white-space: nowrap;
}

.indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--rk-ink);
}

/* ══════ Watermark ══════ */
.watermark-percent {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: clamp(6rem, 12vw, 10rem);
  font-weight: 900;
  color: rgba(23, 23, 19, 0.04);
  line-height: 1;
  pointer-events: none;
  user-select: none;
}

.teacher-entry-content {
  margin-top: auto;
  margin-bottom: auto;
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.process-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  color: var(--rk-ink);
  padding: 3px 8px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  width: fit-content;
}

.upload-title {
  font-size: clamp(2.4rem, 4vw, 3.2rem);
  font-weight: 900;
  color: var(--rk-ink);
  margin: 0;
  line-height: 1;
}

.upload-desc {
  font-size: 14px;
  color: var(--rk-ink);
  line-height: 1.6;
  margin: 0;
}

.studio-entry-stack {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.studio-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow-sm);
  color: var(--rk-ink);
  font-weight: 800;
  font-size: 14px;
  transition: transform 0.05s, box-shadow 0.05s, background 0.1s;
}

.studio-entry:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--rk-ink);
  background: var(--rk-yellow);
}

.entry-arrow {
  font-family: var(--font-mono);
  font-size: 16px;
}

/* ══════ Ambient Visual ══════ */
.network-container {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
}

.ambient-readout {
  position: absolute;
  z-index: 10;
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-ink);
  background: var(--rk-panel);
  padding: 2px 6px;
  border: 1px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
}

.ar-tl { top: 48px; left: 20px; }
.ar-tr { top: 48px; right: 20px; }
.ar-bl { bottom: 20px; left: 20px; }
.ar-br { bottom: 20px; right: 20px; }

.network-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 40px;
}

.parallax-layer {
  display: flex;
  align-items: center;
  justify-content: center;
}

.network-image {
  max-width: 90%;
  max-height: 85%;
  object-fit: contain;
  border: 2px solid var(--rk-ink);
  box-shadow: 6px 6px 0 var(--rk-ink);
}

@media (max-width: 900px) {
  .studio-hero {
    grid-template-columns: 1fr;
  }
  .hero-right {
    min-height: 360px;
  }
}
</style>
