# EDUFISH NeuroLab 2.0 Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/lab` from a parameter form into a real NeuroLab workbench with a fixed experiment pipeline canvas, an inspector, instrument panels, and richer synthetic EEG artifacts while reusing mature open-source components wherever possible.

**Architecture:** Keep the existing Flask experiment lifecycle and Vue route, but change the lab UX into a four-zone workspace. EDUFISH owns authentication, template/run/report/progress models, pipeline schema, and AI explanations; mature libraries own the hard UI primitives and experiment infrastructure: `@vue-flow/core` for the pipeline canvas and `echarts` for instrument rendering. No new tables are required; the new pipeline definition lives inside existing template/run/artifact JSON fields.

**Tech Stack:** Flask, SQLAlchemy, existing experiment API, Vue 3, Pinia-compatible view state helpers, `@vue-flow/core`, `@vue-flow/minimap`, `echarts`, `@vue/test-utils`, Vitest, pytest.

---

## Scope

This plan implements the first integration-first slice from the approved NeuroLab 2.0 spec:

1. `/lab` becomes a fixed-pipeline workbench instead of a flat parameter form.
2. The EEG Replay template exposes a pipeline definition and node-scoped parameters.
3. Synthetic EEG runs return waveform, PSD, band power, event timeline, and pipeline trace artifacts.
4. The frontend renders a Vue Flow canvas, node inspector, and ECharts-backed instruments.
5. The report carries per-node explanations so the inspector and report panel stay in sync.

This plan does not implement arbitrary graph execution, real BrainFlow hardware streaming, LSL/Timeflux streaming services, jsPsych runtime execution, Carbon Copies / BrainGenix deployment, or NiiVue / Neuroglancer viewers. Those remain deferred adapters after this workbench slice is stable.

## File Structure

### Backend

- Modify: `backend/app/services/experiment_adapters.py`
  - Normalize node-scoped params and return richer synthetic artifacts: `psd`, `events`, `pipeline_trace`.
- Modify: `backend/app/services/experiment_service.py`
  - Upsert template pipeline metadata, preserve backward compatibility for existing seeded rows, and enrich report content with per-node explanations.
- Modify: `backend/app/tests/test_experiment_service.py`
  - Verify richer artifacts, nested params, and report node explanations.
- Modify: `backend/app/tests/test_experiments_api.py`
  - Verify list/create endpoints expose pipeline metadata and accept node-scoped params.

### Frontend

- Modify: `frontend/package.json`
  - Add `@vue-flow/core`, `@vue-flow/minimap`, `echarts`, and `@vue/test-utils`.
- Modify: `frontend/package-lock.json`
  - Lock the new frontend dependencies after `npm install`.
- Create: `frontend/src/views/neuroLabPipelineState.js`
  - Own fixed pipeline schema, node param patching, run-to-workspace mapping, and chart view models.
- Create: `frontend/src/views/neuroLabPipelineState.test.js`
  - Unit tests for template compatibility, param patching, and artifact transforms.
- Create: `frontend/src/components/NeuroLabNode.vue`
  - Custom pipeline node presentation for Vue Flow.
- Create: `frontend/src/components/NeuroLabCanvas.vue`
  - Vue Flow wrapper, node selection, and fixed edge rendering.
- Create: `frontend/src/components/NeuroLabCanvas.test.js`
  - Smoke test for wrapper logic with mocked Vue Flow primitives.
- Create: `frontend/src/components/NeuroLabInspector.vue`
  - Node parameter editor and AI explanation surface.
- Create: `frontend/src/components/NeuroLabChart.vue`
  - Small ECharts lifecycle wrapper.
- Create: `frontend/src/components/NeuroLabInstruments.vue`
  - Tabbed instrument area for waveform, spectrum, bands, events, and report.
- Create: `frontend/src/components/NeuroLabInstruments.test.js`
  - Smoke test for instrument tab switching and report fallback.
- Create: `frontend/src/views/LabView.test.js`
  - Lab workspace integration smoke test with mocked APIs/components.
- Modify: `frontend/src/views/LabView.vue`
  - Rebuild the page as the workbench layout and wire the new state/components.
- Modify: `frontend/src/api/experiments.test.js`
  - Keep API helper coverage aligned with node-scoped payloads.

## Task 1: Add Fixed Pipeline State And Artifact View Models

**Files:**
- Create: `frontend/src/views/neuroLabPipelineState.js`
- Create: `frontend/src/views/neuroLabPipelineState.test.js`

- [ ] **Step 1: Write the failing state tests**

Create `frontend/src/views/neuroLabPipelineState.test.js`:

```js
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
```

- [ ] **Step 2: Run the state test to verify it fails**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js
```

Expected: FAIL with `Cannot find module './neuroLabPipelineState'`.

- [ ] **Step 3: Implement the pipeline schema, param patching, and instrument model helpers**

Create `frontend/src/views/neuroLabPipelineState.js`:

```js
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
```

- [ ] **Step 4: Run the state test to verify it passes**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js
```

Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit the pipeline state module**

