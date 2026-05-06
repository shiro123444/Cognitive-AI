# EduFish Automated Material Agent and Knowledge Scope Design

> Date: 2026-05-06  
> Scope: 教材上传自动分析、Agent 通讯升级、教师/学生知识库作用域隔离、教师工作台入口调整  
> Status: design approved for implementation planning

---

## 1. 设计目标

本设计将教材上传从“文件处理功能”升级为“自动激活的课程分析 Agent”。教师或学生上传材料后，系统应自动完成文本抽取、语义切分、向量化、概念识别、关系抽取、图谱校验、入库发布与前端状态反馈。教师端材料默认进入课程级共享知识库；学生端材料默认进入个人知识库，只服务于该学生的个性化助教与学习路径。

核心目标如下。

| 目标 | 说明 |
| --- | --- |
| 自动激活 | 后端收到上传事件后立即创建 Agent Run，不依赖手动点击“开始分析”。 |
| 自动发布 | 通过结构校验和置信度门槛的概念、关系自动写入知识图谱。 |
| 可追踪 | 每个阶段写入事件流，前端可以展示真实进度、失败原因和结果摘要。 |
| 作用域隔离 | 教师共享知识库和学生个人知识库分开存储、检索、展示和授权。 |
| 视觉去重 | 教师工作台首页移除重复的 Upload 区，只保留核心入口。 |

非目标：本阶段不引入独立微服务、Kafka、Celery 或完整权限系统。当前仓库继续使用 Flask、SQLAlchemy、SQLite、Chroma 和现有 Vue 前端，以最小结构升级完成闭环。

---

## 2. 参考模型

Hermes Agent 的关键经验不是具体 UI 或项目目录，而是事件驱动的运行模型：

1. 输入事件到达后，网关将其归入一个 session/run。
2. run 内部执行长任务，外层不阻塞入口请求。
3. agent 在执行过程中通过回调持续发送 tool、message、progress 事件。
4. 每个事件带有 session/run 标识，便于前端、日志和恢复逻辑关联。
5. 同一 session/run 需要并发保护，避免同一材料被重复处理或事件交错。

EduFish 采用相同思想，但不照搬 Hermes 网关。当前项目已有 `JobQueue`，因此本设计在 `JobQueue` 上增加 Agent Run 和 Agent Event 语义，而不是重写后台。

---

## 3. 总体架构

```
Material Upload
      |
      v
AgentRun(received)
      |
      v
MaterialAnalysisAgent
      |
      +-- extract text
      +-- chunk material
      +-- embed chunks
      +-- extract concepts and edges
      +-- validate graph payload
      +-- publish public graph or personal overlay
      |
      v
AgentEvent stream + Job status + graph/vector stores
```

系统分为四层。

| 层 | 责任 |
| --- | --- |
| API 层 | 接收上传请求，声明知识库作用域，返回 `material_id`、`job_id`、`run_id`。 |
| Agent 执行层 | 编排教材处理流程，向事件流写入阶段、指标、错误和结果摘要。 |
| 数据层 | 存储材料、chunk、向量、图谱节点、图谱边、Agent 事件和审核兜底项。 |
| 前端层 | 教师和学生分别展示上传入口、真实进度、图谱结果和个人化学习反馈。 |

---

## 4. 知识库作用域

系统引入明确的知识作用域，避免公共课程知识和学生私有知识混在一起。

| 作用域 | 上传者 | 可见范围 | 用途 |
| --- | --- | --- | --- |
| `course_global` | 教师 | 全课程师生 | 课程教材、教师讲义、标准知识图谱、公共 RAG。 |
| `student_personal` | 学生 | 学生本人 | 个人笔记、错题、补充材料、个性化助教记忆。 |
| `teacher_private` | 教师 | 教师本人 | 教师草稿、未发布材料、课程设计过程资料。 |

后端检索时应按场景组合作用域：

| 场景 | 检索范围 |
| --- | --- |
| 教师课程分析 | `course_global + teacher_private` |
| 学生 AI 助教 | `course_global + student_personal` |
| 公共课程图谱 | 只读 `course_global` |
| 学生个性化图谱 | `course_global` 基础图谱叠加 `student_personal` overlay |

