"""Integration test — Full agent loop with mock provider.

Demonstrates that the architecture works end-to-end:
Provider → EventStream → Agent → Tool execution → Loop → Final answer
"""

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
    ToolCall,
    ToolCallEndEvent,
    ToolCallStartEvent,
)
from edufish_engine.ai.registry import register_provider
from edufish_engine.ai.stream import EventStream
from edufish_engine.engine.agent import Agent, AgentConfig, AgentDoneEvent, ToolExecutingEvent, ToolResultEvent
from edufish_engine.engine.tools import ToolRegistry


class MockProvider:
    """A mock provider that simulates tool-calling behavior.

    First call: returns a tool call to search_materials
    Second call (after tool result): returns a text answer
    """

    def __init__(self):
        self._call_count = 0

    @property
    def api(self) -> str:
        return "mock"

    def stream(self, model, context, **options) -> EventStream:
        stream = EventStream()
        self._call_count += 1

        async def _push():
            await asyncio.sleep(0.01)
            stream.push(StartEvent())

            if self._call_count == 1:
                # First call: emit a tool call
                tc = ToolCall(id="tc-1", name="search_materials", arguments={"query": "反向传播"})
                stream.push(ToolCallStartEvent(name="search_materials", content_index=1))
                stream.push(ToolCallEndEvent(tool_call=tc, content_index=1))
                msg = AssistantMessage(
                    content=[tc],
                    stop_reason="tool_use",
                    timestamp=time.time(),
                )
                stream.push(DoneEvent(message=msg, stop_reason="tool_use"))
            else:
                # Second call: emit text answer
                stream.push(TextDeltaEvent(delta="反向传播是"))
                stream.push(TextDeltaEvent(delta="神经网络训练的核心算法。"))
                msg = AssistantMessage(
                    content=[TextContent(text="反向传播是神经网络训练的核心算法。")],
                    stop_reason="stop",
                    timestamp=time.time(),
                )
                stream.push(DoneEvent(message=msg, stop_reason="stop"))

        asyncio.create_task(_push())
        return stream

    def stream_sync(self, model, context, **options):
        raise NotImplementedError


# Register mock provider
register_provider(MockProvider())


@pytest.fixture
def mock_tools():
    """Create a tool registry with a mock search tool."""
    reg = ToolRegistry()

    @reg.register(
        name="search_materials",
        description="搜索课程材料",
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    )
    def search_materials(query: str = "") -> dict:
        return {
            "results": [
                {"content": "反向传播通过链式法则计算梯度...", "heading": "第3章 神经网络"}
            ],
            "count": 1,
        }

    return reg


@pytest.mark.asyncio
async def test_agent_tool_calling_loop(mock_tools):
    """Test the full agent loop: LLM → tool call → execute → LLM → answer."""
    model = Model(id="mock-model", provider="mock", api="mock", base_url="")

    config = AgentConfig(
        name="test-tutor",
        system_prompt="你是学习助手",
        tools=["search_materials"],
        model=model,
        max_iterations=5,
    )

    agent = Agent(config=config, tool_registry=mock_tools)

    events = []
    async for event in agent.run("什么是反向传播？"):
        events.append(event)

    # Verify event sequence
    event_types = [e.type for e in events]

    # Should have: iteration → start → toolcall_start → toolcall_end → done
    #              → tool_executing → tool_result
    #              → iteration → start → text_delta → text_delta → done
    #              → agent_done
    assert "iteration" in event_types
    assert "toolcall_start" in event_types
    assert "tool_executing" in event_types
    assert "tool_result" in event_types
    assert "text_delta" in event_types
    assert "agent_done" in event_types

    # Final event should be agent_done with the answer
    final = events[-1]
    assert isinstance(final, AgentDoneEvent)
    assert "反向传播" in final.answer
    assert final.tool_calls_made == 1
    assert final.iterations == 2


@pytest.mark.asyncio
async def test_agent_complete(mock_tools):
    """Test the convenience complete() method."""
    model = Model(id="mock-model", provider="mock", api="mock", base_url="")

    config = AgentConfig(
        name="test-tutor",
        system_prompt="你是学习助手",
        tools=["search_materials"],
        model=model,
    )

    # Reset mock provider call count
    from edufish_engine.ai.registry import get_provider
    provider = get_provider("mock")
    provider._call_count = 0

    agent = Agent(config=config, tool_registry=mock_tools)
    answer = await agent.complete("什么是反向传播？")

    assert "反向传播" in answer
    assert "核心算法" in answer
