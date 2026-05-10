const PIPELINE_NODES = [
  {
    id: 'source',
    type: 'data_source',
    label: 'Synthetic EEG Source',
    editable: true,
    fields: [
      { key: 'duration_seconds', label: '时长', kind: 'number', min: 1, max: 30, step: 1 },
      { key: 'sample_rate', label: '采样率', kind: 'select', options: [64, 128, 256] },
      { key: 'channels', label: '通道数', kind: 'number', min: 1, max: 8, step: 1 }
    ]
  },
  {
    id: 'filter',
    type: 'signal_processing',
    label: 'Bandpass Filter',
    editable: true,
    fields: [
      { key: 'low_hz', label: '低截止', kind: 'number', min: 0, max: 20, step: 0.5 },
      { key: 'high_hz', label: '高截止', kind: 'number', min: 8, max: 64, step: 0.5 }
    ]
  },
  { id: 'psd', type: 'analysis', label: 'PSD Spectrum', editable: false, fields: [] },
  { id: 'band-power', type: 'feature', label: 'Band Power', editable: false, fields: [] },
  { id: 'ai-report', type: 'report', label: 'AI Experiment Report', editable: false, fields: [] }
];

const PIPELINE_EDGES = [
  ['source', 'filter'],
  ['filter', 'psd'],
  ['psd', 'band-power'],
  ['band-power', 'ai-report']
];

const DEFAULT_NODE_PARAMS = {
  source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
  filter: { low_hz: 1, high_hz: 40 }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function templatePipeline(defaultParams = {}) {
  return defaultParams.pipeline || {
    nodes: PIPELINE_NODES.map(({ id }) => ({ id })),
    edges: PIPELINE_EDGES
  };
}

function templateNodeParams(defaultParams = {}) {
  if (defaultParams.node_params) {
    return {
      source: { ...DEFAULT_NODE_PARAMS.source, ...(defaultParams.node_params.source || {}) },
      filter: { ...DEFAULT_NODE_PARAMS.filter, ...(defaultParams.node_params.filter || {}) }
    };
  }

  return {
    source: {
      duration_seconds: defaultParams.duration_seconds || DEFAULT_NODE_PARAMS.source.duration_seconds,
      sample_rate: defaultParams.sample_rate || DEFAULT_NODE_PARAMS.source.sample_rate,
      channels: defaultParams.channels || DEFAULT_NODE_PARAMS.source.channels
    },
    filter: { ...DEFAULT_NODE_PARAMS.filter }
  };
}

export function buildWorkspaceFromTemplate(template) {
  const defaultParams = template?.default_params || {};
  const pipeline = templatePipeline(defaultParams);
  const nodeParams = templateNodeParams(defaultParams);

  return {
    templateId: template?.id || '',
    title: template?.title || '',
    selectedNodeId: pipeline.nodes[0]?.id || 'source',
    nodes: pipeline.nodes.map((node) => {
      const meta = PIPELINE_NODES.find((item) => item.id === node.id) || {};
      return {
        ...meta,
        ...node,
        status: 'ready'
      };
    }),
    edges: pipeline.edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
    nodeParams
  };
}

export function patchNodeParams(workspace, nodeId, patch) {
  return {
    ...workspace,
    nodeParams: {
      ...workspace.nodeParams,
      [nodeId]: {
        ...(workspace.nodeParams[nodeId] || {}),
        ...patch
      }
    }
  };
}

export function applyRunToWorkspace(workspace, run) {
  const trace = run?.artifacts?.[0]?.data?.pipeline_trace || [];
  const traceById = Object.fromEntries(trace.map((item) => [item.node_id, item.status]));

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => ({
      ...node,
      status: traceById[node.id] || (run ? 'completed' : 'ready')
    }))
  };
}

function buildSeries(name, data) {
  return {
    name,
    type: 'line',
    smooth: true,
    showSymbol: false,
    data
  };
}

export function buildInstrumentModel(run) {
  const artifact = run?.artifacts?.[0]?.data || {};
  const preview = Array.isArray(artifact.signal_preview?.[0]) ? artifact.signal_preview[0] : [];
  const psd = Array.isArray(artifact.psd) ? artifact.psd[0] : null;
  const bands = Array.isArray(artifact.channel_power) ? artifact.channel_power : [];

  return {
    waveform: {
      option: {
        xAxis: { type: 'category', data: preview.map((_, index) => index) },
        yAxis: { type: 'value' },
        series: [buildSeries('CH1', preview)]
      }
    },
    spectrum: {
      option: {
        xAxis: { type: 'category', data: psd?.frequencies || [] },
        yAxis: { type: 'value' },
        series: [
          {
            name: psd?.channel || 'CH1',
            type: 'bar',
            data: psd?.values || []
          }
        ]
      }
    },
    bands: {
      option: {
        legend: { data: ['alpha', 'beta'] },
        xAxis: { type: 'category', data: bands.map((item) => item.channel) },
        yAxis: { type: 'value' },
        series: [
          { name: 'alpha', type: 'bar', data: bands.map((item) => item.alpha) },
          { name: 'beta', type: 'bar', data: bands.map((item) => item.beta) }
        ]
      }
    },
    events: {
      rows: Array.isArray(artifact.events) ? artifact.events : []
    },
    report: {
      sections: [
        { title: '关键观察', body: (run?.report?.content?.observations || []).join('\n') },
        { title: '限制说明', body: run?.report?.content?.limitations || '' },
        { title: '下一步', body: run?.report?.content?.next_steps || '' }
      ].filter((section) => section.body)
    }
  };
}

export function selectedNodeInspector(workspace, run) {
  const node = workspace?.nodes?.find((item) => item.id === workspace.selectedNodeId) || null;
  const explanations = run?.report?.content?.node_explanations || [];
  const explanation = explanations.find((item) => item.node_id === node?.id)?.body || '';

  return {
    node,
    params: node ? clone(workspace.nodeParams[node.id] || {}) : {},
    explanation
  };
}