学生上传内容不能自动写入公共课程图谱。它可以生成个人概念、个人关系和个人推荐，但默认只影响该学生自己的 Agent。

---

## 5. 自动化处理流程

教师上传课程材料时，默认执行完整自动化链路：

1. `received`：保存文件，创建 `Material`、`Job`、`AgentRun`。
2. `extracting`：解析 PDF/TXT/MD，记录页码和抽取方式。
3. `chunking`：按语义切分文本，保存 `Chunk`。
4. `embedding`：调用 embedding 模型，写入 Chroma，metadata 包含 `course_id`、`scope_type`、`owner_id`、`material_id`。
5. `extracting_graph`：调用 LLM，生成概念、关系、标签、难度、证据 chunk、置信度。
6. `validating_graph`：校验 JSON 结构、概念引用、重复项、证据、置信度和作用域。
7. `publishing`：合格结果自动写入公共或个人图谱。
8. `completed`：写入结果摘要，前端刷新材料、图谱和队列。

失败策略：

| 失败位置 | 处理 |
| --- | --- |
| 文本抽取失败 | 标记材料 `parser_status=failed`，生成失败事件。 |
| embedding 失败 | 保留 chunk 和图谱抽取能力，事件中明确“向量索引未完成”。 |
| LLM 抽取失败 | 进入简单 fallback suggestion，不自动污染图谱。 |
| 图谱校验失败 | 进入审核队列，等待教师修正或发布。 |
| 自动发布失败 | rollback 图谱写入，保留审核条目和错误事件。 |

---

## 6. 图谱自动发布策略

自动发布不是无条件写库，而是“可审计的自动发布”。

后端应新增一个内部方法，例如 `ReviewService.auto_publish_graph_suggestion()`，行为如下：

1. 复用现有 `ReviewService._validate_graph_payload()`。
2. 对概念和边做去重合并，避免同名概念反复生成。
3. 检查每条边的 source 和 target 是否存在于本次 payload 或已发布图谱。
4. 校验作用域：教师公共材料只写 `course_global`；学生材料只写个人 overlay。
5. 达到置信度门槛则自动发布，未达到则保留为 `draft` 或 `needs_review`。
6. 自动发布后仍保留 `ReviewItem` 作为审计记录，状态为 `published`。

建议的 LLM 输出字段：

| 字段 | 用途 |
| --- | --- |
| `label` | 概念名称。 |
| `definition` | 面向课程的简短定义。 |
| `tags` | 主题标签，例如 “RAG”“注意力”“认知负荷”。 |
| `difficulty` | `introductory / intermediate / advanced`。 |
| `evidence_chunk_ids` | 证据来源，支持溯源。 |
| `confidence` | 自动发布门槛依据。 |
| `relationship` | `prerequisite_of / related_to / explains / evidenced_by`。 |

---

## 7. Agent 通讯升级

在现有 `Job` 表之外增加事件语义。最小实现可以新增 `AgentEvent` 表，也可以先将事件 append 到 `Job.result_json` 的 `events` 字段；推荐新增表，便于前端实时读取和后续审计。

推荐事件结构：

```json
{
  "id": "event-...",
  "run_id": "run-...",
  "job_id": "job-...",
  "material_id": "material-...",
  "course_id": "brain-cog-intro",
  "scope_type": "course_global",
  "event_type": "embedding",
  "status": "running",
  "message": "Embedding 24 chunks",
  "progress": 42,
  "payload": {
    "chunk_count": 24
  },
  "created_at": "2026-05-06T..."
}
```

API 设计：

| API | 用途 |
| --- | --- |
| `POST /api/materials/upload?async=1` | 上传并自动创建 Agent Run。 |
| `GET /api/jobs/<job_id>` | 兼容现有轮询。 |
| `GET /api/agent-runs/<run_id>` | 获取 run 摘要。 |
| `GET /api/agent-runs/<run_id>/events` | 获取事件列表，前端轮询或后续升级 SSE。 |
| `GET /api/materials?course_id=&scope_type=&owner_id=` | 按作用域查看材料。 |

