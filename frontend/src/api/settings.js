import apiClient from './client';

export function getLlmSettings() {
  return apiClient.get('/api/settings/llm');
}

export function updateLlmSettings(payload) {
  return apiClient.put('/api/settings/llm', payload);
}

export function testLlmSettings(payload) {
  return apiClient.post('/api/settings/llm/test', payload);
}

export function getEmbeddingSettings() {
  return apiClient.get('/api/settings/embedding');
}

export function updateEmbeddingSettings(payload) {
  return apiClient.put('/api/settings/embedding', payload);
}

export function testEmbeddingSettings(payload) {
  return apiClient.post('/api/settings/embedding/test', payload);
}
