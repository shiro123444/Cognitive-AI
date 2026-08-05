// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const attachToCanvas = vi.fn(() => Promise.resolve());
const loadVolumes = vi.fn(() => Promise.resolve());
const loadMeshes = vi.fn(() => Promise.resolve());
const connectomeMesh = { id: 'connectome' };
const loadConnectomeAsMesh = vi.fn(() => connectomeMesh);
const addMesh = vi.fn();
const removeMesh = vi.fn();
const drawScene = vi.fn();
const setMeshProperty = vi.fn();
const setMeshShader = vi.fn();
const surfaceMeshes = [{ id: 'lh' }, { id: 'rh' }];
const setRenderAzimuthElevation = vi.fn();
const setScale = vi.fn();
const setSliceType = vi.fn();
const cleanup = vi.fn();

vi.mock('@niivue/niivue', () => ({
  Niivue: vi.fn().mockImplementation(() => ({
    attachToCanvas,
    loadVolumes,
    loadMeshes,
    loadConnectomeAsMesh,
    addMesh,
    removeMesh,
    drawScene,
    setMeshProperty,
    setMeshShader,
    meshes: surfaceMeshes,
    setRenderAzimuthElevation,
    setScale,
    setSliceType,
    sliceTypeRender: 'render',
    cleanup
  }))
}));

import NeuroLabNiiVueScene from './NeuroLabNiiVueScene.vue';

describe('NeuroLabNiiVueScene', () => {
  it('boots niivue and loads the band-power connectome overlay', async () => {
    const connectome = {
      nodes: {
        names: ['PFC', 'M1-L', 'M1-R', 'V1'],
        X: [-14, -34, 18, -8],
        Y: [56, 18, 20, -26],
        Z: [24, 34, 30, 12],
        Color: [3.6, 2.8, 2.1, 1.8],
        Size: [2, 2, 2, 2]
      },
      edges: new Array(16).fill(0),
      nodeColormap: 'warm'
    };
    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          volumes: [],
          meshes: [
            { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' },
            { url: '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3', name: 'BrainMesh_ICBM152.rh.mz3' }
          ],
          cameraPreset: { azimuth: 126, elevation: 18, scale: 0.94 },
          connectome,
          fallbackLabel: 'NiiVue unavailable',
          sceneRevision: 'prefrontal:3.60'
        },
        cameraResetToken: 0
      }
    });

    await flushPromises();

    expect(attachToCanvas).toHaveBeenCalled();
    expect(loadVolumes).not.toHaveBeenCalled();
    expect(loadMeshes).toHaveBeenCalledWith([
      { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' },
      { url: '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3', name: 'BrainMesh_ICBM152.rh.mz3' }
    ]);
    expect(setSliceType).toHaveBeenCalledWith('render');
    expect(loadConnectomeAsMesh).toHaveBeenCalledWith(connectome);
    expect(addMesh).toHaveBeenCalledWith(connectomeMesh);
    expect(setRenderAzimuthElevation).toHaveBeenCalledWith(126, 18);
    expect(setScale).toHaveBeenCalledWith(0.94);
    expect(wrapper.find('[data-testid="niivue-fallback"]').exists()).toBe(false);
  });

  it('refreshes the connectome when band-power changes without re-mounting', async () => {
    const connectomeA = { nodes: { names: ['PFC'], X: [1], Y: [1], Z: [1], Color: [3.6], Size: [2] }, edges: [0], nodeColormap: 'warm' };
    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: { volumes: [{ url: '/a.nii' }], meshes: [], cameraPreset: { azimuth: 1, elevation: 1 }, connectome: connectomeA, sceneRevision: 'a' },
        cameraResetToken: 0
      }
    });
    await flushPromises();
    loadConnectomeAsMesh.mockClear();
    addMesh.mockClear();
    removeMesh.mockClear();
    loadVolumes.mockClear();
    loadMeshes.mockClear();
    setRenderAzimuthElevation.mockClear();

    // Same images, new band-power data (scrubber moved) → connectome refresh, no reload.
    await wrapper.setProps({ model: { ...wrapper.vm.model, sceneRevision: 'b', connectome: { ...connectomeA, nodes: { ...connectomeA.nodes, Color: [5.0] } } } });
    await flushPromises();

    expect(loadVolumes).not.toHaveBeenCalled();
    expect(loadMeshes).not.toHaveBeenCalled();
    expect(removeMesh).toHaveBeenCalledWith(connectomeMesh);
    expect(loadConnectomeAsMesh).toHaveBeenCalled();
    expect(addMesh).toHaveBeenCalledWith(connectomeMesh);
    expect(setRenderAzimuthElevation).not.toHaveBeenCalled();
  });

  it('shows the fallback layer when niivue init fails', async () => {
    attachToCanvas.mockImplementationOnce(() => Promise.reject(new Error('webgl unavailable')));

    const wrapper = mount(NeuroLabNiiVueScene, {
      props: {
        model: {
          volumes: [],
          meshes: [],
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
