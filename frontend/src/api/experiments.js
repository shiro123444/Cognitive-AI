import apiClient from './client';

export function listExperiments(params = {}) {
  return apiClient.get('/api/experiments', { params });
}

export function getExperiment(experimentId) {
  return apiClient.get(`/api/experiments/${experimentId}`);
}

export function runExperiment(experimentId, payload) {
  return apiClient.post(`/api/experiments/${experimentId}/runs`, payload);
}

export function getExperimentRun(runId) {
  return apiClient.get(`/api/experiment-runs/${runId}`);
}
