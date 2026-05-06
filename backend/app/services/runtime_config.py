"""Runtime configuration stored outside source control."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlparse


LLM_KEYS = {
    "base_url": "LLM_BASE_URL",
    "model": "LLM_MODEL_NAME",
    "api_key": "LLM_API_KEY",
}

EMBEDDING_KEYS = {
    "base_url": "EMBEDDING_BASE_URL",
    "model": "EMBEDDING_MODEL",
    "api_key": "EMBEDDING_API_KEY",
    "query_input_type": "EMBEDDING_QUERY_INPUT_TYPE",
    "passage_input_type": "EMBEDDING_PASSAGE_INPUT_TYPE",
    "truncate": "EMBEDDING_TRUNCATE",
}


class RuntimeConfigError(ValueError):
    pass


def runtime_config_path(app) -> Path:
    configured_path = app.config.get("RUNTIME_CONFIG_PATH")
    if configured_path:
        return Path(configured_path)
    return Path(app.instance_path) / "runtime_config.json"


def load_runtime_config(app) -> dict:
    path = runtime_config_path(app)
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError:
        return {}

    return payload if isinstance(payload, dict) else {}


def save_runtime_config(app, payload: dict) -> None:
    path = runtime_config_path(app)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, path)


def apply_runtime_config(app) -> None:
    payload = load_runtime_config(app)
    llm = payload.get("llm") if isinstance(payload.get("llm"), dict) else {}
    embedding = payload.get("embedding") if isinstance(payload.get("embedding"), dict) else {}
    for runtime_key, config_key in LLM_KEYS.items():
        value = llm.get(runtime_key)
        if isinstance(value, str) and value:
            app.config[config_key] = value
    if embedding:
        _apply_embedding_config(app, embedding)
    else:
        _sync_embedding_config(app, llm)


def serialize_llm_settings(app) -> dict:
    api_key = app.config.get("LLM_API_KEY") or ""
    serialized = {
        "base_url": app.config.get("LLM_BASE_URL") or "",
        "model": app.config.get("LLM_MODEL_NAME") or "",
        "api_key_configured": bool(api_key),
    }
    if api_key:
        serialized["api_key_hint"] = mask_secret(api_key)
    return serialized


def serialize_embedding_settings(app) -> dict:
    api_key = app.config.get("EMBEDDING_API_KEY") or ""
    serialized = {
        "base_url": app.config.get("EMBEDDING_BASE_URL") or "",
        "model": app.config.get("EMBEDDING_MODEL") or "",
        "api_key_configured": bool(api_key),
        "query_input_type": app.config.get("EMBEDDING_QUERY_INPUT_TYPE") or "",
        "passage_input_type": app.config.get("EMBEDDING_PASSAGE_INPUT_TYPE") or "",
        "truncate": app.config.get("EMBEDDING_TRUNCATE") or "",
    }
    if api_key:
        serialized["api_key_hint"] = mask_secret(api_key)
    return serialized


def update_llm_settings(app, payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeConfigError("request body must be an object")

    current_api_key = app.config.get("LLM_API_KEY") or ""
    base_url = _clean(payload.get("base_url", app.config.get("LLM_BASE_URL")))
    model = _clean(payload.get("model", app.config.get("LLM_MODEL_NAME")))
    clear_api_key = bool(payload.get("clear_api_key"))

    api_key = current_api_key
    if clear_api_key:
        api_key = ""
    elif isinstance(payload.get("api_key"), str) and payload.get("api_key").strip():
        api_key = payload.get("api_key").strip()

    validate_llm_settings(base_url=base_url, model=model)

    persisted = load_runtime_config(app)
    persisted["llm"] = {
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
    }
    save_runtime_config(app, persisted)

    app.config["LLM_BASE_URL"] = base_url
    app.config["LLM_MODEL_NAME"] = model
    app.config["LLM_API_KEY"] = api_key
    if not isinstance(persisted.get("embedding"), dict):
        _sync_embedding_config(app, persisted["llm"], force_empty_key=True)

    return serialize_llm_settings(app)


def update_embedding_settings(app, payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeConfigError("request body must be an object")

    current_api_key = app.config.get("EMBEDDING_API_KEY") or ""
    base_url = _clean(payload.get("base_url", app.config.get("EMBEDDING_BASE_URL")))
    model = _clean(payload.get("model", app.config.get("EMBEDDING_MODEL")))
    clear_api_key = bool(payload.get("clear_api_key"))

    api_key = current_api_key
    if clear_api_key:
        api_key = ""
    elif isinstance(payload.get("api_key"), str) and payload.get("api_key").strip():
        api_key = payload.get("api_key").strip()

    query_input_type = _clean(payload.get("query_input_type", app.config.get("EMBEDDING_QUERY_INPUT_TYPE")))
    passage_input_type = _clean(payload.get("passage_input_type", app.config.get("EMBEDDING_PASSAGE_INPUT_TYPE")))
    query_input_type, passage_input_type = _default_embedding_input_types(
        base_url=base_url,
        model=model,
        query_input_type=query_input_type,
        passage_input_type=passage_input_type,
    )
    truncate = _clean(payload.get("truncate", app.config.get("EMBEDDING_TRUNCATE"))).upper()

    validate_embedding_settings(
        base_url=base_url,
        model=model,
        query_input_type=query_input_type,
        passage_input_type=passage_input_type,
        truncate=truncate,
    )

    persisted = load_runtime_config(app)
    persisted["embedding"] = {
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
        "query_input_type": query_input_type,
        "passage_input_type": passage_input_type,
        "truncate": truncate,
    }
    save_runtime_config(app, persisted)

    _apply_embedding_config(app, persisted["embedding"], force_empty_key=True)
    return serialize_embedding_settings(app)


def validate_llm_settings(*, base_url: str, model: str) -> None:
    if not base_url:
        raise RuntimeConfigError("base_url is required")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeConfigError("base_url must be a valid http(s) URL")
    if not model:
        raise RuntimeConfigError("model is required")


def validate_embedding_settings(
    *,
    base_url: str,
    model: str,
    query_input_type: str = "",
    passage_input_type: str = "",
    truncate: str = "",
) -> None:
    validate_llm_settings(base_url=base_url, model=model)
    allowed_input_types = {"", "query", "passage"}
    if query_input_type not in allowed_input_types:
        raise RuntimeConfigError("query_input_type must be query, passage, or empty")
    if passage_input_type not in allowed_input_types:
        raise RuntimeConfigError("passage_input_type must be query, passage, or empty")
    if truncate not in {"", "NONE", "START", "END"}:
        raise RuntimeConfigError("truncate must be NONE, START, END, or empty")


def mask_secret(secret: str) -> str:
    if len(secret) <= 4:
        return "****"
    return f"****{secret[-4:]}"


def _clean(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _sync_embedding_config(app, llm: dict, force_empty_key: bool = False) -> None:
    base_url = llm.get("base_url")
    api_key = llm.get("api_key")

    if isinstance(base_url, str) and base_url:
        app.config["EMBEDDING_BASE_URL"] = base_url
    if isinstance(api_key, str) and (api_key or force_empty_key):
        app.config["EMBEDDING_API_KEY"] = api_key


def _apply_embedding_config(app, embedding: dict, force_empty_key: bool = False) -> None:
    for runtime_key, config_key in EMBEDDING_KEYS.items():
        value = embedding.get(runtime_key)
        if isinstance(value, str) and (value or (runtime_key == "api_key" and force_empty_key)):
            app.config[config_key] = value


def _default_embedding_input_types(*, base_url: str, model: str, query_input_type: str, passage_input_type: str):
    marker = f"{base_url} {model}".lower()
    if "nvidia" in marker or "nv-embed" in marker or "embedqa" in marker:
        return query_input_type or "query", passage_input_type or "passage"
    return query_input_type, passage_input_type
