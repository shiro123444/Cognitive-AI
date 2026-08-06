import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';

/**
 * All views are lazy-loaded so the heavy graph / lab / studio bundles
 * (d3, echarts, three, gsap, niivue) load on demand instead of shipping
 * in the initial entry chunk. The login page and app shell stay lean.
 */
const DashboardView = () => import('../views/DashboardView.vue');
const CourseView = () => import('../views/CourseView.vue');
const CourseGraphView = () => import('../views/CourseGraphView.vue');
const ChapterActivityFlowView = () => import('../views/ChapterActivityFlowView.vue');
const TeacherStudioView = () => import('../views/TeacherStudioView.vue');
const EduFishStudioView = () => import('../views/EduFishStudioView.vue');
const TeacherModelConfigView = () => import('../views/TeacherModelConfigView.vue');
const TutorView = () => import('../views/TutorView.vue');
const LabView = () => import('../views/LabView.vue');
const RuntimeInspectorView = () => import('../views/RuntimeInspectorView.vue');
const UploadView = () => import('../views/UploadView.vue');
const LoginView = () => import('../views/LoginView.vue');
const MyAssignmentsView = () => import('../views/MyAssignmentsView.vue');
const TeacherAssignmentsView = () => import('../views/TeacherAssignmentsView.vue');

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
    path: '/lab',
    name: 'lab',
    component: LabView,
    meta: { requiresAuth: true }
  },
  {
    path: '/runtime',
    name: 'runtime-inspector',
    component: RuntimeInspectorView,
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] }
  },
  {
    path: '/upload',
    name: 'upload',
    component: UploadView,
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] }
  },
  {
    path: '/assignments',
    name: 'my-assignments',
    component: MyAssignmentsView,
    meta: { requiresAuth: true, roles: ['student', 'admin'] }
  },
  {
    path: '/teacher/assignments',
    name: 'teacher-assignments',
    component: TeacherAssignmentsView,
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
    const auth = useAuthStore();
    auth.clearSession();
    router.replace({ name: 'login', query: { redirect: currentPath } });
  });
}

export default router;
