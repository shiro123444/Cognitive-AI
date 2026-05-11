// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabChart.vue', () => ({
  default: {
    props: ['option', 'height'],
    template: '<div data-testid="chart">{{ height }}</div>'
  }
}));

vi.mock('./NeuroLabFloatingWindow.vue', () => ({
  default: {
    props: ['title', 'subtitle', 'dock', 'expanded'],
    emits: ['update:dock', 'update:expanded'],
    template: '<section><header>{{ title }} {{ subtitle }}</header><slot /></section>'
  }
}));

import NeuroLabInstruments from './NeuroLabInstruments.vue';

describe('NeuroLabInstruments', () => {
  it('renders metrics, events, and assistant sections without tab switching', () => {
    const wrapper = mount(NeuroLabInstruments, {
      props: {
        model: {
          waveform: { option: { series: [{ data: [0.1, 0.2] }] } },
          spectrum: { option: { series: [{ data: [1.2, 3.6] }] } },
          bands: { option: { series: [{ data: [3.6] }, { data: [2.4] }] } },
          events: { rows: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }] },
          metrics: [
            { id: 'sample-rate', label: '采样率', value: '128 Hz' },
            { id: 'channels', label: '通道数', value: '4' }
          ],
          assistantSections: [
            { id: 'observation', title: '当前观察', body: 'Alpha remains dominant across channels.' }
          ]
        },
        windows: {
          metrics: { dock: 'bottom-left', expanded: false },
          assistant: { dock: 'bottom-right', expanded: true }
        }
      }
    });

    expect(wrapper.text()).toContain('采样率');
    expect(wrapper.text()).toContain('Stimulus');
    expect(wrapper.text()).toContain('当前观察');
    expect(wrapper.findAll('[data-testid="chart"]')).toHaveLength(3);
  });
});