```bash
git add frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js
git commit -m "feat: add neurolab pipeline state helpers"
```

## Task 2: Extend The Synthetic Adapter To Return Pipeline Artifacts

**Files:**
- Modify: `backend/app/services/experiment_adapters.py`
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/tests/test_experiment_service.py`

- [ ] **Step 1: Write the failing backend test for PSD, events, and node explanations**

Append to `backend/app/tests/test_experiment_service.py`:

```python
def test_experiment_service_returns_pipeline_artifacts_and_node_explanations(app):
    with app.app_context():
        seed_courses()
        seed_users()
        ExperimentService.ensure_default_templates()

        run = ExperimentService.create_and_execute_run(
            "exp-eeg-replay",
            {
                "student_id": "student-ada",
                "course_id": "ai-intro",
                "params": {
                    "source": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
                    "filter": {"low_hz": 1, "high_hz": 32},
                },
            },
        )

    artifact = run["artifacts"][0]["data"]

    assert artifact["psd"][0]["frequencies"] == [4, 8, 12, 20, 30, 40]
    assert artifact["events"][0]["label"] == "Baseline"
    assert artifact["pipeline_trace"][-1]["node_id"] == "ai-report"
    assert run["report"]["content"]["node_explanations"][1]["node_id"] == "filter"
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run:

```bash
uv run --project backend pytest backend/app/tests/test_experiment_service.py::test_experiment_service_returns_pipeline_artifacts_and_node_explanations -q
```

Expected: FAIL with missing `psd`, `events`, or `node_explanations` keys.

- [ ] **Step 3: Implement node-scoped param normalization and richer synthetic artifacts**

Update `backend/app/services/experiment_adapters.py`:

```python
FREQUENCY_BINS = [4, 8, 12, 20, 30, 40]


def _normalize_pipeline_params(params: dict) -> dict:
    source = params.get("source") if isinstance(params.get("source"), dict) else params
    filter_params = params.get("filter") if isinstance(params.get("filter"), dict) else {}

    duration_seconds = int(source.get("duration_seconds", 4))
    sample_rate = int(source.get("sample_rate", 128))
    channels = int(source.get("channels", 4))
    low_hz = float(filter_params.get("low_hz", 1))
    high_hz = float(filter_params.get("high_hz", 40))

    if duration_seconds < 1 or duration_seconds > 30:
        raise ValueError("source.duration_seconds must be between 1 and 30.")
    if sample_rate not in {64, 128, 256}:
        raise ValueError("source.sample_rate must be one of 64, 128, 256.")
    if channels < 1 or channels > 8:
        raise ValueError("source.channels must be between 1 and 8.")
    if low_hz < 0 or low_hz >= high_hz:
        raise ValueError("filter.low_hz must be less than filter.high_hz.")

    return {
        "source": {
            "duration_seconds": duration_seconds,
            "sample_rate": sample_rate,
            "channels": channels,
        },
        "filter": {
            "low_hz": low_hz,
            "high_hz": high_hz,
        },
    }


@dataclass
class SyntheticEegAdapter:
    def validate_params(self, params: dict) -> dict:
        return _normalize_pipeline_params(params)

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        source = validated["source"]
        filter_params = validated["filter"]
        sample_count = source["duration_seconds"] * source["sample_rate"]
        sample_rate = source["sample_rate"]
        channels = source["channels"]
        preview = []
        channel_power = []
        psd = []

        for channel_index in range(channels):
            alpha_amp = 12 - channel_index
            beta_amp = 4 + channel_index
            values = []
            for index in range(sample_count):
                t = index / sample_rate
                alpha = alpha_amp * math.sin(2 * math.pi * 10 * t)
                beta = beta_amp * math.sin(2 * math.pi * 20 * t)
                drift = 0.8 * math.sin(2 * math.pi * 1.5 * t)
                values.append(round(alpha + beta + drift, 4))

            preview.append(values[:96])
            alpha_power = round(alpha_amp * alpha_amp / 2, 3)
            beta_power = round(beta_amp * beta_amp / 2, 3)
            channel_power.append({
                "channel": f"CH{channel_index + 1}",
                "alpha": alpha_power,
                "beta": beta_power,
            })
            psd.append({
                "channel": f"CH{channel_index + 1}",
                "frequencies": FREQUENCY_BINS,
                "values": [
                    round(alpha_power * 0.18, 3),
                    round(alpha_power * 0.62, 3),
                    round(alpha_power, 3),
                    round(beta_power, 3),
                    round(beta_power * 0.48, 3),
                    round(beta_power * 0.22, 3),
                ],
            })

        return {
            "params": validated,
            "sample_count": sample_count,
            "signal_preview": preview,
            "channel_power": channel_power,
            "psd": psd,
            "events": [
                {"label": "Baseline", "start_ms": 0, "end_ms": 500},
                {"label": "Stimulus", "start_ms": 500, "end_ms": 1500},
                {"label": "Analysis", "start_ms": 1500, "end_ms": source["duration_seconds"] * 1000},
            ],
            "pipeline_trace": [
                {"node_id": "source", "status": "completed"},
                {"node_id": "filter", "status": "completed"},
                {"node_id": "psd", "status": "completed"},
                {"node_id": "band-power", "status": "completed"},
                {"node_id": "ai-report", "status": "completed"},
            ],
        }
```

