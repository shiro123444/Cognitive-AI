import { describe, expect, it } from 'vitest';

import router from './index';

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
});
