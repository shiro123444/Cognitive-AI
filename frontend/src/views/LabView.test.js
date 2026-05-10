// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/experiments', () => ({
  listExperiments: vi.fn(() => Promise.resolve({
    data: {
      data: [
        {
          id: 'exp-eeg-replay',
          title: 'EEG Replay Lab',
          experiment_type: 'eeg_replay',
          summary: 'Synthetic EEG pipeline.',
          status: 'published',
          default_params: {
            pipeline: {
              nodes: [
                { id: 'source' },
                { id: 'filter' },
                { id: 'psd' },
                { id: 'band-power' },
                { id: 'ai-report' }
              ],
              edges: [
                ['source', 'filter'],
                ['filter', 'psd'],
                ['psd', 'band-power'],
                ['band-power', 'ai-report']
              ]
            },
            node_params: {
              source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
              filter: { low_hz: 1, high_hz: 40 }
            }
          }
        }
      ]
    }
  })),
  runExperiment: vi.fn(() => Promise.resolve({
    data: {
      data: {
        status: 'completed',
        artifacts: [
          {
            data: {
              signal_preview: [[0.1, 0.2]],
              psd: [{ channel: 'CH1', frequencies: [4, 8], values: [1.2, 3.6] }],
              channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
              events: [{ label: 'Stimulus', start_ms: 500, end_ms: 1500 }],
              pipeline_trace: [
                { node_id: 'source', status: 'completed' },
                { node_id: 'filter', status: 'completed' },
                { node_id: 'psd', status: 'completed' },
                { node_id: 'band-power', status: 'completed' },
                { node_id: 'ai-report', status: 'completed' }
              ]
            }
          }
        ],
        report: {
          content: {
            node_explanations: [],
            observations: ['Alpha remains dominant.'],
            limitations: 'Synthetic data only.',
            next_steps: 'Adjust sample rate.'
          }
        }
      }
    }
  }))
}));

vi.mock('../components/NeuroLabCanvas.vue', () => ({
  default: { props: ['workspace'], template: '<div data-testid="canvas"></div>' }
}));

vi.mock('../components/NeuroLabInspector.vue', () => ({
  default: { props: ['node', 'params', 'explanation'], template: '<div data-testid="inspector"></div>' }
}));

vi.mock('../components/NeuroLabInstruments.vue', () => ({
  default: { props: ['model'], template: '<div data-testid="instruments"></div>' }
}));

import LabView from './LabView.vue';
import { listExperiments, runExperiment } from '../api/experiments';

describe('LabView', () => {
  it('loads the pipeline template and sends node-scoped params on run', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    expect(listExperiments).toHaveBeenCalled();
    expect(wrapper.text()).toContain('EEG Replay Lab');

    await wrapper.get('button.lab-run-action').trigger('click');

    expect(runExperiment).toHaveBeenCalledWith('exp-eeg-replay', {
      params: {
        source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
        filter: { low_hz: 1, high_hz: 40 }
      }
    });
  });
});
