# EduFish Web-Native Open Multi-Agent Runtime Design

> Date: 2026-05-14  
> Scope: Web 原生开放多 Agent 引擎核心、开放协议、Node runtime 与 Python domain services 分层  
> Status: design approved for implementation planning

---

## 1. 设计目标

本设计定义 EduFish 下一代 Agent 引擎核心。目标不是继续在现有 Python 代码上增加零散能力，而是建立一套可闭环、可扩展、可复用、可恢复、可开放接入的 Web-native multi-agent runtime。

核心目标如下。

| 目标 | 说明 |
| --- | --- |
| 可闭环 | 单 agent 和多 agent 都能完成从消息输入、工具调用、委派、失败恢复到结果输出的完整执行链路。 |
| 可扩展 | 新模型、新工具服务、新 agent 类型、新协议客户端可以在不重写核心 loop 的前提下接入。 |
| 可复用 | Agent 核心从课程、教务、实验、图谱等具体业务中抽离，形成跨产品、跨场景的基础能力。 |
| Web 原生 | 权威执行态运行在独立 Node runtime service 中，浏览器是客户端，不承担权威 agent 状态。 |
| 开放协议 | 内部组件、Python 服务、未来第三方 agent/runtime 通过统一版本化协议接入，而不是靠进程内 API 耦合。 |
| 多 Agent 协作 | 多 agent 通讯、委派、上下文授权、审计和恢复是核心设计的一部分，而非后续附加功能。 |
| 可恢复 | 支持断线重连、事件重放、run 恢复、session 分叉、上下文压缩和审计追踪。 |

非目标如下。

1. 本阶段不重写全部前端产品 UI。
2. 本阶段不迁移全部 Python 业务逻辑到 Node。
3. 本阶段不设计通用联邦网络或跨组织 agent discovery 体系。
4. 本阶段不引入独立事件数据库或自定义消息中间件。
5. 本阶段不追求所有第三方协议兼容，只定义 EduFish 对外公开的开放协议。

---

## 2. 当前问题与设计判断

当前仓库已经开始探索新的 SDK/engine 方向，但核心仍然没有形成真正稳定的运行时边界。

当前问题主要体现在以下几个方面。

| 问题 | 当前表现 |
| --- | --- |
| Agent loop 单线化 | 现有 `sdk/python/edufish_engine/engine/agent.py` 仍是单 agent 单轮工具循环，不具备多 agent 调度能力。 |
| Session 结构过平 | 现有 `sdk/python/edufish_engine/engine/session.py` 主要是平面消息数组和单摘要字符串，不支持 branch、replay、run 隔离和精确授权。 |
| Compaction 粗粒度 | 当前 `compaction.py` 只能生成摘要并替换旧消息，不适合作为多 agent 共享上下文的长期结构。 |
| 业务与引擎耦合 | Python 侧同时承担模型调用、会话状态、工具执行和业务逻辑，导致闭环能力难验证，复用边界差。 |
| 无开放协议 | 当前能力主要依赖仓库内代码调用，没有稳定的 session/run/event/tool/delegation contract。 |
| 无权威 runtime | 现有系统更像“功能模块集合”，没有单一权威执行面统一管理 run 生命周期、事件流和恢复。 |

设计判断如下。

1. 不直接复用 `pi-coding-agent` 作为核心。
2. 复用 `pi-ai + pi-agent-core` 的分层思想，以及必要时的 provider/runtime 抽象经验。
3. 新核心以 TypeScript/Node 的 `Agent Runtime Service` 为权威执行面。
4. Python 保留为领域服务层，不再承担权威 agent runtime。

---

## 3. 方案选择与理由

本设计采用以下路线：

- 复用方向：`A`，只复用 `pi-ai + pi-agent-core` 这一层的思想和可迁移实现，不复用 `pi-coding-agent` 交互壳。
- 双栈方向：`3`，TypeScript 负责 agent runtime，Python 保留教务、课程、实验、RAG 与图谱服务，通过协议互通。
- 权威运行时：`A`，Node/TypeScript runtime service 持有真实会话状态、agent loop 和多 agent orchestration。
- 多 agent 范围：`B`，首版即支持真实多 agent，而不是仅做单 agent 预留。
- 协议边界：`B`，从一开始设计为开放协议，而不是只服务内部调用。

不选其他路线的原因如下。

