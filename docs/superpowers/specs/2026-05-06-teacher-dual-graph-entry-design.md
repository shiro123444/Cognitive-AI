# Teacher Dual Graph Entry Design

> Date: 2026-05-06
> Scope: teacher homepage graph entries + unified EduFish dual-graph workspace
> Status: approved design draft

---

## 1. Goal

教师端需要新增两个明确入口，让教师可以从 `teacher` 首页直接进入两类图谱能力，同时保持当前界面的克制、简洁和统一视觉语言。

两类图谱分别是：

1. 课程知识图谱
2. 教学证据图谱

本次设计不引入新的视觉体系，不拆出新的大型子系统，不整搬 `MiroFish` 的图谱组件，而是在现有 EduFish 工作台之内完成统一承载。

---

## 2. Product Decision

### 2.1 Entry Strategy

在教师首页 `/teacher` 增加两个新入口：

1. `COURSE KNOWLEDGE GRAPH`
2. `EVIDENCE GRAPH`

保留原有入口：

1. `OPEN EDUFISH OS`
2. `MODEL CONFIG`

教师首页的入口栈最终为四项，全部保持现有的极简链接式样，不增加说明性卡片，不引入新页面风格。

### 2.2 Navigation Strategy

两个图谱入口都不进入独立页面，而是统一进入：

- `/teacher/edufish?view=course-graph`
- `/teacher/edufish?view=evidence-graph`

默认入口仍为：

- `/teacher/edufish`

这样可以保证教师工作流仍然停留在同一套系统里，不出现“跳出工作台”的割裂感。

### 2.3 Privacy Strategy

课程知识图谱中的学生个性化覆盖层默认匿名展示。主画布上只显示稳定匿名别名，例如：

- `学生-01`
- `学生-02`
- `学生-03`

真实身份不在主画布上默认展开，只在右侧检视栏或详情数据里按需显示。

### 2.4 Interaction Depth

两个图谱都采用“浏览 + 跳转”模式，而不是“浏览 + 编辑”模式。

默认允许的动作：

1. 搜索
2. 筛选
3. 缩放 / 重置
4. 查看详情
5. 跳到证据链
6. 跳到质量报告
7. 在两个图谱视角之间来回跳转

不做图上直接编辑，不做节点拖拽后的持久化，不做图谱写回。

---

## 3. Information Architecture

### 3.1 Teacher Homepage

位置：`/teacher`

变更内容：

入口栈从当前两项变为四项：

1. `OPEN EDUFISH OS`
2. `COURSE KNOWLEDGE GRAPH`
3. `EVIDENCE GRAPH`
4. `MODEL CONFIG`

跳转规则：

1. `OPEN EDUFISH OS` -> `/teacher/edufish`
2. `COURSE KNOWLEDGE GRAPH` -> `/teacher/edufish?view=course-graph`
3. `EVIDENCE GRAPH` -> `/teacher/edufish?view=evidence-graph`
4. `MODEL CONFIG` -> `/teacher/model-config`

### 3.2 EduFish Workspace

位置：`/teacher/edufish`

统一承载以下三种模式：

1. 默认总览模式
2. 课程知识图谱模式
3. 教学证据图谱模式

进入规则：

1. `view` 缺失或无效时，进入默认总览模式
2. `view=course-graph` 时，进入课程知识图谱模式
3. `view=evidence-graph` 时，进入教学证据图谱模式

---

## 4. Workspace Layout

### 4.1 Shared Layout Principle

统一保留当前 EduFish 的左侧 rail + 右侧主舞台结构。

不新增满屏卡片，不新增解释性大块文案，不引入新的 header shell。所有模式切换只通过：

1. 首页入口
2. `view` 参数
3. EduFish 内部局部状态

### 4.2 Default Mode

默认模式保持当前结构不变：

1. `AI PULSE`
2. `EVIDENCE GRAPH`
3. `PREDICTION`
4. `REPORT`

现有生长动画、预测曲线、报告闭环全部保留。

### 4.3 Course Graph Mode

课程知识图谱模式采用统一图谱工作台，底层复用现有课程图谱工作台组件。

主舞台结构只保留三层：

1. 顶部细工具带
2. 中部图谱画布
3. 右侧窄检视栏

#### 顶部细工具带

仅保留以下控件：

1. `COURSE`
2. `SCOPE`：`GLOBAL / OVERLAY`
3. `STUDENT`：仅在 `OVERLAY` 时出现
4. `SEARCH`

#### 图谱画布

`GLOBAL`：

显示课程全局图谱，节点类别包括但不限于：

1. 课程
2. 章节
3. 概念
4. 材料
5. 关系

`OVERLAY`：

在全局图谱之上叠加学生个性化覆盖层，内容包括但不限于：

