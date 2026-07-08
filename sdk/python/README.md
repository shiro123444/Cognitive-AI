# EduFish Engine SDK

一套引擎，多种界面。本地 CLI + Web 平台共享同一个 AI 引擎。

## 架构

```
edufish_engine/
├── ai/                 # 协议层 (inspired by @pi/ai)
│   ├── __init__.py     # Types: Message, Event, Model, Context, Tool
│   ├── stream.py       # EventStream — 统一的异步事件流
│   ├── registry.py     # Provider 注册表 + stream()/complete()
│   └── providers/      # OpenAI-compatible (covers Ollama, NIM, vLLM...)
│
├── engine/             # 引擎层 (inspired by pi's coding-agent/core)
│   ├── agent.py        # Tool-calling loop (消费 AI 层的 EventStream)
│   ├── session.py      # 会话管理 + compaction
│   └── tools/          # Tool 注册表 + handlers
│
├── sync/               # 同步层
│   └── client.py       # 与 web 平台的 API 通信
│
└── cli/                # CLI 应用层
    ├── app.py          # Click 命令入口
    ├── config.py       # ~/.edufish/config.toml
    ├── tui.py          # Rich 终端渲染
    └── commands/       # ask, chat, graph, sync
```

## 设计原则 (from pi)

1. **AI 层是协议，不是实现** — `stream()` 只接受 `Model + Context`，返回 `EventStream`
2. **EventStream 是统一消费接口** — CLI 和 Web 都消费同一个事件流
3. **Tool 声明式 + 执行分离** — AI 层只看 schema，engine 层执行 handler
4. **Provider 可插拔** — 注册新 provider 不需要改任何消费端代码

## 快速开始

```bash
# 安装
pip install -e ".[dev]"

# CLI
edufish ask "什么是反向传播？"
edufish chat --course ai-intro
edufish config

# 作为 SDK 使用
```

```python
import asyncio
from edufish_engine.ai import Model, Context, UserMessage
from edufish_engine.ai.registry import stream
from edufish_engine.ai.providers import OpenAICompatibleProvider  # 自动注册

model = Model(
    id="qwen2.5:14b",
    provider="ollama",
    base_url="http://localhost:11434/v1",
)

ctx = Context(
    system_prompt="你是学习助手",
    messages=[UserMessage(content="什么是注意力机制？")],
)

async def main():
    async for event in stream(model, ctx):
        if event.type == "text_delta":
            print(event.delta, end="", flush=True)
    print()

asyncio.run(main())
```

## Agent 使用

```python
from edufish_engine.engine.agent import Agent, AgentConfig
from edufish_engine.engine.tools import registry

# 注册工具
@registry.register(
    name="search_materials",
    description="搜索课程材料",
    parameters={"type": "object", "properties": {"query": {"type": "string"}}},
)
def search_materials(query: str = "") -> dict:
    return {"results": [...], "count": 1}

# 创建 agent
config = AgentConfig(
    name="tutor",
    system_prompt="你是AI学习助手...",
    tools=["search_materials"],
    model=model,
)

agent = Agent(config=config)

# 流式运行
async for event in agent.run("什么是反向传播？"):
    if event.type == "text_delta":
        print(event.delta, end="")
    elif event.type == "tool_executing":
        print(f"\n🔧 {event.name}...")
```

## 与 Web 后端集成

```python
# Flask adapter — 将 EventStream 转为 SSE
from edufish_engine.ai import Model, Context
from edufish_engine.ai.registry import stream_sync

def tutor_sse_endpoint(question, course_id):
    model = Model(...)
    ctx = Context(...)
    
    def generate():
        for event in stream_sync(model, ctx):
            yield f"data: {json.dumps(asdict(event))}\n\n"
        yield "data: [DONE]\n\n"
    
    return Response(generate(), mimetype="text/event-stream")
```

## Runtime Transition Note

`edufish_engine.engine.*` 目前仍然是一个可运行的 Python 侧 agent 实现，但它已经不是长期的权威运行时方向。新的 authority runtime 正在迁移到仓库根目录下的 Node/TypeScript `runtime/` workspace，用来集中处理开放协议、多 agent orchestration、replay、session branching 和 runtime-level policy。

Python 侧后续主要保留：

1. 领域能力与工具服务
2. 课程、教务、实验、图谱、RAG 的业务逻辑
3. 被 authority runtime 发现和调用的 capability/resource endpoints

## 测试

```bash
pytest tests/ -v
```

## 下一步

- [ ] RAG pipeline (本地向量检索)
- [ ] `edufish sync pull` 实现 (从平台拉取材料)
- [ ] Session compaction (用 LLM 生成摘要)
- [ ] Web adapter (替换现有 Flask TutorService)
- [ ] 更多 provider (Anthropic native, Google)
