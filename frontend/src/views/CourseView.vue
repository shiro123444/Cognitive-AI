<template>
  <section class="course-view container">
    <header v-if="courseLoading || courseError || !course" class="page-header hero-banner">
      <div class="indicator mono">
        <span class="sq sq-yellow"></span>
        <span>COURSE VIEW / 课程视图</span>
      </div>
      <h1 class="hero-banner-title">{{ course?.title || course?.name || courseId }}</h1>
      <p class="hero-banner-subtitle">{{ course?.summary || course?.description || '查看课程材料并提出针对性问题。' }}</p>
    </header>

    <div v-if="courseLoading" class="panel">
      <p class="status-message mono"><span class="sq on"></span> 正在加载课程数据…</p>
    </div>

    <div v-else-if="courseError" class="panel">
      <p class="status-message error"><span class="sq off"></span> {{ courseError }}</p>
      <button type="button" class="btn btn-primary btn-sm mt-4" @click="loadCourse">重试加载</button>
    </div>

    <div v-else-if="course" class="course-spatial-shell">
      <aside ref="introRef" class="course-spatial-intro">
        <p class="kicker course-kicker">AI &amp; BRAIN SCIENCE / 人工智能与脑科学</p>
        <h1 class="course-spatial-title">
          SYLLABUS /<br>COURSE<br>CHAPTERS
        </h1>
        <div class="course-blue-rule"></div>
        <p class="course-spatial-copy">
          穿越智能原理、学习机制与脑科学前沿的旅程。<br>
          <span class="course-spatial-copy-en">A journey through the principles of intelligence, learning, and the science of the brain.</span>
        </p>
        <div class="course-utility-links mono">
          <RouterLink class="btn btn-yellow btn-sm" :to="`/courses/${courseId}/graph`">
            打开知识图谱 →
          </RouterLink>
        </div>
        <div class="course-vertical-rail" aria-hidden="true">
          <span class="course-rail-dots">
            <i v-for="chapter in visualChapters" :key="chapter.id || chapter.title"></i>
          </span>
          <span>CHAPTERS</span>
        </div>
      </aside>

      <!-- 3D Parallax Container -->
      <section
        id="full-syllabus"
        ref="stageContainerRef"
        class="course-path-stage-container"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
      >
        <div ref="stageRef" class="course-path-stage" aria-label="课程章节路径">
          <div class="course-top-label mono">COURSE SYLLABUS <span class="sq sq-cyan"></span></div>

          <!-- Background Noise / Grid -->
          <div class="noise-overlay"></div>

          <!-- Organic SVG Path -->
          <svg class="course-path-svg" ref="svgPathsRef" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <!-- Smooth curves with 2px crisp ink strokes -->
            <path class="svg-path-solid" d="M 150 100 L 420 100 C 480 100, 480 230, 550 230" />
            <path class="svg-path-dotted" d="M 550 230 L 850 230 C 950 230, 950 500, 450 500" />
            <path class="svg-path-solid" d="M 450 500 C 350 500, 350 650, 550 650" />
            <path class="svg-path-dotted" d="M 550 650 L 850 650 C 950 650, 950 900, 700 900" />

            <!-- Intersection Nodes -->
            <circle cx="420" cy="100" r="5" class="svg-dot" />
            <circle cx="550" cy="230" r="5" class="svg-dot" />
            <circle cx="450" cy="500" r="5" class="svg-dot" />
            <circle cx="550" cy="650" r="5" class="svg-dot" />
            <circle cx="700" cy="900" r="5" class="svg-dot" />
          </svg>

          <p v-if="visualChapters.length === 0" class="panel status-message">暂无可用章节。</p>
          <template v-else>
            <button
              v-for="(chapter, index) in visualChapters"
              :key="chapter.id || index"
              type="button"
              :class="chapterNodeClass(index)"
              :disabled="!chapter.id"
              @click="selectChapter(chapter.id)"
              @mouseenter="onNodeHover(index, $event)"
            >
              <span class="course-node-head">
                <span class="course-node-number" :data-text="String(index + 1).padStart(2, '0')">
                  {{ String(index + 1).padStart(2, '0') }}
                </span>
                <span class="course-node-rule"></span>
                <span class="course-node-pin"></span>
              </span>
              <span class="course-node-title">
                <span class="course-node-title-en">{{ chapterDisplayTitle(chapter).en }}</span>
                <span class="course-node-title-zh">{{ chapterDisplayTitle(chapter).zh }}</span>
              </span>
              <span class="course-node-topics">
                <span v-for="(topic, topicIndex) in chapterSubtopics(chapter)" :key="topic.en" class="topic-tag">
                  <b>{{ index + 1 }}.{{ topicIndex + 1 }}</b>
                  <span class="topic-zh">{{ topic.zh }}</span>
                </span>
              </span>
            </button>
          </template>

          <a class="course-syllabus-link mono" href="#full-syllabus">
            VIEW FULL SYLLABUS <span class="arrow-line">→</span>
          </a>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useWindowScroll, useWindowSize } from '@vueuse/core';
import { getCourse } from '../api/courses';
import { buildChapterActivityPath } from './chapterActivityFlowState';
import { chapterDisplayTitle, chapterNodeClass, chapterSubtopics } from './courseViewState';
import gsap from 'gsap';

const props = defineProps({
  courseId: {
    type: String,
    required: true
  }
});

const router = useRouter();
const course = ref(null);
const courseLoading = ref(false);
const courseError = ref('');
let courseRequestId = 0;

const stageContainerRef = ref(null);
const stageRef = ref(null);
const introRef = ref(null);
const svgPathsRef = ref(null);

