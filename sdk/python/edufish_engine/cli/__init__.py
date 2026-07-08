"""EduFish CLI — Local learning companion.

A terminal interface that consumes the same engine as the web platform.
Inspired by pi's TUI: rich streaming output, tool call visualization,
and session management.

Usage:
    edufish ask "什么是反向传播？"
    edufish chat --course ai-intro
    edufish sync pull --course ai-intro
    edufish graph explore "注意力机制"
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure providers are registered
from ..ai.providers import OpenAICompatibleProvider  # noqa: F401


def get_config_dir() -> Path:
    """~/.edufish/ — local configuration and cache."""
    return Path.home() / ".edufish"


def get_sessions_dir() -> Path:
    """~/.edufish/sessions/ — persisted conversation sessions."""
    d = get_config_dir() / "sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_cache_dir() -> Path:
    """~/.edufish/cache/ — cached course materials and vector index."""
    d = get_config_dir() / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d
