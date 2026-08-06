# EDUFISH NeuroLab 2.0 实验画布与仪器工作台设计

> Date: 2026-05-10
> Scope: 将 `/lab` 从参数表单式 MVP 升级为节点式实验平台
> Status: approved for planning

---

## 1. Goal

当前 NeuroLab MVP 已经能运行 synthetic EEG 实验、生成 artifact/report、记录 `ran_lab` 进度，但体验仍然像“选择参数然后看结果”。这不足以表达脑机/神经科学实验平台的质感。

NeuroLab 2.0 的目标是把 `/lab` 升级为 **实验流程画布 + 仪器面板 + AI 实验解释**：

1. 学生不再只填参数，而是在节点画布中看到实验 pipeline。
2. 每个节点代表真实实验步骤：数据源、滤波、特征提取、频域分析、分类、可视化、AI 报告。
3. 下方仪器面板显示多通道 EEG、PSD、band power、事件时间轴、实验报告。
4. 直接借用成熟开源组件，而不是手写所有交互。
5. 保留现有后端 `ExperimentTemplate / ExperimentRun / ExperimentArtifact / ExperimentReport`，只扩展 template config 和 artifact 类型。

### 1.1 Integration-First Guardrails

NeuroLab 2.0 的首要原则不是“把所有实验体验自己重写一遍”，而是把 EDUFISH 做成一个统一的实验工作台，把成熟开源项目接进来：

1. 画布交互优先接入 `Vue Flow`，不自研节点编辑器。
2. 图表仪器优先接入 `Apache ECharts`，不自研 waveform/spectrum 渲染框架。
3. 认知实验优先预留 `jsPsych` 接口，不自研 stimulus/response runtime。
4. EEG/BCI 数据层优先复用 `BrainFlow`、后续接 `LSL/Timeflux`，不自研底层设备协议。
5. EDUFISH 自己负责的是课程上下文、登录权限、实验模板、运行记录、AI 解释、进度记录和统一 UI 编排。
6. `Carboncopies / BrainGenix`、`BCI2000`、`OpenViBE` 这类系统在首版里只作为后续 adapter 目标或交互借鉴对象，不作为整页直接嵌入的主前端。

---

## 2. Context Findings

### 2.1 当前项目基础

当前代码已具备：

1. Vue 3 + Vite + Pinia + Vue Router。
2. D3 与 Three.js 已存在，可继续用于图和 3D。
3. `/lab` 已注册为登录后可访问 route。
4. 后端已实现实验 template/run/artifact/report。
5. 后端 run API 已绑定登录学生，能记录 `ran_lab`。

当前缺口：

1. 没有节点式实验流程编辑器。
2. 没有专业时序信号图组件。
3. 没有实验协议阶段：baseline、stimulus、task、rest、analysis。
4. 没有真实认知实验组件，如反应时、刺激呈现、按键采集。
5. 没有脑影像/虚拟脑 viewer。

### 2.2 开源组件调研结论

**Carboncopies / BrainGenix**

适合作为长期的虚拟脑仿真和数据源，不适合作为可直接嵌入 Vue 的完整实验 UI。BrainGenix-NES 更像神经仿真/虚拟扫描后端，后续可以作为 adapter 节点。

**OpenViBE / BCI2000**

成熟但偏桌面研究软件。OpenViBE 的 designer 思路非常适合借鉴：用节点和 box 组成 BCI pipeline。但它不是 Web 组件，不适合直接嵌入 EDUFISH。

**BrainFlow**

适合继续作为 EEG/BCI 数据接入层。支持 synthetic、playback、硬件 board。NeuroLab 2.0 里它应成为 `DataSource` 节点的后端 adapter。

**Timeflux / LSL**

适合未来做实时信号流和设备同步。首版不直接引入实时流服务，但画布数据模型要留出 stream adapter。

**jsPsych**

非常适合直接作为浏览器实验组件，支持刺激呈现、反应时、键盘响应、实验 timeline。它应该成为 NeuroLab 2.0 的 `Cognitive Task` 节点来源。

**Vue Flow / Rete.js**

两者都能做节点画布。Vue Flow 更贴合当前 Vue 3 项目，首版优先用 Vue Flow。Rete.js 更适合复杂 visual programming，但引入成本更高。

**uPlot / Apache ECharts**

uPlot 适合高性能多通道时序信号；ECharts 适合仪表、柱状、热图、频谱和交互图。首版可以用 ECharts 更快完成丰富仪器面板；后续如果数据量增长，再把多通道 waveform 换成 uPlot。

**NiiVue / Neuroglancer**

