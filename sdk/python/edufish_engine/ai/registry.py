"""Provider Registry — Plugin system for LLM providers.

Inspired by pi's api-registry.ts: providers self-register, and the
stream() function just looks up the right provider by API type.

The registry is the seam between "what protocol to speak" and
"how to speak it". Adding a new provider means implementing the
Provider protocol and registering it — no other code changes.
"""

from __future__ import annotations

from typing import Protocol

from . import Context, Model
from .stream import EventStream, SyncEventStream


class Provider(Protocol):
    """Protocol that all LLM providers must implement.

    A provider translates our unified Context into provider-specific
    HTTP calls and emits events into an EventStream.
    """

    @property
    def api(self) -> str:
        """The API protocol this provider handles (e.g. 'openai-compatible')."""
        ...

    def stream(self, model: Model, context: Context, **options) -> EventStream:
        """Start a streaming LLM call. Returns immediately with an EventStream."""
        ...

    def stream_sync(self, model: Model, context: Context, **options) -> SyncEventStream:
        """Synchronous streaming for WSGI contexts (Flask)."""
        ...


# ── Global Registry ──────────────────────────────────────────────────────────

_registry: dict[str, Provider] = {}


def register_provider(provider: Provider) -> None:
    """Register a provider. Called at import time by provider modules."""
    _registry[provider.api] = provider


def get_provider(api: str) -> Provider | None:
    """Look up a registered provider by API type."""
    return _registry.get(api)


def list_providers() -> list[str]:
    """List all registered API types."""
    return sorted(_registry.keys())


# ── Public API ───────────────────────────────────────────────────────────────
# These are the only two functions consumers need.
# Equivalent to pi's stream() and complete() in stream.ts.


def stream(model: Model, context: Context, **options) -> EventStream:
    """Stream an LLM response. The primary interface.

    Usage:
        from edufish_engine.ai import stream, Model, Context

        model = Model(id="qwen2.5:14b", provider="ollama", base_url="http://localhost:11434/v1")
        ctx = Context(system_prompt="你是学习助手", messages=[...])

        async for event in stream(model, ctx):
            ...
    """
    provider = get_provider(model.api)
    if provider is None:
        raise ValueError(
            f"No provider registered for api={model.api!r}. "
            f"Available: {list_providers()}"
        )
    return provider.stream(model, context, **options)


def stream_sync(model: Model, context: Context, **options) -> SyncEventStream:
    """Synchronous stream for Flask/WSGI. Same semantics, blocking iteration."""
    provider = get_provider(model.api)
    if provider is None:
        raise ValueError(f"No provider registered for api={model.api!r}")
    return provider.stream_sync(model, context, **options)


async def complete(model: Model, context: Context, **options):
    """Non-streaming completion. Awaits the full response.

    Usage:
        message = await complete(model, ctx)
        print(message.text)
    """
    s = stream(model, context, **options)
    return await s.result()