| 备选 | 不选原因 |
| --- | --- |
| 继续以 Python 为核心 | 很难复用 `pi` 现有分层成果，也会让开放协议、多 agent 和 Web-native 运行态长期受限。 |
| 只复用 `pi-ai` 重写全部 runtime | 自由度高，但会重造 `agent-core` 已经踩过的事件流、tool loop、streaming 语义问题。 |
| 直接服务化 `pi-coding-agent` | 抽象层级不对，会把 CLI/TUI 假设带入核心 runtime。 |
| 先单 agent 再补多 agent | 会迫使 session、run、protocol、event schema 在第二阶段重构。 |

---

## 4. 总体架构

新系统拆成四层，只有最上层面向具体产品，下面三层面向复用。

```text
Web Client / External Agent / Admin Tools
                |
                v
    Open Protocol + Transport Layer
                |
                v
   Agent Runtime Service (Node / TypeScript)
                |
      +---------+---------+
      |                   |
      v                   v
Python Domain Services   Artifact / Storage Services
```

四层责任如下。

| 层 | 责任 |
| --- | --- |
| Web Client | 输入消息、订阅事件、展示 run/session/agent 状态、进行调试和管理。 |
| Protocol Layer | 对外暴露 session、run、event、tool、delegation 等统一 contract。 |
| Agent Runtime Service | 持有权威执行态，负责编排、调度、恢复、授权、审计和事件流。 |
| Domain Services | 提供课程、教务、实验、RAG、图谱、报告等工具和资源能力。 |

关键原则如下。

1. Web 前端不持有权威执行态。
2. Python 不再持有权威 agent loop。
3. 内部状态变化必须通过 runtime 统一落事件和持久化。
4. 外部系统只能通过协议对象与 runtime 交互，不能越过 runtime 直改 session。

---

## 5. 系统边界与责任分层

### 5.1 Agent Runtime Service

TypeScript/Node runtime service 是系统的权威执行面，负责：

1. Session 生命周期
2. Run 生命周期
3. Agent 调度和委派
4. Tool/resource orchestration
5. Context grants 与 capability grants
6. Event stream 生成、排序、重放
7. Branch、fork、compaction、replay
8. AuthN/AuthZ 与审计

它不负责课程业务规则实现，也不直接承担具体产品 UI。

### 5.2 Protocol Layer

协议层负责定义所有外部可见的对象、命令和事件：

- Session
- Run
- Entry
- Event
- AgentDescriptor
- Delegation
- ArtifactRef
- ContextGrant
- CapabilityGrant

这层既服务前端，也服务 Python domain services 和未来第三方 agent/runtime。

### 5.3 Domain Services

Python 侧继续承载课程、教务、实验、图谱、RAG、报告等领域逻辑，但它们不再实现 agent 核心。

它们对 runtime 的身份是：

- tool provider
- resource provider
- artifact producer

### 5.4 Web Client

Web client 负责产品体验，包括：

1. 消息输入
2. 事件流展示
3. agent 运行状态观察
4. session/tree/branch 浏览
5. multi-agent 调试视图
6. 管理配置界面

Web client 可以有本地交互态，但不拥有权威执行态。

---

## 6. Multi-Agent Runtime Model

### 6.1 核心模型

本设计不采用 agent 之间直接互联的 mesh，而采用 `runtime-mediated federation`。

核心对象如下。

| 对象 | 定义 |
| --- | --- |
| Session | 用户视角的长期上下文容器，承载 branch、共享资源引用、策略和审计边界。 |
| Agent | 能力声明对象，定义 prompt 策略、模型策略、工具域、权限域、可接收消息类型。 |
| Run | 某个 agent 在某个 session 内的一次执行实例。 |
| Mailbox / Event Stream | 所有 agent-to-agent 通讯都经 runtime 路由的消息和事件总线。 |

### 6.2 协作模型

推荐协作流程如下。

1. 用户消息进入一个 supervisor run。
2. supervisor 决定自己回答、调用工具，或委派给其他 agent。
3. 每个被委派 agent 生成自己的 child run。
4. child run 只能通过协议事件向父 run 返回结果、失败、请求更多上下文或交接。
5. 父 run 决定继续编排、重试、改派、合并或结束。

### 6.3 关键约束

1. 多 agent 的共享单位是 `session`，不是共享同一个可变 message list。
2. 多 agent 的执行单位是 `run`，不是隐式子线程。
3. child run 默认不能直接改父 run 的上下文。
4. 上下文共享必须通过 `ContextGrant` 显式授权。
5. 所有 agent 通讯都必须可审计、可排序、可重放。

### 6.4 首版必须支持的 agent-to-agent 事件

