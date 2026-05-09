"""Role-based access control decorators.

Used on endpoints that require a real authenticated user. Reads
``g.current_user`` populated by :mod:`app.auth`.
"""

from __future__ import annotations

from functools import wraps
from typing import Iterable

from flask import g, jsonify


ALLOWED_ROLES: frozenset[str] = frozenset({"student", "teacher", "admin"})


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

    ``admin`` always passes regardless of the listed roles.
    """
    allowed: set[str] = set(roles)
    unknown = allowed - ALLOWED_ROLES
    if unknown:
        raise ValueError(f"Unknown role(s) for require_role: {sorted(unknown)}")

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            current = getattr(g, "current_user", None)
            if not current:
                return _unauthenticated()
            role = current.get("role")
            if role == "admin" or role in allowed:
                return view(*args, **kwargs)
            return _forbidden()

        return wrapper

    return decorator


def require_authenticated(view):
    """Require any logged-in user (any role)."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        current = getattr(g, "current_user", None)
        if not current:
            return _unauthenticated()
        return view(*args, **kwargs)

    return wrapper


def current_role() -> str | None:
    current = getattr(g, "current_user", None)
    return current.get("role") if current else None


def current_user_id() -> str | None:
    current = getattr(g, "current_user", None)
    return current.get("id") if current else None
