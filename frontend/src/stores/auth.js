import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../api/client';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth';

const ROLE_HOME_ROUTE = {
  admin: '/',
  teacher: '/teacher',
  student: '/'
};

function readStored(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy mode failures
  }
}

function loadStoredUser() {
  const raw = readStored(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(readStored(TOKEN_STORAGE_KEY) || '');
  const user = ref(loadStoredUser());

  const isAuthenticated = computed(() => Boolean(token.value && user.value));
  const role = computed(() => user.value?.role || null);

  function persist() {
    writeStored(TOKEN_STORAGE_KEY, token.value || null);
    writeStored(USER_STORAGE_KEY, user.value ? JSON.stringify(user.value) : null);
  }

  function setSession(nextToken, nextUser) {
    token.value = nextToken || '';
    user.value = nextUser || null;
    persist();
  }

  function clearSession() {
    token.value = '';
    user.value = null;
    persist();
  }

  async function login(credentials) {
    const data = await loginRequest(credentials);
    setSession(data.token, data.user);
    return data;
  }

  async function refresh() {
    if (!token.value) return null;
    try {
      const fresh = await fetchCurrentUser();
      user.value = fresh;
      persist();
      return fresh;
    } catch (err) {
      // 401 path is already handled in the axios interceptor (storage cleared,
      // edufish:auth-expired dispatched). Mirror that here for explicit calls.
      if (err?.status === 401) clearSession();
      throw err;
    }
  }

  async function logout() {
    try {
      if (token.value) await logoutRequest();
    } catch {
      // best-effort; backend logout is stateless
    } finally {
      clearSession();
    }
  }

  function homeRouteForCurrentRole() {
    return ROLE_HOME_ROUTE[role.value] || '/';
  }

  return {
    token,
    user,
    isAuthenticated,
    role,
    setSession,
    clearSession,
    login,
    refresh,
    logout,
    homeRouteForCurrentRole
  };
});
