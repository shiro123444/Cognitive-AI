import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

const { default: apiClient } = await import('./client');
const {
  approveReviewItem,
  listReviewItems,
  publishReviewItem,
  rejectReviewItem
} = await import('./review');
const { uploadMaterial } = await import('./materials');
const {
  createReviewActionTracker,
  reviewItemCreatedMessage,
  teacherStudioEntries
} = await import('../views/teacherStudioState');

describe('teacher studio API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads review items through the shared api client', async () => {
    const items = [{ id: 'review-1', status: 'draft' }];
    apiClient.get.mockResolvedValue(items);

    await expect(listReviewItems()).resolves.toBe(items);

    expect(apiClient.get).toHaveBeenCalledWith('/api/review/items');
  });

  it('posts teacher review decisions without unwrapping a second time', async () => {
    apiClient.post.mockResolvedValueOnce({ id: 'review-1', status: 'reviewed' });
    apiClient.post.mockResolvedValueOnce({ id: 'review-2', status: 'rejected' });
    apiClient.post.mockResolvedValueOnce({ id: 'review-1', status: 'published' });

    await approveReviewItem('review-1');
    await rejectReviewItem('review-2');
    await publishReviewItem('review-1');

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/review/items/review-1/approve', {
      reviewer: 'teacher'
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/review/items/review-2/reject', {
      reviewer: 'teacher'
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/api/review/items/review-1/publish');
  });

  it('uploads materials as form data with the selected course id and file', async () => {
    const file = new File(['chapter notes'], 'chapter.txt', { type: 'text/plain' });
    const created = { id: 'review-3' };
    apiClient.post.mockResolvedValue(created);

    await expect(uploadMaterial('ai-intro', file)).resolves.toBe(created);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toBe('/api/materials/upload');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('course_id')).toBe('ai-intro');
    expect(body.get('file')).toBe(file);
  });

  it('keeps scoped upload metadata optional for old callers', async () => {
    const file = new File(['chapter notes'], 'chapter.txt', { type: 'text/plain' });
    apiClient.post.mockResolvedValue({ job_id: 'job-1' });

    await uploadMaterial('ai-intro', file);

    const [, body] = apiClient.post.mock.calls[0];
    expect(body.get('scope_type')).toBe(null);
    expect(body.get('owner_id')).toBe(null);
  });

  it('formats upload responses with backend review_item_id', () => {
    expect(reviewItemCreatedMessage({ review_item_id: 'review-3' })).toBe('已创建审核条目 review-3');
  });

  it('tracks pending review actions by item id to block duplicate requests', () => {
    const tracker = createReviewActionTracker();

    expect(tracker.isPending('review-1')).toBe(false);
    expect(tracker.start('review-1')).toBe(true);
    expect(tracker.isPending('review-1')).toBe(true);
    expect(tracker.start('review-1')).toBe(false);
    tracker.finish('review-1');
    expect(tracker.isPending('review-1')).toBe(false);
  });

  it('keeps teacher studio focused on the two primary entries', () => {
    expect(teacherStudioEntries()).toEqual([
      { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
      { label: 'MODEL CONFIG', to: '/teacher/model-config' }
    ]);
  });
});