Update `backend/app/services/experiment_service.py`:

```python
        report = ExperimentReport(
            id=f"report-{uuid4().hex}",
            run_id=run.id,
            status="ready",
            content_json=json.dumps(
                ExperimentService._build_report_content(template, summary, result),
                ensure_ascii=False,
            ),
            updated_at=_now(),
        )
```

```python
    @staticmethod
    def _build_report_content(template: ExperimentTemplate, summary: dict, result: dict) -> dict:
        dominant = summary.get("dominant_band", "unknown")
        source = result.get("params", {}).get("source", {})
        filter_params = result.get("params", {}).get("filter", {})
        return {
            "title": f"{template.title} 实验报告",
            "purpose": "观察合成 EEG 信号中的频段能量变化，并理解采样率、滤波和通道数量的关系。",
            "observations": [
                f"本次运行生成 {summary.get('sample_count')} 个采样点。",
                f"主导频段为 {dominant}。",
                f"alpha 总功率为 {summary.get('alpha_power')}，beta 总功率为 {summary.get('beta_power')}。",
            ],
            "limitations": "本实验使用 synthetic/sample 数据，不代表真实人体脑电，也不能用于医疗判断。",
            "next_steps": "尝试调整滤波参数或通道数量，比较波形和频谱如何变化。",
            "node_explanations": [
                {
                    "node_id": "source",
                    "title": "Synthetic EEG Source",
                    "body": f"生成了 {source.get('channels')} 个通道、{source.get('sample_rate')} Hz 的合成 EEG 片段。",
                },
                {
                    "node_id": "filter",
                    "title": "Bandpass Filter",
                    "body": f"保留 {filter_params.get('low_hz')} 到 {filter_params.get('high_hz')} Hz 的频段，用于压制漂移和高频噪声。",
                },
                {
                    "node_id": "psd",
                    "title": "PSD Spectrum",
                    "body": "把时域波形映射到频域，便于比较 alpha 和 beta 能量分布。",
                },
                {
                    "node_id": "band-power",
                    "title": "Band Power",
                    "body": "按通道聚合 alpha/beta 功率，方便课堂对比不同脑区的节律强度。",
                },
                {
                    "node_id": "ai-report",
                    "title": "AI Experiment Report",
                    "body": "将信号摘要、频谱和限制说明汇总成教学解释，而不是医疗结论。",
                },
            ],
        }
```

- [ ] **Step 4: Run the backend test to verify it passes**

Run:

```bash
uv run --project backend pytest backend/app/tests/test_experiment_service.py::test_experiment_service_returns_pipeline_artifacts_and_node_explanations -q
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the richer synthetic artifact changes**

```bash
git add backend/app/services/experiment_adapters.py backend/app/services/experiment_service.py backend/app/tests/test_experiment_service.py
git commit -m "feat: enrich neurolab synthetic pipeline artifacts"
```

## Task 3: Backfill Template Pipeline Metadata For Existing Seeded Rows

**Files:**
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/tests/test_experiments_api.py`

- [ ] **Step 1: Write the failing API test for pipeline metadata backfill**

Append to `backend/app/tests/test_experiments_api.py`:

```python
import json

from app.models import ExperimentTemplate


def test_list_experiments_backfills_pipeline_metadata_for_existing_templates(client, app):
    with app.app_context():
        db.session.merge(
            ExperimentTemplate(
                id="exp-eeg-replay",
                title="EEG Replay Lab",
                experiment_type="eeg_replay",
                adapter="synthetic_eeg",
                summary="Legacy seeded template without pipeline metadata.",
                status="published",
                default_params_json=json.dumps(
                    {"duration_seconds": 4, "sample_rate": 128, "channels": 4},
                    ensure_ascii=False,
                ),
                linked_concept_ids_json="[]",
                estimated_minutes=30,
            )
        )
        db.session.commit()

    res = client.get("/api/v1/experiments")
    payload = res.get_json()
    eeg = next(item for item in payload["data"] if item["id"] == "exp-eeg-replay")

    assert eeg["default_params"]["pipeline"]["nodes"][0]["id"] == "source"
    assert eeg["default_params"]["node_params"]["filter"]["high_hz"] == 40
```

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```bash
uv run --project backend pytest backend/app/tests/test_experiments_api.py::test_list_experiments_backfills_pipeline_metadata_for_existing_templates -q
```

Expected: FAIL because the seeded template still serializes the old flat `default_params_json`.

- [ ] **Step 3: Upsert template defaults instead of only creating missing rows**

Update the EEG template definition in `backend/app/services/experiment_service.py`:

