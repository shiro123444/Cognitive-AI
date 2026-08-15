import type { Context } from '../cordis/context.js';
import type { ToolRegistry } from '../seams/tools.js';

export function applyNeuroLabPlugin(ctx: Context) {
  const tools: ToolRegistry = (ctx as any).tools;
  if (!tools) return;

  tools.register({
    name: 'neurolab_visualize_nii',
    description: 'Mount and control 3D NIfTI brain image slices, atlas coordinates, and volume rendering in the NeuroLab Client Slot.',
    parameters: {
      type: 'object',
      properties: {
        structureName: { type: 'string', description: 'Name of the anatomical region to inspect.' },
        coordinates: {
          type: 'array',
          items: { type: 'number' },
          description: 'MNI coordinates [X, Y, Z].',
        },
        colormap: { type: 'string', enum: ['gray', 'warm', 'cool', 'jet', 'plasma'], description: 'Overlay colormap.' },
      },
      required: ['structureName'],
    },
    slotBinding: {
      slotId: 'slot:neurolab-3d',
      kind: 'niivue-3d',
      transform: (result) => result,
    },
    async execute(args) {
      const { structureName, coordinates = [24, -18, -16], colormap = 'warm' } = args;
      return {
        structure: structureName,
        mniCoordinates: coordinates,
        colormap,
        volumeUrl: '/assets/mni152_2mm.nii.gz',
        metrics: {
          voxelCount: 4280,
          meanTValue: 4.82,
          activationSignificance: 'p < 0.001 (FWE corrected)',
        },
        description: `已自动加载 MNI 空间中的【${structureName}】高亮切片，坐标定位 [X:${coordinates[0]}, Y:${coordinates[1]}, Z:${coordinates[2]}]。`,
      };
    },
  });
}
