<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import FeatureParticles from '../components/FeatureParticles.vue';
import gsap from 'gsap';

const mouseX = ref(0);
const mouseY = ref(0);

function onMouseMove(e) {
  mouseX.value = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY.value = (e.clientY / window.innerHeight - 0.5) * 2;

  // Floating geometric elements parallax
  gsap.to('.parallax-fast', { x: mouseX.value * 40, y: mouseY.value * 40, duration: 1.2, ease: 'power2.out' });
  gsap.to('.parallax-slow', { x: mouseX.value * -20, y: mouseY.value * -20, duration: 1.8, ease: 'power2.out' });

  // Text parallax
  gsap.to('.parallax-text', { x: mouseX.value * 15, y: mouseY.value * 15, duration: 1.5, ease: 'power2.out' });

  // Main brain image 3D tilt
  gsap.to('.brain-image', {
    x: mouseX.value * 15,
    y: mouseY.value * 15,
    rotationY: mouseX.value * 8,
    rotationX: -mouseY.value * 8,
    duration: 1,
    ease: 'power2.out'
  });
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);

  const tl = gsap.timeline();

  tl.fromTo('.hero-tag',
    { opacity: 0, x: -20 },
    { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out' }
  )
  .fromTo('.hero-title-line',
    { opacity: 0, y: 40 },
    { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'expo.out' },
    '-=0.6'
  )
  .fromTo('.hero-desc',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' },
    '-=0.6'
  )
  .fromTo('.hero-link',
    { opacity: 0 },
    { opacity: 1, duration: 0.8 },
    '-=0.4'
  )
  .fromTo('.brain-image',
    { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
    { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.5, ease: 'expo.out' },
    '-=0.8'
  )
  .fromTo('.visual-decor > *',
    { opacity: 0, scale: 0 },
    { opacity: 1, scale: 1, duration: 1, stagger: 0.1, ease: 'back.out(1.5)' },
    '-=1.2'
  )
  .fromTo('.floating-text',
    { opacity: 0 },
    { opacity: 1, duration: 1, stagger: 0.1 },
    '-=1'
  )
  .fromTo('.feature-col, .blue-block',
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'expo.out' },
    '-=0.6'
  );

  // Continuous slight floating animation for the brain if mouse is still
  gsap.to('.scene-wrapper', {
    y: '-=15',
    duration: 3,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut'
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
});
</script>

<template>
  <div class="dashboard">
    <!-- Main Hero Container -->
    <main class="hero-container container">
      <!-- Left Content -->
      <div class="hero-content">
        <!-- Number indicator -->
        <div class="side-indicator mono">
          <span class="num">01</span>
          <div class="line"></div>
          <span class="num">05</span>
        </div>

        <div class="content-wrapper">
          <div class="hero-tag">
            <span class="dot"></span>
            <span class="tag-text">AI × 脑科学 × 认知科学</span>
          </div>

          <h1 class="hero-title display">
            <span class="hero-title-line">AI与脑认知科学</span>
          </h1>

          <div class="hero-separator"></div>

          <p class="hero-desc">
            探索智能与大脑的共通原理，<br>
            推动跨学科研究与教育创新。
          </p>

          <RouterLink to="/courses/ai-intro" class="hero-link">
            了解更多 <span class="arrow">→</span>
          </RouterLink>
        </div>
      </div>

      <!-- Right Visual (Image & Geometry) -->
      <div class="hero-visual">
        <div class="visual-decor">
          <div class="square-blue parallax-fast"></div>
          <div class="triangle-blue parallax-slow"></div>
          <div class="circle-blue parallax-fast"></div>

          <div class="dots-grid top-right parallax-slow"></div>
          <div class="dots-grid center-left parallax-fast"></div>

          <svg class="connecting-lines" width="100%" height="100%" preserveAspectRatio="none">
            <line x1="20%" y1="60%" x2="40%" y2="20%" stroke="var(--border-default)" stroke-width="1"/>
            <line x1="40%" y1="20%" x2="80%" y2="30%" stroke="var(--border-default)" stroke-width="1"/>
            <line x1="60%" y1="80%" x2="80%" y2="30%" stroke="var(--border-default)" stroke-width="1"/>
            <line x1="20%" y1="60%" x2="60%" y2="80%" stroke="var(--border-default)" stroke-width="1"/>
          </svg>

          <!-- Nodes -->
          <div class="node n1 parallax-slow"></div>
          <div class="node n2 parallax-fast"></div>
          <div class="node n3 parallax-slow"></div>
          <div class="node n4 parallax-fast"></div>
        </div>

        <!-- Interactive Brain Image Wrapper -->
        <div class="scene-wrapper">
          <img src="/brain-hero.png" alt="Brain Geometry" class="brain-image" draggable="false" />
        </div>

        <div class="floating-text t1 mono parallax-text">NEURAL<br>COGNITION</div>
        <div class="floating-text t2 mono parallax-text">INTERDISCIPLINARY<br>EDUCATION</div>
        <div class="floating-text t3 mono parallax-text">ARTIFICIAL<br>INTELLIGENCE</div>
      </div>
    </main>

    <!-- Bottom Features Grid with Three.js interactions -->
    <section class="features-grid container">
      <!-- Column 1 -->
      <div class="feature-col">
        <div class="col-header">
          <h3>课程知识图谱</h3>
          <span class="plus">+</span>
        </div>
        <p>把章节、概念与材料关系可视化，帮助学生快速定位学习路径。</p>
        <div class="col-graphic">
          <FeatureParticles type="cloud" emphasis />
        </div>
      </div>

      <!-- Column 2 -->
      <div class="feature-col">
        <div class="col-header">
          <h3>AI 助教问答</h3>
          <span class="plus">+</span>
        </div>
        <p>基于课程材料、知识图谱与引用证据回答问题，支持章节上下文追问。</p>
        <div class="col-graphic">
          <FeatureParticles type="organic" emphasis />
        </div>
      </div>

      <!-- Column 3 -->
      <div class="feature-col">
        <div class="col-header">
          <h3>材料智能分析</h3>
          <span class="plus">+</span>
        </div>
        <p>上传 PDF、Markdown 或文本后，自动完成提取、分块、嵌入与索引。</p>
        <div class="col-graphic">
          <FeatureParticles type="organic" emphasis />
        </div>
      </div>

      <!-- Solid Blue Block -->
      <div class="blue-block">
        <p class="blue-block-text">从课程材料到可追问的知识网络。</p>
        <div class="blue-block-line"></div>
        <RouterLink to="/teacher" class="blue-block-link">
          进入教师工作室 <span class="arrow">→</span>
        </RouterLink>
        <div class="geometric-decor">
          <div class="shape s-circle"></div>
          <div class="shape s-square"></div>
          <div class="shape s-triangle"></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--surface-0);
  padding-top: var(--nav-height);
  display: flex;
  flex-direction: column;
}