```python
DEFAULT_TEMPLATES = [
    {
        "id": "exp-eeg-replay",
        "title": "EEG Replay Lab",
        "experiment_type": "eeg_replay",
        "adapter": "synthetic_eeg",
        "summary": "使用合成 EEG 信号观察 alpha/beta 频段、滤波和通道功率变化。",
        "status": "published",
        "data_source": "synthetic",
        "difficulty": "intermediate",
        "estimated_minutes": 30,
        "default_params": {
            "pipeline": {
                "nodes": [
                    {"id": "source"},
                    {"id": "filter"},
                    {"id": "psd"},
                    {"id": "band-power"},
                    {"id": "ai-report"},
                ],
                "edges": [
                    ["source", "filter"],
                    ["filter", "psd"],
                    ["psd", "band-power"],
                    ["band-power", "ai-report"],
                ],
            },
            "node_params": {
                "source": {"duration_seconds": 4, "sample_rate": 128, "channels": 4},
                "filter": {"low_hz": 1, "high_hz": 40},
            },
        },
        "linked_concept_ids": ["concept-neural-networks"],
    },
```

Add an update helper and call it from `ensure_default_templates()`:

```python
def _json_dump(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


class ExperimentService:
    @staticmethod
    def _sync_template(existing: ExperimentTemplate, spec: dict) -> bool:
        next_defaults = _json_dump(spec["default_params"])
        next_concepts = _json_dump(spec["linked_concept_ids"])
        changed = False

        for attr in [
            "title",
            "experiment_type",
            "adapter",
            "summary",
            "status",
            "data_source",
            "difficulty",
            "estimated_minutes",
        ]:
            if getattr(existing, attr) != spec[attr]:
                setattr(existing, attr, spec[attr])
                changed = True

        if existing.default_params_json != next_defaults:
            existing.default_params_json = next_defaults
            changed = True
        if existing.linked_concept_ids_json != next_concepts:
            existing.linked_concept_ids_json = next_concepts
            changed = True

        return changed

    @staticmethod
    def ensure_default_templates(commit: bool = True) -> list[dict]:
        changed = False
        for spec in DEFAULT_TEMPLATES:
            existing = db.session.get(ExperimentTemplate, spec["id"])
            if existing:
                changed = ExperimentService._sync_template(existing, spec) or changed
                continue
            template = ExperimentTemplate(
                id=spec["id"],
                title=spec["title"],
                experiment_type=spec["experiment_type"],
                adapter=spec["adapter"],
                summary=spec["summary"],
                status=spec["status"],
                data_source=spec["data_source"],
                difficulty=spec["difficulty"],
                estimated_minutes=spec["estimated_minutes"],
                default_params_json=_json_dump(spec["default_params"]),
                linked_concept_ids_json=_json_dump(spec["linked_concept_ids"]),
            )
            db.session.add(template)
            changed = True
        if changed:
            if commit:
                db.session.commit()
            else:
                db.session.flush()
        return [
            ExperimentService.serialize_template(item)
            for item in ExperimentTemplate.query.order_by(ExperimentTemplate.created_at.asc()).all()
        ]
```

- [ ] **Step 4: Run the API test to verify it passes**

Run:

```bash
uv run --project backend pytest backend/app/tests/test_experiments_api.py::test_list_experiments_backfills_pipeline_metadata_for_existing_templates -q
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the template metadata backfill**

```bash
git add backend/app/services/experiment_service.py backend/app/tests/test_experiments_api.py
git commit -m "feat: seed neurolab templates with pipeline metadata"
```

## Task 4: Integrate Vue Flow And Build The Canvas + Inspector Layer

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/components/NeuroLabNode.vue`
- Create: `frontend/src/components/NeuroLabCanvas.vue`
- Create: `frontend/src/components/NeuroLabCanvas.test.js`
- Create: `frontend/src/components/NeuroLabInspector.vue`

- [ ] **Step 1: Write the failing canvas smoke test**

Create `frontend/src/components/NeuroLabCanvas.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    props: ['nodes', 'edges', 'nodeTypes'],
    emits: ['nodeClick'],
    template: `
      <div data-testid="vue-flow">
        <button data-testid="node-filter" @click="$emit('nodeClick', { node: nodes[1] })">
          {{ nodes[1].data.label }}
        </button>
        <slot />
      </div>
    `
  },
  Handle: { template: '<span class="handle"></span>' },
  Position: { Left: 'left', Right: 'right' }
}));

vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { template: '<div data-testid="mini-map"></div>' }
}));

import NeuroLabCanvas from './NeuroLabCanvas.vue';

describe('NeuroLabCanvas', () => {
  it('renders the fixed pipeline and emits node selection', async () => {
    const wrapper = mount(NeuroLabCanvas, {
      props: {
        workspace: {
          nodes: [
            { id: 'source', label: 'Synthetic EEG Source', type: 'data_source', status: 'ready' },
            { id: 'filter', label: 'Bandpass Filter', type: 'signal_processing', status: 'ready' }
          ],
          edges: [{ id: 'source-filter', source: 'source', target: 'filter' }]
        }
      }
    });

    expect(wrapper.text()).toContain('Bandpass Filter');
    await wrapper.get('[data-testid="node-filter"]').trigger('click');
    expect(wrapper.emitted('select-node')[0][0]).toBe('filter');
  });
});
```