1. `delegate`
2. `accept`
3. `reject`
4. `message`
5. `artifact`
6. `request_context`
7. `grant_context`
8. `interrupt`
9. `complete`
10. `fail`

---

## 7. Open Protocol Object Model

### 7.1 设计原则

协议采用 `transport-neutral + versioned JSON protocol`。

同一套协议对象必须可以运行在：

1. WebSocket
2. SSE + HTTP POST
3. JSONL RPC

协议不与某一种传输绑定。

### 7.2 核心对象

#### AgentDescriptor

公开声明某个 agent 的能力和边界，至少包含：

- `agent_id`
- `name`
- `role`
- `model_policy`
- `tool_scopes`
- `resource_scopes`
- `delegation_policy`
- `accepted_message_types`
- `produced_artifact_types`

#### Session

长期共享上下文容器，至少包含：

- `session_id`
- `protocol_version`
- `participants`
- `branch_heads`
- `policy_refs`
- `shared_resource_refs`
- `audit_settings`

#### Run

具体执行对象，至少包含：

- `run_id`
- `session_id`
- `agent_id`
- `parent_run_id`
- `state`
- `mailbox_offset`
- `input_refs`
- `output_refs`
- `started_at`
- `ended_at`

#### Entry

上下文持久化单元，支持：

- `entry_id`
- `parent_entry_id`
- `branch_id`
- `kind`
- `payload`
- `created_at`

首版 `kind` 至少包括：

- `user_message`
- `assistant_message`
- `tool_call`
- `tool_result`
- `summary`
- `artifact_ref`
- `label`
- `system_note`

#### Event

运行时事件单元，至少包含：

- `event_id`
- `session_id`
- `run_id`
- `session_seq`
- `type`
- `payload`
- `timestamp`

#### Artifact

非纯文本产物对象，至少包含：

- `artifact_id`
- `artifact_type`
- `content_type`
- `storage_ref`
- `metadata`

#### Delegation

显式的 agent 委派对象，至少包含：

- `delegation_id`
- `from_run_id`
- `to_agent_id`
- `goal`
- `constraints`
- `context_grants`
- `expected_output`
- `status`

#### ContextGrant

上下文授权对象，至少包含：

- `grant_id`
- `from_run_id`
- `to_run_id`
- `entry_refs`
- `summary_refs`
- `artifact_refs`
- `resource_scopes`
- `expires_at`

### 7.3 协议硬约束

1. 所有持久化对象默认 append-only。
2. 所有命令都带 `request_id`，用于幂等重试。
3. 所有事件都带单调递增的 `session_seq`。
4. agent 间共享的是 `ref` 和 `grant`，不是内部内存状态。
5. 外部接入方只能通过协议对象交互。
6. `protocol_version` 必须显式出现在 session 和 command envelope 中，例如 `v1alpha1`。

---

## 8. Transport、认证与断线恢复

### 8.1 Transport 设计

传输层拆为 `control plane` 和 `event plane`。

| 传输 | 用途 |
| --- | --- |
| HTTP | 创建 session、启动 run、提交命令、查询快照、拉取 artifact、管理型操作。 |
| WebSocket | 双向实时事件流、steering、follow-up、agent-to-agent mailbox。 |
| SSE | 浏览器和观察者的只读降级通道。 |

协议对象一致，transport 只是承载层。

### 8.2 认证主体

首版支持三类主体：

| 主体 | 说明 |
| --- | --- |
| User Principal | 来自产品登录体系的用户身份。 |
| Service Principal | Python tool/resource services 使用的服务身份。 |
| Agent Principal | 外部 agent/runtime 使用的接入身份。 |

### 8.3 授权模型

授权不只看“谁是谁”，还看“对哪个 session/run/agent 拥有什么 capability”。

首版至少支持：

- session-level read/write
- run-level observe/control
- tool scope invoke
- resource scope read/query
- delegation scope create/accept
- artifact scope resolve/read

### 8.4 断线恢复机制

1. 所有事件携带 `session_seq`
2. 订阅允许传 `last_seen_seq`
3. 所有命令携带 `request_id`
4. run 生命周期独立于客户端连接
5. 事件窗口过大时允许先返回 snapshot，再继续增量事件

这样页面刷新、弱网、多个客户端观察、后台继续执行都能成立。

---

## 9. Tool / Resource / Artifact Execution Model

### 9.1 三类能力对象

Python 侧能力不再统称为 tool，而拆成三种协议角色。

