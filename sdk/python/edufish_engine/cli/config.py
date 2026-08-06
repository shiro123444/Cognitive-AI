"""CLI Configuration — ~/.edufish/config.toml

Manages local settings: which LLM to use, platform URL, cache paths.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from . import get_config_dir


DEFAULT_CONFIG = {
    "llm": {
        "provider": "ollama",
        "model": "qwen2.5:14b",
        "base_url": "http://localhost:11434/v1",
        "api_key": "",
    },
    "platform": {
        "url": "",
        "api_key": "",
    },
    "rag": {
        "embedding_provider": "ollama",
        "embedding_model": "nomic-embed-text",
        "embedding_base_url": "http://localhost:11434/v1",
        "chunk_max_chars": 800,
    },
}


def config_path() -> Path:
    return get_config_dir() / "config.toml"


def load_config() -> dict[str, Any]:
    """Load config from ~/.edufish/config.toml, or return defaults."""
    path = config_path()
    if not path.exists():
        return DEFAULT_CONFIG.copy()

    try:
        import tomllib
    except ImportError:
        import tomli as tomllib  # type: ignore[no-redef]

    with open(path, "rb") as f:
        user_config = tomllib.load(f)

    # Merge with defaults
    merged = DEFAULT_CONFIG.copy()
    for section, values in user_config.items():
        if section in merged and isinstance(merged[section], dict):
            merged[section] = {**merged[section], **values}
        else:
            merged[section] = values
    return merged


def save_config(config: dict[str, Any]) -> None:
    """Save config to ~/.edufish/config.toml."""
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    lines = []
    for section, values in config.items():
        if isinstance(values, dict):
            lines.append(f"[{section}]")
            for k, v in values.items():
                if isinstance(v, str):
                    lines.append(f'{k} = "{v}"')
                elif isinstance(v, bool):
                    lines.append(f"{k} = {'true' if v else 'false'}")
                elif isinstance(v, (int, float)):
                    lines.append(f"{k} = {v}")
            lines.append("")

    path.write_text("\n".join(lines))


def get_model_from_config(config: dict[str, Any]):
    """Build a Model instance from config."""
    from ..ai import Model

    llm = config.get("llm", {})
    return Model(
        id=llm.get("model", "qwen2.5:14b"),
        provider=llm.get("provider", "ollama"),
        api="openai-compatible",
        base_url=llm.get("base_url", "http://localhost:11434/v1"),
        api_key=llm.get("api_key", ""),
    )
