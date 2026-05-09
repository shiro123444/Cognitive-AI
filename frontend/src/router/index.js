import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import CourseView from '../views/CourseView.vue';
import CourseGraphView from '../views/CourseGraphView.vue';
import ChapterActivityFlowView from '../views/ChapterActivityFlowView.vue';
import TeacherStudioView from '../views/TeacherStudioView.vue';
import EduFishStudioView from '../views/EduFishStudioView.vue';
import TeacherModelConfigView from '../views/TeacherModelConfigView.vue';
import TutorView from '../views/TutorView.vue';
import UploadView from '../views/UploadView.vue';
import LoginView from '../views/LoginView.vue';

import { useAuthStore } from '../stores/auth';

export const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true, immersive: true }
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/:courseId',
    name: 'course',
    component: CourseView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/:courseId/graph',
    name: 'course-graph',
    component: CourseGraphView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/:courseId/chapters/:chapterId',
    name: 'chapter-activity-flow',
    component: ChapterActivityFlowView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/teacher',
    name: 'teacher',
    component: TeacherStudioView,
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] }
  },
  {
    path: '/teacher/edufish',
    name: 'teacher-edufish',
    component: EduFishStudioView,
    meta: { immersive: true, requiresAuth: true, roles: ['teacher', 'admin'] }
  },
  {
    path: '/teacher/model-config',
    name: 'teacher-model-config',
    component: TeacherModelConfigView,
    meta: { immersive: true, requiresAuth: true, roles: ['teacher', 'admin'] }
  },
  {
    path: '/tutor',
    name: 'tutor',
    component: TutorView,
    meta: { requiresAuth: true }
  },
  {
    path: '/upload',
    name: 'upload',
    component: UploadView,
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] }
  }
];

const router = createRouter({
  history: import.meta.env.MODE === 'test' ? createMemoryHistory() : createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  }
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta?.public) {
    if (to.name === 'login' && auth.isAuthenticated) {
      return auth.homeRouteForCurrentRole();
    }
    return true;
  }

  if (!to.meta?.requiresAuth) return true;

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  const allowedRoles = to.meta?.roles;
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (auth.role !== 'admin' && !allowedRoles.includes(auth.role)) {
      return auth.homeRouteForCurrentRole();
    }
  }

  return true;
});

if (typeof window !== 'undefined') {
  window.addEventListener('edufish:auth-expired', () => {
    const currentPath = router.currentRoute.value.fullPath;
    if (router.currentRoute.value.name === 'login') return;
    router.replace({ name: 'login', query: { redirect: currentPath } });
  });
}

export default router;