NiiVue 适合嵌入 Web 做 MRI/NIfTI/体数据查看；Neuroglancer 适合大型 connectomics 和 mesh/skeleton。首版只保留 viewer slot，不强行引入大数据 viewer。

---

## 3. Approaches Considered

### 3.1 Approach A: 继续增强参数面板

在当前 `/lab` 上加更多参数、图表和解释。

优点：

1. 改动最小。
2. 不需要新增节点库依赖。
3. 容易保持当前测试稳定。

缺点：

1. 仍然像工具表单，不像实验平台。
2. 很难表达实验流程。
3. 用户无法理解数据如何从源头变成报告。

### 3.2 Approach B: 节点画布 + 仪器面板

引入 Vue Flow，使用节点表达实验 pipeline；下方或右侧展示仪器面板。

优点：

1. 质感最接近真实实验平台。
2. 可以直接借鉴 OpenViBE 的 pipeline 设计。
3. 能把 BrainFlow、jsPsych、MNE、AI Report 都抽象成节点。
4. 能渐进接入更多开源项目。

缺点：

1. 需要新增前端依赖。
2. 需要建立 pipeline schema。
3. UI 信息密度更高，必须控制首版节点数量。

### 3.3 Approach C: 嵌入外部平台

直接嵌入 Node-RED、OpenViBE 或其它系统作为实验平台。

优点：

1. 外部能力丰富。
2. 开发初期看起来快。

缺点：

1. 产品风格割裂。
2. 权限、数据、报告、课程图谱难以统一。
3. 很容易变成“EDUFISH 里挂了一个别人的系统”。

### 3.4 Recommendation

采用 **Approach B: 节点画布 + 仪器面板**。

这条路线既能直接使用开源组件，又能保持 EDUFISH 的课程、AI、报告、进度系统统一。

其中的工程边界要明确：

1. 优先集成成熟组件，不为“实验平台质感”重复造轮子。
2. 首版只整合能稳定嵌入当前 Vue/Flask 架构的项目。
3. 对桌面型 BCI 软件，优先借鉴其 pipeline 结构和协议，而不是强行 iframe 或做脆弱嵌入。

---

## 4. Product Design

### 4.1 Page Layout

`/lab` 改为四区工作台：

1. 左侧模板/节点导览栏
   - 首版以实验模板列表为主
   - 预留 Data Source / Signal Processing / Feature Extraction / Cognitive Task / Visualization / AI Report 分组位
2. 中央实验流程画布
   - 节点可视化连接
   - 默认加载 EEG Replay pipeline
   - 节点状态：ready、running、completed、error
3. 右侧 Inspector
   - 当前节点参数
   - AI 对该节点的解释
   - 输入/输出 artifact 摘要
4. 底部 Instrument Panel
   - EEG waveform
   - PSD spectrum
   - Band power
   - Event timeline
   - Report

### 4.2 First Default Pipeline

首个 pipeline 固定为：

1. `Synthetic EEG Source`
2. `Bandpass Filter`
3. `PSD Spectrum`
4. `Band Power`
5. `AI Experiment Report`

节点连接顺序固定，但用户可以点击节点调整参数。首版不要求自由拖拽新增节点执行任意图，只先提供可视化 pipeline 和节点参数编辑。

### 4.3 Interaction Model

用户流程：

1. 进入 `/lab`。
2. 选择 `EEG Replay Lab`。
3. 看到默认 pipeline。
4. 点击 `Synthetic EEG Source` 设置时长、采样率、通道数。
5. 点击 `Bandpass Filter` 设置低/高截止频率。
6. 点击 `Run Pipeline`。
7. 节点依次变为 running/completed。
8. 底部仪器面板同步更新。
9. AI Report 节点生成实验解释和限制说明。

### 4.4 Visual Tone

界面应像“教学实验室工作台”，不是营销页：

1. 信息密度高但清楚。
2. 节点和仪器面板应稳定，不随内容跳动。
3. 少用大面积卡片堆叠。
4. 主色保持 EDUFISH 现有风格，避免重新换一套视觉系统。
5. 节点状态用清晰符号和颜色：ready、running、completed、error。

---

## 5. Open-Source Components To Use

### 5.1 Vue Flow

用途：

1. 实验流程画布。
2. 节点拖拽、连线、缩放、mini map。
3. 自定义节点 UI。

首版只使用固定 pipeline，不实现自由增删节点执行图，避免范围失控。

接入形式：

