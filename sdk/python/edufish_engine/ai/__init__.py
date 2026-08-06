"""AI Protocol Layer — Types.

Defines the unified message protocol that all providers emit into
and all consumers (CLI, Web, tests) read from.

Design principle from pi: the AI layer is a protocol, not an implementation.
It doesn't know about agents, tools, RAG, or education — it just moves
messages between the application and LLM providers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ── Content Types ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TextContent:
    """A text segment in a message."""

    type: str = "text"
    text: str = ""


@dataclass(frozen=True)
class ThinkingContent:
    """A reasoning/thinking segment (for models that expose chain-of-thought)."""

    type: str = "thinking"
    thinking: str = ""
    redacted: bool = False


@dataclass(frozen=True)
class ToolCall:
    """A tool invocation requested by the model."""

    type: str = "tool_call"
    id: str = ""
    name: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ImageContent:
    """An image attachment."""

    type: str = "image"
    data: str = ""  # base64
    mime_type: str = "image/png"


Content = TextContent | ThinkingContent | ToolCall | ImageContent


# ── Messages ─────────────────────────────────────────────────────────────────


@dataclass
class UserMessage:
    """A message from the user."""

    role: str = "user"
    content: str = ""
    timestamp: float = 0.0


@dataclass
class AssistantMessage:
    """A complete response from the model."""

    role: str = "assistant"
    content: list[Content] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    usage: Usage | None = None
    stop_reason: StopReason = "stop"
    error_message: str | None = None
    timestamp: float = 0.0

    @property
    def text(self) -> str:
        """Extract concatenated text from all TextContent segments."""
        return "".join(c.text for c in self.content if isinstance(c, TextContent))

    @property
    def tool_calls(self) -> list[ToolCall]:
        """Extract all tool calls from content."""
        return [c for c in self.content if isinstance(c, ToolCall)]


@dataclass
class ToolResultMessage:
    """Result of executing a tool, fed back to the model."""

    role: str = "tool_result"
    tool_call_id: str = ""
    tool_name: str = ""
    content: str = ""
    is_error: bool = False
    timestamp: float = 0.0


Message = UserMessage | AssistantMessage | ToolResultMessage


# ── Usage & Stop Reasons ─────────────────────────────────────────────────────


StopReason = str  # "stop" | "length" | "tool_use" | "error" | "aborted"


@dataclass
class Usage:
    """Token usage for a single LLM call."""

    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0

    @property
    def total(self) -> int:
        return self.input + self.output


# ── Tool Definition ──────────────────────────────────────────────────────────


@dataclass
class Tool:
    """A tool that can be offered to the model.

    The AI layer only cares about the schema — execution is external.
    This is pi's key insight: tools are declarative here, imperative elsewhere.
    """

    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


# ── Context ──────────────────────────────────────────────────────────────────


@dataclass
class Context:
    """Everything needed to make an LLM call.

    This is the single input to stream()/complete().
    The AI layer doesn't interpret the content — it just passes it through
    to the provider in the right format.
    """

    system_prompt: str = ""
    messages: list[Message] = field(default_factory=list)
    tools: list[Tool] = field(default_factory=list)


# ── Model ────────────────────────────────────────────────────────────────────


@dataclass
class Model:
    """A specific model on a specific provider.

    Analogous to pi's Model<TApi> — identifies what to call and how.
    """

    id: str  # e.g. "qwen2.5:14b", "gpt-4o-mini"
    provider: str  # e.g. "ollama", "openai", "nvidia-nim"
    api: str = "openai-compatible"  # protocol to use
    base_url: str = ""
    api_key: str = ""
    # Capabilities
    reasoning: bool = False
    context_window: int = 128_000
    max_tokens: int = 4096


# ── Stream Events ────────────────────────────────────────────────────────────
# This is the core protocol. Every LLM interaction produces an EventStream
# of these events. Consumers (CLI TUI, Web SSE, tests) all read the same stream.


@dataclass(frozen=True)
class StartEvent:
    """Stream has started, partial message available."""

    type: str = "start"
    partial: AssistantMessage | None = None


@dataclass(frozen=True)
class TextDeltaEvent:
    """Incremental text token."""

    type: str = "text_delta"
    delta: str = ""
    content_index: int = 0


@dataclass(frozen=True)
class ThinkingDeltaEvent:
    """Incremental thinking/reasoning token."""

    type: str = "thinking_delta"
    delta: str = ""
    content_index: int = 0


@dataclass(frozen=True)
class ToolCallStartEvent:
    """Model is starting a tool call."""

    type: str = "toolcall_start"
    content_index: int = 0
    name: str = ""


@dataclass(frozen=True)
class ToolCallDeltaEvent:
    """Incremental tool call arguments."""

    type: str = "toolcall_delta"
    delta: str = ""
    content_index: int = 0


@dataclass(frozen=True)
class ToolCallEndEvent:
    """Tool call is complete, arguments fully parsed."""

    type: str = "toolcall_end"
    content_index: int = 0
    tool_call: ToolCall | None = None


@dataclass(frozen=True)
class DoneEvent:
    """Stream completed successfully."""

    type: str = "done"
    message: AssistantMessage | None = None
    stop_reason: StopReason = "stop"


@dataclass(frozen=True)
class ErrorEvent:
    """Stream terminated with an error."""

    type: str = "error"
    message: AssistantMessage | None = None
    error_message: str = ""


Event = (
    StartEvent
    | TextDeltaEvent
    | ThinkingDeltaEvent
    | ToolCallStartEvent
    | ToolCallDeltaEvent
    | ToolCallEndEvent
    | DoneEvent
    | ErrorEvent
)
