import axios from 'axios';

const TOKEN_STORAGE_KEY = 'edufish.auth.token';
const USER_STORAGE_KEY = 'edufish.auth.user';

function readStoredToken() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function extractMessage(envelopeError) {
  if (!envelopeError) return 'Request failed';
  if (typeof envelopeError === 'string') return envelopeError;
  if (typeof envelopeError === 'object' && typeof envelopeError.message === 'string') {
    return envelopeError.message;
  }
  return 'Request failed';
}

export function unwrapEnvelope(response) {
  const payload = response?.data;

  if (payload && typeof payload === 'object' && typeof payload.success === 'boolean') {
    if (payload.success) {
      return payload.data;
    }

    throw new Error(extractMessage(payload.error) || payload.message || 'Request failed');
  }

  return payload;
}

export function unwrapEnvelopeError(error) {
  const payload = error?.response?.data;

  if (payload && typeof payload === 'object' && typeof payload.success === 'boolean') {
    const err = new Error(extractMessage(payload.error) || payload.message || 'Request failed');
    err.status = error?.response?.status;
    err.code = typeof payload.error === 'object' ? payload.error?.code : undefined;
    throw err;
  }

  throw error;
}

const apiClient = axios.create({
  baseURL: '',
  timeout: 20000
});

apiClient.interceptors.request.use((config) => {
  const token = readStoredToken();
  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(unwrapEnvelope, (error) => {
  const status = error?.response?.status;
  if (status === 401 && typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable in some environments
    }
    window.dispatchEvent(new CustomEvent('edufish:auth-expired'));
  }
  return unwrapEnvelopeError(error);
});

export { TOKEN_STORAGE_KEY, USER_STORAGE_KEY };
export default apiClient;
