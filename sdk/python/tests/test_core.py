"""Test the core EventStream and type system."""

import asyncio
import time

import pytest

from edufish_engine.ai import (
    AssistantMessage,
    Context,
    DoneEvent,
    Model,
    StartEvent,
    TextContent,
    TextDeltaEvent,
    Tool,
    ToolCall,
    UserMessage,
)
from edufish_engine.ai.stream import EventStream


@pytest.fixture
def sample_model():
    return Model(
        id="test-model",
        provider="test",
        api="openai-compatible",
        base_url="http://localhost:11434/v1",
    )


@pytest.fixture
def sample_context():
    return Context(
        system_prompt="你是学习助手",
        messages=[UserMessage(content="什么是反向传播？", timestamp=time.time())],
        tools=[
            Tool(
                name="search_materials",
                description="搜索课程材料",
                parameters={"type": "object", "properties": {"query": {"type": "string"}}},
            )
        ],
    )


class TestTypes:
    """Test that the type system is coherent."""

    def test_assistant_message_text(self):
        msg = AssistantMessage(
            content=[TextContent(text="Hello"), TextContent(text=" World")],
            provider="test",
            model="test-model",
        )
        assert msg.text == "Hello World"

    def test_assistant_message_tool_calls(self):
        msg = AssistantMessage(
            content=[
                TextContent(text="Let me search..."),
                ToolCall(id="tc1", name="search", arguments={"q": "test"}),
            ],
        )
        assert len(msg.tool_calls) == 1
        assert msg.tool_calls[0].name == "search"
        assert msg.text == "Let me search..."

    def test_context_construction(self, sample_context):
        assert sample_context.system_prompt == "你是学习助手"
        assert len(sample_context.messages) == 1
        assert len(sample_context.tools) == 1


class TestEventStream:
    """Test the EventStream async iteration protocol."""

    @pytest.mark.asyncio
    async def test_basic_stream(self):
        stream = EventStream()

        # Simulate provider pushing events
        msg = AssistantMessage(
            content=[TextContent(text="反向传播是...")],
            provider="test",
            model="test-model",
            stop_reason="stop",
            timestamp=time.time(),
        )

        async def push_events():
            await asyncio.sleep(0.01)
            stream.push(StartEvent())
            stream.push(TextDeltaEvent(delta="反向传播"))
            stream.push(TextDeltaEvent(delta="是..."))
            stream.push(DoneEvent(message=msg, stop_reason="stop"))

        asyncio.create_task(push_events())

        events = []
        async for event in stream:
            events.append(event)

        assert len(events) == 4
        assert events[0].type == "start"
        assert events[1].type == "text_delta"
        assert events[1].delta == "反向传播"
        assert events[3].type == "done"

    @pytest.mark.asyncio
    async def test_result_awaitable(self):
        stream = EventStream()

        msg = AssistantMessage(
            content=[TextContent(text="答案")],
            stop_reason="stop",
            timestamp=time.time(),
        )

        async def push():
            await asyncio.sleep(0.01)
            stream.push(DoneEvent(message=msg))

        asyncio.create_task(push())

        result = await stream.result()
        assert result.text == "答案"


class TestToolRegistry:
    """Test the tool registry pattern."""

    def test_register_and_execute(self):
        from edufish_engine.engine.tools import ToolRegistry

        reg = ToolRegistry()

        @reg.register(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object", "properties": {"x": {"type": "integer"}}},
        )
        def test_tool(x: int = 0) -> dict:
            return {"result": x * 2}

        assert "test_tool" in reg.list_names()
        result = reg.execute("test_tool", {"x": 5})
        assert result == {"result": 10}

    def test_unknown_tool(self):
        from edufish_engine.engine.tools import ToolRegistry

        reg = ToolRegistry()
        result = reg.execute("nonexistent", {})
        assert "error" in result

    def test_schemas(self):
        from edufish_engine.engine.tools import ToolRegistry

        reg = ToolRegistry()

        @reg.register(
            name="tool_a",
            description="Tool A",
            parameters={"type": "object"},
        )
        def tool_a() -> dict:
            return {}

        @reg.register(
            name="tool_b",
            description="Tool B",
            parameters={"type": "object"},
        )
        def tool_b() -> dict:
            return {}

        schemas = reg.schemas(["tool_a"])
        assert len(schemas) == 1
        assert schemas[0].name == "tool_a"

        all_schemas = reg.schemas()
        assert len(all_schemas) == 2
