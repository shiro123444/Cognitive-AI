<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: Alpha" />
  <img src="https://img.shields.io/badge/python-3.11+-blue" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/node-20+-green" alt="Node 20+" />
  <img src="https://img.shields.io/badge/vue-3-brightgreen" alt="Vue 3" />
  <img src="https://img.shields.io/badge/license-proprietary-lightgrey" alt="License" />
</p>

# EduFish

> 面向「人工智能导论」与「脑与认知科学导论」的课程级 AI 教学平台。
> 知识图谱驱动、RAG 增强、多 Agent 协作。

---

## 概览

EduFish 将课程材料转化为可交互的知识结构，为学生提供基于证据的 AI 辅导，为教师提供教学质量洞察。

**核心能力：**

- 📚 **RAG 辅导** — 基于课程材料的语义检索 + LLM 生成，回答有引用来源
- 🕸️ **知识图谱** — 自动从材料中提取概念与关系，可视化学习路径
- 🧪 **NeuroLab** — 脑科学实验工作台，NIfTI 可视化 + 实验流水线
- 📊 **EduFish 分析引擎** — 教学质量评估、预测推演、证据图谱
- 🤖 **多 Agent 运行时** — Node.js 编排层，Python 能力层，事件溯源

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                          │
│  Course View · Tutor · NeuroLab · Teacher Studio · Inspector    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌────────────────────────────────┐ │
│  │  Agent Runtime (Node) │    │  Backend (Flask)               │ │
│  │                        │    │                                │ │
│  │  Protocol (v1alpha1)   │◄──►│  Capability Provider           │ │
│  │  Session / Run FSM     │    │  ├─ RAG (embed + vector)      │ │
│  │  Event Store (PG)      │    │  ├─ Knowledge Graph           │ │
│  │  Supervisor / Delegate │    │  ├─ Tutor Service             │ │
│  │  Agent Loop            │    │  ├─ EduFish Analysis          │ │
│  │                        │    │  └─ Experiment Service        │ │
│  └──────────────────────┘    └────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  EduFish Engine SDK (Python)                                  ││
│  │  ai/ (EventStream + Provider) · engine/ (Agent + RAG + Tools) ││
│  │  cli/ (edufish ask/chat/sync) · web/ (Flask adapter)          ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

| 层 | 技术栈 | 职责 |
|---|---|---|
| Frontend | Vue 3 + D3.js + NiiVue + GSAP | 交互界面、知识图谱可视化、脑影像渲染 |
| Runtime | Node 20 + Fastify + PostgreSQL | Agent 编排、状态机、事件溯源、多 Agent 委派 |
| Backend | Python 3.11 + Flask + ChromaDB | 领域服务：RAG、图谱、分析、实验 |
| SDK | Python (click + rich + chromadb) | 本地 CLI 学习助手，与平台同构的引擎 |

---

## 快速开始

### 环境要求

- Python ≥ 3.11
- Node.js ≥ 20
- PostgreSQL 15+ (runtime 持久化)
- 一个 OpenAI-compatible LLM 端点 (OpenAI / Ollama / NVIDIA NIM)

### 一键部署 (Docker)

```bash
git clone <repo-url> && cd edufish
cp deploy/.env.template deploy/.env
# 编辑 deploy/.env，填入 LLM_API_KEY
bash deploy/setup.sh
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3025 |
| API | http://localhost:5001/api/v1 |
| Runtime | http://localhost:4000/runtime |

### 本地开发

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python run.py

# Frontend
cd frontend
npm install
npm run dev

# Runtime
cd runtime
npm install
npm test

# SDK CLI
cd sdk/python
pip install -e ".[dev]"
edufish --help
```

---

## 项目结构

```
.
├── frontend/                 # Vue 3 SPA
│   ├── src/api/              # API 客户端 (courses, tutor, runtime...)
│   ├── src/views/            # 页面 (Course, Tutor, Lab, Studio, Inspector)
│   ├── src/router/           # 路由
│   └── src/styles/           # Design tokens + CSS
│
├── backend/                  # Flask 后端
│   └── app/
│       ├── api/              # REST 路由 (auth, courses, tutor, graph, edu...)
│       ├── agents/           # Agent 定义 + Tool 注册
│       ├── rag/              # RAG pipeline (chunker, embedder, vector store)
│       ├── services/         # 业务逻辑 (tutor, material, analysis, experiment)
│       └── tests/            # pytest 测试
│
├── runtime/                  # Agent Runtime (Node.js)
│   └── src/
│       ├── protocol/         # v1alpha1 schema (Session, Run, Event, Delegation)
│       ├── core/             # 状态机、服务编排
│       ├── agent/            # Agent Loop、Supervisor、Faux Provider
│       ├── persistence/      # Event Store、Session Store (PostgreSQL)
│       └── api/routes/       # Fastify HTTP 路由
│
├── sdk/
│   ├── python/
│   │   ├── edufish/          # Platform API client (分析引擎)
│   │   └── edufish_engine/   # 本地引擎 SDK
│   │       ├── ai/           # 协议层: EventStream + Provider Registry
│   │       ├── engine/       # 引擎层: Agent Loop + RAG + Session + Compaction
│   │       ├── cli/          # CLI: edufish ask/chat/graph/sync
│   │       ├── web/          # Flask adapter (EventStream → SSE)
│   │       └── sync/         # 平台同步客户端
│   └── js/                   # TypeScript SDK client
│
├── deploy/                   # Docker Compose + 环境配置
├── docs/                     # 设计文档、规格说明
└── reference/                # 参考资料
```