/* ══════ Hero ══════ */
.hero-container {
  flex: 1;
  display: grid;
  grid-template-columns: 45% 55%;
  min-height: calc(100vh - var(--nav-height) - 300px);
  position: relative;
}

.hero-content {
  display: flex;
  position: relative;
  padding: 80px 0 40px 0;
  z-index: 10;
}

.side-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px;
  margin-right: 40px;
  color: var(--text-4);
  font-size: 10px;
}

.side-indicator .line {
  width: 1px;
  flex: 1;
  background: var(--border-default);
  margin: 16px 0;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hero-tag {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 40px;
}

.hero-tag .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
}

.hero-tag .tag-text {
  color: var(--primary);
  font-weight: 600;
  letter-spacing: 0.05em;
  font-size: 14px;
}

.hero-title {
  font-size: clamp(3rem, 5vw, 5rem);
  color: var(--text-1);
  margin-bottom: 32px;
  white-space: nowrap;
  line-break: strict;
  word-break: keep-all;
}

.hero-separator {
  width: 48px;
  height: 2px;
  background: var(--primary);
  margin-bottom: 32px;
}

.hero-desc {
  color: var(--text-3);
  font-size: 16px;
  line-height: 1.8;
  margin-bottom: 48px;
}

.hero-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  color: var(--text-1);
  font-size: 15px;
  transition: color var(--dur-2) ease;
}

.hero-link .arrow {
  color: var(--primary);
  transition: transform var(--dur-2) ease;
}

.hero-link:hover {
  color: var(--primary);
}

.hero-link:hover .arrow {
  transform: translateX(6px);
}

