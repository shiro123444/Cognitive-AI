# EDUFISH NeuroLab 虚拟脑与脑机实验平台设计

> Date: 2026-05-10
> Scope: EDUFISH `/lab` 实验平台、脑机/神经科学开源项目接入、AI 实验报告闭环
> Status: pending user review

---

## 1. Goal

把当前静态实验卡片式的 `LabView` 升级为一个真正可运行的教学实验平台：学生可以启动脑科学、脑机接口和 AI 相关实验，调整参数，观察信号或仿真结果，保存实验产物，并由 EDUFISH AI 引擎生成解释、反馈和实验报告。

本设计的重点不是先接真实人体硬件，而是先做一个安全、稳定、可演示、可教学的 **EDUFISH NeuroLab**：

1. 使用开源神经科学/BCI 工具作为实验内核或数据规范。
2. 复用现有课程、活动、作业、进度和 AI 报告能力。
3. 首版只使用虚拟仿真、合成数据、公开样例数据或本地回放数据。
4. 明确排除医疗诊断、临床解释、实时人体硬件采集和闭环刺激控制。

目标结果是：`/lab` 不再只是“实验列表”，而是课程内可布置、可运行、可提交、可解释的实验学习空间。

---

## 2. Context Findings

### 2.1 当前代码基础

当前项目已经有几块可复用基础：

1. `frontend/src/views/LabView.vue` 已存在，但目前只是静态实验卡片，且路由表还没有注册 `/lab`。
2. `LearningActivity.activity_type` 已支持 `cognitive_experiment`、`bci_dataset_lab`、`notebook_lab` 等实验类型。
3. `Assignment.assignment_type` 已支持 `experiment`，适合教师布置实验任务。
4. `ProgressEvent` 已预留 `ran_lab` 事件，适合记录学生实验运行历史。
5. 后端已有异步 `Job`、材料分析、RAG、AI tutor、报告导出等能力，可扩展到实验产物解释。

这说明 NeuroLab 不需要从零做一个孤立产品。更合理的路径是把实验平台作为 EDUFISH 课程系统里的一个新能力，和课程图谱、AI 助教、作业、材料分析打通。

### 2.2 开源项目调研结论

Carboncopies 本身更像研究组织和社区入口，真正可复用的软件资产是 BrainGenix 生态，尤其是 BrainGenix-NES / VBP。BrainGenix-NES 面向虚拟神经系统仿真、虚拟扫描、虚拟电极记录和 Neuroglancer 可视化，适合作为中长期的“虚拟脑实验”后端。

BrainFlow 更适合首版落地。它提供统一的 biosensor API，并且支持 synthetic board 与 playback file board，因此可以在没有真实 EEG 设备的情况下开发和演示 EEG/BCI 信号流程。

Timeflux 适合作为后续实时数据流框架。它的定位是采集和实时处理生物信号，适合未来做 LSL、ZeroMQ、浏览器监控和 BCI pipeline，但首版直接上 Timeflux 会增加部署复杂度。

MNE-BIDS 适合作为数据规范和离线分析方向。它能把 EEG/MEG/iEEG 等数据组织到 BIDS 结构，并与 MNE-Python 分析生态衔接，适合公开数据集、课程数据集和实验回放归档。

---

## 3. Approaches Considered

### 3.1 Approach A: 纯前端虚拟实验

用前端或本地 JS 实现神经元仿真、简单 EEG 波形和 AI 解释。

优点：

1. 实现最快。
2. 部署风险最低。
3. 第一版视觉效果容易做出来。

缺点：

1. “借用开源项目”的真实性不足。
2. 后续接入真实数据和实验产物会返工。
3. AI 报告缺少可信的数据来源。

### 3.2 Approach B: 混合适配器平台

建立 EDUFISH 自己的实验模板、运行记录、产物和报告模型；首版接入本地仿真、BrainFlow synthetic/playback、公开 EEG 样例数据；BrainGenix-NES 和 Timeflux 先定义 adapter 边界，后续按实验接入。

优点：

1. 首版能真实运行，不只是 UI mock。
2. 可以安全避开人体硬件和临床风险。
3. 能把开源工具变成 EDUFISH 统一实验体验的一部分。
4. 后续接 BrainGenix-NES、Timeflux 或真实设备时，不需要推翻 UI 和数据模型。

缺点：

1. 需要新增后端实验运行层和 artifact 层。
2. 要为不同 adapter 设计统一契约。
3. 首版要控制范围，否则会变成过大的科研平台。

### 3.3 Approach C: 真实硬件 BCI 平台优先

直接接 OpenBCI、Muse、BrainFlow 硬件板卡和实时数据流。

优点：

1. 演示冲击力强。
2. 更接近真实 BCI 工作流。

缺点：

1. 设备、驱动、权限、噪声、连接稳定性都会拖慢产品进度。
2. 涉及人体数据、同意书、隐私和伦理边界。
3. 教学平台首版容易被硬件调试吞掉。

