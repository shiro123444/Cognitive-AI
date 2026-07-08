<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const mobileOpen = ref(false);
const userMenuOpen = ref(false);
const isImmersive = computed(() => Boolean(route.meta?.immersive));

const ROLE_LABELS = {
  admin: '管理员',
  teacher: '教师',
  student: '学生'
};

const allNavLinks = [
  { to: '/', label: '首页', match: (r) => r.name === 'dashboard', visibleFor: ['admin', 'teacher', 'student'] },
  {
    to: '/courses/ai-intro',
    label: '课程',
    match: (r) => r.name === 'course' || r.name === 'course-graph' || r.name === 'chapter-activity-flow',
    visibleFor: ['admin', 'teacher', 'student']
  },
  {
    to: '/assignments',
    label: '我的作业',
    match: (r) => r.name === 'my-assignments',
    visibleFor: ['student']
  },
  {
    to: '/teacher/assignments',
    label: '作业批改',
    match: (r) => r.name === 'teacher-assignments',
    visibleFor: ['admin', 'teacher']
  },
  { to: '/tutor', label: 'AI 助教', match: (r) => r.name === 'tutor', visibleFor: ['admin', 'teacher', 'student'] },
  {
    to: '/lab',
    label: '实验平台',
    match: (r) => r.name === 'lab',
    visibleFor: ['admin', 'teacher', 'student']
  },
  { to: '/upload', label: '上传材料', match: (r) => r.name === 'upload', visibleFor: ['admin', 'teacher'] },
  { to: '/runtime', label: 'Runtime', match: (r) => r.name === 'runtime-inspector', visibleFor: ['admin', 'teacher'] },
  {
    to: '/teacher',
    label: '教师工作室',
    match: (r) => r.name === 'teacher' || r.name === 'teacher-edufish' || r.name === 'teacher-model-config',
    visibleFor: ['admin', 'teacher']
  }
];

const navLinks = computed(() => {
  if (!auth.isAuthenticated) return allNavLinks;
  const role = auth.role;
  if (!role) return allNavLinks;
  return allNavLinks.filter((link) => link.visibleFor.includes(role));
});

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
        <!-- Logo Section -->
        <RouterLink to="/" class="brand" aria-label="EDUFISH · AI与脑认知科学">
          <div class="brand-icon-wrapper">
            <div class="brand-shape square"></div>
            <div class="brand-shape circle"></div>
          </div>
          <span class="brand-stack">
            <span class="brand-text">EDUFISH</span>
            <span class="brand-sub">AI与脑认知科学</span>
          </span>
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
          <template v-if="auth.isAuthenticated">
            <div class="user-block" @keydown.esc="userMenuOpen = false">
              <button class="user-pill" :class="{ open: userMenuOpen }" @click="toggleUserMenu" aria-haspopup="menu" :aria-expanded="userMenuOpen">
                <span class="user-avatar">{{ userInitial }}</span>
                <span class="user-meta">
                  <span class="user-name">{{ auth.user?.name || auth.user?.username }}</span>
                  <span class="user-role">{{ roleLabel }}</span>
                </span>
              </button>
              <transition name="fade">
                <div v-if="userMenuOpen" class="user-menu" role="menu">
                  <div class="user-menu-head">
                    <div class="user-menu-name">{{ auth.user?.name }}</div>
                    <div class="user-menu-username">@{{ auth.user?.username }}</div>
                  </div>
                  <button class="user-menu-item" type="button" @click="handleLogout">退出登录</button>
                </div>
              </transition>
            </div>
          </template>
          <template v-else>
            <button class="login-btn" type="button" @click="goLogin">登录</button>
          </template>
        </div>

        <button class="mobile-toggle" @click="toggleMobile" aria-label="Toggle menu" aria-controls="mobile-menu" :aria-expanded="mobileOpen">
          <span :class="{ open: mobileOpen }"></span>
        </button>
      </div>

      <!-- Mobile menu -->
      <transition name="fade">
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
              <button class="mobile-action" type="button" @click="handleLogout">退出登录</button>
            </template>
            <template v-else>
              <button class="mobile-action primary" type="button" @click="() => { mobileOpen = false; goLogin(); }">登录</button>
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
  letter-spacing: 0.02em;
  line-height: 1;
}

.brand-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-sub {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.16em;
  line-height: 1;
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
  height: 36px;
  padding: 0 18px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.04em;
  transition: transform var(--dur-2) ease, background var(--dur-2) ease;
}

.login-btn:hover {
  transform: translateY(-1px);
  background: var(--primary-hover);
}

.user-block {
  position: relative;
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 14px 4px 4px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color var(--dur-2) ease;
  font: inherit;
}

.user-pill:hover,
.user-pill.open {
  border-color: var(--text-1);
}

.user-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0;
  border-radius: 50%;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  text-align: left;
}

.user-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-1);
  line-height: 1;
}

.user-role {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.08);
  z-index: 110;
}

.user-menu-head {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.user-menu-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--text-1);
}

.user-menu-username {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

.user-menu-item {
  display: block;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  color: var(--text-1);
  transition: background var(--dur-2) ease;
}

.user-menu-item:hover {
  background: var(--surface-2, rgba(0, 0, 0, 0.04));
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-right: -10px; /* align visual edge while keeping tap target */
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    position: relative;
  }

  .mobile-toggle span,
  .mobile-toggle span::before,
  .mobile-toggle span::after {
    position: absolute;
    left: 50%;
    width: 24px;
    height: 2px;
    background: var(--text-1);
    transform: translateX(-50%);
    transition: all var(--dur-2) ease;
  }

  .mobile-toggle span { top: 50%; margin-top: -1px; }
  .mobile-toggle span::before { content: ""; top: -7px; }
  .mobile-toggle span::after { content: ""; top: 7px; }

  .mobile-toggle span.open { background: transparent; }
  .mobile-toggle span.open::before { top: 0; transform: translateX(-50%) rotate(45deg); }
  .mobile-toggle span.open::after { top: 0; transform: translateX(-50%) rotate(-45deg); }

  .mobile-menu {
    position: fixed;
    top: var(--nav-height);
    left: 0;
    right: 0;
    background: var(--surface-0);
    border-bottom: 1px solid var(--border-subtle);
    padding: 8px 20px 16px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - var(--nav-height));
    overflow-y: auto;
    z-index: 99;
  }

  .mobile-nav {
    display: flex;
    flex-direction: column;
  }

  .mobile-link {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: 0.02em;
    border-bottom: 1px solid var(--border-subtle);
  }

  .mobile-link:last-child {
    border-bottom: none;
  }

  .mobile-link.active {
    color: var(--primary);
  }

  .mobile-account {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-user {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mobile-user-avatar {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    background: var(--text-1);
    color: var(--text-inverse, #fff);
    font-weight: 700;
    font-size: 14px;
    border-radius: 50%;
  }

  .mobile-user-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mobile-user-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-1);
    line-height: 1.2;
  }

  .mobile-user-role {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  .mobile-action {
    min-height: 44px;
    padding: 0 16px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    color: var(--text-1);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    font: inherit;
  }

  .mobile-action.primary {
    background: var(--primary);
    color: var(--text-inverse);
    border-color: var(--primary);
  }
}
</style>
