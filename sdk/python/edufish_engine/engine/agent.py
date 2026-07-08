"""Agent — Tool-calling loop that consumes the AI layer.

This is the equivalent of pi's AgentSession + opencode's Agent.
It orchestrates: LLM call → tool execution → feed results back → repeat.

Key difference from the old backend/app/agents/base.py:
- The agent doesn't call the LLM directly — it uses the AI layer's stream()
- Tool execution is decoupled from the LLM call
- Events flow through a unified EventStream that consumers can observe

The agent is a state machine:
  IDLE → STREAMING → (TOOL_EXECUTING → STREAMING)* → DONE
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

from ..ai import (
    AssistantMessage,
    Context,
    DoneEvent,
    ErrorEvent,
    Event,
    Model,
    TextContent,
    TextDeltaEvent,
    ToolCall,
    ToolCallEndEvent,
    ToolCallStartEvent,
    ToolResultMessage,
    UserMessage,
)
from ..ai.registry import stream as ai_stream
from .tools import ToolRegistry, registry as global_registry

logger = logging.getLogger(__name__)


# ── Agent Events (extend base AI events with agent-specific semantics) ───────


@dataclass(frozen=True)
class ToolExecutingEvent:
    """Agent is executing a tool (not an LLM event — agent-level)."""

    type: str = "tool_executing"
    name: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolResultEvent:
    """Tool execution completed."""

    type: str = "tool_result"
    name: str = ""
    result_preview: str = ""
    is_error: bool = False


@dataclass(frozen=True)
class IterationEvent:
    """Agent is starting a new iteration (tool results fed back to LLM)."""

    type: str = "iteration"
    iteration: int = 0


@dataclass(frozen=True)
class AgentDoneEvent:
    """Agent has produced a final answer."""

    type: str = "agent_done"
    answer: str = ""
    tool_calls_made: int = 0
    iterations: int = 0


AgentEvent = Event | ToolExecutingEvent | ToolResultEvent | IterationEvent | AgentDoneEvent


# ── Agent Configuration ──────────────────────────────────────────────────────


@dataclass
class AgentConfig:
    """Configuration for a specialized agent."""

    name: str
    system_prompt: str
    tools: list[str]  # Tool names this agent can use
    model: Model | None = None  # Override default model
    temperature: float = 0.7
    max_iterations: int = 8
    max_tokens: int = 4096


# ── Agent ────────────────────────────────────────────────────────────────────


class Agent:
    """Tool-calling agent that loops until it produces a text answer.

    Usage:
        agent = Agent(config, model=my_model)

        # Streaming (for CLI/Web)
        async for event in agent.run("什么是反向传播？"):
            handle(event)

        # Or collect the final answer
        result = await agent.complete("什么是反向传播？")
    """

    def __init__(
        self,
        config: AgentConfig,
        model: Model | None = None,
        tool_registry: ToolRegistry | None = None,
    ) -> None:
        self.config = config
        self.model = model or config.model
        self.tools = tool_registry or global_registry

        if self.model is None:
            raise ValueError("Agent requires a Model (pass via config.model or model=)")

    async def run(
        self,
        user_input: str,
        context_vars: dict[str, str] | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """Run the agent, yielding events as they happen.

        This is the primary interface. Both CLI and Web consume this.
        """
        # Build system prompt with optional context variables
        system_prompt = self.config.system_prompt
        if context_vars:
            ctx_lines = [f"{k}: {v}" for k, v in context_vars.items() if v]
            if ctx_lines:
                system_prompt += "\n\n## 当前上下文\n" + "\n".join(ctx_lines)

        # Conversation history for this run
        messages = [UserMessage(content=user_input, timestamp=time.time())]
        tool_schemas = self.tools.schemas(self.config.tools)
        total_tool_calls = 0

        for iteration in range(self.config.max_iterations):
            yield IterationEvent(iteration=iteration)

            # Build context for AI layer
            ctx = Context(
                system_prompt=system_prompt,
                messages=messages,
                tools=tool_schemas,
            )

            # Stream from AI layer
            event_stream = ai_stream(
                self.model,
                ctx,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
            )

            # Collect the assistant response while forwarding events
            assistant_msg: AssistantMessage | None = None
            async for event in event_stream:
                # Forward AI events to consumer
                yield event

                if isinstance(event, DoneEvent):
                    assistant_msg = event.message
                elif isinstance(event, ErrorEvent):
                    yield AgentDoneEvent(
                        answer=event.error_message,
                        tool_calls_made=total_tool_calls,
                        iterations=iteration + 1,
                    )
                    return

            if assistant_msg is None:
                yield AgentDoneEvent(answer="", tool_calls_made=total_tool_calls, iterations=iteration + 1)
                return

            # Check if there are tool calls to execute
            tool_calls = assistant_msg.tool_calls
            if not tool_calls:
                # No tool calls — this is the final answer
                yield AgentDoneEvent(
                    answer=assistant_msg.text,
                    tool_calls_made=total_tool_calls,
                    iterations=iteration + 1,
                )
                return

            # Execute tools and build result messages
            messages.append(assistant_msg)  # Add assistant message to history

            for tc in tool_calls:
                total_tool_calls += 1
                yield ToolExecutingEvent(name=tc.name, arguments=tc.arguments)

                result = self.tools.execute(tc.name, tc.arguments)
                is_error = "error" in result
                result_str = json.dumps(result, ensure_ascii=False)

                yield ToolResultEvent(
                    name=tc.name,
                    result_preview=result_str[:300],
                    is_error=is_error,
                )

                messages.append(ToolResultMessage(
                    tool_call_id=tc.id,
                    tool_name=tc.name,
                    content=result_str,
                    is_error=is_error,
                    timestamp=time.time(),
                ))

            # Loop: feed tool results back to LLM

        # Max iterations reached
        yield AgentDoneEvent(
            answer=f"达到最大迭代次数 ({self.config.max_iterations})",
            tool_calls_made=total_tool_calls,
            iterations=self.config.max_iterations,
        )

    async def complete(self, user_input: str, context_vars: dict[str, str] | None = None) -> str:
        """Run agent and return just the final answer text."""
        answer = ""
        async for event in self.run(user_input, context_vars):
            if isinstance(event, AgentDoneEvent):
                answer = event.answer
        return answer
