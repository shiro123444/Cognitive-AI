import { describe, expect, it } from 'vitest';
import {
  buildCanvasModel,
  buildInstrumentModel,
  buildWorkspaceFromTemplate,
  patchNodeParams,
  selectedNodeInspector
} from './neuroLabPipelineState';

describe('neuroLabPipelineState', () => {
  it('builds the default fixed pipeline from legacy flat template params', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    expect(workspace.nodes.map((node) => node.id)).toEqual([
      'source',
      'filter',
      'psd',
      'band-power',
      'ai-report'
    ]);
    expect(workspace.nodeParams.source.channels).toBe(4);
    expect(workspace.nodeParams.filter.high_hz).toBe(40);
    expect(workspace.selectedNodeId).toBe('source');
  });

  it('patches editable node params without changing node order', () => {
    const workspace = buildWorkspaceFromTemplate({
      default_params: {
        pipeline: {
          nodes: [
            { id: 'source' },
            { id: 'filter' },
            { id: 'psd' },
            { id: 'band-power' },
            { id: 'ai-report' }
          ],
          edges: [
            ['source', 'filter'],
            ['filter', 'psd'],
            ['psd', 'band-power'],
            ['band-power', 'ai-report']
          ]
        },
        node_params: {
          source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
          filter: { low_hz: 1, high_hz: 40 }
        }
      }
    });

    const next = patchNodeParams(workspace, 'filter', { high_hz: 32 });

    expect(next.nodeParams.filter.high_hz).toBe(32);
    expect(next.nodes.map((node) => node.id)).toEqual(workspace.nodes.map((node) => node.id));
  });

  it('builds a layered niivue canvas model from experiment artifacts', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-eeg-replay',
      title: 'EEG Replay Lab',
      default_params: { duration_seconds: 4, sample_rate: 128, channels: 4 }
    });

    const run = {
      status: 'completed',
      report: {
        content: {
          observations: ['Alpha remains dominant across channels.'],
          next_steps: 'Adjust the source duration and compare frontal response.'
        }
      },
      artifacts: [
        {
          data: {
            signal_preview: [
              [0.12, 0.24, -0.18, 0.08],
              [0.06, 0.1, -0.08, 0.02],
              [0.04, 0.08, -0.05, 0.01],
              [0.02, 0.05, -0.03, 0.0]
            ],
            channel_power: [
              { channel: 'CH1', alpha: 3.6, beta: 2.4 },
              { channel: 'CH2', alpha: 2.8, beta: 1.9 },
              { channel: 'CH3', alpha: 2.1, beta: 1.5 },
              { channel: 'CH4', alpha: 1.8, beta: 1.2 }
            ],
            events: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }],
            pipeline_trace: [
              { node_id: 'source', status: 'completed' },
              { node_id: 'filter', status: 'completed' },
              { node_id: 'psd', status: 'completed' }
            ]
          }
        }
      ]
    };

    const model = buildCanvasModel(workspace, run, {
      channelId: 'ch-2',
      regionId: 'motor-right'
    });

    expect(model.channels).toHaveLength(4);
    expect(model.brain.meshes.map((item) => item.url)).toEqual([
      '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3',
      '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3'
    ]);
    expect(model.brain.volumes).toEqual([]);
    expect(model.brain.cameraPreset).toEqual({ azimuth: 126, elevation: 18, scale: 0.94 });
    expect(model.channels[1].id).toBe('ch-2');
    expect(model.channels[1].points.length).toBeGreaterThan(0);
    expect(model.brain.regions.find((region) => region.id === 'motor-right').summary).toContain('Alpha');
    expect(model.brain.connectome.nodes.names).toContain('Prefrontal Cortex');
    expect(model.regions.find((region) => region.id === 'motor-right').isActive).toBe(true);
    expect(model.materialPanels.find((panel) => panel.id === 'network-field').isActive).toBe(true);
    expect(model.pipeline.find((node) => node.id === 'psd').status).toBe('completed');
    expect(model.events[0].left).toBe('25.00%');
    expect(model.hasData).toBe(true);
  });

  it('maps experiment artifacts into instrument panels and inspector explanations', () => {
    const run = {
      report: {
        content: {
          node_explanations: [
            {
              node_id: 'filter',
              title: 'Bandpass Filter',
              body: 'Removes drift and high-frequency noise before spectrum analysis.'
            }
          ],
          observations: ['Alpha remains dominant across channels.'],
          limitations: 'Synthetic data only.',
          next_steps: 'Try a lower high-cut value.'
        }
      },
      artifacts: [
        {
          data: {
            signal_preview: [[0.1, 0.2, -0.1]],
            psd: [
              {
                channel: 'CH1',
                frequencies: [4, 8, 12],
                values: [1.2, 3.6, 2.4]
              }
            ],
            channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
            events: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }],
            pipeline_trace: [
              { node_id: 'source', status: 'completed' },
              { node_id: 'filter', status: 'completed' }
            ]
          }
        }
      ]
    };

    const instruments = buildInstrumentModel(run);
    const inspector = selectedNodeInspector(
      {
        nodes: [
          {
            id: 'filter',
            label: 'Bandpass Filter',
            type: 'signal_processing',
            editable: true,
            status: 'completed',
            fields: []
          }
        ],
        nodeParams: {
          filter: { low_hz: 1, high_hz: 40 }
        },
        selectedNodeId: 'filter'
      },
      run
    );

    expect(instruments.waveform.option.series[0].data).toEqual([0.1, 0.2, -0.1]);
    expect(instruments.spectrum.option.grid).toMatchObject({ containLabel: true, top: 12 });
    expect(instruments.bands.option.legend.bottom).toBe(0);
    expect(instruments.events.rows[0].label).toBe('Stimulus');
    expect(inspector.explanation).toContain('Removes drift');
    expect(inspector.statusLabel).toBe('Completed');
  });

  it('builds a neuron workspace from the spike-lab template params', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-neuron-spike',
      title: 'Neuron Spike Lab',
      default_params: {
        pipeline: {
          nodes: [
            { id: 'stimulus' },
            { id: 'integrate' },
            { id: 'detect-spikes' },
            { id: 'firing-rate' },
            { id: 'ai-report' }
          ],
          edges: [
            ['stimulus', 'integrate'],
            ['integrate', 'detect-spikes'],
            ['detect-spikes', 'firing-rate'],
            ['firing-rate', 'ai-report']
          ]
        },
        node_params: {
          stimulus: { stimulus_current: 8, duration_ms: 120 }
        }
      }
    });

    expect(workspace.nodes.map((node) => node.id)).toEqual([
      'stimulus',
      'integrate',
      'detect-spikes',
      'firing-rate',
      'ai-report'
    ]);
    expect(workspace.nodeParams.stimulus).toEqual({ stimulus_current: 8, duration_ms: 120 });
    expect(workspace.nodes[0].editable).toBe(true);
    expect(workspace.nodes[1].editable).toBe(false);
  });

  it('maps a neuron run onto the canvas as a membrane-potential wave bed', () => {
    const workspace = buildWorkspaceFromTemplate({
      id: 'exp-neuron-spike',
      default_params: {
        pipeline: { nodes: [{ id: 'stimulus' }], edges: [] },
        node_params: { stimulus: { stimulus_current: 8, duration_ms: 120 } }
      }
    });

    const run = {
      status: 'completed',
      artifacts: [
        {
          data: {
            duration_ms: 120,
            membrane_potential: { t_ms: [0, 0.1, 0.2], v_mv: [-70, -69.7, -69.4] },
            spike_times: [3.6, 9.1],
            total_spikes: 2,
            firing_rate: 16.7,
            threshold_mv: -55,
            events: [{ label: 'Stimulus On', start_ms: 0, end_ms: 120 }],
            pipeline_trace: [{ node_id: 'stimulus', status: 'completed' }]
          }
        }
      ]
    };

    const model = buildCanvasModel(workspace, run);
    const instruments = buildInstrumentModel(run);

    expect(model.channels).toHaveLength(1);
    expect(model.channels[0].readout).toContain('2 spikes');
    expect(model.channels[0].points.length).toBeGreaterThan(0);
    expect(model.brain.connectome).toBeTruthy();
    expect(model.events[0].width).toBe('100.00%');

    expect(instruments.neuron).toBeTruthy();
    expect(instruments.neuron.metrics.totalSpikes).toBe(2);
    expect(instruments.neuron.metrics.firingRate).toBe(16.7);
    expect(instruments.neuron.potential.option.series[0].markLine.data).toEqual([{ yAxis: -55 }]);
    expect(instruments.neuron.raster.option.series[0].data).toEqual([
      [3.6, 0.5],
      [9.1, 0.5]
    ]);
  });

  it('keeps the instrument model EEG-shaped when the run has no neuron artifact', () => {
    const run = {
      status: 'completed',
      artifacts: [
        {
          data: {
            signal_preview: [[0.1, 0.2]],
            channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }]
          }
        }
      ]
    };
    const instruments = buildInstrumentModel(run);
    expect(instruments.neuron).toBeNull();
    expect(instruments.spectrum.option).toBeTruthy();
  });
});