1. 前端直接安装 `@vue-flow/core`。
2. 只使用其画布、节点、边、缩放和 minimap 等成熟能力。
3. EDUFISH 只维护节点 schema、参数映射和运行状态，不改造 Vue Flow 内核。

### 5.2 Apache ECharts

用途：

1. 多通道 EEG waveform。
2. PSD spectrum。
3. Band power bar chart。
4. Event timeline。

ECharts 的优势是单库覆盖多种教学可视化，适合首版快速提升质感。

接入形式：

1. 前端直接安装 `echarts`。
2. 用同一图库完成 waveform、PSD、band power、timeline，减少多图库维护成本。
3. 若后续多通道实时波形性能不够，再按需替换单一面板为 `uPlot`，而不是一开始并行引入两套图表栈。

### 5.3 jsPsych

用途：

1. 后续认知实验节点。
2. Stroop、反应时、视觉刺激、按键任务。
3. 与 EEG/BCI pipeline 的事件 marker 对齐。

NeuroLab 2.0 首批代码可以先预留 `cognitive_task` 节点 schema，不一定立即运行 jsPsych 实验。

接入形式：

1. 首版先定义节点类型和适配层，不立刻实现完整实验运行时。
2. 第二阶段优先接入 `Stroop`、`Oddball`、`Reaction Time` 这类成熟范式，而不是自写浏览器刺激框架。

### 5.4 BrainFlow

用途：

1. `Synthetic EEG Source` 后端 adapter。
2. 后续接 playback file board 和真实硬件 board。

现有 synthetic adapter 可以保留，但 pipeline schema 应显式表达它是 data source 节点。

接入形式：

1. 首版继续沿用当前 deterministic synthetic EEG adapter，保持测试稳定。
2. 第二阶段新增 `playback_file` / `live_board` adapter，对接 BrainFlow 的 playback 和硬件 board。
3. EDUFISH 不自己实现 board SDK 兼容层，统一从 BrainFlow 抽象进入。

### 5.5 NiiVue / Neuroglancer

用途：

1. 后续虚拟脑 viewer。
2. 接 BrainGenix-NES 或公开脑影像数据。

首版只保留 `Brain Viewer` panel slot，不立即接大型影像数据。

### 5.6 OpenViBE / BCI2000 / Timeflux / LSL

用途：

1. 作为后续实时脑机实验和设备同步方向的成熟生态。
2. 为 pipeline 节点类型、流式数据语义和实验协议提供参照。

接入边界：

1. `OpenViBE`、`BCI2000` 主要借鉴其模块化实验流程，不作为首版 Web UI 直接嵌入物。
2. `LSL`、`Timeflux` 适合作为第二阶段实时流桥接服务。
3. 若要接真实脑机设备，优先通过 `BrainFlow/LSL` 进入 EDUFISH，而不是让浏览器直连设备。

---

## 6. Architecture

### 6.1 Frontend Modules

新增：

1. `frontend/src/views/neuroLabPipelineState.js`
   - pipeline schema
   - node status update
   - selected node inspector data
   - artifact to chart data transform
2. `frontend/src/components/NeuroLabCanvas.vue`
   - Vue Flow wrapper
   - custom experiment nodes
3. `frontend/src/components/NeuroLabInspector.vue`
   - node parameters
   - AI explanation
4. `frontend/src/components/NeuroLabInstruments.vue`
   - ECharts waveform/PSD/band power/timeline
5. `frontend/src/components/NeuroLabNode.vue`
   - custom node rendering

改造：

1. `frontend/src/views/LabView.vue`
   - 从单面板参数页升级为工作台布局。
   - 继续使用现有 `listExperiments` / `runExperiment` API。

### 6.2 Backend Extensions

后端保留当前 API，扩展 artifact payload：

1. `pipeline`
   - nodes
   - edges
   - selected node params
2. `artifacts`
   - `signal_preview`
   - `channel_power`
   - `psd`
   - `events`
   - `pipeline_trace`
3. `report`
   - 增加 per-node explanation。

首版不需要新增表。`ExperimentTemplate.default_params_json` 可以存 pipeline template；`ExperimentRun.params_json` 可以存 pipeline run params；`ExperimentArtifact.data_json` 可以存仪器数据。

### 6.3 Pipeline Schema

首版 pipeline schema：