### 3.4 Recommendation

采用 **Approach B: 混合适配器平台**。

首版优先做“虚拟仿真 + EEG 回放/合成数据 + AI 实验报告”，把真实开源工具接进来，但不把首版成败押在真实设备或 BrainGenix-NES 的完整部署上。

---

## 4. Product Design

### 4.1 Lab Dashboard

`/lab` 作为实验入口，展示可运行实验模板，而不是普通卡片库。

每个实验模板显示：

1. 实验类型：神经元仿真、EEG 回放、BCI 特征、AI 报告。
2. 数据来源：synthetic、public sample、uploaded dataset、future hardware。
3. 难度、预计时间、关联课程章节和知识点。
4. 可运行状态：ready、requires dataset、coming soon。
5. 最近运行结果和教师是否已布置为作业。

### 4.2 Experiment Workspace

实验工作台分为四个区域：

1. 左侧参数面板：采样率、滤波范围、神经元参数、分类器选项等。
2. 中央可视区：波形、频谱、spike raster、仿真轨迹或分类边界。
3. 右侧 AI 解释栏：解释当前参数、指出异常、连接课程知识点。
4. 底部运行时间线：run started、adapter executed、artifact generated、AI report ready。

交互目标是让学生“改一个参数就能看到实验结果变化”，而不是只阅读说明。

### 4.3 AI Report Panel

每次实验运行生成结构化报告草稿：

1. 实验目的。
2. 参数配置。
3. 关键观察。
4. 图表或 artifact 引用。
5. 与课程概念的关系。
6. AI 反馈和下一步建议。

报告可以作为作业提交内容，也可以进入教师端批改和课程进度统计。

### 4.4 Teacher Assignment Flow

教师在课程或教师工作台中选择实验模板，配置参数范围和评分标准，然后发布为 `assignment_type = experiment` 的作业。

学生完成实验后，提交内容不是普通文本，而是：

1. `experiment_run_id`
2. selected artifacts
3. AI report draft
4. 学生自己的观察和结论

教师端看到的是可追溯的实验记录，而不是孤立答案。

---

## 5. MVP Experiments

### 5.1 Neuron Spike Lab

目标：让学生理解动作电位、阈值、刺激强度和神经元响应。

实现方式：

1. 首版使用本地确定性仿真，不依赖外部服务。
2. 支持调整刺激电流、时间窗口、阈值、恢复参数。
3. 产物包括膜电位曲线、spike 时间点、参数摘要。
4. 后续可替换或扩展为 BrainGenix-NES adapter。

### 5.2 EEG Replay Lab

目标：让学生理解 EEG 信号、频段、滤波和功率谱。

实现方式：

1. 首版使用 BrainFlow synthetic board 或 playback file board。
2. 支持 alpha、beta、theta 等频段的可视化。
3. 支持简单 bandpass filter 和 PSD 展示。
4. 数据必须标注为 synthetic 或 sample replay。

这是最推荐优先实现的实验，因为它足够“真实”，又不依赖真实硬件。

### 5.3 BCI Feature Lab

目标：演示运动想象或二分类 BCI 的特征提取流程。

实现方式：

1. 首版使用公开样例数据或固定 fixture 数据。
2. 展示 epoch、特征、分类结果和混淆矩阵。
3. 不做实时控制，不输出医疗解释。
4. AI 解释重点放在“为什么这个特征有区分度”。

### 5.4 AI Report Lab

目标：把 EDUFISH 的 AI 引擎变成实验学习闭环的一部分。

实现方式：

1. 根据 run 参数、artifact 摘要和课程知识点生成报告。
2. 引用课程材料、知识图谱节点和实验图表。
3. 对学生报告给出反馈，但保留学生最终编辑权。

---

## 6. Architecture

### 6.1 Backend Domain Model

新增或扩展以下后端概念：

1. `ExperimentTemplate`
   - 实验定义、默认参数、adapter 类型、课程/章节/概念关联。
2. `ExperimentRun`
   - 单次运行记录、学生、课程、状态、参数、adapter、耗时、错误。
3. `ExperimentArtifact`
   - 波形数据、频谱数据、图片、JSON 指标、报告输入摘要。
4. `ExperimentReport`
   - AI 生成报告、引用来源、教师/学生编辑状态。
5. `ExperimentAdapter`
   - 非数据库对象，定义每类实验如何执行、验证参数和生成产物。

如果首版想降低迁移成本，可以先让 `ExperimentTemplate` 对应 `LearningActivity.config_json`，但 `ExperimentRun` 和 `ExperimentArtifact` 应该独立建模。运行记录是平台核心资产，不适合塞进通用 activity JSON 里。

### 6.2 Adapter Contract

每个 adapter 需要实现同一组能力：

1. `validate_params(template, params)`
2. `run(params, input_artifacts)`
3. `summarize_artifacts(run_result)`
4. `build_report_context(run, artifacts)`

首版 adapter：

