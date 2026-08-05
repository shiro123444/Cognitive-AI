export const NEUROLAB_BRAIN_VOLUMES = [];

export const NEUROLAB_BRAIN_MESHES = [
  {
    url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3',
    name: 'BrainMesh_ICBM152.lh.mz3',
    rgba255: [151, 187, 231, 255],
    opacity: 1,
    meshShaderIndex: 1
  },
  {
    url: '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3',
    name: 'BrainMesh_ICBM152.rh.mz3',
    rgba255: [169, 211, 202, 255],
    opacity: 1,
    meshShaderIndex: 1
  }
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
    displayLabel: '前额叶',
    shortLabel: 'PFC',
    channels: [0],
    screen: { x: 29, y: 22 },
    mesh: { x: -42, y: 58, z: 28 }
  },
  {
    id: 'motor-left',
    label: 'Motor Cortex L',
    displayLabel: '左运动区',
    shortLabel: 'M1-L',
    channels: [1],
    screen: { x: 23, y: 43 },
    mesh: { x: -55, y: 5, z: 45 }
  },
  {
    id: 'motor-right',
    label: 'Motor Cortex R',
    displayLabel: '右运动区',
    shortLabel: 'M1-R',
    channels: [2],
    screen: { x: 56, y: 40 },
    mesh: { x: 55, y: 5, z: 45 }
  },
  {
    id: 'visual',
    label: 'Visual Cortex',
    displayLabel: '视觉区',
    shortLabel: 'V1',
    channels: [3],
    screen: { x: 47, y: 66 },
    mesh: { x: -40, y: -60, z: 24 }
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
