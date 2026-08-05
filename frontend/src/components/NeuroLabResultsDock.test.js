// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabChart.vue', () => ({
  default: {
    props: ['option', 'height'],
    template: '<div data-testid="chart">{{ height }}</div>'
  }
}));

vi.mock('./ScalpTopo.vue', () => ({
  default: {
    props: ['regions', 'band'],
    template: '<div data-testid="topography">{{ band }}</div>'
  }
}));

import NeuroLabResultsDock from './NeuroLabResultsDock.vue';

const instruments = {
  spectrum: { option: {} },
  bands: { option: {} },
  spectrogram: { option: {} },
  report: {
    sections: [
      { title: '关键观察', body: 'Alpha remains dominant.' },
      { title: '限制说明', body: 'Synthetic data only.' }
    ]
  }
};

const regions = [
  {
    id: 'prefrontal',
    shortLabel: 'PFC',
    displayLabel: '前额叶',
    hasData: true,
    alpha: 34.1,
    beta: 3.8
  },
  {
    id: 'visual',
    shortLabel: 'V1',
    displayLabel: '视觉区',
    hasData: false,
    alpha: 0,
    beta: 0
  }
];

function mountDock(props = {}) {
  return mount(NeuroLabResultsDock, {
    props: {
      instruments,
      regions,
      activeTab: 'overview',
      expanded: true,
      selectedRegionId: 'prefrontal',
      ...props
    }
  });
}

describe('NeuroLabResultsDock', () => {
  it('switches analysis views and collapses into an informative summary row', async () => {
    const wrapper = mountDock();

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(4);
    await wrapper.get('[data-testid="results-tab-spectrum"]').trigger('click');
    expect(wrapper.emitted('update:active-tab')?.[0]).toEqual(['spectrum']);

    await wrapper.get('[data-testid="results-toggle"]').trigger('click');
    expect(wrapper.emitted('update:expanded')?.[0]).toEqual([false]);

    await wrapper.setProps({ expanded: false });
    expect(wrapper.text()).toContain('概览 · 1 个脑区已映射');
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
  });

  it('keeps spatial results linked to the selected brain region', async () => {
    const wrapper = mountDock({ activeTab: 'spatial' });

    expect(wrapper.text()).toContain('前额叶');
    const regionButtons = wrapper.findAll('.result-dock__region-list button');
    await regionButtons[1].trigger('click');

    expect(wrapper.emitted('select-region')?.[0]).toEqual(['visual']);
  });

  it('renders neuron metrics and narrows the tabs for a neuron run', () => {
    const neuronInstruments = {
      neuron: {
        potential: { option: { series: [] } },
        raster: { option: { series: [] } },
        metrics: {
          totalSpikes: 2,
          firingRate: 16.7,
          meanPotential: -62.1,
          thresholdMv: -55
        }
      },
      report: { sections: [] }
    };
    const wrapper = mountDock({ instruments: neuronInstruments });

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('NEURON METRICS');
    expect(wrapper.text()).toContain('2 spikes');
    expect(wrapper.text()).toContain('16.7 Hz');
    expect(wrapper.findAll('[data-testid="chart"]')).toHaveLength(2);
  });
});
