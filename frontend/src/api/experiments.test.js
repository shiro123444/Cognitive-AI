import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({ url })),
    post: vi.fn((url, payload) => Promise.resolve({ url, payload }))
  }
}));

const apiClient = (await import('./client')).default;
const { exploreExperiments, getExperimentRun, listExperiments, runExperiment } = await import('./experiments');

describe('experiments api', () => {
  it('lists experiments', async () => {
    await listExperiments();

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiments', { params: {} });
  });

  it('explores experiments by query', async () => {
    await exploreExperiments('spike neuron');

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiments/explore', {
      params: { q: 'spike neuron' }
    });
  });

  it('runs an experiment with node-scoped params', async () => {
    await runExperiment('exp-eeg-replay', {
      params: {
        source: { sample_rate: 64, channels: 2, duration_seconds: 2 },
        filter: { low_hz: 1, high_hz: 32 }
      }
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/experiments/exp-eeg-replay/runs', {
      params: {
        source: { sample_rate: 64, channels: 2, duration_seconds: 2 },
        filter: { low_hz: 1, high_hz: 32 }
      }
    });
  });

  it('gets a run', async () => {
    await getExperimentRun('run-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiment-runs/run-1');
  });
});
