"""Teacher-configurable runtime settings."""

from __future__ import annotations

from flask import current_app, jsonify, request

from app.api import api_bp
from app.llm_client import LLMClient
from app.rag.embedding import EmbeddingClient
from app.services.runtime_config import (
    RuntimeConfigError,
    serialize_embedding_settings,
    serialize_llm_settings,
    update_embedding_settings,
    update_llm_settings,
    validate_embedding_settings,
    validate_llm_settings,
)


def _error(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


@api_bp.get("/settings/llm")
def get_llm_settings():
    return jsonify({"success": True, "data": serialize_llm_settings(current_app)})


@api_bp.put("/settings/llm")
def put_llm_settings():
    try:
        payload = request.get_json(silent=True) or {}
        settings = update_llm_settings(current_app, payload)
        return jsonify({"success": True, "data": settings})
    except RuntimeConfigError as exc:
        return _error(str(exc), 400)


@api_bp.get("/settings/embedding")
def get_embedding_settings():
    return jsonify({"success": True, "data": serialize_embedding_settings(current_app)})


@api_bp.put("/settings/embedding")
def put_embedding_settings():
    try:
        payload = request.get_json(silent=True) or {}
        settings = update_embedding_settings(current_app, payload)
        return jsonify({"success": True, "data": settings})
    except RuntimeConfigError as exc:
        return _error(str(exc), 400)


@api_bp.post("/settings/llm/test")
def test_llm_settings():
    try:
        payload = request.get_json(silent=True) or {}
        base_url = _setting_value(payload, "base_url", "LLM_BASE_URL")
        model = _setting_value(payload, "model", "LLM_MODEL_NAME")
        api_key = _setting_value(payload, "api_key", "LLM_API_KEY")
        validate_llm_settings(base_url=base_url, model=model)
        if not api_key:
            return _error("api_key is required to test the connection", 400)

        client = LLMClient(base_url=base_url, api_key=api_key, model=model, timeout=20)
        message = client.chat(
            [
                {"role": "system", "content": "Reply with ok."},
                {"role": "user", "content": "ping"},
            ],
            temperature=0,
            max_tokens=16,
        )
        return jsonify({"success": True, "data": {"ok": True, "message": message}})
    except RuntimeConfigError as exc:
        return _error(str(exc), 400)
    except Exception as exc:
        return _error(f"connection test failed: {exc}", 502)


@api_bp.post("/settings/embedding/test")
def test_embedding_settings():
    try:
        payload = request.get_json(silent=True) or {}
        base_url = _setting_value(payload, "base_url", "EMBEDDING_BASE_URL")
        model = _setting_value(payload, "model", "EMBEDDING_MODEL")
        api_key = _setting_value(payload, "api_key", "EMBEDDING_API_KEY")
        query_input_type = _setting_value(payload, "query_input_type", "EMBEDDING_QUERY_INPUT_TYPE")
        passage_input_type = _setting_value(payload, "passage_input_type", "EMBEDDING_PASSAGE_INPUT_TYPE")
        truncate = _setting_value(payload, "truncate", "EMBEDDING_TRUNCATE").upper()
        validate_embedding_settings(
            base_url=base_url,
            model=model,
            query_input_type=query_input_type,
            passage_input_type=passage_input_type,
            truncate=truncate,
        )
        if not api_key:
            return _error("api_key is required to test the embedding connection", 400)

        client = EmbeddingClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            query_input_type=query_input_type,
            passage_input_type=passage_input_type,
            truncate=truncate,
        )
        embedding = client.embed_query("ping")
        return jsonify({"success": True, "data": {"ok": True, "dimensions": len(embedding)}})
    except RuntimeConfigError as exc:
        return _error(str(exc), 400)
    except Exception as exc:
        return _error(f"embedding connection test failed: {exc}", 502)


def _setting_value(payload: dict, payload_key: str, config_key: str) -> str:
    if isinstance(payload.get(payload_key), str) and payload.get(payload_key).strip():
        return payload.get(payload_key).strip()
    return (current_app.config.get(config_key) or "").strip()
