export function materialUploadScopeFromRoute(query = {}) {
  const mode = query.mode === 'student' ? 'student' : 'teacher';
  if (mode === 'student') {
    return {
      mode,
      scopeType: 'student_personal',
      ownerId: typeof query.owner === 'string' && query.owner ? query.owner : 'student-demo'
    };
  }
  return {
    mode,
    scopeType: 'course_global',
    ownerId: ''
  };
}
