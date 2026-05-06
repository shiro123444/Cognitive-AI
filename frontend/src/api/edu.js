import apiClient from './client';

export function createEduDataset(payload) {
  return apiClient.post('/api/edu/datasets', payload);
}

export function listEduDatasets(limit = 20) {
  return apiClient.get('/api/edu/datasets', { params: { limit } });
}

export function getEduDataset(datasetId) {
  return apiClient.get(`/api/edu/datasets/${datasetId}`);
}

export function runEduAnalysis(payload) {
  return apiClient.post('/api/edu/analysis/run', payload);
}

export function getEduAnalysisStatus(jobId) {
  return apiClient.get(`/api/edu/analysis/status/${jobId}`);
}

export function listEduAnalyses(limit = 20) {
  return apiClient.get('/api/edu/analysis', { params: { limit } });
}

export function getEduAnalysis(analysisId) {
  return apiClient.get(`/api/edu/analysis/${analysisId}`);
}

export function getEduAnalysisGraph(analysisId) {
  return apiClient.get(`/api/edu/analysis/${analysisId}/graph`);
}

export function getEduAnalysisPrediction(analysisId) {
  return apiClient.get(`/api/edu/analysis/${analysisId}/prediction`);
}

export function getEduReport(reportId) {
  return apiClient.get(`/api/edu/reports/${reportId}`);
}

export function getEduReportPreviewUrl(reportId) {
  return `/api/edu/reports/${reportId}/preview`;
}

export function getEduReportPdfUrl(reportId, options = {}) {
  const shouldDownload = options.download !== false;
  return `/api/edu/reports/${reportId}/pdf${shouldDownload ? '?download=1' : ''}`;
}

// ── Global-awareness Agent ─────────────────────────────────────────────────

export function collectAndAnalyze(payload = {}) {
  return apiClient.post('/api/edu/collect-and-analyze', payload);
}

export function collectPreview(params = {}) {
  return apiClient.get('/api/edu/collect-preview', { params });
}
