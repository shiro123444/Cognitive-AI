"""OpenAI-Compatible Provider.

Handles any endpoint that speaks the OpenAI chat completions protocol:
- OpenAI (gpt-4o, o1, etc.)
- Ollama (localhost:11434/v1)
- NVIDIA NIM
- vLLM, LM Studio, etc.

This single provider covers ~90% of use cases. Additional providers
(Anthropic native, Google Vertex) can be added later without changing
any consumer code.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from openai import OpenAI

from .. import (
    AssistantMessage,
    Context,
    DoneEvent,
    ErrorEvent,
    Model,
    StartEvent,
    TextContent,
    TextDeltaEvent,
    ThinkingContent,
    ThinkingDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
    Usage,
)
from ..registry import register_provider
from ..stream import EventStream, SyncEventStream

logger = logging.getLogger(__name__)


def _build_messages(context: Context) -> list[dict[str, Any]]:
    """Convert our Context into OpenAI message format."""
    messages = []

    if context.system_prompt:
        messages.append({"role": "system", "content": context.system_prompt})

    for msg in context.messages:
        if msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        elif msg.role == "assistant":
            # Reconstruct assistant message with tool_calls if present
            entry: dict[str, Any] = {"role": "assistant"}
            text_parts = [c.text for c in msg.content if isinstance(c, TextContent)]
            entry["content"] = "".join(text_parts) or ""

            tool_calls = [c for c in msg.content if isinstance(c, ToolCall)]
            if tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                        },
                    }
                    for tc in tool_calls
                ]
            messages.append(entry)
        elif msg.role == "tool_result":
            messages.append({
                "role": "tool",
                "tool_call_id": msg.tool_call_id,
                "content": msg.content,
            })

    return messages


def _build_tools(context: Context) -> list[dict[str, Any]] | None:
    """Convert Tool definitions to OpenAI format."""
    if not context.tools:
        return None
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        }
        for tool in context.tools
    ]


class OpenAICompatibleProvider:
    """Provider for any OpenAI-compatible chat completions endpoint."""

    @property
    def api(self) -> str:
        return "openai-compatible"

    def stream(self, model: Model, context: Context, **options) -> EventStream:
        """Async streaming via background thread (OpenAI SDK is sync internally)."""
        event_stream = EventStream()

        def _run():
            try:
                self._stream_into(model, context, event_stream, **options)
            except Exception as exc:
                logger.exception("OpenAI stream failed")
                event_stream.error(str(exc))

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return event_stream

    def stream_sync(self, model: Model, context: Context, **options) -> SyncEventStream:
        """Synchronous streaming for Flask/WSGI."""
        sync_stream = SyncEventStream()
        try:
            self._stream_into_sync(model, context, sync_stream, **options)
        except Exception as exc:
            logger.exception("OpenAI sync stream failed")
            sync_stream.push(ErrorEvent(error_message=str(exc)))
        return sync_stream

    def _stream_into(self, model: Model, context: Context, stream: EventStream, **options) -> None:
        """Core streaming logic — pushes events into an EventStream."""
        client = OpenAI(base_url=model.base_url, api_key=model.api_key or "sk-placeholder")
        messages = _build_messages(context)
        tools = _build_tools(context)

        kwargs: dict[str, Any] = {
            "model": model.id,
            "messages": messages,
            "stream": True,
            "temperature": options.get("temperature", 0.7),
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if model.max_tokens:
            kwargs["max_tokens"] = options.get("max_tokens", model.max_tokens)

        # Emit start
        partial = AssistantMessage(provider=model.provider, model=model.id, timestamp=time.time())
        stream.push(StartEvent(partial=partial))

        # Accumulate content
        text_buf = ""
        tool_call_bufs: dict[int, dict[str, Any]] = {}  # index -> {id, name, arguments_str}

        response = client.chat.completions.create(**kwargs)

        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # Text delta
            if delta.content:
                text_buf += delta.content
                stream.push(TextDeltaEvent(delta=delta.content, content_index=0))

            # Tool call deltas
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_call_bufs:
                        tool_call_bufs[idx] = {
                            "id": tc_delta.id or "",
                            "name": tc_delta.function.name or "" if tc_delta.function else "",
                            "arguments": "",
                        }
                        if tool_call_bufs[idx]["name"]:
                            stream.push(ToolCallStartEvent(
                                content_index=idx + 1,
                                name=tool_call_bufs[idx]["name"],
                            ))
                    else:
                        if tc_delta.id:
                            tool_call_bufs[idx]["id"] = tc_delta.id
                        if tc_delta.function and tc_delta.function.name:
                            tool_call_bufs[idx]["name"] = tc_delta.function.name

                    if tc_delta.function and tc_delta.function.arguments:
                        tool_call_bufs[idx]["arguments"] += tc_delta.function.arguments
                        stream.push(ToolCallDeltaEvent(
                            delta=tc_delta.function.arguments,
                            content_index=idx + 1,
                        ))

            # Check finish reason
            finish = chunk.choices[0].finish_reason
            if finish:
                break

        # Build final message
        content: list = []
        if text_buf:
            content.append(TextContent(text=text_buf))

        for idx in sorted(tool_call_bufs.keys()):
            tc_buf = tool_call_bufs[idx]
            try:
                args = json.loads(tc_buf["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            tc = ToolCall(id=tc_buf["id"], name=tc_buf["name"], arguments=args)
            content.append(tc)
            stream.push(ToolCallEndEvent(content_index=idx + 1, tool_call=tc))

        # Determine stop reason
        stop_reason = "stop"
        if tool_call_bufs:
            stop_reason = "tool_use"

        # Usage (if available)
        usage = None
        # Note: streaming doesn't always return usage; we leave it None

        final = AssistantMessage(
            content=content,
            provider=model.provider,
            model=model.id,
            usage=usage,
            stop_reason=stop_reason,
            timestamp=time.time(),
        )
        stream.push(DoneEvent(message=final, stop_reason=stop_reason))

    def _stream_into_sync(self, model: Model, context: Context, stream: SyncEventStream, **options) -> None:
        """Same logic but pushes into SyncEventStream directly (no thread)."""
        client = OpenAI(base_url=model.base_url, api_key=model.api_key or "sk-placeholder")
        messages = _build_messages(context)
        tools = _build_tools(context)

        kwargs: dict[str, Any] = {
            "model": model.id,
            "messages": messages,
            "stream": True,
            "temperature": options.get("temperature", 0.7),
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if model.max_tokens:
            kwargs["max_tokens"] = options.get("max_tokens", model.max_tokens)

        partial = AssistantMessage(provider=model.provider, model=model.id, timestamp=time.time())
        stream.push(StartEvent(partial=partial))

        text_buf = ""
        tool_call_bufs: dict[int, dict[str, Any]] = {}

        response = client.chat.completions.create(**kwargs)

        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            if delta.content:
                text_buf += delta.content
                stream.push(TextDeltaEvent(delta=delta.content, content_index=0))

            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_call_bufs:
                        tool_call_bufs[idx] = {
                            "id": tc_delta.id or "",
                            "name": tc_delta.function.name or "" if tc_delta.function else "",
                            "arguments": "",
                        }
                        if tool_call_bufs[idx]["name"]:
                            stream.push(ToolCallStartEvent(
                                content_index=idx + 1,
                                name=tool_call_bufs[idx]["name"],
                            ))
                    else:
                        if tc_delta.id:
                            tool_call_bufs[idx]["id"] = tc_delta.id
                        if tc_delta.function and tc_delta.function.name:
                            tool_call_bufs[idx]["name"] = tc_delta.function.name

                    if tc_delta.function and tc_delta.function.arguments:
                        tool_call_bufs[idx]["arguments"] += tc_delta.function.arguments
                        stream.push(ToolCallDeltaEvent(
                            delta=tc_delta.function.arguments,
                            content_index=idx + 1,
                        ))

            if chunk.choices[0].finish_reason:
                break

        content: list = []
        if text_buf:
            content.append(TextContent(text=text_buf))

        for idx in sorted(tool_call_bufs.keys()):
            tc_buf = tool_call_bufs[idx]
            try:
                args = json.loads(tc_buf["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            tc = ToolCall(id=tc_buf["id"], name=tc_buf["name"], arguments=args)
            content.append(tc)
            stream.push(ToolCallEndEvent(content_index=idx + 1, tool_call=tc))

        stop_reason = "tool_use" if tool_call_bufs else "stop"
        final = AssistantMessage(
            content=content,
            provider=model.provider,
            model=model.id,
            stop_reason=stop_reason,
            timestamp=time.time(),
        )
        stream.push(DoneEvent(message=final, stop_reason=stop_reason))


# ── Self-register at import time ─────────────────────────────────────────────

register_provider(OpenAICompatibleProvider())
