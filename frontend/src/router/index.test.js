import { describe, expect, it } from 'vitest';

import router, { routes } from './index';

describe('router', () => {
  it('exposes the teacher model configuration as a deeper studio route', () => {
    expect(router.hasRoute('teacher-model-config')).toBe(true);

    const route = router.resolve('/teacher/model-config');
    expect(route.name).toBe('teacher-model-config');
    expect(route.meta.immersive).toBe(true);
  });

  it('exposes a dedicated student graph workspace route', () => {
    expect(router.hasRoute('course-graph')).toBe(true);

    const route = router.resolve('/courses/ai-intro/graph');
    expect(route.name).toBe('course-graph');
    expect(route.params.courseId).toBe('ai-intro');
  });

  it('keeps teacher edufish graph modes on the same route with query parameters', () => {
    const route = router.resolve('/teacher/edufish?view=course-graph&course=AI101');

    expect(route.name).toBe('teacher-edufish');
    expect(route.query.view).toBe('course-graph');
    expect(route.query.course).toBe('AI101');
  });

  it('registers the lab route as an authenticated student route', () => {
    const lab = routes.find((route) => route.path === '/lab');

    expect(lab).toBeTruthy();
    expect(lab.name).toBe('lab');
    expect(lab.meta).toEqual({ requiresAuth: true });
  });

  it('registers the runtime inspector as a protected teacher route', () => {
    const runtime = routes.find((route) => route.path === '/runtime');

    expect(runtime).toBeTruthy();
    expect(runtime.name).toBe('runtime-inspector');
    expect(runtime.meta).toEqual({ requiresAuth: true, roles: ['teacher', 'admin'] });
  });
});
