<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const route = useRoute();
const mobileOpen = ref(false);
const isImmersive = computed(() => Boolean(route.meta?.immersive));

const navLinks = [
  { to: '/', label: '首页', match: (r) => r.name === 'dashboard' },
  {
    to: '/courses/ai-intro',
    label: '课程',
    match: (r) => r.name === 'course' || r.name === 'course-graph' || r.name === 'chapter-activity-flow'
  },
  { to: '/tutor', label: 'AI 助教', match: (r) => r.name === 'tutor' },
  { to: '/upload', label: '上传材料', match: (r) => r.name === 'upload' },
  {
    to: '/teacher',
    label: '教师工作室',
    match: (r) => r.name === 'teacher' || r.name === 'teacher-edufish' || r.name === 'teacher-model-config'
  }
];

function isActive(link) {
  return link.match(route);
}

function toggleMobile() {
  mobileOpen.value = !mobileOpen.value;
}
</script>

<template>
  <div class="shell-root" :class="{ 'is-immersive': isImmersive }">
    <header v-if="!isImmersive" class="nav">
      <div class="container nav-inner">
        <!-- Logo Section -->
        <RouterLink to="/" class="brand" aria-label="AI与脑认知科学">
          <div class="brand-icon-wrapper">
            <div class="brand-shape square"></div>
            <div class="brand-shape circle"></div>
          </div>
          <span class="brand-text">AI与脑认知科学</span>
        </RouterLink>

        <!-- Centered Navigation Links -->
        <nav class="nav-links" aria-label="Primary">
          <RouterLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link"
            :class="{ active: isActive(link) }"
          >
            {{ link.label }}
          </RouterLink>
        </nav>

        <!-- Right Side Actions -->
        <div class="nav-trailing">
          <button class="search-btn" aria-label="搜索">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
              <circle cx="11" cy="11" r="7"/>
              <line x1="20" y1="20" x2="16" y2="16"/>
            </svg>
          </button>
          <button class="login-btn">登录</button>
        </div>

        <button class="mobile-toggle" @click="toggleMobile" aria-label="Toggle menu">
          <span :class="{ open: mobileOpen }"></span>
        </button>
      </div>

      <!-- Mobile menu -->
      <transition name="fade">
        <div v-if="mobileOpen" class="mobile-menu">
          <RouterLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="mobile-link"
            :class="{ active: isActive(link) }"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </RouterLink>
        </div>
      </transition>
    </header>

    <main class="shell-main" :class="{ 'shell-main-immersive': isImmersive }">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell-root {
  min-height: 100vh;
  background: var(--surface-0);
}

.shell-root.is-immersive {
  min-height: 100vh;
}

.shell-main-immersive {
  min-height: 100vh;
}

.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--nav-height);
  background: var(--surface-0);
  border-bottom: 1px solid var(--border-subtle);
}

.nav-inner {
  display: grid;
  grid-template-columns: 240px 1fr 240px;
  align-items: center;
  height: 100%;
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
}

.brand-shape {
  position: absolute;
}

.brand-shape.square {
  width: 16px;
  height: 16px;
  border: 1px solid var(--text-1);
  top: 0;
  left: 0;
}

.brand-shape.circle {
  width: 12px;
  height: 12px;
  background: var(--primary);
  border-radius: 50%;
  bottom: 0;
  right: 0;
}

.brand-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  color: var(--text-1);
  letter-spacing: -0.02em;
}

/* ── Nav Links ── */
.nav-links {
  display: flex;
  justify-content: center;
  gap: 40px;
}

.nav-link {
  position: relative;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.05em;
  padding: 8px 0;
  transition: color var(--dur-2) ease;
}

.nav-link:hover {
  color: var(--text-1);
}

.nav-link.active {
  color: var(--text-1);
}

.nav-link.active::after {
  content: "";
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 16px;
  height: 2px;
  background: var(--primary);
}

/* ── Trailing Actions ── */
.nav-trailing {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 24px;
}

.search-btn {
  color: var(--text-1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-btn {
  background: var(--primary);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 600;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--dur-2) ease, background var(--dur-2) ease;
}

.login-btn:hover {
  transform: scale(1.05);
  background: var(--primary-hover);
}

/* ── Mobile ── */
.mobile-toggle {
  display: none;
}

.fade-enter-active, .fade-leave-active { transition: opacity var(--dur-2); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 900px) {
  .nav-inner {
    grid-template-columns: 1fr auto;
  }

  .nav-links, .nav-trailing {
    display: none;
  }

  .mobile-toggle {
    display: flex;
    width: 24px;
    height: 24px;
    position: relative;
  }

  .mobile-toggle span,
  .mobile-toggle span::before,
  .mobile-toggle span::after {
    position: absolute;
    width: 24px;
    height: 2px;
    background: var(--text-1);
    transition: all var(--dur-2) ease;
  }

  .mobile-toggle span { top: 50%; margin-top: -1px; }
  .mobile-toggle span::before { content: ""; top: -6px; }
  .mobile-toggle span::after { content: ""; top: 6px; }
}
</style>
