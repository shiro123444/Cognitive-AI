import { describe, expect, it } from 'vitest';
import {
  buildEduFishAnalysisRequest,
  createEduFishDemoPayload,
  eduFishCourseOptions,
  mapEduFishGraph,
  normalizePredictionScenarios
} from './edufishStudioState';

describe('EduFish studio state helpers', () => {
  it('builds course-scoped analysis requests from the selected course', () => {
    const request = buildEduFishAnalysisRequest('edu_ds_1', eduFishCourseOptions[1]);

    expect(request).toEqual({
      dataset_id: 'edu_ds_1',
      template_id: 'course-quality',
      audience_role: 'school_admin',
      scope: {
        department_name: '智能科学学院',
        course_id: 'BC201',
        course_name: '脑与认知科学导论'
      }
    });
  });

  it('keeps demo data aligned with both teacher-studio course choices', () => {
    const payload = createEduFishDemoPayload();
    const courseIds = payload.dataset.courses.map((course) => course['课程编号']);

    expect(courseIds).toEqual(['AI101', 'BC201']);
    expect(payload.dataset.feedback).toHaveLength(4);
  });

  it('maps backend evidence graph nodes into a stable stage layout', () => {
    const mapped = mapEduFishGraph({
      nodes: [
        { id: 'department:智能科学学院', label: '智能科学学院', type: 'Department' },
        { id: 'course:BC201', label: '脑与认知科学导论', type: 'Course', subtitle: '2026春' },
        { id: 'teacher:T002', label: '王老师', type: 'Teacher' }
      ],
      edges: [
        { id: 'edge_1', source: 'department:智能科学学院', target: 'course:BC201', relationship: 'OFFERS' },
        { id: 'edge_2', source: 'teacher:T002', target: 'course:BC201', relationship: 'TEACHES' }
      ]
    });

    expect(mapped.nodes[0]).toMatchObject({
      id: 'course:BC201',
      label: '脑与认知科学导论',
      central: true,
      x: 585,
      y: 315,
      growthDelay: 0
    });
    expect(mapped.edges).toHaveLength(2);
    expect(mapped.edges[0]).toMatchObject({ growthDelay: 0.16 });
    expect(mapped.nodes.every((node) => typeof node.detail === 'string' && node.detail.length > 0)).toBe(true);
  });

  it('normalizes backend prediction scenarios for animated rendering', () => {
    const scenarios = normalizePredictionScenarios({
      baseline_score: 69,
      scenarios: [
        {
          scenario_id: 'lab-review',
          name: '增加实验复盘',
          delta_label: '+9%',
          score: 78,
          rationale: '补充复盘会改善学习达成。',
          actions: ['补充一次实验复盘课']
        }
      ]
    });

    expect(scenarios[0]).toMatchObject({
      id: 'lab-review',
      name: '增加实验复盘',
      delta: '+9%',
      score: 78,
      copy: '补充复盘会改善学习达成。'
    });
    expect(scenarios[0].path).toContain('M 8');
    expect(scenarios[0].points).toHaveLength(3);
  });
});
