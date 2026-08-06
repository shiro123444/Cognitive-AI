import { describe, expect, it } from 'vitest';
import {
  buildTeacherGraphQuery,
  buildTeacherOverlayOptions,
  resolveTeacherGraphView,
  teacherGraphEmptyMessage
} from './teacherGraphWorkspaceState';

describe('teacher graph workspace state', () => {
  it('normalizes teacher graph view modes', () => {
    expect(resolveTeacherGraphView('course-graph')).toBe('course-graph');
    expect(resolveTeacherGraphView('evidence-graph')).toBe('evidence-graph');
    expect(resolveTeacherGraphView('report')).toBe('default');
  });

  it('maps overlay owners to compact toolbar options', () => {
    expect(buildTeacherOverlayOptions([
      { user_id: 'student-1', student_alias: '学生-01' }
    ])).toEqual([
      { id: 'student-1', label: '学生-01' }
    ]);
  });

  it('builds teacher graph query payloads', () => {
    expect(buildTeacherGraphQuery('course-graph', 'AI101', { overlay: 'student-1' })).toEqual({
      view: 'course-graph',
      course: 'AI101',
      overlay: 'student-1'
    });
  });

  it('returns concise empty states per mode', () => {
    expect(teacherGraphEmptyMessage('course-graph')).toContain('知识图谱');
    expect(teacherGraphEmptyMessage('course-graph', { overlay: true })).toContain('个性化训练痕迹');
    expect(teacherGraphEmptyMessage('evidence-graph', { latestMissing: true })).toBe('NO COMPLETED ANALYSIS');
  });
});
