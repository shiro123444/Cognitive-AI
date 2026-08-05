import {
  NEUROLAB_BRAIN_CAMERA,
  NEUROLAB_BRAIN_MESHES,
  NEUROLAB_BRAIN_REGIONS,
  NEUROLAB_BRAIN_VOLUMES,
  NEUROLAB_CONNECTOME_SCAFFOLD,
  NEUROLAB_MATERIAL_PANELS
} from '../data/neuroLabBrainScene';

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
  { id: 'ai-report', type: 'report', label: 'AI Experiment Report', editable: false, fields: [] },
  {
    id: 'stimulus',
    type: 'data_source',
    label: 'Stimulus Source',
    editable: true,
    fields: [
      { key: 'stimulus_current', label: '刺激强度', kind: 'number', min: 0.5, max: 20, step: 0.5 },
      { key: 'duration_ms', label: '时长(ms)', kind: 'number', min: 50, max: 500, step: 10 }
    ]
  },
  { id: 'integrate', type: 'signal_processing', label: 'LIF Integrate', editable: false, fields: [] },
  { id: 'detect-spikes', type: 'analysis', label: 'Spike Detect', editable: false, fields: [] },
  { id: 'firing-rate', type: 'feature', label: 'Firing Rate', editable: false, fields: [] }
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
  { id: 'source', x: 8, y: 6 },
  { id: 'filter', x: 28, y: 6 },
  { id: 'psd', x: 50, y: 6 },
  { id: 'band-power', x: 72, y: 6 },
  { id: 'ai-report', x: 92, y: 6 }
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