- [ ] **Step 2: Run the canvas smoke test to verify it fails**

Run:

```bash
npm test -- src/components/NeuroLabCanvas.test.js
```

Expected: FAIL because `@vue/test-utils` or `./NeuroLabCanvas.vue` is missing.

- [ ] **Step 3: Install Vue Flow and implement the canvas wrapper and inspector**

Update `frontend/package.json`:

```json
{
  "dependencies": {
    "@vue-flow/core": "^1.48.2",
    "@vue-flow/minimap": "^1.5.4",
    "@vueuse/core": "^14.3.0",
    "axios": "^1.13.2",
    "d3": "^7.9.0",
    "echarts": "^6.0.0",
    "gsap": "^3.15.0",
    "pinia": "^2.3.1",
    "three": "^0.184.0",
    "vue": "^3.5.22",
    "vue-router": "^4.6.3"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.4",
    "@vue/test-utils": "^2.4.10",
    "vite": "^6.4.1",
    "vitest": "^2.1.9"
  }
}
```

Run:

```bash
npm install
```

Create `frontend/src/components/NeuroLabNode.vue`:

```vue
<script setup>
import { Handle, Position } from '@vue-flow/core';

defineProps({
  data: {
    type: Object,
    required: true
  }
});
</script>

<template>
  <div class="node-card" :data-status="data.status">
    <Handle type="target" :position="Position.Left" />
    <div class="node-header">
      <strong>{{ data.label }}</strong>
      <span class="node-status">{{ data.status }}</span>
    </div>
    <p class="node-kind">{{ data.type }}</p>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
```

Create `frontend/src/components/NeuroLabCanvas.vue`:

```vue
<script setup>
import { computed } from 'vue';
import { VueFlow } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import NeuroLabNode from './NeuroLabNode.vue';

const props = defineProps({
  workspace: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select-node']);

const nodeTypes = {
  experiment: NeuroLabNode
};

const flowNodes = computed(() => (
  props.workspace.nodes.map((node, index) => ({
    id: node.id,
    type: 'experiment',
    position: { x: 120 + index * 220, y: 120 },
    data: {
      label: node.label,
      status: node.status,
      type: node.type
    }
  }))
));

const flowEdges = computed(() => props.workspace.edges);

function handleNodeClick({ node }) {
  emit('select-node', node.id);
}
</script>

<template>
  <div class="lab-canvas">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      fit-view-on-init
      class="lab-canvas-surface"
      @node-click="handleNodeClick"
    >
      <MiniMap pannable zoomable />
    </VueFlow>
  </div>
</template>
```

Create `frontend/src/components/NeuroLabInspector.vue`:

```vue
<script setup>
const props = defineProps({
  node: {
    type: Object,
    default: null
  },
  params: {
    type: Object,
    default: () => ({})
  },
  explanation: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['patch-node']);

function updateField(key, rawValue) {
  const value = rawValue === '' ? rawValue : Number(rawValue);
  emit('patch-node', props.node.id, { [key]: Number.isNaN(value) ? rawValue : value });
}
</script>

<template>
  <aside class="lab-inspector">
    <template v-if="node">
      <header class="lab-inspector-header">
        <h3>{{ node.label }}</h3>
        <p>{{ node.type }}</p>
      </header>

      <div v-if="node.editable" class="lab-inspector-form">
        <label v-for="field in node.fields" :key="field.key">
          <span>{{ field.label }}</span>
          <select
            v-if="field.kind === 'select'"
            :value="params[field.key]"
            @change="updateField(field.key, $event.target.value)"
          >
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input
            v-else
            :value="params[field.key]"
            :min="field.min"
            :max="field.max"
            :step="field.step || 1"
            type="number"
            @input="updateField(field.key, $event.target.value)"
          >
        </label>
      </div>

      <p class="lab-inspector-explanation">{{ explanation || '运行实验后显示该节点的 AI 解释。' }}</p>
    </template>

    <p v-else class="lab-inspector-empty">请选择一个节点。</p>
  </aside>
</template>
```

- [ ] **Step 4: Run the canvas smoke test to verify it passes**

Run:

```bash
npm test -- src/components/NeuroLabCanvas.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the Vue Flow integration layer**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/NeuroLabNode.vue frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabCanvas.test.js frontend/src/components/NeuroLabInspector.vue
git commit -m "feat: add neurolab canvas and inspector components"
```

## Task 5: Add ECharts Instrument Panels

**Files:**
- Create: `frontend/src/components/NeuroLabChart.vue`
- Create: `frontend/src/components/NeuroLabInstruments.vue`
- Create: `frontend/src/components/NeuroLabInstruments.test.js`

- [ ] **Step 1: Write the failing instrument panel smoke test**

Create `frontend/src/components/NeuroLabInstruments.test.js`:

