"""API Key authentication for EDUFISH engine endpoints."""

import os
from functools import wraps

from flask import Flask, current_app, jsonify, request

ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "")

AUTH_REQUIRED_PATHS: tuple[str, ...] = (
    "/api/v1/edu/",
    "/api/v1/agents/",
    "/api/v1/agent-runs/",
)


def _path_requires_auth(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in AUTH_REQUIRED_PATHS)


def _configured_api_key() -> str:
    try:
        return current_app.config.get("ENGINE_API_KEY", ENGINE_API_KEY) or ""
    except RuntimeError:
        return ENGINE_API_KEY


def _unauthorized_response():
    return (
        jsonify(
            {
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Invalid or missing API key",
                },
            }
        ),
        401,
    )


def require_api_key(f):
    """Decorator that enforces X-API-Key on protected routes."""

    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = _configured_api_key()
        if not api_key:
            return f(*args, **kwargs)
        if not _path_requires_auth(request.path):
            return f(*args, **kwargs)

        key = request.headers.get("X-API-Key", "")
        if not key or key != api_key:
            return _unauthorized_response()
        return f(*args, **kwargs)

    return decorated


def register_auth(app: Flask) -> None:
    """Register the auth before_request handler on the Flask app.

    Attaches to the app (not the Blueprint) so repeated ``create_app()`` calls
    in tests don't trip ``Blueprint._check_setup_finished``.
    """
    if getattr(api_bp, "_edufish_auth_registered", False):
        return
    api_bp._edufish_auth_registered = True

    @app.before_request
    def _check_api_key():
        api_key = _configured_api_key()
        if not api_key:
            return None
        if not _path_requires_auth(request.path):
            return None

        key = request.headers.get("X-API-Key", "")
        if not key or key != api_key:
            return _unauthorized_response()
        return None