1. 学生个人概念节点
2. 薄弱连接
3. 个性化材料节点
4. 训练痕迹

视觉规则：

1. 全局图谱使用黑灰主色
2. 覆盖层只使用更细的 Klein blue 轮廓和轻量发光
3. 不使用大面积高饱和色
4. 不让覆盖层压过全局结构

#### 右侧窄检视栏

点节点后只提供三类动作：

1. `查看证据链`
2. `跳到质量报告`
3. `切换到该学生覆盖层`

如果当前已在该学生覆盖层，第三项变为：

1. `返回全局图谱`

### 4.4 Evidence Graph Mode

教学证据图谱模式不是课程概念图，而是教学质量分析图谱的完整工作台版本。

默认仍然基于当前 EduFish 的证据图谱主舞台，但进入该模式时直接展开为完整工作台态。

允许的主操作只有四类：

1. `FILTER`
2. `FOCUS`
3. `CHAIN`
4. `REPORT`

规则如下：

1. `FILTER`：按节点类型筛选
2. `FOCUS`：聚焦课程 / 教师 / 学生 / 风险
3. `CHAIN`：打开对应证据链
4. `REPORT`：跳到对应报告段落

完整工作台模式仍保留当前的骨架感、留白和生长动画，不切换成传统后台表格页。

---

## 5. Graph Semantics

### 5.1 Course Knowledge Graph

本图谱的核心语义是“课程结构 + 学生个性化覆盖”。

全局层描述课程公共知识结构。
覆盖层描述学生与公共结构之间的偏移、薄弱点和个性化学习痕迹。

本图谱服务的问题是：

1. 课程知识结构是否清晰
2. 某个学生相对于课程公共结构偏离在哪里
3. 某个学生需要补什么材料
4. 课程概念图与学生训练路径是否一致

### 5.2 Evidence Graph

本图谱的核心语义是“教学质量分析关系网络”。

节点类型以分析结果为中心，当前后端已有的主要节点类型包括：

1. `Course`
2. `Teacher`
3. `Student`
4. `Department`
5. `School`

本图谱服务的问题是：

1. 当前课程质量信号来自哪里
2. 哪些教师 / 学生 /课程节点构成风险链
3. 哪个节点最值得优先干预
4. 哪条证据链足以支撑报告结论

---

## 6. Cross-Graph Navigation

两个图谱不是孤立页面，而是两个视角。

跳转规则：

1. 从课程知识图谱点击学生覆盖节点，可跳到证据图谱中对应学生相关信号
2. 从课程知识图谱点击课程结构异常节点，可跳到对应证据链或报告段落
3. 从证据图谱点击学生或课程风险节点，可回跳到课程知识图谱对应覆盖层
4. 从证据图谱点击课程节点，可返回课程全局图谱

这样教师不是在“看两张图”，而是在两个视角之间切换。

---

## 7. Frontend Architecture

### 7.1 Reuse Strategy

不整搬 `MiroFish` 的图谱组件。

原因：

1. `MiroFish` 图谱面板绑定仿真平台语义
2. 我们当前的课程图谱和证据图谱语义不同
3. 整搬会引入 `uuid / labels / self-loop / simulation phase / realtime refresh` 等额外耦合

### 7.2 Shared Workbench

前端保留一个统一图谱工作台底座，继续使用现有课程图谱工作台组件：

- `frontend/src/components/GraphPanel.vue`

在其上增加两个适配层：

1. `CourseGraphAdapter`
2. `EvidenceGraphAdapter`

### 7.3 CourseGraphAdapter

输入：

1. 课程全局图谱
2. 某个学生的 overlay 图谱
3. 匿名学生映射

输出：

1. 统一 `nodes / edges`
2. overlay 模式下的视觉层信息
3. 右侧检视栏动作
4. 匿名学生标签

### 7.4 EvidenceGraphAdapter

输入：

1. EduFish 分析图谱
2. 最新分析元数据
3. 可跳转的报告 / 证据链引用

输出：

1. 统一 `nodes / edges`
2. 节点筛选与聚焦信息
3. 右侧检视栏动作
4. 报告跳转目标

### 7.5 Existing Display Graph Split

当前 `edufishStudioState.js` 中的固定舞台坐标映射继续保留，但拆成两路使用：

1. 一路继续服务当前展示型主舞台
2. 一路转成完整图谱工作台数据

这样不会破坏当前 EduFish 的主视觉。

---

## 8. Backend Architecture

### 8.1 Course Global Graph

保留现有接口：

- `GET /api/graph?course_id=...`

用途：

1. 学生端课程全局图谱
2. 教师端课程全局图谱

### 8.2 Course Overlay Graph

新增最小接口集：

- `GET /api/course-overlays?course_id=...`
- `GET /api/graph?course_id=...&user_id=...`

