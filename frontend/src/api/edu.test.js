import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

const { default: apiClient } = await import('./client');
const {
  createEduDataset,
  getEduAnalysis,
  getEduAnalysisGraph,
  getEduAnalysisPrediction,
  getEduAnalysisStatus,
  getEduDataset,
  getEduReportPdfUrl,
  getEduReportPreviewUrl,
  getEduReport,
  listEduAnalyses,
  listEduDatasets,
  runEduAnalysis
} = await import('./edu');

describe('EduFish API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and lists persisted education datasets', async () => {
    const payload = { dataset_meta: { name: 'demo' }, dataset: {} };
    const dataset = { dataset_id: 'edu_ds_1' };
    apiClient.post.mockResolvedValue(dataset);
    apiClient.get.mockResolvedValue({ datasets: [dataset], count: 1 });

    await expect(createEduDataset(payload)).resolves.toBe(dataset);
    await expect(listEduDatasets(5)).resolves.toEqual({ datasets: [dataset], count: 1 });
    await expect(getEduDataset('edu_ds_1')).resolves.toEqual({ datasets: [dataset], count: 1 });

    expect(apiClient.post).toHaveBeenCalledWith('/api/edu/datasets', payload);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/edu/datasets', { params: { limit: 5 } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/edu/datasets/edu_ds_1');
  });

  it('runs analysis and reads status, graph, prediction, and report resources', async () => {
    apiClient.post.mockResolvedValue({ job_id: 'job-1', analysis_id: 'edu_an_1', report_id: 'edu_rp_1' });
    apiClient.get
      .mockResolvedValueOnce({ status: 'completed' })
      .mockResolvedValueOnce({ analysis_id: 'edu_an_1' })
      .mockResolvedValueOnce({ analyses: [], count: 0 })
      .mockResolvedValueOnce({ nodes: [], edges: [] })
      .mockResolvedValueOnce({ baseline_score: 72, scenarios: [] })
      .mockResolvedValueOnce({ report_id: 'edu_rp_1' });

    await runEduAnalysis({ dataset_id: 'edu_ds_1' });
    await getEduAnalysisStatus('job-1');
    await getEduAnalysis('edu_an_1');
    await listEduAnalyses(3);
    await getEduAnalysisGraph('edu_an_1');
    await getEduAnalysisPrediction('edu_an_1');
    await getEduReport('edu_rp_1');

    expect(apiClient.post).toHaveBeenCalledWith('/api/edu/analysis/run', { dataset_id: 'edu_ds_1' });
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/edu/analysis/status/job-1');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/edu/analysis/edu_an_1');
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/api/edu/analysis', { params: { limit: 3 } });
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/api/edu/analysis/edu_an_1/graph');
    expect(apiClient.get).toHaveBeenNthCalledWith(5, '/api/edu/analysis/edu_an_1/prediction');
    expect(apiClient.get).toHaveBeenNthCalledWith(6, '/api/edu/reports/edu_rp_1');
  });

  it('builds report preview and pdf URLs for browser navigation', () => {
    expect(getEduReportPreviewUrl('edu_rp_1')).toBe('/api/edu/reports/edu_rp_1/preview');
    expect(getEduReportPdfUrl('edu_rp_1')).toBe('/api/edu/reports/edu_rp_1/pdf?download=1');
    expect(getEduReportPdfUrl('edu_rp_1', { download: false })).toBe('/api/edu/reports/edu_rp_1/pdf');
  });
});
