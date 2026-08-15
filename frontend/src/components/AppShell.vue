<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const mobileOpen = ref(false);
const userMenuOpen = ref(false);
const teacherDropdownOpen = ref(false);
const isImmersive = computed(() => Boolean(route.meta?.immersive));

const ROLE_LABELS = {
  admin: '管理员',
  teacher: '教师',
  student: '学生'
};

const navLinks = computed(() => {
  const links = [
    { to: '/agentos', label: '⚡ AgentOS 全天候工作台', match: (r) => r.name === 'agentos' },
    { to: '/', label: '首页', match: (r) => r.name === 'dashboard' },
    {
      to: '/courses/ai-intro',
      label: '课程体系',
      match: (r) => r.name === 'course' || r.name === 'course-graph' || r.name === 'chapter-activity-flow'
    },
    {
      to: '/lab',
      label: '实验平台',
      match: (r) => r.name === 'lab'
    },
    {
      to: '/tutor',
      label: 'AI 助教',
      match: (r) => r.name === 'tutor'
    }
  ];

  if (auth.role === 'student') {
    links.push({
      to: '/assignments',
      label: '我的作业',
      match: (r) => r.name === 'my-assignments'
    });
  }

  if (auth.role === 'teacher' || auth.role === 'admin') {
    links.push({
      to: '/teacher',
      label: '教师工作台',
      isDropdown: true,
      match: (r) => [
        'teacher', 'teacher-edufish', 'teacher-model-config',
        'teacher-assignments', 'upload', 'runtime-inspector'
      ].includes(r.name)
    });
  }

  return links;
});

const teacherSubLinks = [
  { to: '/teacher', label: '工作台首页' },
  { to: '/teacher/edufish', label: 'EduFish 教学分析推演' },
  { to: '/teacher/model-config', label: '模型网关参数' },
  { to: '/teacher/assignments', label: '作业批改中心' },
  { to: '/upload', label: '材料智能抽取' },
  { to: '/runtime', label: 'Agent Runtime 监控' }
];

const userInitial = computed(() => {
  const name = auth.user?.name || auth.user?.username || '';
  return name ? name.slice(0, 1).toUpperCase() : '·';
});

const roleLabel = computed(() => ROLE_LABELS[auth.role] || auth.role || '');

function isActive(link) {
  return link.match(route);
}

function toggleMobile() {
  mobileOpen.value = !mobileOpen.value;
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value;
}

function goLogin() {
  router.push({ name: 'login', query: { redirect: route.fullPath } });
}