---

## 功能模块

> **状态图例**：✅ 完成（真闭环 / 已部署） · 🟡 骨架（代码就绪、测试通过，但含桩或未接入生产） · 🔲 计划中

### 🎓 课程学习

| 功能 | 状态 | 说明 |
|------|------|------|
| 课程浏览 | ✅ 完成 | 章节列表、学习目标、正文 |
| 知识图谱 | ✅ 完成 | D3 力导向图，概念关系可视化 |
| AI 辅导 (Tutor) | ✅ 完成 | RAG + LLM 流式回答，带引用 |
| 章节活动流 | ✅ 完成 | 学习路径、进度追踪 |
| 作业系统 | ✅ 完成 | 提交、评分、反馈 |

### 🧪 NeuroLab

| 功能 | 状态 | 说明 |
|------|------|------|
| 实验工作台 | ✅ 完成 | canvas + pipeline 侧栏 + 折叠结果带 |
| NIfTI 可视化 | ✅ 完成 | NiiVue 集成，脑影像渲染 |
| 实验流水线 | 🟡 骨架 | 模板 → 参数 → 执行；**合成数据 + 占位算法**，真信号处理 (scipy) 待后续 |
| 数据分析面板 | ✅ 完成 | 实时结果展示 |

### 👩‍🏫 教师工作室

| 功能 | 状态 | 说明 |
|------|------|------|
| 材料上传 | ✅ 完成 | PDF/文本，自动分块 + 向量化 |
| 图谱编辑 | ✅ 完成 | 双入口：自动提取 + 手动编辑 |
| 模型配置 | ✅ 完成 | LLM/Embedding 端点配置 + 测试 |
| 发布审核 | ✅ 完成 | 概念/关系审核 → 发布到学生端 |

### 📊 EduFish 分析引擎

| 功能 | 状态 | 说明 |
|------|------|------|
| 数据采集 Agent | ✅ 完成 | 自动从平台 DB 采集学习数据 |
| 教学质量分析 | ✅ 完成 | 多维度评估 + 证据图谱 |
| 预测推演 | ✅ 完成 | 干预方案模拟 |
| 报告生成 | ✅ 完成 | HTML/PDF 报告 |

### 🤖 Agent Runtime (新)

| 功能 | 状态 | 说明 |
|------|------|------|
| 协议定义 (v1alpha1) | ✅ 完成 | Session, Run, Event, Delegation schema (Zod) |
| Run 状态机 | ✅ 完成 | 10 状态 × 11 动作，完整转换表 |
| Event Store | ✅ 完成 | Append-only, session_seq；本轮接入 PostgreSQL 部署 |
| Supervisor / Delegation | 🟡 骨架 | context_grants 协议就绪；委派调度为占位，真 fan-out/fan-in 待 P1 |
| Capability Bridge | ✅ 完成 | 本轮桥接到真 tool registry（search_materials 等 8 个真 tool） |
| HTTP 入口 | ✅ 完成 | Fastify sessions/runs/events 路由；本轮补 bootstrap（listen :4000） |
| Agent Loop | 🟡 骨架 | 真驱动（FSM + tool 执行 + 事件）；**faux provider**，真 LLM 待 P1 |
| Runtime Service | ✅ 完成 | 生命周期协调、Session/Run/Event 编排 |
| Session Service | ✅ 完成 | 创建 + 事件查询 |
| Capability Client | ✅ 完成 | HTTP bridge 到 Python 后端 |
| SSE 事件流 | ✅ 完成 | /runtime/events/:id/stream；本轮 nginx 反代（proxy_buffering off） |
| Inspector 面板 | ✅ 完成 | 本轮接通：实时 session/run/event 仪表盘（轮询） |

### 🖥️ EduFish Engine SDK

| 功能 | 状态 | 说明 |
|------|------|------|
| EventStream 协议 | ✅ 完成 | 统一异步事件流 (学习 pi) |
| Provider Registry | ✅ 完成 | OpenAI-compatible 自注册 |
| Agent Loop | ✅ 完成 | Tool-calling + 状态推进 |
| RAG Pipeline | ✅ 完成 | Chunk → Embed → Store → Search |
| Session + Compaction | ✅ 完成 | LLM 生成结构化学习摘要 |
| CLI (edufish) | ✅ 完成 | ask / chat / graph / sync / config |
| Web Adapter | ✅ 完成 | EventStream → Flask SSE |
| Sync Pull | ✅ 完成 | 从平台拉取材料 + 构建本地索引 |
| Sync Push | ✅ 完成 | 上报学习进度 |

