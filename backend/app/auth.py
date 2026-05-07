"""API Key authentication for EDUFISH engine endpoints."""

import os
from functools import wraps

from flask import request, jsonify

ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "")

AUTH_REQUIRED_PATHS = (
    "/api/v1/edu/",
    "/api/v1/agents/",
    "/api/v1/agent-runs/",
)


def _path_requires_auth(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in AUTH_REQUIRED_PATHS)


def require_api_key(f):
    """Decorator that enforces X-API-Key on protected routes."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not ENGINE_API_KEY:
            return f(*args, **kwargs)
        if not _path_requires_auth(request.path):
            return f(*args, **kwargs)

        key = request.headers.get("X-API-Key", "")
        if not key or key != ENGINE_API_KEY:
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
        return f(*args, **kwargs)

    return decorated


def register_auth(api_bp):
    """Register the auth before_request handler on the API blueprint.

    Called during app initialization so auth is applied to all blueprint routes.
    """

    @api_bp.before_request
    def _check_api_key():
        if not ENGINE_API_KEY:
            return None
        if not _path_requires_auth(request.path):
            return None

        key = request.headers.get("X-API-Key", "")
        if not key or key != ENGINE_API_KEY:
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
        return None
