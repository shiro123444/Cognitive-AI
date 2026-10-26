"""HTTP surface for the independent EduFish plugin (protocol v1).

Routes live on the existing versioned ``api_bp`` blueprint so both
``/api/v1/plugin/...`` and the legacy ``/api/plugin/...`` alias are inherited
without changing any existing API.
"""

from __future__ import annotations

import json
import os

from flask import current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from app.api import api_bp
from app.db import db

# Imported for its side effect: register the plugin-owned SQL model before
# ``db.create_all()`` runs during application startup.
from app.plugin import models as _plugin_models  # noqa: F401
from app.plugin.errors import (
    PluginError,
    invalid,
    payload_too_large,
    unavailable,
)
from app.plugin.service import get_manifest, invoke_operation
from app.plugin.validation import DEFAULT_MAX_BODY_BYTES, max_body_bytes
from app.plugin.visibility import resolve_plugin_user

_ENVELOPE_KEYS = frozenset({"operation", "arguments", "request_id"})


def _success(data: dict):
    return jsonify({"success": True, "data": data})


def _error(exc: PluginError):
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": exc.code, "message": exc.message},
            }
        ),
        exc.status,
    )


def _body_limit() -> int:
    configured = current_app.config.get("PLUGIN_MAX_BODY_BYTES")
    if configured is None:
        configured = os.getenv("PLUGIN_MAX_BODY_BYTES")
    if configured is None:
        configured = DEFAULT_MAX_BODY_BYTES
    return max_body_bytes(configured)


def _read_json_object() -> dict:
    limit = _body_limit()
    if request.content_length is not None and request.content_length > limit:
        raise payload_too_large(f"request body must be at most {limit} bytes")
    try:
        raw = request.get_data(cache=True)
    except RequestEntityTooLarge:
        raise payload_too_large(f"request body must be at most {limit} bytes") from None
    if len(raw) > limit:
        raise payload_too_large(f"request body must be at most {limit} bytes")
    if not raw:
        raise invalid("request body must be a JSON object")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise invalid("request body must be valid JSON") from None
    if not isinstance(payload, dict):
        raise invalid("request body must be a JSON object")
    return payload


def _validate_envelope(payload: dict) -> tuple[str, dict, object]:
    unexpected = sorted(key for key in payload if key not in _ENVELOPE_KEYS)
    if unexpected:
        raise invalid(
            "request envelope contains unexpected key(s): "
            + ", ".join(str(key)[:80] for key in unexpected[:5])
        )
    if "operation" not in payload:
        raise invalid("operation is required")
    operation = payload["operation"]
    if not isinstance(operation, str) or not operation.strip():
        raise invalid("operation must be a non-empty string")
    if "arguments" not in payload:
        raise invalid("arguments are required")
    arguments = payload["arguments"]
    if not isinstance(arguments, dict):
        raise invalid("arguments must be an object")
    request_id = payload.get("request_id")
    if "request_id" in payload and request_id is None:
        raise invalid("request_id must be a string")
    return operation, arguments, request_id


@api_bp.get("/plugin/manifest")
def plugin_manifest():
    try:
        return _success(get_manifest())
    except PluginError as exc:
        db.session.rollback()
        return _error(exc)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("EduFish plugin manifest request failed")
        return _error(unavailable("plugin operation failed"))


@api_bp.post("/plugin/invoke")
def plugin_invoke():
    try:
        # Authorize before touching the request body so an unauthenticated
        # caller cannot use envelope/body errors as an oracle.
        user = resolve_plugin_user()
        payload = _read_json_object()
        operation, arguments, request_id = _validate_envelope(payload)
        return _success(
            invoke_operation(operation, arguments, request_id, user=user)
        )
    except PluginError as exc:
        db.session.rollback()
        return _error(exc)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("EduFish plugin invocation failed")
        return _error(unavailable("plugin operation failed"))
