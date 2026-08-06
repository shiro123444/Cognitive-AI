import apiClient from './client';

const API_BASE = '/api/auth';

/**
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<{ token: string, user: { id: string, name: string, role: string, username: string, email: string } }>}
 */
export function login(credentials) {
  return apiClient.post(`${API_BASE}/login`, credentials);
}

export function fetchCurrentUser() {
  return apiClient.get(`${API_BASE}/me`);
}

export function logout() {
  return apiClient.post(`${API_BASE}/logout`);
}