/* ══════ Right Visual ══════ */
.hero-visual {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.scene-wrapper {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 700px;
  height: 700px;
  z-index: 5;
  perspective: 1200px; /* Crucial for 3D rotation of the image */
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brain-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
}

/* Geometry Decor */
.visual-decor {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.square-blue {
  position: absolute;
  top: 30%;
  left: 10%;
  width: 80px;
  height: 80px;
  background: var(--primary);
}

.circle-blue {
  position: absolute;
  top: 50%;
  right: 20%;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--primary);
}

.triangle-blue {
  position: absolute;
  bottom: 20%;
  left: 30%;
  width: 0;
  height: 0;
  border-left: 40px solid transparent;
  border-right: 40px solid transparent;
  border-bottom: 69px solid var(--primary);
}

/* Dots pattern */
.dots-grid {
  position: absolute;
  width: 100px;
  height: 100px;
  background-image: radial-gradient(var(--text-4) 1px, transparent 1px);
  background-size: 10px 10px;
  opacity: 0.5;
}

.top-right {
  top: 20%;
  right: 10%;
}

.center-left {
  top: 60%;
  left: 5%;
  width: 60px;
  height: 150px;
}

.connecting-lines {
  position: absolute;
  inset: 0;
}

/* Nodes */
.node {
  position: absolute;
  border-radius: 50%;
}

.n1 { width: 8px; height: 8px; background: var(--primary); top: 15%; right: 25%; }
.n2 { width: 6px; height: 6px; background: var(--text-1); top: 40%; right: 10%; }
.n3 { width: 10px; height: 10px; background: var(--primary); bottom: 15%; right: 30%; }
.n4 { width: 4px; height: 4px; background: var(--text-1); bottom: 35%; left: 15%; }

/* Floating Text */
.floating-text {
  position: absolute;
  font-size: 9px;
  color: var(--primary);
  letter-spacing: 0.1em;
  z-index: 3;
}

.t1 { top: 15%; right: 5%; text-align: right; }
.t2 { bottom: 25%; left: 5%; }
.t3 { bottom: 15%; right: 10%; text-align: right; }

/* ══════ Bottom Features ══════ */
.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  align-items: stretch;
  border-top: 1px solid var(--border-default);
  margin-top: 40px;
}

.feature-col {
  padding: 40px 40px 40px 0;
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
}

.feature-col:nth-child(3) {
  padding-right: 40px;
}

.col-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.col-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
}

.col-header .plus {
  color: var(--primary);
  font-size: 20px;
  font-weight: 300;
}

.feature-col p {
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 40px;
}

.col-graphic {
  margin-top: auto;
  height: 120px;
  position: relative;
  /* Make sure the container limits the Three.js canvas correctly */
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* Solid Blue Block */
.blue-block {
  background: var(--primary);
  padding: 60px 40px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.blue-block-text {
  color: var(--surface-0);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.6;
  margin-bottom: 24px;
  position: relative;
  z-index: 2;
}

.blue-block-line {
  width: 40px;
  height: 1px;
  background: var(--surface-0);
  margin-bottom: 40px;
  position: relative;
  z-index: 2;
}

.blue-block-link {
  color: var(--surface-0);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  position: relative;
  z-index: 2;
}

.blue-block-link .arrow {
  transition: transform var(--dur-2) ease;
}

.blue-block-link:hover .arrow {
  transform: translateX(6px);
}

.geometric-decor {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  opacity: 0.8;
}

.geometric-decor .shape {
  width: 40px;
  height: 40px;
  border: 1px solid var(--surface-0);
}

.geometric-decor .s-circle {
  border-radius: 50%;
}

.geometric-decor .s-triangle {
  width: 0;
  height: 0;
  border-left: 20px solid transparent;
  border-right: 20px solid transparent;
  border-bottom: 34px solid transparent;
  border-top: none;
  border-bottom-color: var(--surface-0);
  background: transparent;
  border-left-color: transparent;
  border-right-color: transparent;
  position: relative;
}
.geometric-decor .s-triangle::after {
  content: "";
  position: absolute;
  top: 1px;
  left: -18px;
  border-left: 18px solid transparent;
  border-right: 18px solid transparent;
  border-bottom: 31px solid var(--primary);
}

/* ══════ Responsive ══════ */
@media (max-width: 1024px) {
  .features-grid {
    grid-template-columns: 1fr 1fr;
  }

  .feature-col {
    padding: 32px 32px 32px 0;
  }

  .feature-col:nth-child(2) {
    border-right: none;
    padding-right: 0;
    padding-left: 32px;
  }

  .feature-col:nth-child(3) {
    border-top: 1px solid var(--border-default);
  }

  .blue-block {
    grid-column: span 1;
    border-top: 1px solid var(--border-default);
  }
}

@media (max-width: 768px) {
  .hero-container {
    grid-template-columns: 1fr;
  }

  .hero-visual {
    display: none; /* Hide heavy visual on mobile */
  }

  .hero-title {
    white-space: normal;
    max-width: min(100%, 7.5ch);
    font-size: clamp(2rem, 8vw, 2.75rem);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .hero-title-line {
    display: block;
    max-width: 100%;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .feature-col {
    padding: 32px 0;
    border-right: none;
    border-bottom: 1px solid var(--border-default);
  }

  .feature-col:nth-child(2) {
    padding-left: 0;
  }

  .feature-col:nth-child(3) {
    border-top: none;
    border-bottom: none;
  }
}
</style>
