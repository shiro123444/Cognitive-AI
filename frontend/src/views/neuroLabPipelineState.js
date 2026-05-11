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

const REGION_BLUEPRINTS = [
  { id: 'prefrontal', label: 'Prefrontal', x: 34, y: 28, channels: [0] },
  { id: 'motor-left', label: 'Motor Left', x: 26, y: 44, channels: [1] },
  { id: 'motor-right', label: 'Motor Right', x: 58, y: 44, channels: [2] },
  { id: 'visual', label: 'Visual', x: 42, y: 62, channels: [3] }
];

const PIPELINE_ANCHORS = [
  { id: 'source', x: 10, y: 14 },
  { id: 'filter', x: 23, y: 12 },
  { id: 'psd', x: 70, y: 16 },
  { id: 'band-power', x: 84, y: 26 },
  { id: 'ai-report', x: 88, y: 62 }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function artifactData(run) {
  return run?.artifacts?.[0]?.data || {};
}

function nodeStatusLabel(status) {
  return {
    ready: 'Ready',
    running: 'Running',
    completed: 'Completed',
    error: 'Error'
  }[status] || 'Ready';
}

function toPolyline(samples = []) {
  if (!samples.length) return '';
  const max = Math.max(...samples.map((value) => Math.abs(value))) || 1;

  return samples.map((value, index) => {
    const x = (index / Math.max(samples.length - 1, 1)) * 100;
    const y = 50 - (value / max) * 38;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPercent(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
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
  const trace = artifactData(run).pipeline_trace || [];
  const traceById = Object.fromEntries(trace.map((item) => [item.node_id, item.status]));

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => ({
      ...node,
      status: traceById[node.id] || (run ? 'completed' : 'ready')
    }))
  };
}

export function buildCanvasModel(workspace, run, focus = {}) {
  const artifact = artifactData(run);
  const preview = Array.isArray(artifact.signal_preview) ? artifact.signal_preview : [];
  const powers = Array.isArray(artifact.channel_power) ? artifact.channel_power : [];
  const traceById = Object.fromEntries((artifact.pipeline_trace || []).map((item) => [item.node_id, item.status]));
  const channelCount = preview.length || workspace?.nodeParams?.source?.channels || 4;
  const durationMs = (workspace?.nodeParams?.source?.duration_seconds || 4) * 1000;

  const channels = Array.from({ length: channelCount }, (_, index) => {
    const id = `ch-${index + 1}`;
    const samples = preview[index] || [];
    const power = powers[index] || {};

    return {
      id,
      label: `CH${index + 1}`,
      points: toPolyline(samples),
      alpha: power.alpha ?? 0,
      beta: power.beta ?? 0,
      isActive: focus.channelId ? focus.channelId === id : index === 0
    };
  });

  const regions = REGION_BLUEPRINTS.map((region) => {
    const relatedChannels = region.channels.map((index) => channels[index]).filter(Boolean);
    const activity = average(relatedChannels.map((channel) => channel.alpha + channel.beta));

    return {
      ...region,
      activity,
      intensity: Math.min(1, activity / 8),
      isActive: focus.regionId === region.id
    };
  });

  const pipeline = (workspace?.nodes || []).map((node, index) => {
    const anchor = PIPELINE_ANCHORS.find((item) => item.id === node.id) || PIPELINE_ANCHORS[index];
    const status = traceById[node.id] || node.status || 'ready';

    return {
      ...node,
      status,
      statusLabel: nodeStatusLabel(status),
      x: anchor?.x ?? 20 + index * 14,
      y: anchor?.y ?? 20 + index * 10,
      isSelected: workspace?.selectedNodeId === node.id
    };
  });

  const events = (artifact.events || []).map((event) => ({
    ...event,
    left: clampPercent((event.start_ms / durationMs) * 100),
    width: clampPercent(((event.end_ms - event.start_ms) / durationMs) * 100)
  }));

  return {
    channels,
    regions,
    pipeline,
    events,
    gridColumns: 12,
    gridRows: 8
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
  const artifact = artifactData(run);
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

export function buildWorkbenchPanels({
  templates = [],
  selectedExperiment = null,
  workspace = null,
  run = null,
  focus = {}
}) {
  const sourceParams = workspace?.nodeParams?.source || {};
  const artifact = artifactData(run);
  const trace = artifact.pipeline_trace || [];
  const lastTrace = trace[trace.length - 1];
  const focusChannel = focus.channelId || 'ch-1';
  const focusRegion = focus.regionId || 'prefrontal';

  return {
    controlStrip: {
      title: selectedExperiment?.title || '请选择实验模板',
      modeLabel: 'Teaching Cockpit',
      statusLabel: nodeStatusLabel(run?.status || lastTrace?.status || 'ready'),
      sessionLabel: `${sourceParams.channels || 4} CH · ${sourceParams.sample_rate || 128} Hz`
    },
    templateItems: templates.map((template) => ({
      id: template.id,
      title: template.title,
      subtitle: `${template.status || 'draft'} · ${template.data_source || 'simulation'}`,
      isActive: template.id === selectedExperiment?.id
    })),
    metrics: [
      { id: 'sample-rate', label: '采样率', value: `${sourceParams.sample_rate || 128} Hz` },
      { id: 'channels', label: '通道数', value: `${sourceParams.channels || 4}` },
      { id: 'duration', label: '时长', value: `${sourceParams.duration_seconds || 4} s` },
      { id: 'events', label: '事件数', value: `${(artifact.events || []).length}` }
    ],
    assistantSections: [
      {
        id: 'observation',
        title: '当前观察',
        body: run?.report?.content?.observations?.[0] || '运行实验后显示当前观察。'
      },
      {
        id: 'meaning',
        title: '可能含义',
        body: `当前焦点：${focusChannel.toUpperCase()} / ${focusRegion.replace('-', ' ')}。`
      },
      {
        id: 'next-step',
        title: '下一步建议',
        body: run?.report?.content?.next_steps || '调整参数后再次运行以比较结果。'
      }
    ]
  };
}

export function selectedNodeInspector(workspace, run) {
  const node = workspace?.nodes?.find((item) => item.id === workspace.selectedNodeId) || null;
  const explanations = run?.report?.content?.node_explanations || [];
  const explanation = explanations.find((item) => item.node_id === node?.id)?.body || '';

  return {
    node,
    params: node ? clone(workspace.nodeParams[node.id] || {}) : {},
    explanation,
    statusLabel: nodeStatusLabel(node?.status || 'ready')
  };
}
