"""Runtime SSO endpoints.

The Node Agent Runtime needs to call backend capability endpoints on behalf
of an authenticated user. This module:

- exposes ``POST /runtime/sessions/runtime-token`` which mints a short-lived
  JWT for the runtime service account (``role='runtime'``);
- accepts either a runtime JWT, a regular user JWT, or (when configured) the
  shared ``ENGINE_API_KEY`` for the capability endpoints.

Both endpoints go through the regular auth/RBAC pipeline so adding new
runtime-mediated flows does not require a parallel auth surface.
"""

from __future__ import annotations

import time

from flask import current_app, jsonify, request

from . import api_bp
from app.jwt_utils import create_access_token


RUNTIME_USER_ID = "runtime"
RUNTIME_ROLE = "runtime"
RUNTIME_TOKEN_TTL_HOURS = 12


def _mint_runtime_token() -> str:
    """Mint a JWT for the runtime service account.

    Uses the standard JWT signing path so the same secret/audience as user
    tokens is in play. The TTL defaults to 12 hours — long enough to span a
    full working session but short enough to limit replay risk.
    """
    return create_access_token(
        user_id=RUNTIME_USER_ID,
        role=RUNTIME_ROLE,
        ttl_hours=RUNTIME_TOKEN_TTL_HOURS,
    )


def _is_engine_key_valid() -> bool:
    """Return True when the request carries a matching engine API key.

    Empty configured key means "no engine auth required" — used in tests and
    local dev so the runtime can mint a token without ceremony.
    """
    configured = current_app.config.get("ENGINE_API_KEY", "") or ""
    if not configured:
        return True
    presented = request.headers.get("X-API-Key", "")
    return bool(presented) and presented == configured


@api_bp.post("/runtime/sessions/runtime-token")
def post_runtime_token():
    """Mint a runtime service JWT.

    Auth: the engine shared key (``X-API-Key``) when configured, otherwise
    no auth (intended for local dev / tests). Returns ``{"token": ...,
    "expires_at": <unix ts>, "role": "runtime"}``.
    """
    if not _is_engine_key_valid():
        return jsonify(
            {
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "engine API key required to mint runtime token",
                },
            }
        ), 401
    token = _mint_runtime_token()
    return jsonify(
        {
            "success": True,
            "data": {
                "token": token,
                "role": RUNTIME_ROLE,
                "expires_at": int(time.time()) + RUNTIME_TOKEN_TTL_HOURS * 3600,
                "ttl_hours": RUNTIME_TOKEN_TTL_HOURS,
            },
        }
    )