1. `local_neuron_simulator`
2. `brainflow_synthetic_eeg`
3. `brainflow_playback_eeg`
4. `fixture_bci_features`

后续 adapter：

1. `braingenix_nes`
2. `timeflux_stream`
3. `mne_bids_dataset`
4. `hardware_brainflow_board`

### 6.3 Frontend Routes

建议新增：

1. `/lab`
   - 实验模板列表和最近运行。
2. `/lab/:experimentId`
   - 实验详情与参数配置。
3. `/lab/:experimentId/run`
   - 运行工作台。
4. `/lab/runs/:runId`
   - 历史运行与报告查看。

当前已有 `LabView.vue`，但需要注册路由并改造成 dashboard。工作台建议拆成独立组件，避免把所有可视化、参数、报告逻辑塞进一个 view。

---

## 7. Data Flow

标准流程：

1. 教师或系统创建 `ExperimentTemplate`。
2. 学生从 `/lab` 或作业入口打开实验。
3. 前端提交参数创建 `ExperimentRun`。
4. 后端校验参数并启动 adapter job。
5. Adapter 生成 `ExperimentArtifact`。
6. AI 服务读取 run、artifact、课程概念和材料引用，生成 `ExperimentReport`。
7. 系统记录 `ProgressEvent(event_type = ran_lab)`。
8. 学生提交作业时引用 `experiment_run_id` 和报告。
9. 教师查看运行轨迹、产物和学生结论。

这个流程让实验结果可以回到课程图谱、AI 助教和作业系统，而不是停留在一次性页面交互。

---

## 8. Safety And Scope

MVP 明确限制：

1. 不接真实人体硬件。
2. 不做医疗诊断或健康建议。
3. 不做实时闭环刺激。
4. 不存储真实个人生物信号。
5. 所有 synthetic/sample 数据必须在 UI 和报告中标注。

后续如果接真实设备，必须新增：

1. 设备连接向导。
2. 数据采集同意流程。
3. 数据脱敏和删除机制。
4. 教师/管理员权限控制。
5. 硬件兼容性和故障恢复策略。

---

## 9. Implementation Phases

### 9.1 Phase 1: Lab Platform Skeleton

1. 注册 `/lab` 路由。
2. 改造实验 dashboard。
3. 新增实验模板、运行、产物的后端基础接口。
4. 建立 adapter contract。
5. 使用 fixture 数据完成端到端 run。

### 9.2 Phase 2: EEG Replay MVP

1. 引入 BrainFlow synthetic/playback adapter。
2. 增加 EEG 波形、PSD、频段可视化。
3. 生成 AI 实验报告草稿。
4. 记录 `ran_lab` 进度事件。

### 9.3 Phase 3: Teacher Assignment Integration

1. 教师可以把实验模板发布为作业。
2. 学生提交实验 run 和报告。
3. 教师查看 artifacts、AI summary 和学生结论。

### 9.4 Phase 4: BrainGenix / Timeflux Extension

1. 验证 BrainGenix-NES 本地部署约束。
2. 接入虚拟神经元或虚拟电极 recording。
3. 评估 Timeflux 作为实时流 adapter 的部署成本。
4. 再决定是否支持真实设备。

---

## 10. Testing Strategy

1. 后端 API 测试：template/run/artifact/report 的生命周期。
2. Adapter contract 测试：确定性 fixture 输入必须产生稳定 artifact 摘要。
3. BrainFlow adapter 测试：synthetic board 和 playback fixture 不依赖真实设备。
4. 前端单元测试：参数状态、运行状态、错误状态和报告状态。
5. Playwright 检查：`/lab` dashboard、实验工作台、运行完成页在桌面和移动端可见且无布局重叠。
6. AI 报告测试：输入 artifact 摘要后，报告必须包含参数、观察、限制说明和课程关联。

---

## 11. Open Decisions

推荐先实现 **EEG Replay Lab + AI Report**，原因是它最能体现“开源 BCI 工具 + EDUFISH AI 引擎”的结合，且不需要真实硬件。

仍需用户确认的产品选择：

1. 首个实验是否按推荐从 EEG Replay Lab 开始。
2. BrainGenix-NES 是第一阶段只保留 adapter 设计，还是立即投入部署验证。
3. 公开 EEG 样例数据使用内置 fixture，还是后续让教师上传 MNE-BIDS 风格数据集。

---

## 12. References

1. Carboncopies BrainGenix-NES Overview: https://carboncopies.org/Research/BrainGenix/Divisions/NES/Overview/
2. BrainGenix-NES GitLab: https://gitlab.braingenix.org/carboncopies/BrainGenix-NES
3. BrainFlow Documentation: https://brainflow.readthedocs.io/en/stable/index.html
4. BrainFlow Supported Boards: https://brainflow.readthedocs.io/en/stable/SupportedBoards.html
5. Timeflux Documentation: https://doc.timeflux.io/en/stable/index.html
6. MNE-BIDS Documentation: https://mne.tools/mne-bids/stable/index.html