```js
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NeuroLabChart.vue', () => ({
  default: {
    props: ['option', 'height'],
    template: '<div data-testid="chart">{{ height }}</div>'
  }
}));

import NeuroLabInstruments from './NeuroLabInstruments.vue';

describe('NeuroLabInstruments', () => {
  it('switches between chart tabs and report content', async () => {
    const wrapper = mount(NeuroLabInstruments, {
      props: {
        model: {
          waveform: { option: { series: [{ data: [0.1, 0.2] }] } },
          spectrum: { option: { series: [{ data: [1.2, 3.6] }] } },
          bands: { option: { series: [{ data: [3.6] }, { data: [2.4] }] } },
          events: { rows: [{ label: 'Stimulus', start_ms: 1000, end_ms: 1500 }] },
          report: {
            sections: [{ title: '关键观察', body: 'Alpha remains dominant across channels.' }]
          }
        }
      }
    });

    expect(wrapper.text()).toContain('Alpha remains dominant across channels.');
    await wrapper.get('button[data-tab="events"]').trigger('click');
    expect(wrapper.text()).toContain('Stimulus');
  });
});
```

- [ ] **Step 2: Run the instrument panel smoke test to verify it fails**

Run:

```bash
npm test -- src/components/NeuroLabInstruments.test.js
```

Expected: FAIL with `Cannot find module './NeuroLabInstruments.vue'`.

- [ ] **Step 3: Implement the ECharts wrapper and instrument tabs**

Create `frontend/src/components/NeuroLabChart.vue`:

```vue
<script setup>
import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  option: {
    type: Object,
    default: () => ({})
  },
  height: {
    type: String,
    default: '240px'
  }
});

const root = ref(null);
let chart = null;

function render() {
  if (!root.value) return;
  if (!chart) {
    chart = echarts.init(root.value);
  }
  chart.setOption(props.option || {}, true);
  chart.resize();
}

onMounted(render);
watch(() => props.option, render, { deep: true });
onBeforeUnmount(() => {
  if (chart) chart.dispose();
});
</script>

<template>
  <div ref="root" class="chart-root" :style="{ height }" />
</template>
```

Create `frontend/src/components/NeuroLabInstruments.vue`:

```vue
<script setup>
import { computed, ref } from 'vue';
import NeuroLabChart from './NeuroLabChart.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  }
});

const activeTab = ref('report');

const tabs = [
  { id: 'waveform', label: '波形' },
  { id: 'spectrum', label: '频谱' },
  { id: 'bands', label: '频带' },
  { id: 'events', label: '事件' },
  { id: 'report', label: '报告' }
];

const reportSections = computed(() => props.model?.report?.sections || []);
const eventRows = computed(() => props.model?.events?.rows || []);
</script>

<template>
  <section class="lab-instruments">
    <div class="lab-instrument-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :data-tab="tab.id"
        type="button"
        :class="{ active: tab.id === activeTab }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'waveform'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.waveform?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'spectrum'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.spectrum?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'bands'" class="lab-instrument-panel">
      <NeuroLabChart :option="model.bands?.option" height="260px" />
    </div>
    <div v-else-if="activeTab === 'events'" class="lab-instrument-panel">
      <table v-if="eventRows.length">
        <thead>
          <tr><th>阶段</th><th>开始</th><th>结束</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in eventRows" :key="`${row.label}-${row.start_ms}`">
            <td>{{ row.label }}</td>
            <td>{{ row.start_ms }} ms</td>
            <td>{{ row.end_ms }} ms</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无事件数据。</p>
    </div>
    <div v-else class="lab-instrument-panel">
      <article v-for="section in reportSections" :key="section.title">
        <h4>{{ section.title }}</h4>
        <p>{{ section.body }}</p>
      </article>
      <p v-if="!reportSections.length">运行实验后显示实验报告。</p>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run the instrument panel smoke test to verify it passes**

Run:

```bash
npm test -- src/components/NeuroLabInstruments.test.js
```

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the instrument panel**

```bash
git add frontend/src/components/NeuroLabChart.vue frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabInstruments.test.js
git commit -m "feat: add neurolab instrument panels"
```

## Task 6: Rebuild LabView As The NeuroLab Workbench

**Files:**
- Create: `frontend/src/views/LabView.test.js`
- Modify: `frontend/src/views/LabView.vue`
- Modify: `frontend/src/api/experiments.test.js`

- [ ] **Step 1: Write the failing LabView integration smoke test**

Create `frontend/src/views/LabView.test.js`:

```js
// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/experiments', () => ({
  listExperiments: vi.fn(() => Promise.resolve({
    data: {
      data: [
        {
          id: 'exp-eeg-replay',
          title: 'EEG Replay Lab',
          experiment_type: 'eeg_replay',
          summary: 'Synthetic EEG pipeline.',
          status: 'published',
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
        }
      ]
    }
  })),
  runExperiment: vi.fn(() => Promise.resolve({
    data: {
      data: {
        status: 'completed',
        artifacts: [
          {
            data: {
              signal_preview: [[0.1, 0.2]],
              psd: [{ channel: 'CH1', frequencies: [4, 8], values: [1.2, 3.6] }],
              channel_power: [{ channel: 'CH1', alpha: 3.6, beta: 2.4 }],
              events: [{ label: 'Stimulus', start_ms: 500, end_ms: 1500 }],
              pipeline_trace: [
                { node_id: 'source', status: 'completed' },
                { node_id: 'filter', status: 'completed' },
                { node_id: 'psd', status: 'completed' },
                { node_id: 'band-power', status: 'completed' },
                { node_id: 'ai-report', status: 'completed' }
              ]
            }
          }
        ],
        report: {
          content: {
            node_explanations: [],
            observations: ['Alpha remains dominant.'],
            limitations: 'Synthetic data only.',
            next_steps: 'Adjust sample rate.'
          }
        }
      }
    }
  }))
}));

