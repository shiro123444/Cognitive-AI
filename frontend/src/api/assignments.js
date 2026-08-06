import apiClient from './client';

export function listAssignments(params = {}) {
  const search = new URLSearchParams();
  if (params.courseId) search.set('course_id', params.courseId);
  if (params.status) search.set('status', params.status);
  const qs = search.toString();
  return apiClient.get(`/api/assignments${qs ? `?${qs}` : ''}`);
}

export function getAssignment(assignmentId) {
  return apiClient.get(`/api/assignments/${assignmentId}`);
}

export function createAssignment(payload) {
  return apiClient.post('/api/assignments', payload);
}

export function publishAssignment(assignmentId) {
  return apiClient.post(`/api/assignments/${assignmentId}/publish`);
}

export function archiveAssignment(assignmentId) {
  return apiClient.post(`/api/assignments/${assignmentId}/archive`);
}

export function listSubmissions(assignmentId) {
  return apiClient.get(`/api/assignments/${assignmentId}/submissions`);
}

export function submitAssignment(assignmentId, content) {
  return apiClient.post(`/api/assignments/${assignmentId}/submissions`, { content });
}

export function gradeSubmission(submissionId, payload) {
  return apiClient.post(`/api/submissions/${submissionId}/grade`, payload);
}

export function listMySubmissions() {
  return apiClient.get('/api/me/submissions');
}