function nodeTypeLabel(type) {
  return {
    data_source: '数据源',
    signal_processing: '信号处理',
    analysis: '频谱分析',
    feature: '特征提取',
    report: 'AI 解读'
  }[type] || type || '节点';
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

function focusRegionId(focus = {}) {
  return focus.regionId || 'prefrontal';
}

function clampPercent(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

const CLASSIC_PIPELINE_NODE_IDS = ['source', 'filter', 'psd', 'band-power', 'ai-report'];

function templatePipeline(defaultParams = {}) {
  return defaultParams.pipeline || {
    nodes: CLASSIC_PIPELINE_NODE_IDS.map((id) => ({ id })),
    edges: PIPELINE_EDGES
  };
}

function templateNodeParams(defaultParams = {}) {
  if (defaultParams.node_params) {
    return Object.fromEntries(Object.entries(defaultParams.node_params).map(([nodeId, value]) => {
      const defaults = {
        source: DEFAULT_NODE_PARAMS.source,
        filter: DEFAULT_NODE_PARAMS.filter
      }[nodeId];
      return [nodeId, { ...(defaults || {}), ...(value || {}) }];
    }));
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

function regionActivity(region, channels) {
  const relatedChannels = region.channels.map((index) => channels[index]).filter(Boolean);
  return average(relatedChannels.map((channel) => channel.alpha + channel.beta));
}

function buildMaterialPanels(regionId) {
  return NEUROLAB_MATERIAL_PANELS.map((panel) => ({
    ...panel,
    isActive: panel.regionIds.includes(regionId)
  }));
}

function buildLegacyConnectome(regions) {
  const indexById = Object.fromEntries(regions.map((region, index) => [region.id, index]));
  const size = regions.length;
  const edges = Array(size * size).fill(0);

  for (const edge of NEUROLAB_CONNECTOME_SCAFFOLD) {
    const sourceIndex = indexById[edge.source];
    const targetIndex = indexById[edge.target];

    if (sourceIndex == null || targetIndex == null) continue;

    const strength = Number(
      ((((regions[sourceIndex].intensity + regions[targetIndex].intensity) / 2) * edge.weight)).toFixed(3)
    );

    edges[sourceIndex * size + targetIndex] = strength;
    edges[targetIndex * size + sourceIndex] = strength;
  }

  return {
    nodes: {
      names: regions.map((region) => region.label),
      prefilled: regions.map((region) => region.summary),
      X: regions.map((region) => region.mesh.x),
      Y: regions.map((region) => region.mesh.y),
      Z: regions.map((region) => region.mesh.z),
      Color: regions.map((region) => Number(region.intensity.toFixed(3))),
      Size: regions.map((region) => Number((0.75 + region.intensity * 0.55).toFixed(2)))
    },
    edges,
    nodeColormap: 'electric_blue',
    nodeColormapNegative: 'winter',
    nodeMinColor: 0,
    nodeMaxColor: 1,
    nodeScale: 2.2,
    edgeColormap: 'warm',
    edgeColormapNegative: 'winter',
    edgeScale: 0.42,
    edgeMin: 0.12,
    edgeMax: 1,
    showLegend: false
  };
}

function buildBrainSceneModel(channels, regionId = 'prefrontal', hasData = false) {
  const regions = NEUROLAB_BRAIN_REGIONS.map((region) => {
    const activity = regionActivity(region, channels);
    const alpha = average(region.channels.map((index) => channels[index]?.alpha || 0));
    const beta = average(region.channels.map((index) => channels[index]?.beta || 0));

    return {
      ...region,
      activity,
      alpha,
      beta,
      hasData,
      intensity: hasData ? Math.min(1, activity / 8) : 0,
      summary: hasData ? `Alpha ${alpha.toFixed(1)} · Beta ${beta.toFixed(1)}` : '待运行',
      isActive: region.id === regionId
    };
  });

  return {
    volumes: NEUROLAB_BRAIN_VOLUMES,
    meshes: NEUROLAB_BRAIN_MESHES,
    cameraPreset: NEUROLAB_BRAIN_CAMERA,
    regions,
    connectome: hasData ? buildLegacyConnectome(regions) : null,
    sceneRevision: `${hasData ? 'result' : 'ready'}:${regionId}:${regions.map((region) => region.activity.toFixed(2)).join('|')}`,
    fallbackLabel: '三维脑表面暂不可用',
    mappingLabel: '教学通道映射'
  };
}

function buildNeuronChannels(membrane, artifact) {
  const samples = membrane.v_mv.map((value) => Number((value + 62.5).toFixed(3)));
  return [{
    id: 'ch-1',
    label: 'CH1',
    unit: 'mV',
    points: toPolyline(samples),
    readout: `${artifact.total_spikes} spikes · ${artifact.firing_rate} Hz`,
    alpha: 0,
    beta: 0,
    hasData: true,
    isActive: true
  }];
}

export function buildCanvasModel(workspace, run, focus = {}, options = {}) {
  const artifact = artifactData(run);
  const hasData = Boolean(run && Object.keys(artifact).length);
  const preview = Array.isArray(artifact.signal_preview) ? artifact.signal_preview : [];
  const channelCount = preview.length || workspace?.nodeParams?.source?.channels || 4;
  const timeseries = Array.isArray(artifact.band_power_timeseries) ? artifact.band_power_timeseries : [];
  const framed = timeseries.length ? buildBandPowerAtTime(timeseries, options.playheadMs ?? 0, channelCount) : null;
  const powers = framed || (Array.isArray(artifact.channel_power) ? artifact.channel_power : []);
  const traceById = Object.fromEntries((artifact.pipeline_trace || []).map((item) => [item.node_id, item.status]));
  const membrane = artifact.membrane_potential;
  const neuronDuration = artifact.duration_ms || workspace?.nodeParams?.stimulus?.duration_ms;
  const durationMs = neuronDuration || (workspace?.nodeParams?.source?.duration_seconds || 4) * 1000;

  const channels = (membrane && Array.isArray(membrane.v_mv) && membrane.v_mv.length)
    ? buildNeuronChannels(membrane, artifact)
    : Array.from({ length: channelCount }, (_, index) => {
      const id = `ch-${index + 1}`;
      const samples = preview[index] || [];
      const power = powers[index] || {};

      return {
        id,
        label: `CH${index + 1}`,
        points: toPolyline(samples),
        alpha: power.alpha ?? 0,
        beta: power.beta ?? 0,
        hasData: hasData && samples.length > 0,
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

  const regionId = focusRegionId(focus);
  const brain = buildBrainSceneModel(channels, regionId, hasData);
  const materialPanels = buildMaterialPanels(regionId);

  return {
    brain,
    channels,
    regions,
    pipeline,
    events,
    materialPanels,
    hasData,
    gridColumns: 12,
    gridRows: 8
  };
}

/**
 * Resolve per-channel band-power at a given time from the timeseries produced
 * by the real-DSP adapter. Returns null when there is no timeseries (so callers
 * can fall back to the static channel_power snapshot).
 */
export function buildBandPowerAtTime(timeseries, tMs, channelCount) {
  if (!Array.isArray(timeseries) || timeseries.length === 0) return null;
  let frame = timeseries[0];
  for (const point of timeseries) {
    if (point.t_ms <= tMs) frame = point;
    else break;
  }
  const channels = frame.channels || {};
  return Array.from({ length: channelCount }, (_, index) => {
    const key = `CH${index + 1}`;
    const value = channels[key] || {};
    return { channel: key, alpha: value.alpha ?? 0, beta: value.beta ?? 0 };
  });
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

function compactCartesianGrid(bottom = 8) {
  return {
    left: 8,
    right: 12,
    top: 12,
    bottom,
    containLabel: true
  };
}

const PSD_TARGET_TICKS = 10;

function categoryLabelInterval(count, targetTicks = PSD_TARGET_TICKS) {
  if (count <= targetTicks) return 0;
  return Math.max(1, Math.ceil(count / targetTicks) - 1);
}

function buildSpectrogramOption(spec) {
  if (!spec || !Array.isArray(spec.freqs) || !Array.isArray(spec.times) || !Array.isArray(spec.values)) {
    return null;
  }
  const data = [];
  let maxVal = 0;
  for (let fi = 0; fi < spec.freqs.length; fi++) {
    const row = spec.values[fi] || [];
    for (let ti = 0; ti < spec.times.length; ti++) {
      const value = row[ti] ?? 0;
      if (value > maxVal) maxVal = value;
      data.push([ti, fi, value]);
    }
  }
  return {
    tooltip: { position: 'top' },
    grid: { left: 38, right: 10, top: 10, bottom: 36 },
    xAxis: {
      type: 'category',
      data: spec.times.map((t) => t.toFixed(2)),
      name: 't(s)',
      nameLocation: 'middle',
      nameGap: 22,
      axisLabel: { fontSize: 9 },
      splitArea: { show: false }
    },
    yAxis: {
      type: 'category',
      data: spec.freqs.map((f) => f.toFixed(0)),
      name: 'Hz',
      axisLabel: { fontSize: 9 },
      splitArea: { show: false }
    },
    visualMap: {
      min: 0,
      max: maxVal || 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 80,
      inRange: { color: ['#f8f9fa', '#9aa6ff', '#0022ff'] }
    },
    series: [{ type: 'heatmap', data, progressive: 1000 }]
  };
}

function buildNeuronPotentialOption(membrane, artifact) {
  const t = membrane.t_ms || [];
  const v = membrane.v_mv || [];
  return {
    grid: compactCartesianGrid(),
    xAxis: { type: 'value', name: 'ms', nameLocation: 'middle', nameGap: 24, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', name: 'mV', nameLocation: 'middle', nameGap: 34, axisLabel: { fontSize: 9 } },
    series: [
      {
        name: 'V(mV)',
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: v.map((value, index) => [t[index], value]),
        markLine: {
          symbol: 'none',
          silent: true,
          label: { formatter: '阈值', fontSize: 9 },
          lineStyle: { color: '#b91c1c', type: 'dashed', width: 1 },
          data: [{ yAxis: artifact.threshold_mv }]
        }
      }
    ]
  };
}

function buildNeuronRasterOption(spikeTimes = [], artifact) {
  return {
    grid: compactCartesianGrid(),
    xAxis: {
      type: 'value',
      name: 'ms',
      nameLocation: 'middle',
      nameGap: 24,
      axisLabel: { fontSize: 9 },
      max: artifact.duration_ms || undefined
    },
    yAxis: { type: 'value', min: 0, max: 1, show: false },
    series: [
      {
        name: 'spike',
        type: 'scatter',
        symbol: 'rect',
        symbolSize: [6, 18],
        data: spikeTimes.map((t) => [t, 0.5])
      }
    ]
  };
}

export function buildInstrumentModel(run) {
  const artifact = artifactData(run);
  const preview = Array.isArray(artifact.signal_preview?.[0]) ? artifact.signal_preview[0] : [];
  const psd = Array.isArray(artifact.psd) ? artifact.psd[0] : null;
  const bands = Array.isArray(artifact.channel_power) ? artifact.channel_power : [];
  const spectrogram = Array.isArray(artifact.spectrogram) ? artifact.spectrogram[0] : null;
  const membrane = artifact.membrane_potential;
  const neuron = membrane && Array.isArray(membrane.v_mv) && membrane.v_mv.length
    ? {
      potential: { option: buildNeuronPotentialOption(membrane, artifact) },
      raster: { option: buildNeuronRasterOption(artifact.spike_times || [], artifact) },
      metrics: {
        totalSpikes: artifact.total_spikes ?? run?.summary?.total_spikes ?? 0,
        firingRate: artifact.firing_rate ?? run?.summary?.firing_rate ?? 0,
        meanPotential: run?.summary?.mean_potential ?? null,
        thresholdMv: artifact.threshold_mv ?? null
      }
    }
    : null;

  return {
    neuron,
    waveform: {
      option: {
        grid: compactCartesianGrid(),
        xAxis: { type: 'category', data: preview.map((_, index) => index) },
        yAxis: { type: 'value' },
        series: [buildSeries('CH1', preview)]
      }
    },
    spectrum: {
      option: {
        grid: compactCartesianGrid(),
        xAxis: {
          type: 'category',
          data: psd?.frequencies || [],
          axisTick: { alignWithLabel: true },
          axisLabel: { interval: categoryLabelInterval((psd?.frequencies || []).length) }
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: psd?.channel || 'CH1',
            type: 'bar',
            barMaxWidth: 12,
            barCategoryGap: '32%',
            data: psd?.values || []
          }
        ]
      }
    },
    bands: {
      option: {
        grid: compactCartesianGrid(34),
        legend: { data: ['alpha', 'beta'], bottom: 0 },
        xAxis: { type: 'category', data: bands.map((item) => item.channel) },
        yAxis: { type: 'value' },
        series: [
          { name: 'alpha', type: 'bar', data: bands.map((item) => item.alpha) },
          { name: 'beta', type: 'bar', data: bands.map((item) => item.beta) }
        ]
      }
    },
    spectrogram: {
      option: buildSpectrogramOption(spectrogram)
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
    explanation,
    statusLabel: nodeStatusLabel(node?.status || 'ready'),
    typeLabel: nodeTypeLabel(node?.type)
  };
}