| 类型 | 作用 |
| --- | --- |
| Tool | 有副作用或计算行为的动作，如检索、报告生成、实验启动、分析执行。 |
| Resource | 可读取上下文对象，如课程结构、知识点、学生画像、图谱节点、实验模板。 |
| Artifact Store | 大对象与产物存储，如 PDF、图像、图谱快照、HTML 报告、结果矩阵。 |

### 9.2 Domain Services 的角色

Python 服务在新体系里只承担能力提供者角色：

1. 暴露 capability 描述和 schema
2. 接收 runtime 的协议调用
3. 返回结构化结果和进度事件
4. 生成 artifact refs

它们不再承担：

1. 权威 session 状态
2. 权威 agent loop
3. 多 agent 调度
4. 协议路由

### 9.3 首版能力接口

首版统一 capability 接口至少包含：

- `discover`
- `invoke_tool`
- `read_resource`
- `query_resource`
- `stream_tool_events`
- `resolve_artifact`

### 9.4 工具执行原则

1. runtime 是唯一编排者，domain service 只是能力提供者。
2. tool 调用结果必须结构化，不允许只返回自由文本。
3. 长任务必须支持异步 accepted/running/completed/failed 状态。
4. schema 可发现，便于外部 agent 按协议接入。
5. agent 间传大对象时优先传 `artifact_ref`，不直接灌入 message。

---

## 10. Session Persistence、Branching、Compaction、Replay

### 10.1 持久化模型

首版采用 `append-only event store + materialized views`，存储使用 `Postgres + JSONB`。

推荐的最小表集合如下。

| 表 | 用途 |
| --- | --- |
| `sessions` | session 元信息、策略、当前 branch heads。 |
| `entries` | 可进入上下文的持久化记录。 |
| `runs` | agent 执行实例和运行状态。 |
| `events` | 运行时事件流。 |
| `artifacts` | 大对象索引与 metadata。 |

选择 Postgres 的原因如下。

1. 足够支撑 append-only log 与索引查询。
2. 支持事务、幂等写入和 JSONB 演进。
3. 第一版重点是模型正确，不是自定义存储引擎。

### 10.2 Branching

branch 是 session 的一等公民，不通过复制整个 session 文件实现。

规则如下。

1. 用户可从任意 `entry` 或 `run result` fork 新 branch。
2. 每个 branch 有独立 head。
3. 多个 run 可以工作在同一 session 的不同 branch 上。
4. branch 共享历史前缀，只切换 head，不复制全量记录。

### 10.3 Compaction

compaction 永远以新增 `summary entry` 实现，绝不覆盖原始记录。

规则如下。

1. compaction 作用于某个 branch 的上下文窗口，而不是全局改写 session。
2. summary entry 明确记录覆盖的 entry range 或 run range。
3. 构造 prompt 时可选择原始记录或 summary ref。
4. child agent 默认优先接收 summary + 最近必要上下文。

### 10.4 Replay

replay 分成两种：

| 类型 | 目标 |
| --- | --- |
| Context Replay | 重建某时刻 agent 可见上下文。 |
| Execution Replay | 重建系统当时的调度与状态变化。 |

二者不能混为一谈。前者回答“agent 当时看到了什么”，后者回答“runtime 当时做了什么”。

---

## 11. Failure Model 与安全边界

### 11.1 失败域

首版将失败域分成五类：

| 失败域 | 示例 |
| --- | --- |
| Model Failure | 超时、429、provider 中断、输出不合法、上下文溢出。 |
| Tool Failure | Python 服务报错、参数无效、长任务卡死、依赖不可用。 |
| Protocol Failure | 事件乱序、重复投递、非法对象、断线重放。 |
| Policy Failure | 越权读上下文、越权调工具、越权委派。 |
| Runtime Failure | Node worker 崩溃、进程重启、队列积压、投影落后。 |

### 11.2 Run 生命周期

run 生命周期至少包含：

- `created`
- `queued`
- `running`
- `waiting_tool`
- `waiting_child`
- `retrying`
- `interrupted`
- `completed`
- `failed`
- `cancelled`

### 11.3 安全边界

安全边界同时由四层保证：

1. `Capability Boundaries`
2. `Context Boundaries`
3. `Tenant Boundaries`
4. `Execution Boundaries`

设计要求如下。

1. prompt 不是安全边界。
2. 权限控制必须在 runtime 和 domain service 两端生效。
3. child agent 默认看不到全量 session。
4. 高风险工具必须支持禁用、确认或沙箱策略。

### 11.4 恢复机制

