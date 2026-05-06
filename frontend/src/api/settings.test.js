import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn()
  }
}));

const { default: apiClient } = await import('./client');
const {
  getEmbeddingSettings,
  getLlmSettings,
  testEmbeddingSettings,
  testLlmSettings,
  updateEmbeddingSettings,
  updateLlmSettings
} = await import('./settings');

describe('settings API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads teacher-configurable LLM settings', async () => {
    const settings = {
      base_url: 'https://api.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
      api_key_configured: false
    };
    apiClient.get.mockResolvedValue(settings);

    await expect(getLlmSettings()).resolves.toBe(settings);

    expect(apiClient.get).toHaveBeenCalledWith('/api/settings/llm');
  });

  it('updates model endpoint and optional api key through the settings API', async () => {
    const payload = {
      base_url: 'https://api.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
      api_key: 'tp-secret'
    };
    apiClient.put.mockResolvedValue({ ...payload, api_key_configured: true });

    await updateLlmSettings(payload);

    expect(apiClient.put).toHaveBeenCalledWith('/api/settings/llm', payload);
  });

  it('can request a backend connection test without exposing the key in the URL', async () => {
    const payload = {
      base_url: 'https://api.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
      api_key: 'tp-secret'
    };
    apiClient.post.mockResolvedValue({ ok: true });

    await expect(testLlmSettings(payload)).resolves.toEqual({ ok: true });

    expect(apiClient.post).toHaveBeenCalledWith('/api/settings/llm/test', payload);
  });

  it('loads and updates teacher-configurable embedding settings', async () => {
    const settings = {
      base_url: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia/nv-embed-v1',
      api_key_configured: false,
      query_input_type: 'query',
      passage_input_type: 'passage',
      truncate: 'END'
    };
    apiClient.get.mockResolvedValue(settings);
    apiClient.put.mockResolvedValue({ ...settings, api_key_configured: true });

    await expect(getEmbeddingSettings()).resolves.toBe(settings);
    await updateEmbeddingSettings({ ...settings, api_key: 'nvapi-secret' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/settings/embedding');
    expect(apiClient.put).toHaveBeenCalledWith('/api/settings/embedding', {
      ...settings,
      api_key: 'nvapi-secret'
    });
  });

  it('tests embedding settings through the backend without exposing the key in the URL', async () => {
    const payload = {
      base_url: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia/nv-embed-v1',
      api_key: 'nvapi-secret',
      query_input_type: 'query',
      passage_input_type: 'passage'
    };
    apiClient.post.mockResolvedValue({ ok: true, dimensions: 4096 });

    await expect(testEmbeddingSettings(payload)).resolves.toEqual({ ok: true, dimensions: 4096 });

    expect(apiClient.post).toHaveBeenCalledWith('/api/settings/embedding/test', payload);
  });
});
