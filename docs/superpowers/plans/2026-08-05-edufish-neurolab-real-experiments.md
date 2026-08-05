# EDUFISH NeuroLab 真实实验扩展计划（Spike Lab → 探究查询 → ML 训练台）

> Date: 2026-08-05
> Branch: `feature/edufish-verticalization`
> Status: approved for execution
> For agentic workers: 每个 Phase 内部按 Task 分步执行，Task 用 checkbox（`- [ ]`）跟踪；每个 Phase 结束跑一次全量测试再进入下一 Phase。

## 背景与动机

当前 `/lab` 已完成 NiiVue 研究画布与结果坞（results dock），但只有 `exp-eeg-replay`（合成 EEG + 真 DSP）一个可运行实验；`exp-neuron-spike` 模板已定义但 `status=coming_soon` 且适配器未实现。整站缺少"查询→探究→实验→报告"的闭环，也缺少 AI 导论课本身的动手实验（当前是"用 AI 讲脑电"，没有"动手玩 AI"）。

本计划按投入产出比拆成四个 Phase：

- **Phase A（本次执行）：Neuron Spike Lab** —— 补齐已占坑的神经元仿真适配器，让第一个"真计算"实验可运行。
- **Phase B：探究查询闭环** —— 概念 → 实验的检索接口 + Lab 页探究入口。
- **Phase C：ML 训练台** —— 感知机/线性模型训练实验，AI 导论课的动手核心。
- **Phase D（里程碑，仅规划）：真实 EEG 数据集 + 多智能体实验助教** —— 后续单独计划。

---

## Phase A: Neuron Spike Lab（神经元仿真实验）

### 目标

把 `exp-neuron-spike` 从 `coming_soon` 变成可运行实验：学生调节刺激强度（stimulus current），观察 LIF 神经元膜电位轨迹与放电频率（firing rate），理解阈值、不应期与频率编码。

### 约束与边界

1. 复用现有 `ExperimentAdapter` 协议（validate_params / run / summarize_artifacts），不加新服务。
2. 复用现有 run/artifact/report 存储链路，不改 DB schema。
3. 仿真用 scipy/numpy 数值积分（显式 Euler，dt=0.1ms），确定性种子，可复现。
4. 前端复用 Scrubber 回放骨架；新增 spike raster 渲染（ECharts）。
5. 不改脑区/connectome 层（NiiVue 画布仍承载 EEG 实验结果；神经元实验以结果坞为主）。

### Task A1: 后端 `neuron_simulator` 适配器

- [x] 在 `backend/app/services/experiment_adapters.py` 新增 `NeuronSimulatorAdapter`：
  - `validate_params`: `stimulus_current`（0.5–20 nA，step 0.5）、`duration_ms`（50–500）、`reset_voltage`（-70 mV）、`threshold`（-55 mV）等
  - `run`: LIF 常微分方程 `C dV/dt = -gL(V - EL) + I(t)`，显式 Euler 积分；输出：
    - `membrane_potential`: `{ t_ms: [], v_mv: [] }`
    - `spike_times`: `[ms, ...]`
    - `firing_rate`: Hz
    - `raster`: 单一神经元的 spike 时间点（供前端 raster 图）
    - `pipeline_trace`: `stimulus → integrate → detect-spikes → firing-rate → ai-report`
  - `summarize_artifacts`: `total_spikes`、`firing_rate`、`mean_potential`、`threshold_reached`
- [x] 注册进 `ADAPTERS` 字典：`"neuron_simulator": NeuronSimulatorAdapter()`

### Task A2: 模板转 published

- [x] `backend/app/services/experiment_service.py` 的 `DEFAULT_TEMPLATES` 中把 `exp-neuron-spike`：
  - `status` 改为 `"published"`
  - `summary` 更新为可运行描述
  - `default_params` 改为 `{ "pipeline": {nodes/edges for neuron lab}, "node_params": {"source": {...}} }` 形式（与 eeg-replay 对齐，前端 `buildWorkspaceFromTemplate` 直接吃）
  - `adapter` 改为 `"neuron_simulator"`
  - `linked_concept_ids` 保持 `concept-neural-networks`
- [x] `_build_report_content` 增加对 neuron 模板的 report 分支（node_explanations 按 neuron pipeline 生成）

### Task A3: 后端测试

- [x] 新增 `backend/app/tests/test_neuron_adapter.py`：
  - 参数校验（越界报错）
  - 低电流 → 0 spike；高电流 → spikes 增加
  - 确定性（同参数两次 run 结果一致）
  - summarize 字段存在
- [x] `backend/app/tests/test_experiments_api.py` 追加：
  - `exp-neuron-spike` 出现在列表且 status=published
  - 能创建 run 并返回 artifacts（membrane_potential / spike_times / firing_rate）
- [x] 运行 `cd backend && uv run pytest` 通过

### Task A4: 前端 pipeline state 支持神经元模板