vi.mock('../components/NeuroLabCanvas.vue', () => ({
  default: { props: ['workspace'], template: '<div data-testid="canvas"></div>' }
}));

vi.mock('../components/NeuroLabInspector.vue', () => ({
  default: { props: ['node', 'params', 'explanation'], template: '<div data-testid="inspector"></div>' }
}));

vi.mock('../components/NeuroLabInstruments.vue', () => ({
  default: { props: ['model'], template: '<div data-testid="instruments"></div>' }
}));

import LabView from './LabView.vue';
import { listExperiments, runExperiment } from '../api/experiments';

describe('LabView', () => {
  it('loads the pipeline template and sends node-scoped params on run', async () => {
    const wrapper = mount(LabView);
    await flushPromises();

    expect(listExperiments).toHaveBeenCalled();
    expect(wrapper.text()).toContain('EEG Replay Lab');

    await wrapper.get('button.lab-run-action').trigger('click');

    expect(runExperiment).toHaveBeenCalledWith('exp-eeg-replay', {
      params: {
        source: { duration_seconds: 4, sample_rate: 128, channels: 4 },
        filter: { low_hz: 1, high_hz: 40 }
      }
    });
  });
});
```

- [ ] **Step 2: Run the LabView test to verify it fails**

Run:

```bash
npm test -- src/views/LabView.test.js
```

Expected: FAIL because the current `LabView.vue` still renders the older form page and does not emit node-scoped params.

- [ ] **Step 3: Rebuild `LabView.vue` around the new state and components**

Update `frontend/src/views/LabView.vue`:

```vue
<script setup>
import { computed, onMounted, ref } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import NeuroLabCanvas from '../components/NeuroLabCanvas.vue';
import NeuroLabInspector from '../components/NeuroLabInspector.vue';
import NeuroLabInstruments from '../components/NeuroLabInstruments.vue';
import { templateStatusLabel } from './labViewState';
import {
  applyRunToWorkspace,
  buildInstrumentModel,
  buildWorkspaceFromTemplate,
  patchNodeParams,
  selectedNodeInspector
} from './neuroLabPipelineState';

const templates = ref([]);
const selectedExperimentId = ref('');
const workspace = ref(null);
const selectedRun = ref(null);
const isLoading = ref(false);
const isRunning = ref(false);
const errorMessage = ref('');

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const instruments = computed(() => buildInstrumentModel(selectedRun.value));
const inspector = computed(() => selectedNodeInspector(workspace.value, selectedRun.value));

function unwrapResponse(response, fallback) {
  return response?.data?.data ?? response?.data ?? response ?? fallback;
}

function selectExperiment(template) {
  selectedExperimentId.value = template.id;
  selectedRun.value = null;
  workspace.value = buildWorkspaceFromTemplate(template);
}

function selectNode(nodeId) {
  workspace.value = workspace.value ? { ...workspace.value, selectedNodeId: nodeId } : workspace.value;
}

function patchNode(nodeId, patch) {
  workspace.value = patchNodeParams(workspace.value, nodeId, patch);
}

async function loadExperiments() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await listExperiments();
    templates.value = unwrapResponse(response, []);
    if (templates.value.length > 0) {
      selectExperiment(templates.value[0]);
    }
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验模板加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function startRun() {
  if (!selectedExperiment.value || !workspace.value) return;
  isRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await runExperiment(selectedExperiment.value.id, {
      params: workspace.value.nodeParams
    });
    selectedRun.value = unwrapResponse(response, null);
    workspace.value = applyRunToWorkspace(workspace.value, selectedRun.value);
  } catch (error) {
    errorMessage.value = error?.response?.data?.error || error?.message || '实验运行失败';
  } finally {
    isRunning.value = false;
  }
}

onMounted(loadExperiments);
</script>