const { y: scrollY } = useWindowScroll();
const { height: winH } = useWindowSize();

const visualChapters = computed(() => {
  if (!course.value || !Array.isArray(course.value.chapters)) return [];
  return course.value.chapters;
});

function onMouseMove(e) {
  if (!stageRef.value || !stageContainerRef.value) return;

  const rect = stageContainerRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;

  gsap.to(stageRef.value, {
    rotationY: x * 6,
    rotationX: -y * 6,
    x: x * -10,
    y: y * -10,
    ease: "power2.out",
    duration: 1,
    overwrite: "auto"
  });
}

function onMouseLeave() {
  if (!stageRef.value) return;
  gsap.to(stageRef.value, {
    rotationY: 0,
    rotationX: 0,
    x: 0,
    y: 0,
    ease: "power2.out",
    duration: 1.2,
    overwrite: "auto"
  });
}

function selectChapter(chapterId) {
  if (!chapterId) return;
  router.push(buildChapterActivityPath(props.courseId, chapterId));
}

// ── Scroll Parallax ──
function applyParallax() {
  if (!introRef.value) return;
  const scrollProgress = Math.min(1, Math.max(0, scrollY.value / Math.max(winH.value * 0.8, 1)));

  const titleEl = introRef.value.querySelector('.course-spatial-title');
  if (titleEl) {
    titleEl.style.transform = `translateY(${-scrollProgress * 20}px)`;
  }
}

watch(scrollY, applyParallax, { passive: true });
watch(winH, applyParallax);

// ── SVG Path Animation ──
function animateLines() {
  if (!svgPathsRef.value) return;

  const paths = svgPathsRef.value.querySelectorAll('path');
  paths.forEach((path, i) => {
    if (path.classList.contains('svg-path-dotted')) {
      gsap.fromTo(path, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: i * 0.2 + 0.3, ease: "steps(2,end)" });
    } else {
      const length = path.getTotalLength();
      gsap.fromTo(path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 1.2, delay: i * 0.2, ease: "power2.inOut" }
      );
    }
  });

  const dots = svgPathsRef.value.querySelectorAll('circle');
  gsap.fromTo(dots,
    { scale: 0, transformOrigin: "center" },
    { scale: 1, duration: 0.4, stagger: 0.15, delay: 0.3, ease: "back.out(2)" }
  );
}

function onNodeHover(_index, event) {
  const pin = event.currentTarget.querySelector('.course-node-pin');
  if (!pin) return;
  pin.classList.add('pin-pulse');
  pin.addEventListener('animationend', () => {
    pin.classList.remove('pin-pulse');
  }, { once: true });
}

onMounted(() => {
  loadCourse();
  nextTick(() => {
    setTimeout(animateLines, 300);
    applyParallax();
  });
});

watch(
  () => props.courseId,
  () => {
    loadCourse();
  }
);

async function loadCourse() {
  const requestId = courseRequestId + 1;
  courseRequestId = requestId;
  courseLoading.value = true;
  courseError.value = '';
  course.value = null;

  try {
    const result = await getCourse(props.courseId);
    if (requestId !== courseRequestId) return;
    course.value = result || null;
    await nextTick();
    setTimeout(animateLines, 300);
  } catch (caughtError) {
    if (requestId === courseRequestId) {
      course.value = null;
      courseError.value = caughtError?.message || '无法加载课程。';
    }
  } finally {
    if (requestId === courseRequestId) {
      courseLoading.value = false;
    }
  }
}
</script>

<style scoped>
.course-view {
  padding-top: 24px;
  padding-bottom: 80px;
}

.page-header {
  margin-bottom: 32px;
}

.indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 800;
  color: var(--rk-ink);
  margin-bottom: 8px;
}

.course-utility-links {
  margin-top: 24px;
}

.course-path-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.svg-path-solid {
  stroke: var(--rk-ink);
  stroke-width: 2;
  fill: none;
}

.svg-path-dotted {
  stroke: var(--rk-ink);
  stroke-width: 2;
  stroke-dasharray: 4 4;
  fill: none;
}

.svg-dot {
  fill: var(--rk-yellow);
  stroke: var(--rk-ink);
  stroke-width: 2;
}

.course-node-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.course-node-number {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 900;
  line-height: 1;
  color: var(--rk-ink);
  padding: 2px 6px;
  background: var(--rk-yellow);
  border: 1.5px solid var(--rk-ink);
}

.course-node-rule {
  flex: 1;
  height: 2px;
  background: var(--rk-ink);
}

.course-node-pin {
  width: 10px;
  height: 10px;
  background: var(--rk-pink);
  border: 1.5px solid var(--rk-ink);
  transition: transform 0.15s ease;
}

.course-path-node:hover .course-node-pin {
  transform: scale(1.3);
}

.course-node-title-en {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--rk-muted);
  text-transform: uppercase;
}

.course-node-title-zh {
  display: block;
  font-size: 16px;
  font-weight: 900;
  color: var(--rk-ink);
  margin-top: 2px;
}

.course-node-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--rk-faint);
}

.topic-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
  font-size: 11px;
}

.topic-tag b {
  font-family: var(--font-mono);
  color: var(--rk-ink);
}

.topic-zh {
  color: var(--rk-ink);
  font-weight: 600;
}

.course-top-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 11px;
  font-weight: 800;
  color: var(--rk-muted);
  margin-bottom: 12px;
}

.course-syllabus-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
  margin-top: 16px;
}

.mt-4 {
  margin-top: 16px;
}
</style>