- [x] `frontend/src/views/neuroLabPipelineState.js`：
  - `PIPELINE_NODES` 增加 neuron 模板的节点元数据（`stimulus`、`integrate`、`detect-spikes`、`firing-rate`、`ai-report`）——通过 template 的 `default_params.pipeline.nodes` 驱动，不在固定列表里硬编码
  - `templateNodeParams` 泛化：直接以 template 的 `node_params` 为准（含 stimulus_current / duration_ms）
  - `buildInstrumentModel` 增加 `neuron` 分支：从 artifact 提取 `membrane_potential` 时间序列 option、`spike_times` raster option、`firing_rate` 指标
  - `buildCanvasModel` 在 neuron 模板下退化为波形床渲染膜电位（不依赖脑区 alpha/beta，防止 NaN）
- [x] `frontend/src/views/neuroLabPipelineState.test.js` 补测试

### Task A5: 前端 UI 渲染

- [x] `frontend/src/components/NeuroLabResultsDock.vue`：新增 `neuron` tab（或复用 overview）渲染：
  - 膜电位波形（ECharts line，阈值线标注）
  - spike raster（ECharts scatter / custom 竖线）
  - 指标卡：total spikes / firing rate
- [x] `frontend/src/components/NeuroLabResultsDock.test.js` 补测试
- [x] Lab 页选中 neuron 实验时模板下拉可见、可运行

### Task A6: Phase A 验证

- [x] `npm run test:backend` 与 `npm run test:frontend` 全绿
- [x] 生产构建通过（`npm run build`）
- [x] 浏览器验证：切换模板 → 调刺激强度 → 运行 → 结果坞出现膜电位 + raster + 指标
- [x] 提交（`feat(neurolab): neuron spike lab real simulation`）

---

## Phase B: 探究查询闭环（概念 → 实验检索）

### 目标

学生在 Lab 页输入自然语言问题（如"alpha 波和注意力有什么关系"），系统返回：相关概念卡 → 关联实验 → 一键运行。

### Task B1: 后端查询接口

- [x] `GET /api/experiments/explore?q=`（注意路由顺序，避免与 `<experiment_id>` 冲突）：
  - 对 `q` 做小写分词，与模板 `title/summary/linked_concept` 名称做关键词/包含匹配评分
  - 返回 `[{template, score, matched_concepts}]` 排序结果
  - 无匹配时返回空数组（200），不报错
- [x] `GET /api/experiments?concept=<concept_id>` 过滤参数，复用 `linked_concept_ids_json`
- [x] 后端测试：中英文查询、概念过滤、空结果

### Task B2: 前端探究入口

- [x] `frontend/src/api/experiments.js` 增加 `exploreExperiments(q)`、`listExperiments({ concept })`
- [x] Lab 页 header 增加"探究"输入框（enter/防抖 300ms）：结果下拉列表（模板标题 + 匹配概念），点击选中模板并可一键运行
- [x] 组件/状态测试

### Task B3: Phase B 验证

- [x] 全量测试 + 构建 + 浏览器验证
- [x] 提交（`feat(neurolab): explore-query loop for concepts`）

---

## Phase C: ML 训练台（感知机 / 线性模型实验）

### 目标

AI 导论课的动手核心：学生调学习率/epoch/数据集，实时看到 loss 曲线、决策边界与权重变化。

### Task C1: 后端 `ml_train` 适配器

- [ ] `backend/app/services/ml_datasets.py`：内置 iris（或 2 类子集）确定性数据（固定种子，不依赖外部下载）
- [ ] `NeuralNetTrainerAdapter`（`experiment_adapters.py`）：
  - `validate_params`: `learning_rate`（0.001–1）、`epochs`（1–200）、`dataset`（`iris-two-class` / `spiral` 等）、`model`（`perceptron` / `logistic`）
  - `run`: numpy 手写训练循环，输出 `loss_curve`（每 epoch）、`accuracy`、`weights`、`decision_boundary` 采样点（2D 投影）、`predictions`
  - `pipeline_trace`: `dataset → model → train → evaluate → ai-report`
- [ ] 模板 `exp-perceptron-train`（published）
- [ ] 后端测试（收敛性、确定性、校验）

### Task C2: 前端渲染

- [ ] 状态层：ML 模板 pipeline 元数据 + `buildInstrumentModel` 的 `ml` 分支
- [ ] ResultsDock 新增 `ml` tab：loss 曲线 + 决策边界散点（ECharts scatter + line）
- [ ] 测试

### Task C3: Phase C 验证

- [ ] 全量测试 + 构建 + 浏览器验证
- [ ] 提交（`feat(neurolab): perceptron training workbench`）

---

## Phase D: 里程碑（仅规划，不在此计划执行）

1. **真实 EEG 数据集实验**：`dataset_eeg` 适配器 + BCIC IV 2a / DEAP 小样本切片，分类准确率混淆矩阵。
2. **多智能体实验助教**：复用 `runtime/` supervisor/child 编排，自动跑参数网格并聚合对比报告。
3. 后续单独出 spec + plan，不在本文件展开。

---

## 验证基线

- 后端：`cd backend && uv run pytest`
- 前端：`cd frontend && npm test`
- 构建：`npm run build`
- 浏览器：`npm run dev` 后访问 `/lab`
