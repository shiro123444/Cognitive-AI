import apiClient from './client';

/**
 * Agent Runtime API client.
 * Routes are served by the Node runtime (:4000), reverse-proxied under /runtime
 * by nginx. Responses are plain JSON (no success envelope), so the axios
 * response interceptor in ./client returns the payload directly.
 */

export function createRuntimeSession(participants = []) {
  return apiClient.post('/runtime/sessions', { participants });
}

export function listRuntimeEvents(sessionId, lastSeenSeq = 0) {
  return apiClient.get(`/runtime/events/${sessionId}?last_seen_seq=${lastSeenSeq}`);
}

export function startRuntimeRun(payload) {
  return apiClient.post('/runtime/runs', payload);
}
