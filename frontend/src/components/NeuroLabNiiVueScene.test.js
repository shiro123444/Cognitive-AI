// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const attachToCanvas = vi.fn(() => Promise.resolve());
const loadImages = vi.fn(() => Promise.resolve());
const loadConnectome = vi.fn();
const setRenderAzimuthElevation = vi.fn();
const setSliceType = vi.fn();
const cleanup = vi.fn();

vi.mock('@niivue/niivue', () => ({
  Niivue: vi.fn().mockImplementation(() => ({
    attachToCanvas,
    loadImages,
    loadConnectome,
    setRenderAzimuthElevation,
    setSliceType,
    sliceTypeRender: 'render',
    cleanup
  }))
}));

import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

describe('NeuroLabNiiVueScene', () => {
  it('boots niivue with local assets without loading a connectome', async () => {
    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          images: [
            { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
            { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
          ],
          cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
          connectome: null,
          fallbackLabel: 'NiiVue unavailable',
          sceneRevision: 'prefrontal:3.60'
        },
        cameraResetToken: 0
      }
    });

    await flushPromises();

    expect(attachToCanvas).toHaveBeenCalled();
    expect(loadImages).toHaveBeenCalledWith([
      { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
      { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
    ]);
    expect(setSliceType).toHaveBeenCalledWith('render');
    expect(loadConnectome).not.toHaveBeenCalled();
    expect(setRenderAzimuthElevation).toHaveBeenCalledWith(126, 18);
    expect(wrapper.find('[data-testid="niivue-fallback"]').exists()).toBe(false);
  });

  it('shows the fallback layer when niivue init fails', async () => {
    attachToCanvas.mockImplementationOnce(() => Promise.reject(new Error('webgl unavailable')));

    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          images: [],
          cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
          connectome: null,
          fallbackLabel: 'NiiVue unavailable',
          sceneRevision: 'fallback'
        },
        cameraResetToken: 0
      }
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="niivue-fallback"]').exists()).toBe(true);
    expect(wrapper.emitted('scene-error')[0][0]).toBe('webgl unavailable');
  });
});
