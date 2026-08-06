"""Tool Registry — Declarative tools with handlers.

Design principle from pi: the AI layer only sees tool schemas.
The engine layer owns the handlers. This separation means:
1. Tools are testable in isolation
2. The same tool schema works across providers
3. Tool execution is observable (events emitted for each call)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from ...ai import Tool

logger = logging.getLogger(__name__)


@dataclass
class ToolHandler:
    """A tool with both its schema (for the LLM) and handler (for execution)."""

    tool: Tool  # Schema sent to the model
    handler: Callable[..., dict[str, Any]]  # Execution function
    requires_context: bool = False  # Whether handler needs session context


class ToolRegistry:
    """Registry of available tools.

    Tools register themselves (decorator pattern), and the agent
    queries the registry for schemas and handlers separately.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolHandler] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
        requires_context: bool = False,
    ) -> Callable:
        """Decorator to register a function as a tool handler."""

        def decorator(func: Callable[..., dict[str, Any]]) -> Callable:
            tool = Tool(name=name, description=description, parameters=parameters)
            self._tools[name] = ToolHandler(
                tool=tool, handler=func, requires_context=requires_context
            )
            return func

        return decorator

    def get(self, name: str) -> ToolHandler | None:
        return self._tools.get(name)

    def schemas(self, names: list[str] | None = None) -> list[Tool]:
        """Get Tool schemas for a subset (or all) tools."""
        if names is None:
            return [th.tool for th in self._tools.values()]
        return [self._tools[n].tool for n in names if n in self._tools]

    def execute(self, name: str, arguments: dict[str, Any], context: dict | None = None) -> dict[str, Any]:
        """Execute a tool by name. Returns the result dict."""
        handler = self._tools.get(name)
        if handler is None:
            return {"error": f"unknown tool: {name}"}
        try:
            if handler.requires_context and context:
                return handler.handler(**arguments, _context=context)
            return handler.handler(**arguments)
        except TypeError as exc:
            return {"error": f"invalid arguments for {name}: {exc}"}
        except Exception as exc:
            logger.exception("Tool %s failed", name)
            return {"error": f"tool {name} raised: {exc}"}

    def list_names(self) -> list[str]:
        return sorted(self._tools.keys())


# Global registry instance
registry = ToolRegistry()
