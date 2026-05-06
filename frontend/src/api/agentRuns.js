import apiClient from './client';

export function getAgentRun(runId) {
  return apiClient.get(`/api/agent-runs/${runId}`);
}

export function listAgentRunEvents(runId) {
  return apiClient.get(`/api/agent-runs/${runId}/events`);
}