首版内建以下恢复能力：

1. supervisor 可处理 child fail 并决定重试、改派或人工接管。
2. 任意 tool/run 支持 timeout 和 cancellation。
3. 长任务必须发送 heartbeat，否则会被标记为 stale。
4. failed run 不覆盖历史，只追加 failure/recovery 事件。
5. 关键动作必须具备审计链：谁发起、谁授权、谁执行、谁失败、谁恢复。

---

## 12. Verification Strategy

### 12.1 验证层次

验证分六层进行。

| 层 | 目标 |
| --- | --- |
| Protocol Contract Tests | 验证协议 schema、版本兼容和对象语义。 |
| Runtime State Machine Tests | 验证 run 生命周期、tool loop、delegate、retry、cancel、幂等。 |
| Replay / Recovery Tests | 验证断线重连、事件重放、进程恢复、重复投递。 |
| Multi-Agent Scenario Tests | 验证 supervisor-child、fan-out/fan-in、失败回退、上下文授权不足等场景。 |
| Tool/Service Integration Tests | 验证 Node runtime 与 Python services 的 discover/invoke/progress/auth 边界。 |
| Policy / Safety Tests | 验证越权上下文、越权工具、租户串读、失效 token、取消传播。 |

### 12.2 固定测试工件

首版内建四类固定工件：

1. `golden event traces`
2. `golden session replays`
3. `faux agents / faux tools / faux providers`
4. `protocol compatibility suite`

### 12.3 系统级验收场景

首版必须长期通过以下系统级验收场景：

1. 单 agent 完成工具闭环并支持断线恢复。
2. supervisor 委派两个 child，汇总结果并正常结束。
3. child tool 超时失败后，supervisor 改派另一个 agent。
4. session 在 compaction 后继续多轮协作且支持 replay。
5. 外部 agent 通过开放协议接入，并通过 compatibility suite。

---

## 13. 首阶段落地边界

本设计对应的第一阶段实现只覆盖 agent engine core，不覆盖全部业务迁移。

第一阶段必须交付：

1. Node/TypeScript `Agent Runtime Service` 基础框架
2. 开放协议 `v1alpha1`
3. Session / Run / Entry / Event / Delegation / ContextGrant 基础模型
4. 单租户先行的多 agent supervisor/child 调度闭环
5. Python capability bridge 的最小 `discover + invoke + progress + artifact` 能力
6. append-only persistence + replay + compaction 基础能力
7. Web client 可消费的事件流与调试视图最小闭环
8. 全套 contract / replay / multi-agent / safety 验证基线

第一阶段不要求完成：

1. 全量旧 Python agent 代码迁移
2. 所有前端产品页面接入新 runtime
3. 复杂联邦 agent discovery
4. 高级跨组织信任和 marketplace 机制

---

## 14. 对现有代码的影响

本设计落地后，现有代码的角色变化如下。

| 当前模块 | 新角色 |
| --- | --- |
| `sdk/python/edufish_engine/engine/agent.py` | 逐步退役，不再作为权威 agent loop。 |
| `sdk/python/edufish_engine/engine/session.py` | 逐步退役，不再作为权威 session persistence。 |
| `sdk/python/edufish_engine/engine/compaction.py` | 其摘要逻辑可保留为参考，但权威 compaction 迁入 runtime。 |
| `backend/app/agents/*` | 从应用内 agent 逻辑转向 domain capabilities 或过渡适配层。 |
| 课程/教务/图谱/实验服务 | 继续保留在 Python，作为 tool/resource/artifact services。 |

迁移原则如下。

1. 先建立新 runtime，不直接破坏现有产品路径。
2. 先桥接 Python capabilities，再逐步迁移调用入口。
3. 在 runtime 稳定前，不强行要求所有产品页面同时接入。

---

## 15. 结论

EduFish 的下一代 agent 核心不应继续演化为“业务后端里的一组 agent 功能”，而应成为独立的 Web-native open multi-agent runtime。

这套设计通过以下方式解决当前根问题：

1. 用 Node runtime service 建立单一权威执行面。
2. 用开放协议统一 session、run、event、delegation 和 capability。
3. 用 run 隔离、多 agent 邮箱、context grant 和 append-only persistence 建立真正可控的多 agent 执行模型。
4. 让 Python 退回为领域能力层，而不是继续兼任 agent 引擎。
5. 用 replay、compaction、recovery 和 contract suite 保证系统可闭环、可恢复、可验证。

这是后续实现计划、技术拆分和渐进迁移的基准设计。
