import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({ url })),
    post: vi.fn((url, payload) => Promise.resolve({ url, payload }))
  }
}));

const apiClient = (await import('./client')).default;
const { getExperimentRun, listExperiments, runExperiment } = await import('./experiments');

describe('experiments api', () => {
  it('lists experiments', async () => {
    await listExperiments();

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiments', { params: {} });
  });

  it('runs an experiment', async () => {
    await runExperiment('exp-eeg-replay', { params: { sample_rate: 64 } });

    expect(apiClient.post).toHaveBeenCalledWith('/api/experiments/exp-eeg-replay/runs', {
      params: { sample_rate: 64 }
    });
  });

  it('gets a run', async () => {
    await getExperimentRun('run-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiment-runs/run-1');
  });
});
