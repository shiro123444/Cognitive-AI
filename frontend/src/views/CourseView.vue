<template>
  <section class="course-view container">
    <header v-if="courseLoading || courseError || !course" class="page-header">
      <div class="indicator mono">
        <div class="dot"></div>
        COURSE VIEW / 课程视图
      </div>
      <h1 class="display">{{ course?.title || course?.name || courseId }}</h1>
      <div class="separator"></div>
      <p class="desc">{{ course?.summary || course?.description || '查看课程材料并提出针对性问题。' }}</p>
    </header>

    <div v-if="courseLoading" class="panel">
      <p class="status-message">正在加载课程…</p>
    </div>

    <div v-else-if="courseError" class="panel">
      <p class="status-message error">{{ courseError }}</p>
      <button type="button" class="btn btn-outline" @click="loadCourse">重试</button>
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
          <RouterLink class="course-utility-link" :to="`/courses/${courseId}/graph`">
            OPEN KNOWLEDGE GRAPH
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
          <div class="course-top-label mono">COURSE SYLLABUS <span class="blue-dot"></span></div>

          <!-- Background Noise -->
          <div class="noise-overlay"></div>

          <!-- CORE MODULE Badge -->
          <div class="core-module-badge mono">
            <span class="badge-text">CORE MODULE</span>
            <div class="badge-line"></div>
            <div class="badge-dot"></div>
          </div>

          <!-- Vertical Text -->
          <div class="vertical-rail-right mono">
            <span class="num">06</span>
            <span class="text">PROJECTS<br>ASSESSMENT AND</span>
            <span class="dots"><i v-for="n in 3" :key="n"></i></span>
          </div>

          <!-- Organic SVG Path -->
          <svg class="course-path-svg" ref="svgPathsRef" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <!-- Smooth curves -->
            <path class="svg-path-solid" d="M 150 100 L 420 100 C 480 100, 480 230, 550 230" />
            <path class="svg-path-dotted" d="M 550 230 L 850 230 C 950 230, 950 500, 450 500" />
            <path class="svg-path-solid" d="M 450 500 C 350 500, 350 650, 550 650" />
            <path class="svg-path-dotted" d="M 550 650 L 850 650 C 950 650, 950 900, 700 900" />

            <!-- Intersection Nodes -->
            <circle cx="420" cy="100" r="4" class="svg-dot" />
            <circle cx="550" cy="230" r="4" class="svg-dot" />
            <circle cx="450" cy="500" r="4" class="svg-dot" />
            <circle cx="550" cy="650" r="4" class="svg-dot" />
            <circle cx="700" cy="900" r="4" class="svg-dot" />
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
                <span v-for="(topic, topicIndex) in chapterSubtopics(chapter)" :key="topic.en">
                  <b>{{ index + 1 }}.{{ topicIndex + 1 }}</b>
                  <span><span class="topic-zh">{{ topic.zh }}</span><span class="topic-en">{{ topic.en }}</span></span>
                </span>
              </span>
            </button>
          </template>

          <a class="course-syllabus-link mono" href="#full-syllabus">
            VIEW FULL SYLLABUS <span class="arrow-line"></span>
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

const introRef = ref(null);
const stageContainerRef = ref(null);
const stageRef = ref(null);
const svgPathsRef = ref(null);

const { y: scrollY } = useWindowScroll();
const { height: winH } = useWindowSize();

const chapters = computed(() => Array.isArray(course.value?.chapters) ? course.value.chapters : []);
const visualChapters = computed(() => {
  if (chapters.value.length >= 5) {
    return chapters.value;
  }

  if (props.courseId === 'ai-intro') {
    return [
      {
        id: 'ai-foundations',
        title: 'Foundations',
        sections: ['What is AI?', 'Agents and environments']
      },
      {
        id: 'ai-search',
        title: 'Search and Problem Solving',
        sections: ['Problem-Solving Agents', 'Uninformed Search', 'Informed Search', 'Heuristics and Optimization']
      },
      {
        id: 'ai-learning',
        title: 'Learning and Neural Networks',
        sections: ['Machine Learning Basics', 'Neural Network Foundations', 'Deep Learning', 'Training and Generalization']
      },
      {
        id: 'ai-language-vision',
        title: 'Language, Vision and Knowledge',
        sections: ['Language Models', 'Computer Vision', 'Knowledge Graphs', 'Reasoning Systems']
      },
      {
        id: 'ai-future',
        title: 'Applications and Future Directions',
        sections: ['AI in Neuroscience', 'Brain-Inspired AI', 'Ethical Considerations', 'The Road Ahead']
      }
    ];
  }

  return chapters.value;
});

// ── 3D Camera Parallax (Mouse Move) ──
function onMouseMove(e) {
  if (!stageRef.value || !stageContainerRef.value) return;

  const rect = stageContainerRef.value.getBoundingClientRect();
  // Normalized coordinates: -0.5 to 0.5
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;

  gsap.to(stageRef.value, {
    rotationY: x * 8,
    rotationX: -y * 8,
    x: x * -15,
    y: y * -15,
    ease: "power2.out",
    duration: 1.2,
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
    duration: 1.5,
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
    titleEl.style.transform = `translateY(${-scrollProgress * 28}px)`;
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
      gsap.fromTo(path, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: i * 0.35 + 0.5, ease: "power2.inOut" });
    } else {
      const length = path.getTotalLength();
      gsap.fromTo(path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 1.8, delay: i * 0.35, ease: "power2.inOut" }
      );
    }
  });

  const dots = svgPathsRef.value.querySelectorAll('circle');
  gsap.fromTo(dots,
    { scale: 0, transformOrigin: "center" },
    { scale: 1, duration: 0.6, stagger: 0.2, delay: 0.5, ease: "back.out(2)" }
  );
}

// ── Node hover: ripple the pin ──
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
    setTimeout(animateLines, 400);
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
    setTimeout(animateLines, 400);
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
  padding-top: calc(var(--nav-height) + 60px);
  padding-bottom: 100px;
}

.page-header {
  margin-bottom: 60px;
}

.indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 24px;
}

.indicator .dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
  border-radius: 50%;
}

.page-header h1 {
  font-size: 2.5rem;
  color: var(--text-1);
  margin-bottom: 24px;
}

.separator {
  width: 40px;
  height: 2px;
  background: var(--text-1);
  margin-bottom: 24px;
}

.desc {
  color: var(--text-3);
  font-size: 14px;
  line-height: 1.8;
  max-width: 600px;
}

.course-utility-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 28px;
}

.course-utility-link {
  width: fit-content;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--primary);
  color: var(--primary);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
</style>