职责：

`/api/course-overlays`：

1. 返回课程下可切换的学生 overlay 列表
2. 返回稳定匿名别名
3. 返回内部 `user_id`

`/api/graph?course_id=...&user_id=...`：

1. 返回该学生 overlay 合并后的课程图谱
2. 返回全局图谱与 overlay 图谱统一后的视图数据

### 8.3 Latest Evidence Graph

保留现有接口：

- `GET /api/edu/analysis/<analysis_id>/graph`

新增轻量入口：

- `GET /api/edu/analysis/latest?course_id=...`

返回：

1. `analysis_id`
2. `report_id`
3. `summary`
4. `status`

目的：

让教师从 `view=evidence-graph` 进入时直接定位到最近一条 completed analysis，而不是前端自行遍历分析列表猜测结果。

### 8.4 Identity Mapping

匿名别名必须由后端稳定生成，而不是前端临时排序。

接口返回建议字段：

1. `user_id`
2. `student_alias`
3. `student_name`，仅详情或授权字段使用

稳定别名保证：

1. 教师今天和明天看到的编号一致
2. 图谱、报告、证据链和 overlay 切换中的身份映射一致

---

## 9. Borrowing from MiroFish

### 9.1 Borrow

建议吸收以下交互细节：

1. 刷新按钮
2. 最大化 / 工作台展开
3. 边标签开关
4. 更强的详情面板层级
5. 运行态提示条

### 9.2 Do Not Borrow

明确不引入以下内容：

1. self-loop 聚合逻辑
2. simulation phase 语义
3. project / report / simulation 状态耦合
4. MiroFish 的整体流程外壳
5. MiroFish 的视觉 chrome

原则：

借交互，不借语义；借细节，不借框架。

---

## 10. Error Handling

### 10.1 Course Graph

课程全局图谱加载失败：

1. 主画布显示 `GRAPH UNAVAILABLE`
2. 提供单个 `Retry`

overlay 列表为空：

1. 不报错
2. `STUDENT` 选择器显示 `暂无个性化覆盖层`

选中某个学生但 overlay 为空：

1. 保留课程全局图谱
2. 右侧检视栏提示 `该学生暂无个性化训练痕迹`

### 10.2 Evidence Graph

不存在 completed analysis：

1. 显示 `NO COMPLETED ANALYSIS`
2. 保留 `RUN ANALYSIS →`

analysis 存在但 graph 缺失：

1. 显示 `ANALYSIS READY / GRAPH MISSING`
2. 允许重新分析
3. 允许跳报告

报告目标缺失：

1. 对应按钮置灰
2. 不弹噪声错误框

---

## 11. Testing Strategy

### 11.1 Frontend

必须覆盖：

1. `teacher` 首页新入口是否跳转到正确 `view`
2. `course-graph / evidence-graph` 模式切换是否正确
3. 课程图谱适配器是否能处理全局图谱与 overlay 图谱
4. 证据图谱适配器是否能处理 EduFish 分析图谱
5. 匿名学生是否默认显示为 `学生-01`
6. 图谱节点跳转参数是否正确

### 11.2 Backend

必须覆盖：

1. `/api/course-overlays?course_id=...`
2. `/api/graph?course_id=...&user_id=...`
3. `/api/edu/analysis/latest?course_id=...`

重点验证：

1. 匿名别名稳定
2. overlay 合并正确
3. latest analysis 选择逻辑正确

---

## 12. Delivery Order

建议按以下顺序实现：

1. 教师首页新增两个入口
2. `EduFish` 页面支持 `view=course-graph / evidence-graph`
3. 课程知识图谱先接全局模式
4. 再补学生 overlay 与匿名映射
5. 再补教学证据图谱完整工作台模式
6. 最后吸收 `MiroFish` 的交互细节

原因：

先打通信息架构，再逐层增强，不会破坏当前教师工作台主视觉和现有闭环。

---

## 13. Non-Goals

本次明确不做：

1. 图谱编辑
2. 图谱拖拽布局持久化
3. 全新后台样式页面
4. 把 MiroFish 图谱组件整块迁入
5. 复杂权限系统重构
6. 图谱实时自动刷新系统

---

## 14. Implementation Readiness Check

当前设计已经明确以下关键边界：

1. 入口位置：`/teacher`
2. 承载位置：统一在 `/teacher/edufish`
3. 图谱数量：两种，两个入口
4. 学生 overlay：需要，默认匿名
5. 操作深度：浏览 + 跳转，不编辑
6. 复用策略：复用本地 GraphPanel，吸收 MiroFish 交互细节
7. 新增后端接口：overlay 列表、overlay 图谱、latest analysis

该规格已足够进入实现计划阶段。
