// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    props: ['nodes', 'edges', 'nodeTypes'],
    emits: ['nodeClick'],
    template: `
      <div data-testid="vue-flow">
        <button data-testid="node-filter" @click="$emit('nodeClick', { node: nodes[1] })">
          {{ nodes[1].data.label }}
        </button>
        <slot />
      </div>
    `
  },
  Handle: { template: '<span class="handle"></span>' },
  Position: { Left: 'left', Right: 'right' }
}));

vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { template: '<div data-testid="mini-map"></div>' }
}));

import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders the fixed pipeline and emits node selection', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        workspace: {
          nodes: [
            { id: 'source', label: 'Synthetic EEG Source', type: 'data_source', status: 'ready' },
            { id: 'filter', label: 'Bandpass Filter', type: 'signal_processing', status: 'ready' }
          ],
          edges: [{ id: 'source-filter', source: 'source', target: 'filter' }]
        }
      }
    });

    expect(wrapper.text()).toContain('Bandpass Filter');
    await wrapper.get('[data-testid="node-filter"]').trigger('click');
    expect(wrapper.emitted('select-node')[0][0]).toBe('filter');
  });
});
