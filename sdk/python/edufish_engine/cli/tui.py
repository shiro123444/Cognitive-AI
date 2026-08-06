"""TUI Renderer — Rich terminal output for streaming events.

Inspired by pi's TUI: shows streaming text, tool call spinners,
citations, and thinking indicators.
"""

from __future__ import annotations

import sys
from typing import Any

from rich.console import Console
from rich.live import Live
from rich.markdown import Markdown
from rich.panel import Panel
from rich.spinner import Spinner
from rich.text import Text

from ..ai import (
    DoneEvent,
    ErrorEvent,
    TextDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
    ThinkingDeltaEvent,
)
from ..engine.agent import (
    AgentDoneEvent,
    AgentEvent,
    IterationEvent,
    ToolExecutingEvent,
    ToolResultEvent,
)

console = Console()


class StreamRenderer:
    """Renders agent events to the terminal in real-time.

    This is the CLI's equivalent of the web frontend's SSE consumer.
    Both consume the same event protocol.
    """

    def __init__(self, show_tools: bool = True, show_thinking: bool = False) -> None:
        self.show_tools = show_tools
        self.show_thinking = show_thinking
        self._text_buf = ""
        self._thinking_buf = ""
        self._tool_calls = 0

    async def render(self, events) -> str:
        """Consume an async event stream and render to terminal.

        Returns the final answer text.
        """
        answer = ""

        async for event in events:
            self._handle_event(event)
            if isinstance(event, AgentDoneEvent):
                answer = event.answer

        # Final newline after streaming text
        if self._text_buf:
            sys.stdout.write("\n")
            sys.stdout.flush()

        return answer

    def _handle_event(self, event: AgentEvent) -> None:
        """Dispatch event to the appropriate renderer."""
        if isinstance(event, TextDeltaEvent):
            # Stream text character by character
            sys.stdout.write(event.delta)
            sys.stdout.flush()
            self._text_buf += event.delta

        elif isinstance(event, ThinkingDeltaEvent):
            if self.show_thinking:
                console.print(f"[dim]{event.delta}[/dim]", end="")

        elif isinstance(event, ToolCallStartEvent):
            if self.show_tools:
                console.print(f"\n[cyan]🔧 调用工具: {event.name}[/cyan]", highlight=False)

        elif isinstance(event, ToolExecutingEvent):
            if self.show_tools:
                args_preview = str(event.arguments)[:80]
                console.print(f"   [dim]参数: {args_preview}[/dim]", highlight=False)

        elif isinstance(event, ToolResultEvent):
            if self.show_tools:
                status = "[red]✗[/red]" if event.is_error else "[green]✓[/green]"
                preview = event.result_preview[:100]
                console.print(f"   {status} [dim]{preview}[/dim]", highlight=False)
                console.print()  # Blank line before next LLM response

        elif isinstance(event, IterationEvent):
            if event.iteration > 0 and self.show_tools:
                console.print(f"[dim]── 第 {event.iteration + 1} 轮推理 ──[/dim]")

        elif isinstance(event, ErrorEvent):
            console.print(f"\n[red]错误: {event.error_message}[/red]")

        elif isinstance(event, AgentDoneEvent):
            if event.tool_calls_made > 0 and self.show_tools:
                console.print(
                    f"\n[dim]({event.iterations} 轮, {event.tool_calls_made} 次工具调用)[/dim]"
                )


def print_citations(citations: list[dict[str, Any]]) -> None:
    """Print citation sources after the answer."""
    if not citations:
        return
    console.print("\n[bold]📚 参考来源:[/bold]")
    for i, cite in enumerate(citations, 1):
        title = cite.get("title", "未知")
        snippet = cite.get("snippet", "")[:80]
        console.print(f"  {i}. [cyan]{title}[/cyan]")
        if snippet:
            console.print(f"     [dim]{snippet}[/dim]")
