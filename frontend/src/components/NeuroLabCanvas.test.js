// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabNiiVueScene.vue', () => ({
  default: {
    props: ['model', 'cameraResetToken'],
    emits: ['scene-error'],
    template: '<div data-testid="niivue-scene">{{ model.fallbackLabel }}</div>'
  }
}));

import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders the niivue shell and brain regions', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        model: {
          brain: {
            volumes: [],
            meshes: [
              { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' },
              { url: '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3', name: 'BrainMesh_ICBM152.rh.mz3' }
            ],
            cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
            connectome: {
              nodes: {
                names: ['Prefrontal Cortex'],
                prefilled: ['Alpha 3.6'],
                X: [0],
                Y: [0],
                Z: [0],
                Color: [3.6],
                Size: [1.8]
              },
              edges: [0]
            },
            regions: [
              {
                id: 'prefrontal',
                label: 'Prefrontal Cortex',
                shortLabel: 'PFC',
                screen: { x: 29, y: 22 },
                summary: 'Alpha 3.6 · Beta 2.4',
                alpha: 3.6,
                beta: 2.4,
                hasData: true,
                intensity: 0.7,
                isActive: false
              },
              {
                id: 'motor-right',
                label: 'Motor Cortex R',
                shortLabel: 'M1-R',
                screen: { x: 56, y: 40 },
                summary: 'Alpha 2.1 · Beta 1.5',
                alpha: 2.1,
                beta: 1.5,
                hasData: true,
                intensity: 0.5,
                isActive: true
              }
            ],
            fallbackLabel: 'NiiVue unavailable',
            sceneRevision: 'motor-right:2.10'
          },
          channels: [
            { id: 'ch-1', label: 'CH1', points: '0,50 100,45', alpha: 3.6, beta: 2.4, hasData: true, isActive: true }
          ],
          events: [],
          pipeline: [],
          hasData: true
        }
      }
    });

    expect(wrapper.get('[data-testid="niivue-scene"]').text()).toContain('NiiVue unavailable');
    expect(wrapper.text()).toContain('M1-R');
    expect(wrapper.text()).toContain('多通道回放');
    expect(wrapper.get('[data-testid="selected-region-readout"]').text()).toContain('2.1');

    await wrapper.get('[data-testid="region-motor-right"]').trigger('click');
    expect(wrapper.emitted('select-region')[0][0]).toBe('motor-right');
  });
});
