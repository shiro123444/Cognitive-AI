import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

const { default: apiClient } = await import('./client');
const { getAgentRun, listAgentRunEvents } = await import('./agentRuns');
const { uploadMaterialAsync } = await import('./materials');
const { materialUploadScopeFromRoute } = await import('../views/uploadViewState');

describe('agent run and scoped material APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches an agent run and its events', async () => {
    apiClient.get.mockResolvedValueOnce({ id: 'run-1' });
    apiClient.get.mockResolvedValueOnce([{ id: 'event-1' }]);

    await expect(getAgentRun('run-1')).resolves.toEqual({ id: 'run-1' });
    await expect(listAgentRunEvents('run-1')).resolves.toEqual([{ id: 'event-1' }]);

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/agent-runs/run-1');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/agent-runs/run-1/events');
  });

  it('uploads async materials with scope metadata', async () => {
    const file = new File(['private note'], 'note.txt', { type: 'text/plain' });
    apiClient.post.mockResolvedValue({ job_id: 'job-1', run_id: 'run-1' });

    await uploadMaterialAsync('ai-intro', file, {
      scopeType: 'student_personal',
      ownerId: 'student-1'
    });

    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toBe('/api/materials/upload?async=1');
    expect(body.get('course_id')).toBe('ai-intro');
    expect(body.get('scope_type')).toBe('student_personal');
    expect(body.get('owner_id')).toBe('student-1');
    expect(body.get('file')).toBe(file);
  });
});

describe('upload view scope state', () => {
  it('maps route query to teacher public scope by default', () => {
    expect(materialUploadScopeFromRoute({})).toEqual({
      scopeType: 'course_global',
      ownerId: '',
      mode: 'teacher'
    });
  });

  it('maps student query to personal scope', () => {
    expect(materialUploadScopeFromRoute({ mode: 'student', owner: 'student-1' })).toEqual({
      scopeType: 'student_personal',
      ownerId: 'student-1',
      mode: 'student'
    });
  });
});