```json
{
  "nodes": [
    {
      "id": "source",
      "type": "data_source",
      "label": "Synthetic EEG Source",
      "adapter": "synthetic_eeg",
      "params": {
        "duration_seconds": 4,
        "sample_rate": 128,
        "channels": 4
      }
    },
    {
      "id": "filter",
      "type": "signal_processing",
      "label": "Bandpass Filter",
      "params": {
        "low_hz": 1,
        "high_hz": 40
      }
    },
    {
      "id": "psd",
      "type": "analysis",
      "label": "PSD Spectrum"
    },
    {
      "id": "band-power",
      "type": "feature",
      "label": "Band Power"
    },
    {
      "id": "ai-report",
      "type": "report",
      "label": "AI Experiment Report"
    }
  ],
  "edges": [
    ["source", "filter"],
    ["filter", "psd"],
    ["psd", "band-power"],
    ["band-power", "ai-report"]
  ]
}
```

---

## 7. MVP Scope For NeuroLab 2.0

### Included

1. Install and use Vue Flow.
2. Install and use Apache ECharts.
3. Build fixed EEG Replay pipeline canvas.
4. Add node selection and inspector.
5. Add instrument tabs:
   - Waveform
   - Spectrum
   - Bands
   - Events
   - Report
6. Extend backend synthetic adapter output to include basic PSD-like data and event markers.
7. Keep auth/progress behavior from MVP.
8. Add tests for pipeline schema and chart data transforms.

### Deferred

1. Free-form arbitrary node graph execution.
2. Real BrainFlow hardware board.
3. Timeflux/LSL realtime streaming.
4. BrainGenix-NES deployment.
5. Neuroglancer/NiiVue data viewer.
6. jsPsych task execution.

Deferred items remain visible as disabled future nodes, not implemented behavior.

---

## 8. Data Flow

1. Frontend loads experiment templates.
2. Template includes pipeline definition.
3. User selects a node and edits parameters.
4. Frontend submits node-scoped `params` to `runExperiment`.
5. Backend adapter runs deterministic synthetic EEG pipeline.
6. Backend returns artifacts:
   - signal preview
   - channel power
   - psd spectrum
   - event markers
   - pipeline trace
7. Frontend maps artifacts into ECharts datasets.
8. AI report panel shows report and per-node explanations.
9. Backend records `ran_lab`.

---

## 9. Error Handling

1. Missing template: existing 404 behavior remains.
2. Unauthenticated run: existing 401 behavior remains.
3. Invalid pipeline params: backend returns 400 with node id and field name.
4. Unsupported node type: backend returns 400; frontend marks node error.
5. Chart render failure: instrument panel shows textual fallback and preserves report.
6. Dependency load failure: page shows `实验画布组件加载失败` instead of blank page.

---

## 10. Testing Strategy

Frontend:

1. Unit tests for pipeline schema.
2. Unit tests for selected node inspector.
3. Unit tests for artifact-to-chart transforms.
4. Component smoke test for LabView imports and default render.
5. Browser check for `/lab`:
   - templates visible
   - pipeline nodes visible
   - run button works
   - waveform chart appears
   - report appears

Backend:

1. Existing experiment service/API tests remain.
2. Add tests for PSD/event artifact fields.
3. Add tests for invalid pipeline params.
4. Keep auth tests for anonymous/spoofed student run creation.

Build:

1. `npm test -- neuroLabPipelineState`.
2. `npm test -- src/api/experiments.test.js src/views/labViewState.test.js src/router/index.test.js`.
3. `npm run build`.
4. `uv run --project backend pytest backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py -q`.

---

## 11. First Implementation Recommendation

第一轮只做一个强视觉、真实可运行的切片：

1. 新增 Vue Flow 画布。
2. 新增 ECharts 仪器面板。
3. 后端 artifact 增加 `psd` 和 `events`。
4. `/lab` 默认展示 EEG Replay pipeline。
5. 点击 Run 后节点状态依次更新，仪器面板和报告同步更新。

这会直接解决“太简陋，只能在框里选参数”的问题，同时不把系统一次性拉进实时硬件和大型虚拟脑部署。

---

## 12. References

1. Vue Flow: https://vueflow.dev/
2. Rete.js: https://retejs.org/
3. Apache ECharts: https://echarts.apache.org/
4. jsPsych: https://www.jspsych.org/
5. BrainFlow: https://brainflow.readthedocs.io/en/stable/
6. MNE-Python: https://mne.tools/stable/
7. Lab Streaming Layer: https://labstreaminglayer.org/
8. Timeflux: https://timeflux.io/
9. NiiVue: https://niivue.com/docs/
10. Neuroglancer: https://github.com/google/neuroglancer
11. BCI2000: https://www.bci2000.org/mediawiki/index.php/Main_Page
12. OpenViBE docs from OpenBCI: https://docs.openbci.com/Software/CompatibleThirdPartySoftware/OpenVibe/
