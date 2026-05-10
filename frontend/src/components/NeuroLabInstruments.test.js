// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabChart.vue', () => ({
  default: {
    props: ['option', 'height'],
    template: '<div data-testid="chart">{{ height }}</div>'
  }
}));

import NeuroLabInstruments from './NeuroLabInstruments.vue';

describe('NeuroLabInstruments', () => {
  it('switches between chart tabs and report content', async () => {
    const wrapper = mount(NeuroLabInstruments, {
      props: {
        model: {
          waveform: { option: { series: [{ data: [0.1, 0.2] }] } },
          spectrum: { option: { series: [{ data: [1.2, 3.6] }] } },
          bands: { option: { series: [{ data: [3.6] }, { data: [2.4] }] } },
          events: { rows: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }] },
          report: {
            sections: [{ title: '关键观察', body: 'Alpha remains dominant across channels.' }]
          }
        }
      }
    });

    expect(wrapper.text()).toContain('Alpha remains dominant across channels.');
    await wrapper.get('button[data-tab="events"]').trigger('click');
    expect(wrapper.text()).toContain('Stimulus');
  });
});
