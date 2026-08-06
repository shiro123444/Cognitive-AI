"""Role-based access control decorators.

Used on endpoints that require a real authenticated user. Reads
``g.current_user`` populated by :mod:`app.auth`.
"""

from __future__ import annotations

from functools import wraps
from typing import Iterable

from flask import g, jsonify


ALLOWED_ROLES: frozenset[str] = frozenset({"student", "teacher", "admin"})
# Special role used by the Node Agent Runtime when it talks to the backend on
# behalf of an authenticated user. Tools that need to know the originating
# human can read ``g.runtime_user_context`` (populated from
# ``X-Runtime-User-Id`` / ``X-Runtime-User-Role`` headers).
RUNTIME_ROLE: str = "runtime"
RUNTIME_ROLES: frozenset[str] = ALLOWED_ROLES | {RUNTIME_ROLE}


def _forbidden(message: str = "Insufficient role"):
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": "FORBIDDEN", "message": message},
            }
        ),
        403,
    )


def _unauthenticated():
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": "UNAUTHORIZED", "message": "Authentication required"},
            }
        ),
        401,
    )


def require_role(*roles: str):
    """Require the request to be authenticated as one of the given roles.

    ``admin`` always passes regardless of the listed roles. The ``runtime``
    service role is allowed through any role gate by default — runtime calls
    are brokered on behalf of an authenticated user, so the stricter gate is
    :func:`require_runtime_or_user` which also requires an originating user
    context.
    """
    allowed: set[str] = set(roles)
    unknown = allowed - RUNTIME_ROLES
    if unknown:
        raise ValueError(f"Unknown role(s) for require_role: {sorted(unknown)}")

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            current = getattr(g, "current_user", None)
            if not current:
                return _unauthenticated()
            role = current.get("role")
            if role == "admin" or role == RUNTIME_ROLE or role in allowed:
                return view(*args, **kwargs)
            return _forbidden()

        return wrapper

    return decorator


def require_authenticated(view):
    """Require any logged-in user (any role, including the runtime service)."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        current = getattr(g, "current_user", None)
        if not current:
            return _unauthenticated()
        return view(*args, **kwargs)

    return wrapper


def require_runtime_or_user(view):
    """Require either a real user or the runtime service account.

    When the caller is the runtime service role, also requires the
    ``X-Runtime-User-Id`` header so downstream tools know which user is
    on whose behalf the call is happening.
    """
    from flask import request as _request

    @wraps(view)
    def wrapper(*args, **kwargs):
        current = getattr(g, "current_user", None)
        if not current:
            return _unauthenticated()
        role = current.get("role")
        if role == RUNTIME_ROLE:
            user_header = _request.headers.get("X-Runtime-User-Id", "")
            if not user_header:
                return _forbidden("runtime calls must carry X-Runtime-User-Id")
        return view(*args, **kwargs)

    return wrapper


def runtime_user_context() -> dict[str, str] | None:
    """Return the originating-user context for a runtime-brokered call.

    Returns ``None`` for direct user calls. For runtime-brokered calls,
    returns ``{id, role}`` parsed from the ``X-Runtime-User-Id`` /
    ``X-Runtime-User-Role`` headers (the runtime forwards these alongside
    its JWT so tools can attribute side effects to a real user).
    """
    from flask import request as _request

    current = getattr(g, "current_user", None)
    if not current or current.get("role") != RUNTIME_ROLE:
        return None
    user_id = _request.headers.get("X-Runtime-User-Id", "")
    if not user_id:
        return None
    return {
        "id": user_id,
        "role": _request.headers.get("X-Runtime-User-Role", "student"),
    }


def current_role() -> str | None:
    current = getattr(g, "current_user", None)
    return current.get("role") if current else None


def current_user_id() -> str | None:
    current = getattr(g, "current_user", None)
    return current.get("id") if current else None