<template>
  <section class="lab-workbench">
    <header class="lab-workbench-header">
      <div>
        <p class="eyebrow">EDUFISH NeuroLab</p>
        <h1>脑机实验工作台</h1>
        <p>固定 EEG pipeline、节点参数检查、仪器图和 AI 实验解释在同一页完成。</p>
      </div>
      <button
        class="btn btn-primary lab-run-action"
        type="button"
        :disabled="isRunning || !selectedExperiment || selectedExperiment.status !== 'published'"
        @click="startRun"
      >
        {{ isRunning ? '运行中...' : 'Run Pipeline' }}
      </button>
    </header>

    <p v-if="errorMessage" class="lab-error">{{ errorMessage }}</p>

    <div class="lab-workbench-grid">
      <aside class="lab-template-list" aria-label="实验模板">
        <p v-if="isLoading" class="lab-empty">正在加载实验模板...</p>
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="lab-template-button"
          :class="{ active: template.id === selectedExperimentId }"
          @click="selectExperiment(template)"
        >
          <span>{{ template.title }}</span>
          <small>{{ templateStatusLabel(template.status) }} · {{ template.data_source }}</small>
        </button>
      </aside>

      <main class="lab-canvas-panel">
        <div class="lab-canvas-head">
          <h2>{{ selectedExperiment?.title || '请选择实验模板' }}</h2>
          <p>{{ selectedExperiment?.summary || '暂无实验摘要。' }}</p>
        </div>
        <NeuroLabCanvas v-if="workspace" :workspace="workspace" @select-node="selectNode" />
      </main>

      <NeuroLabInspector
        :node="inspector.node"
        :params="inspector.params"
        :explanation="inspector.explanation"
        @patch-node="patchNode"
      />
    </div>

    <NeuroLabInstruments :model="instruments" />
  </section>
</template>
```

Update `frontend/src/api/experiments.test.js`:

```js
  it('runs an experiment with node-scoped params', async () => {
    await runExperiment('exp-eeg-replay', {
      params: {
        source: { sample_rate: 64, channels: 2, duration_seconds: 2 },
        filter: { low_hz: 1, high_hz: 32 }
      }
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/experiments/exp-eeg-replay/runs', {
      params: {
        source: { sample_rate: 64, channels: 2, duration_seconds: 2 },
        filter: { low_hz: 1, high_hz: 32 }
      }
    });
  });
```

- [ ] **Step 4: Run the LabView and API tests to verify they pass**

Run:

```bash
npm test -- src/views/LabView.test.js src/api/experiments.test.js src/views/neuroLabPipelineState.test.js src/components/NeuroLabCanvas.test.js src/components/NeuroLabInstruments.test.js
```

Expected: PASS with all listed tests green.

- [ ] **Step 5: Commit the workbench page integration**

```bash
git add frontend/src/views/LabView.vue frontend/src/views/LabView.test.js frontend/src/api/experiments.test.js
git commit -m "feat: rebuild lab view as neurolab workbench"
```

## Task 7: Run Full Verification And Prepare The Branch

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run the focused frontend suite**

Run:

```bash
npm test -- src/views/neuroLabPipelineState.test.js src/components/NeuroLabCanvas.test.js src/components/NeuroLabInstruments.test.js src/views/LabView.test.js src/api/experiments.test.js src/router/index.test.js
```

Expected: PASS with all tests green.

- [ ] **Step 2: Run the focused backend suite**

Run:

```bash
uv run --project backend pytest backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py -q
```

Expected: PASS with all experiment tests green.

- [ ] **Step 3: Run the production frontend build**

Run:

```bash
npm run build
```

Expected: PASS. Existing third-party warnings from `@vueuse/core` or bundle-size warnings are acceptable if no new build errors are introduced.

- [ ] **Step 4: Start the app and perform the browser checklist**

Run:

```bash
setsid -f sh -c 'backend/.venv/bin/flask --app backend/run.py run --host 0.0.0.0 --port 5001 --no-debugger --no-reload </dev/null >/tmp/edufish-backend.log 2>&1'
setsid -f sh -c 'npm run dev -- --host 0.0.0.0 --port 3025 </dev/null >/tmp/edufish-frontend.log 2>&1'
```

Check in the browser:

```text
1. Login as a student and open http://localhost:3025/lab
2. Confirm the template list, pipeline canvas, inspector, and instruments all render
3. Click Run Pipeline and confirm node statuses switch to completed
4. Confirm waveform, spectrum, bands, events, and report tabs all show data
5. Confirm there are no console errors and /api/v1/progress/students/user-student-default increments ran_lab
```

- [ ] **Step 5: Commit only the workbench files**

```bash
git add backend/app/services/experiment_adapters.py backend/app/services/experiment_service.py backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py frontend/package.json frontend/package-lock.json frontend/src/views/neuroLabPipelineState.js frontend/src/views/neuroLabPipelineState.test.js frontend/src/components/NeuroLabNode.vue frontend/src/components/NeuroLabCanvas.vue frontend/src/components/NeuroLabCanvas.test.js frontend/src/components/NeuroLabInspector.vue frontend/src/components/NeuroLabChart.vue frontend/src/components/NeuroLabInstruments.vue frontend/src/components/NeuroLabInstruments.test.js frontend/src/views/LabView.vue frontend/src/views/LabView.test.js frontend/src/api/experiments.test.js docs/superpowers/specs/2026-05-10-edufish-neurolab-2-workbench-design.md docs/superpowers/plans/2026-05-10-edufish-neurolab-2-workbench.md
git commit -m "feat: upgrade neurolab into pipeline workbench"
```