---

## 开发路线

### Phase 1 — 课程平台 MVP ✅

> 完成时间：2026-05

- [x] 课程浏览、章节、知识图谱
- [x] RAG 辅导 (embed → search → LLM)
- [x] 教师材料上传 + 自动概念提取
- [x] 作业系统 + 进度追踪
- [x] 认证 + RBAC

### Phase 2 — NeuroLab + 分析引擎 ✅

> 完成时间：2026-05

- [x] NeuroLab 实验工作台
- [x] NiiVue 脑影像可视化
- [x] EduFish 教学质量分析
- [x] 报告生成 (HTML/PDF)
- [x] 数据采集 Agent

### Phase 3 — Agent Runtime 收口 ✅

> 本轮完成：Runtime 可启动 + 可部署 + 真能力桥接 + 可观测

- [x] Runtime 协议设计 (v1alpha1) + Run 状态机 + Event Store
- [x] EduFish Engine SDK (本地引擎) + CLI 工具 (edufish)
- [x] Agent Loop 实现（FSM + tool 执行 + 事件溯源）
- [x] **Runtime bootstrap + 部署** — bin.ts 启动入口 + docker-compose（postgres + runtime）+ nginx /runtime 反代
- [x] **Capability Bridge 桥接真 tool** — 转发到 registry（search_materials / search_concept_graph / collect_edu_data 等）
- [x] **Inspector 仪表盘** — 前端实时 session/run/event 可视化
- [x] SSE 事件流路由 + nginx 反代（proxy_buffering off）

### Phase 3b — AI-Agent 真闭环 🔄

> 后续 PR：让 Runtime 跑真 LLM + 多 Agent 协作（Flask 仍为生产 agent，Runtime 为编排/教学层）

- [ ] **真 LLM Provider** — Node OpenAI 兼容 adapter（替换 faux provider），端到端真 LLM 联调
- [ ] **多 Agent 委派** — supervisor 真 fan-out/fan-in + child run + mailbox
- [ ] **Session 恢复 + Compaction** — 长对话持久化 + 自动压缩
- [ ] Runtime ↔ Backend SSO 认证集成

### Phase 3c — NeuroLab 真实验 🔄

- [ ] scipy 真信号处理（Butterworth 滤波 + Welch PSD + 真频带功率）
- [ ] 实验流水线异步化（走 job_queue，前端 SSE 看逐节点推进）
- [ ] （可选）真开放数据集 / mne 完整科研栈

### Phase 4 — 生产化 (计划中)

- [ ] 认证集成 (Runtime ↔ Backend SSO)
- [ ] 水平扩展 (多 Runtime 实例 + 事件分区)
- [ ] 可观测性 (OpenTelemetry traces)
- [ ] 学生端 CLI 发布 (PyPI: `pip install edufish`)
- [ ] 课程模板市场

---

## 测试

```bash
# Runtime (24 tests)
cd runtime && npm test

# Backend (pytest)
cd backend && pytest -q

# Frontend (vitest)
cd frontend && npm test

# SDK (23 tests)
cd sdk/python && pytest tests/ -v
```

当前测试覆盖：

| 模块 | 测试数 | 状态 |
|------|--------|------|
| Runtime | 24 | ✅ 全部通过 |
| Frontend (runtime) | 9 | ✅ 全部通过 |
| Backend (capability) | 2 | ✅ 全部通过 |
| SDK Engine | 23 | ✅ 全部通过 |

---

## 设计参考

本项目的 Agent 架构设计参考了以下开源项目：

| 项目 | 借鉴点 |
|------|--------|
| [pi](https://github.com/anthropics/pi) | EventStream 协议、Provider Registry、Session Compaction |
| [opencode](https://github.com/opencode-ai/opencode) | Provider 状态管理、Agent 定义与执行分离、models.dev 模型发现 |

**核心设计原则：**

1. **AI 层是协议，不是实现** — `stream()` 只接受 Model + Context，返回 EventStream
2. **Tool 声明式 + 执行分离** — AI 层只看 schema，engine/runtime 层执行 handler
3. **事件溯源** — 所有状态变更通过 append-only events 记录，可 replay
4. **能力分层** — Node 做编排 (状态机 + 事件流)，Python 做领域能力 (RAG + 分析)

---

## 环境变量

参见 [`deploy/.env.template`](deploy/.env.template)。关键配置：

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_BASE_URL` | LLM 端点 | `http://localhost:11434/v1` |
| `LLM_API_KEY` | API 密钥 | `sk-...` |
| `LLM_MODEL_NAME` | 模型名 | `qwen2.5:14b` |
| `EMBEDDING_BASE_URL` | Embedding 端点 | `http://localhost:11434/v1` |
| `EMBEDDING_MODEL` | Embedding 模型 | `nomic-embed-text` |
| `DATABASE_URL` | PostgreSQL (runtime) | `postgresql://...` |

---

## 许可证

Proprietary. 仅供课程教学使用。
