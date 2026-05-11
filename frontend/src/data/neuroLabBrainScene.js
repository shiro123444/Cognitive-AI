export const NEUROLAB_BRAIN_IMAGES = [
  { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' },
  { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' }
];

export const NEUROLAB_BRAIN_CAMERA = {
  azimuth: 126,
  elevation: 18,
  scale: 0.94
};

export const NEUROLAB_BRAIN_REGIONS = [
  {
    id: 'prefrontal',
    label: 'Prefrontal Cortex',
    shortLabel: 'PFC',
    channels: [0],
    screen: { x: 29, y: 22 },
    mesh: { x: -14, y: 56, z: 24 }
  },
  {
    id: 'motor-left',
    label: 'Motor Cortex L',
    shortLabel: 'M1-L',
    channels: [1],
    screen: { x: 23, y: 43 },
    mesh: { x: -34, y: 18, z: 34 }
  },
  {
    id: 'motor-right',
    label: 'Motor Cortex R',
    shortLabel: 'M1-R',
    channels: [2],
    screen: { x: 56, y: 40 },
    mesh: { x: 18, y: 20, z: 30 }
  },
  {
    id: 'visual',
    label: 'Visual Cortex',
    shortLabel: 'V1',
    channels: [3],
    screen: { x: 47, y: 66 },
    mesh: { x: -8, y: -26, z: 12 }
  }
];

export const NEUROLAB_CONNECTOME_SCAFFOLD = [
  { id: 'pfc-m1l', source: 'prefrontal', target: 'motor-left', weight: 0.92 },
  { id: 'pfc-m1r', source: 'prefrontal', target: 'motor-right', weight: 0.9 },
  { id: 'm1l-v1', source: 'motor-left', target: 'visual', weight: 0.68 },
  { id: 'm1r-v1', source: 'motor-right', target: 'visual', weight: 0.72 }
];

export const NEUROLAB_MATERIAL_PANELS = [
  {
    id: 'atlas-frontal',
    label: 'Frontal Atlas Fragment',
    image: '/brain-hero.png',
    caption: 'Standard-surface fragment used as a teaching annotation layer.',
    regionIds: ['prefrontal', 'motor-left']
  },
  {
    id: 'network-field',
    label: 'Network Field Sheet',
    image: '/neural-network.jpg',
    caption: 'Connectivity-oriented visual panel for posterior and lateral emphasis.',
    regionIds: ['motor-right', 'visual']
  }
];