本阶段推荐先实现轮询事件列表，SSE 作为同一数据模型上的后续增强。这样风险低，且能马上替换前端模拟进度。

---

## 8. 前端调整

教师工作台首页移除重复 Upload 区，只保留明确入口：

```
OPEN EDUFISH OS →
MODEL CONFIG →
```

页面视觉继续保持当前先锋、克制、留白充足的风格。教师上传材料的能力迁移到更具体的材料智能页面或 EduFish OS 子页面，避免首页同时承担入口、上传、审核、图谱等过多职责。

教师端需要展示：

| 区域 | 内容 |
| --- | --- |
| Agent Timeline | received、extracting、embedding、publishing 等真实事件。 |
| Result Summary | chunk 数、概念数、关系数、自动发布数、进入审核数。 |
| Graph Preview | 自动发布后可点击查看课程图谱。 |
| Review Fallback | 只展示异常或低置信条目。 |

学生端需要展示：

| 区域 | 内容 |
| --- | --- |
| Personal Materials | 学生自己的材料、笔记、错题上传记录。 |
| Personal Agent Memory | 个人知识库生成的标签、薄弱点、推荐复习方向。 |
| Overlay Graph | 公共课程图谱上的个人补充节点，不影响其他学生。 |
| Tutor Scope Indicator | 明确当前回答来自公共课程知识、个人材料或两者结合。 |

---

## 9. 测试计划

后端测试：

1. 教师异步上传材料后自动创建 `Job` 和 `AgentRun`。
2. job 执行完成后，合格概念和边自动发布到图谱。
3. 校验失败时生成审核项，不写入已发布图谱。
4. 学生上传材料只写个人作用域，不出现在公共课程图谱。
5. AI 助教检索学生问题时同时使用公共课程库和学生个人库。
6. embedding 失败时状态可见，chunk 和审核兜底仍保留。

前端测试：

1. 教师工作台首页不再展示重复上传表单。
2. 教师入口链接仍可进入 EduFish OS 和模型配置。
3. 上传页面使用真实 job/run 进度，不再只显示模拟进度。
4. Agent 事件流可以逐步刷新。
5. 学生端个人材料不会显示在教师公共材料列表中。

---

## 10. 实施顺序

1. 数据模型：补充材料作用域和 Agent 事件记录。
2. 后端服务：封装 `AgentRunService` 与事件写入助手。
3. 上传链路：让异步上传默认触发自动分析和自动发布。
4. 图谱发布：增加自动发布策略和审核兜底。
5. 检索隔离：向量 metadata 和图谱查询按作用域过滤。
6. 前端教师首页：移除重复 Upload UI，只保留两个入口。
7. 前端材料分析页：接入真实 run/job 事件。
8. 学生端：增加个人材料作用域入口和助教检索范围提示。
9. 验证：跑后端测试、前端测试、构建和关键页面视觉检查。

---

## 11. 风险与约束

| 风险 | 处理 |
| --- | --- |
| embedding 模型维度变化 | 需要记录 embedding model，必要时重建 Chroma collection。 |
| LLM 输出不稳定 | 强制 JSON schema、fallback、审核兜底。 |
| 自动发布污染图谱 | 置信度门槛、作用域校验、审计记录、可回滚。 |
| 学生私有数据泄露 | 默认 `student_personal`，检索和列表 API 必须带 owner 过滤。 |
| 前端状态复杂 | 先用轮询事件列表，稳定后再升级 SSE。 |

---

## 12. 结论

本方案保留当前项目已有的材料处理、RAG、审核和图谱基础，把关键缺口补成自动化 Agent 闭环。教师上传的课程材料会成为全班共享的课程知识；学生上传的个人材料会成为只属于自己的学习增强层。两者共享底层 Agent 通讯和材料分析能力，但在数据作用域、可见性和图谱发布策略上严格隔离。
