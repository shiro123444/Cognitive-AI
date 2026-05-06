import apiClient from './client';

function appendScope(formData, options = {}) {
  if (options.scopeType) {
    formData.append('scope_type', options.scopeType);
  }
  if (options.ownerId) {
    formData.append('owner_id', options.ownerId);
  }
}

export function uploadMaterial(courseId, file, options = {}) {
  const formData = new FormData();
  formData.append('course_id', courseId);
  formData.append('file', file);
  appendScope(formData, options);

  return apiClient.post('/api/materials/upload', formData);
}

/**
 * Async upload — returns immediately with {material, job_id}.
 * Poll getJob() to track processing progress.
 */
export function uploadMaterialAsync(courseId, file, options = {}) {
  const formData = new FormData();
  formData.append('course_id', courseId);
  formData.append('file', file);
  appendScope(formData, options);

  return apiClient.post('/api/materials/upload?async=1', formData);
}

/**
 * Fetch job status by ID.
 * Returns {id, job_type, status, progress, progress_message, ...}
 */
export function getJob(jobId) {
  return apiClient.get(`/api/jobs/${jobId}`);
}

export function listMaterials(courseId) {
  const params = courseId ? { course_id: courseId } : {};
  return apiClient.get('/api/materials', { params });
}
