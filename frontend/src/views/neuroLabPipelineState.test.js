import { describe, expect, it } from 'vitest';
import {
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
    expect(instruments.events.rows[0].label).toBe('Stimulus');
    expect(inspector.explanation).toContain('Removes drift');
  });
});
