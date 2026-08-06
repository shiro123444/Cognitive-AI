import { describe, it, expect } from 'vitest';
import {
  assignmentStatusLabel,
  assignmentTypeLabel,
  formatDueAt,
  groupAssignmentsByCourse,
  indexSubmissionsByAssignment,
  submissionStatusLabel,
  validateGradeInput,
  validateSubmissionAnswer
} from './assignmentsViewState';

describe('assignmentsViewState', () => {
  it('maps known labels and falls back to raw value for unknown ones', () => {
    expect(assignmentTypeLabel('reading')).toBe('阅读');
    expect(assignmentTypeLabel('experiment')).toBe('认知实验');
    expect(assignmentTypeLabel('mystery')).toBe('mystery');
    expect(assignmentStatusLabel('draft')).toBe('草稿');
    expect(submissionStatusLabel('graded')).toBe('已批改');
  });

  it('formats ISO dates to zh-CN locale and passes through unparseable ones', () => {
    expect(formatDueAt(null)).toBe('无截止日期');
    expect(formatDueAt('garbage')).toBe('garbage');
    const formatted = formatDueAt('2026-05-10T10:00:00Z');
    expect(formatted).toMatch(/2026/);
  });

  it('indexes submissions keeping the first (most recent) entry per assignment', () => {
    const latest = { id: 's2', assignment_id: 'a1', submitted_at: '2026-05-10T10:00:00Z' };
    const older = { id: 's1', assignment_id: 'a1', submitted_at: '2026-05-09T10:00:00Z' };
    const map = indexSubmissionsByAssignment([latest, older]);
    expect(map.get('a1').id).toBe('s2');
  });

  it('validates submission answers', () => {
    expect(validateSubmissionAnswer('')).toMatch(/填写/);
    expect(validateSubmissionAnswer('   ')).toMatch(/填写/);
    expect(validateSubmissionAnswer('ok')).toBeNull();
    expect(validateSubmissionAnswer('x'.repeat(8001))).toMatch(/过长/);
  });

  it('validates grade input', () => {
    expect(validateGradeInput({ score: '', feedback: '' })).toMatch(/分数/);
    expect(validateGradeInput({ score: 'abc', feedback: '' })).toMatch(/数字/);
    expect(validateGradeInput({ score: -1, feedback: '' })).toMatch(/0 到 100/);
    expect(validateGradeInput({ score: 101, feedback: '' })).toMatch(/0 到 100/);
    expect(validateGradeInput({ score: 85, feedback: 'ok' })).toBeNull();
  });

  it('groups assignments by course, joining on a courses lookup', () => {
    const grouped = groupAssignmentsByCourse(
      [
        { id: 'a1', course_id: 'c1', title: 'A1' },
        { id: 'a2', course_id: 'c1', title: 'A2' },
        { id: 'a3', course_id: 'c2', title: 'A3' }
      ],
      [
        { id: 'c1', title: 'Course One' },
        { id: 'c2', title: 'Course Two' }
      ]
    );
    expect(grouped).toHaveLength(2);
    expect(grouped[0].course.title).toBe('Course One');
    expect(grouped[0].assignments).toHaveLength(2);
    expect(grouped[1].assignments[0].id).toBe('a3');
  });
});