async function handleLogout() {
  userMenuOpen.value = false;
  await auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="shell-root" :class="{ 'is-immersive': isImmersive }">
    <header v-if="!isImmersive" class="nav">
      <div class="container nav-inner">
        <!-- Brand / Logo Section (Compact) -->
        <RouterLink to="/" class="brand" aria-label="EDUFISH · AI与脑认知科学">
          <span class="brand-mark">
            <i class="sq-yellow" />
            <i class="sq-pink" />
            <i class="sq-cyan" />
            <i class="sq-green" />
          </span>
          <span class="brand-stack">
            <strong class="brand-text">EDUFISH</strong>
            <em class="brand-sub mono">AI × 脑科学</em>
          </span>
        </RouterLink>

        <!-- Compact Navigation Links -->
        <nav class="nav-links" aria-label="Primary">
          <template v-for="link in navLinks" :key="link.to">
            <!-- Normal Link -->
            <RouterLink
              v-if="!link.isDropdown"
              :to="link.to"
              class="nav-link"
              :class="{ active: isActive(link) }"
            >
              {{ link.label }}
            </RouterLink>

            <!-- Dropdown Link (Teacher Workspace) -->
            <div
              v-else
              class="nav-dropdown"
              @mouseenter="teacherDropdownOpen = true"
              @mouseleave="teacherDropdownOpen = false"
            >
              <RouterLink
                :to="link.to"
                class="nav-link"
                :class="{ active: isActive(link) }"
              >
                {{ link.label }}
                <span class="dropdown-arrow">▾</span>
              </RouterLink>

              <div v-show="teacherDropdownOpen" class="dropdown-menu" role="menu">
                <RouterLink
                  v-for="sub in teacherSubLinks"
                  :key="sub.to"
                  :to="sub.to"
                  class="dropdown-item"
                  @click="teacherDropdownOpen = false"
                >
                  <span class="sq sq-cyan" />
                  {{ sub.label }}
                </RouterLink>
              </div>
            </div>
          </template>
        </nav>

        <!-- Trailing Actions (User / Status / Login) -->
        <div class="nav-trailing">
          <template v-if="auth.isAuthenticated">
            <div class="user-block" @keydown.esc="userMenuOpen = false">
              <button
                class="user-pill"
                :class="{ open: userMenuOpen }"
                @click="toggleUserMenu"
                aria-haspopup="menu"
                :aria-expanded="userMenuOpen"
              >
                <span class="user-avatar">{{ userInitial }}</span>
                <span class="user-meta">
                  <span class="user-name">{{ auth.user?.name || auth.user?.username }}</span>
                  <span class="user-role">{{ roleLabel }}</span>
                </span>
              </button>
              <transition name="pixel-route">
                <div v-if="userMenuOpen" class="user-menu" role="menu">
                  <div class="user-menu-head">
                    <div class="user-menu-name">{{ auth.user?.name }}</div>
                    <div class="user-menu-username mono">@{{ auth.user?.username }}</div>
                  </div>
                  <button class="user-menu-item" type="button" @click="handleLogout">
                    <span class="sq sq-orange" /> 退出登录
                  </button>
                </div>
              </transition>
            </div>
          </template>
          <template v-else>
            <button class="btn btn-primary btn-sm" type="button" @click="goLogin">登录</button>
          </template>
        </div>

        <button
          class="mobile-toggle"
          @click="toggleMobile"
          aria-label="Toggle menu"
          aria-controls="mobile-menu"
          :aria-expanded="mobileOpen"
        >
          <span :class="{ open: mobileOpen }"></span>
        </button>
      </div>

      <!-- Mobile menu -->
      <transition name="pixel-route">
        <div v-if="mobileOpen" id="mobile-menu" class="mobile-menu">
          <nav class="mobile-nav" aria-label="Mobile primary">
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
          </nav>

          <div class="mobile-account">
            <template v-if="auth.isAuthenticated">
              <div class="mobile-user">
                <span class="mobile-user-avatar">{{ userInitial }}</span>
                <span class="mobile-user-meta">
                  <span class="mobile-user-name">{{ auth.user?.name || auth.user?.username }}</span>
                  <span class="mobile-user-role">{{ roleLabel }}</span>
                </span>
              </div>
              <button class="btn btn-danger btn-sm w-full" type="button" @click="handleLogout">退出登录</button>
            </template>
            <template v-else>
              <button class="btn btn-primary btn-sm w-full" type="button" @click="() => { mobileOpen = false; goLogin(); }">登录</button>
            </template>
          </div>
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
  background-color: var(--rk-bg);
  color: var(--rk-ink);
  display: flex;
  flex-direction: column;
}

.shell-root.is-immersive {
  min-height: 100vh;
}

.shell-main {
  flex: 1;
  min-height: 0;
  padding-top: var(--nav-height);
}

.shell-main-immersive {
  padding-top: 0;
}

.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--nav-height);
  background: var(--rk-panel);
  border-bottom: 2px solid var(--rk-ink);
}

.nav-inner {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  align-items: center;
  height: 100%;
  gap: 12px;
}

/* ── Brand (Compact) ── */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  grid-template-columns: 6px 6px;
  gap: 2px;
  width: 14px;
  height: 14px;
}

