import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../api/client';
import router from './index';
import { useAuthStore } from '../stores/auth';

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await router.replace('/login');
  await router.isReady();
});

afterEach(() => {
  localStorage.clear();
});

describe('router guards', () => {
  it('redirects unauthenticated visitors away from protected routes to /login', async () => {
    await router.push('/teacher');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/teacher');
  });

  it('lets authenticated teachers reach the teacher studio', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 'u', name: 'T', role: 'teacher', username: 'teacher1' }));
    setActivePinia(createPinia());
    useAuthStore();

    await router.push('/teacher');

    expect(router.currentRoute.value.name).toBe('teacher');
  });

  it('redirects students away from teacher-only routes to their home', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 'u', name: 'S', role: 'student', username: 'student1' }));
    setActivePinia(createPinia());
    useAuthStore();

    await router.push('/teacher');

    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('admins are allowed onto teacher-only routes', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 'u', name: 'A', role: 'admin', username: 'admin' }));
    setActivePinia(createPinia());
    useAuthStore();

    await router.push('/teacher/edufish');

    expect(router.currentRoute.value.name).toBe('teacher-edufish');
  });

  it('redirects already-logged-in users away from /login', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 'u', name: 'T', role: 'teacher', username: 'teacher1' }));
    setActivePinia(createPinia());
    useAuthStore();

    // Land on a non-login page first so the subsequent /login navigation isn't
    // treated as a same-route no-op.
    await router.push('/teacher');
    expect(router.currentRoute.value.name).toBe('teacher');

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('teacher');
  });
});
