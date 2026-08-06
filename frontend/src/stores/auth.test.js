import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

function installLocalStorageShim() {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear()
  };
}

beforeAll(() => {
  installLocalStorageShim();
});

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  fetchCurrentUser: vi.fn(),
  logout: vi.fn()
}));

import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../api/client';
import { useAuthStore } from './auth';

const TEACHER = { id: 'user-t', name: '示范教师', role: 'teacher', username: 'teacher1', email: '' };
const ADMIN = { id: 'user-a', name: 'Admin', role: 'admin', username: 'admin', email: '' };
const STUDENT = { id: 'user-s', name: '示范学生', role: 'student', username: 'student1', email: '' };

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('useAuthStore', () => {
  it('starts unauthenticated when no session is stored', () => {
    const auth = useAuthStore();

    expect(auth.isAuthenticated).toBe(false);
    expect(auth.token).toBe('');
    expect(auth.user).toBe(null);
  });

  it('hydrates token and user from localStorage on creation', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'cached-token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(TEACHER));

    const auth = useAuthStore();

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.token).toBe('cached-token');
    expect(auth.user.role).toBe('teacher');
  });

  it('persists token and user after login', async () => {
    loginRequest.mockResolvedValueOnce({ token: 'fresh-token', user: STUDENT });
    const auth = useAuthStore();

    await auth.login({ username: 'student1', password: 'student123' });

    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('fresh-token');
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toMatchObject({ role: 'student' });
  });

  it('clears stored credentials on logout', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(STUDENT));
    logoutRequest.mockResolvedValueOnce({ logged_out: true });
    const auth = useAuthStore();

    await auth.logout();

    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(null);
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBe(null);
  });

  it('clears the session when refresh hits a 401', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'stale');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(STUDENT));
    const expired = Object.assign(new Error('expired'), { status: 401 });
    fetchCurrentUser.mockRejectedValueOnce(expired);
    const auth = useAuthStore();

    await expect(auth.refresh()).rejects.toThrow('expired');
    expect(auth.isAuthenticated).toBe(false);
  });

  it('routes admins and teachers to their respective home pages', () => {
    const auth = useAuthStore();
    auth.setSession('t', ADMIN);
    expect(auth.homeRouteForCurrentRole()).toBe('/');

    auth.setSession('t', TEACHER);
    expect(auth.homeRouteForCurrentRole()).toBe('/teacher');

    auth.setSession('t', STUDENT);
    expect(auth.homeRouteForCurrentRole()).toBe('/');
  });
});