.brand-mark i {
  display: block;
  width: 6px;
  height: 6px;
  border: 1px solid var(--rk-ink);
}

.sq-yellow { background: var(--rk-yellow); }
.sq-pink { background: var(--rk-pink); }
.sq-cyan { background: var(--rk-cyan); }
.sq-green { background: var(--rk-green); }

.brand-stack {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.brand-text {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 14px;
  color: var(--rk-ink);
  letter-spacing: 0.04em;
}

.brand-sub {
  font-size: 9px;
  font-weight: 700;
  font-style: normal;
  color: var(--rk-muted);
  letter-spacing: 0.05em;
  margin-top: 1px;
}

/* ── Nav Links (Compact) ── */
.nav-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
}

.nav-dropdown {
  position: relative;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
  letter-spacing: 0.02em;
  padding: 4px 10px;
  border: 1.5px solid transparent;
  background: transparent;
  transition: all 0.05s ease;
  white-space: nowrap;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--rk-muted);
}

.nav-link:hover {
  background: var(--rk-white);
  border-color: var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  transform: translate(-1px, -1px);
}

.nav-link.active {
  background: var(--rk-yellow);
  border-color: var(--rk-ink);
  box-shadow: 2px 2px 0 var(--rk-ink);
}

/* ── Dropdown Menu ── */
.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow);
  display: grid;
  gap: 2px;
  padding: 4px;
  z-index: 120;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--rk-ink);
  text-decoration: none;
  border: 1px solid transparent;
}

.dropdown-item:hover {
  background: var(--rk-panel);
  border-color: var(--rk-ink);
}

/* ── Trailing Actions (Compact) ── */
.nav-trailing {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.user-block {
  position: relative;
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  cursor: pointer;
  transition: transform 0.05s;
}

.user-pill:hover,
.user-pill.open {
  background: var(--rk-panel);
  transform: translate(1px, 1px);
  box-shadow: none;
}

.user-avatar {
  width: 18px;
  height: 18px;
  background: var(--rk-yellow);
  border: 1px solid var(--rk-ink);
  color: var(--rk-ink);
  font-size: 10px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.user-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.user-name {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--rk-ink);
}

.user-role {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--rk-muted);
}

.user-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow);
  z-index: 120;
}

.user-menu-head {
  padding: 8px 10px;
  border-bottom: 1px solid var(--rk-ink);
  background: var(--rk-panel);
}

.user-menu-name {
  font-size: 11.5px;
  font-weight: 800;
}

.user-menu-username {
  font-size: 10px;
  color: var(--rk-muted);
}

.user-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: none;
  background: none;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--rk-ink);
  cursor: pointer;
  text-align: left;
}

.user-menu-item:hover {
  background: var(--rk-orange);
}

/* ── Mobile ── */
.mobile-toggle {
  display: none;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  padding: 4px;
  cursor: pointer;
}

.mobile-toggle span {
  display: block;
  width: 16px;
  height: 2px;
  background: var(--rk-ink);
  position: relative;
}

.mobile-toggle span::before,
.mobile-toggle span::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 2px;
  background: var(--rk-ink);
  left: 0;
}

.mobile-toggle span::before { top: -5px; }
.mobile-toggle span::after { bottom: -5px; }

@media (max-width: 860px) {
  .nav-links { display: none; }
  .mobile-toggle { display: block; }
  .nav-inner { grid-template-columns: 1fr auto auto; }
}

.mobile-menu {
  position: fixed;
  top: var(--nav-height);
  left: 0;
  right: 0;
  background: var(--rk-panel);
  border-bottom: 2px solid var(--rk-ink);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.mobile-link {
  display: block;
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  font-size: 13px;
  font-weight: 800;
  color: var(--rk-ink);
  text-decoration: none;
}

.mobile-link.active {
  background: var(--rk-yellow);
}

.mobile-account {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--rk-ink);
}

.w-full { width: 100%; }
</style>
