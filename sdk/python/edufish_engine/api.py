"""EduFish Engine — Local AI learning companion SDK.

A unified engine that powers both the web platform and the local CLI.
Architecture inspired by pi's layered design.
"""

from __future__ import annotations

from .ai import (
    AssistantMessage,
    Context,
    Event,
    Model,
    TextContent,
    TextDeltaEvent,
    Tool,
    ToolCall,
    UserMessage,
)
from .ai.registry import complete, stream
from .ai.stream import EventStream
from .engine.agent import Agent, AgentConfig
from .engine.session import Session
from .engine.tools import registry as tool_registry

__all__ = [
    # AI layer
    "stream",
    "complete",
    "EventStream",
    "Model",
    "Context",
    "Event",
    "Tool",
    "AssistantMessage",
    "UserMessage",
    "TextContent",
    "TextDeltaEvent",
    "ToolCall",
    # Engine layer
    "Agent",
    "AgentConfig",
    "Session",
    "tool_registry",
]
