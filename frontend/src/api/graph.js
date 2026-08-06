import apiClient from './client';

export function getGraph(courseId, options = {}) {
  const params = {
    course_id: courseId
  };
  if (options.userId) {
    params.user_id = options.userId;
  }
  return apiClient.get('/api/graph', {
    params
  });
}

export function listCourseOverlays(courseId) {
  return apiClient.get('/api/course-overlays', {
    params: {
      course_id: courseId
    }
  });
}
