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

export const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView
  },
  {
    path: '/courses/:courseId',
    name: 'course',
    component: CourseView,
    props: true
  },
  {
    path: '/courses/:courseId/graph',
    name: 'course-graph',
    component: CourseGraphView,
    props: true
  },
  {
    path: '/courses/:courseId/chapters/:chapterId',
    name: 'chapter-activity-flow',
    component: ChapterActivityFlowView,
    props: true
  },
  {
    path: '/teacher',
    name: 'teacher',
    component: TeacherStudioView
  },
  {
    path: '/teacher/edufish',
    name: 'teacher-edufish',
    component: EduFishStudioView,
    meta: { immersive: true }
  },
  {
    path: '/teacher/model-config',
    name: 'teacher-model-config',
    component: TeacherModelConfigView,
    meta: { immersive: true }
  },
  {
    path: '/tutor',
    name: 'tutor',
    component: TutorView
  },
  {
    path: '/upload',
    name: 'upload',
    component: UploadView
  }
];

export default createRouter({
  history: import.meta.env.MODE === 'test' ? createMemoryHistory() : createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  }
});
