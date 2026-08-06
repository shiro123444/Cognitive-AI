"""Authentication middleware for the EDUFISH engine.

Two layered mechanisms:

1. ``X-API-Key`` — coarse engine-level key for SDK/server-to-server callers.
   When ``ENGINE_API_KEY`` is configured, requests under ``AUTH_REQUIRED_PATHS``
   must present a matching header.
2. ``Authorization: Bearer <jwt>`` — per-user identity used for RBAC. When the
   token verifies, ``g.current_user`` is populated with ``{id, role}``.

Both mechanisms are optional and orthogonal: a request can satisfy one, the
other, or both. Endpoints that require a real user identity should layer on
the :func:`app.rbac.require_role` decorator, which inspects ``g.current_user``.
"""

from __future__ import annotations

import os
from functools import wraps
from typing import TypedDict

from flask import Flask, current_app, g, jsonify, request

ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "")

AUTH_REQUIRED_PATHS: tuple[str, ...] = (
    "/api/v1/edu/",
    "/api/v1/agents/",
    "/api/v1/agent-runs/",
)


class CurrentUser(TypedDict):
    id: str
    role: str


def _path_requires_api_key(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in AUTH_REQUIRED_PATHS)


def _configured_api_key() -> str:
    try:
        return current_app.config.get("ENGINE_API_KEY", ENGINE_API_KEY) or ""
    except RuntimeError:
        return ENGINE_API_KEY


def _unauthorized(message: str = "Invalid or missing API key"):
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": "UNAUTHORIZED", "message": message},
            }
        ),
        401,
    )


def require_api_key(f):
    """Decorator alternative to ``before_request`` for SDK-style endpoints."""

    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = _configured_api_key()
        if not api_key:
            return f(*args, **kwargs)
        if not _path_requires_api_key(request.path):
            return f(*args, **kwargs)

        key = request.headers.get("X-API-Key", "")
        if not key or key != api_key:
            return _unauthorized()
        return f(*args, **kwargs)

    return decorated


def _try_resolve_bearer() -> CurrentUser | None:
    """Parse ``Authorization: Bearer <jwt>`` and return the resolved user.

    Lazy-imports the JWT helpers so app startup doesn't pull cryptography
    dependencies until they're actually needed (and so a malformed token
    silently falls through rather than 500ing).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        return None
    from app.jwt_utils import TokenError, decode_access_token

    try:
        claims = decode_access_token(token)
    except TokenError:
        return None
    return {"id": claims["sub"], "role": claims["role"]}


def register_auth(app: Flask) -> None:
    """Install the auth ``before_request`` handler on the Flask app."""

    @app.before_request
    def _auth_check():
        # Always populate g.current_user (None when no/invalid bearer); RBAC
        # decorators rely on this being set.
        g.current_user = _try_resolve_bearer()

        api_key = _configured_api_key()
        if not api_key:
            return None
        if not _path_requires_api_key(request.path):
            return None
        # A valid Bearer token also satisfies the engine key gate so logged-in
        # users can hit edu/agents endpoints from the browser without exposing
        # the engine key.
        if g.current_user is not None:
            return None
        key = request.headers.get("X-API-Key", "")
        if not key or key != api_key:
            return _unauthorized()
        return None
