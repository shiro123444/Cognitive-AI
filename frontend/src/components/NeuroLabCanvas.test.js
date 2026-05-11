// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders channels, regions, and pipeline anchors and emits focus events', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        model: {
          channels: [
            { id: 'ch-1', label: 'CH1', points: '0,50 100,20', alpha: 3.6, beta: 2.4, isActive: true },
            { id: 'ch-2', label: 'CH2', points: '0,40 100,55', alpha: 2.8, beta: 1.8, isActive: false }
          ],
          regions: [
            { id: 'prefrontal', label: 'Prefrontal', x: 34, y: 28, intensity: 0.7, isActive: false },
            { id: 'motor-right', label: 'Motor Right', x: 58, y: 44, intensity: 0.5, isActive: true }
          ],
          pipeline: [
            {
              id: 'source',
              label: 'Synthetic EEG Source',
              x: 10,
              y: 14,
              status: 'completed',
              statusLabel: 'Completed',
              isSelected: false
            },
            {
              id: 'filter',
              label: 'Bandpass Filter',
              x: 23,
              y: 12,
              status: 'running',
              statusLabel: 'Running',
              isSelected: true
            }
          ],
          events: [{ label: 'Stimulus', left: '25.00%', width: '12.50%' }],
          gridColumns: 12,
          gridRows: 8
        }
      }
    });

    expect(wrapper.text()).toContain('CH1');
    expect(wrapper.text()).toContain('Motor Right');
    expect(wrapper.text()).toContain('Bandpass Filter');

    await wrapper.get('[data-testid="pipeline-filter"]').trigger('click');
    expect(wrapper.emitted('select-node')[0][0]).toBe('filter');

    await wrapper.get('[data-testid="channel-ch-2"]').trigger('click');
    expect(wrapper.emitted('select-channel')[0][0]).toBe('ch-2');

    await wrapper.get('[data-testid="region-motor-right"]').trigger('click');
    expect(wrapper.emitted('select-region')[0][0]).toBe('motor-right');
  });
});
