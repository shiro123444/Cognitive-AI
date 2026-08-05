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
        },
        {
          id: 'exp-neuron-spike',
          title: 'Neuron Spike Lab',
          experiment_type: 'neuron_simulation',
          summary: 'LIF neuron simulation.',
          status: 'published',
          default_params: {
            pipeline: {
              nodes: [
                { id: 'stimulus' },
                { id: 'integrate' },
                { id: 'detect-spikes' },
                { id: 'firing-rate' },
                { id: 'ai-report' }
              ],
              edges: [
                ['stimulus', 'integrate'],
                ['integrate', 'detect-spikes'],
                ['detect-spikes', 'firing-rate'],
                ['firing-rate', 'ai-report']
              ]
            },
            node_params: {
              stimulus: { stimulus_current: 8, duration_ms: 120 }
            }
          }
        }
      ]
    }
  })),
  exploreExperiments: vi.fn((query) => Promise.resolve({
    data: {
      data: query.includes('神经元')
        ? [
          {
            id: 'exp-neuron-spike',
            title: 'Neuron Spike Lab',
            summary: 'LIF neuron simulation.',
            score: 5,
            matched_concepts: ['Neural Networks']
          }
        ]
        : []
    }
  })),
  runExperiment: vi.fn((experimentId) => {
    const neuron = experimentId === 'exp-neuron-spike';
    return Promise.resolve({
      data: {
        data: {
          status: 'completed',
          artifacts: [
            {
              data: neuron
                ? {
                  duration_ms: 120,
                  membrane_potential: { t_ms: [0, 0.1, 0.2], v_mv: [-70, -69.7, -69.4] },
                  spike_times: [3.6, 9.1],
                  total_spikes: 2,
                  firing_rate: 16.7,
                  threshold_mv: -55,
                  events: [{ label: 'Stimulus On', start_ms: 0, end_ms: 120 }],
                  pipeline_trace: [
                    { node_id: 'stimulus', status: 'completed' },
                    { node_id: 'integrate', status: 'completed' },
                    { node_id: 'detect-spikes', status: 'completed' },
                    { node_id: 'firing-rate', status: 'completed' },
                    { node_id: 'ai-report', status: 'completed' }
                  ]
                }
                : {
                  signal_preview: [[0.1, 0.2], [0.05, 0.1], [0.04, 0.08], [0.02, 0.05]],
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
              observations: neuron ? ['Detected 2 spikes.'] : ['Alpha remains dominant.'],
              limitations: neuron ? 'Simplified LIF model.' : 'Synthetic data only.',
              next_steps: neuron ? 'Lower the stimulus.' : 'Adjust sample rate.'
            }
          }
        }
      }
    });
  })
}));

vi.mock('../components/NeuroLabChart.vue', () => ({
  default: { props: ['option', 'height'], template: '<div data-testid="chart">{{ height }}</div>' }
}));

vi.mock('../components/NeuroLabNiiVueScene.vue', () => ({
  default: {
    props: ['model', 'cameraResetToken'],
    template: '<div data-testid="niivue-scene">{{ model?.fallbackLabel }}</div>'
  }
}));

import LabView from './LabView.vue';
import { exploreExperiments, listExperiments, runExperiment } from '../api/experiments';

describe('LabView', () => {
  it('loads the neurolab pipeline shell and sends node-scoped params on run', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    expect(listExperiments).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Synthetic EEG Source');
    expect(wrapper.text()).toContain('EEG Replay Lab');
    expect(wrapper.get('[data-testid="niivue-scene"]').text()).toContain('三维脑表面暂不可用');

    await wrapper.get('button.neurolab__btn-run').trigger('click');
    await flushPromises();

    expect(runExperiment).toHaveBeenCalledWith('exp-eeg-replay', {
      params: {
        source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
        filter: { low_hz: 1, high_hz: 40 }
      }
    });
  });

  it('switches to the neuron lab and runs with stimulus-scoped params', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    const select = wrapper.get('select.neurolab__template-select');
    await select.setValue('exp-neuron-spike');

    expect(wrapper.text()).toContain('Neuron Spike Lab');
    expect(wrapper.text()).toContain('Stimulus Source');

    await wrapper.get('button.neurolab__btn-run').trigger('click');
    await flushPromises();

    expect(runExperiment).toHaveBeenCalledWith('exp-neuron-spike', {
      params: {
        stimulus: { stimulus_current: 8, duration_ms: 120 }
      }
    });
    expect(wrapper.text()).toContain('NEURON METRICS');
    expect(wrapper.text()).toContain('2 spikes');
  });

  it('explores by query and runs the matched template directly', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    const input = wrapper.get('[data-testid="explore-input"]');
    await input.setValue('神经元');
    await input.trigger('focus');
    await flushPromises();

    expect(exploreExperiments).toHaveBeenCalledWith('神经元');
    const results = wrapper.findAll('[data-testid="explore-result"]');
    expect(results).toHaveLength(1);
    expect(wrapper.text()).toContain('Neural Networks');

    await results[0].trigger('mousedown');
    await results[0].trigger('click');
    await flushPromises();

    expect(runExperiment).toHaveBeenCalledWith('exp-neuron-spike', {
      params: {
        stimulus: { stimulus_current: 8, duration_ms: 120 }
      }
    });
  });
});
