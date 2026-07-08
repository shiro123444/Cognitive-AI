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
            images: [
              { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
              { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
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
                intensity: 0.7,
                isActive: false
              },
              {
                id: 'motor-right',
                label: 'Motor Cortex R',
                shortLabel: 'M1-R',
                screen: { x: 56, y: 40 },
                summary: 'Alpha 2.1 · Beta 1.5',
                intensity: 0.5,
                isActive: true
              }
            ],
            fallbackLabel: 'NiiVue unavailable',
            sceneRevision: 'motor-right:2.10'
          },
          pipeline: []
        }
      }
    });

    expect(wrapper.get('[data-testid="niivue-scene"]').text()).toContain('NiiVue unavailable');
    expect(wrapper.text()).toContain('M1-R');

    await wrapper.get('[data-testid="region-motor-right"]').trigger('click');
    expect(wrapper.emitted('select-region')[0][0]).toBe('motor-right');
  });
});
