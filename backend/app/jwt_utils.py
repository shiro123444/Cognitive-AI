"""JWT issuance/verification helpers and password hashing for auth."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import TypedDict

import jwt
from flask import current_app
from werkzeug.security import check_password_hash, generate_password_hash

JWT_ALGORITHM = "HS256"
DEFAULT_TTL_HOURS = 24


class TokenClaims(TypedDict):
    """Decoded payload returned by :func:`decode_access_token`."""

    sub: str
    role: str
    exp: int
    iat: int


class TokenError(Exception):
    """Raised when a JWT cannot be verified or has expired."""


def hash_password(plain: str) -> str:
    if not isinstance(plain, str) or not plain:
        raise ValueError("password must be a non-empty string")
    return generate_password_hash(plain)


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed or not isinstance(plain, str) or not plain:
        return False
    return check_password_hash(hashed, plain)


def _configured_secret() -> str:
    """Resolve the JWT secret with sane fallbacks.

    Priority: ``current_app.config["JWT_SECRET"]`` -> ``JWT_SECRET`` env var ->
    a per-process random secret (so dev runs without setup still work, at the
    cost of invalidating tokens on restart).
    """
    try:
        configured = current_app.config.get("JWT_SECRET")
    except RuntimeError:
        configured = None
    if configured:
        return configured
    env_secret = os.environ.get("JWT_SECRET", "")
    if env_secret:
        return env_secret
    process_secret = os.environ.setdefault("_EDUFISH_RUNTIME_JWT_SECRET", secrets.token_urlsafe(48))
    return process_secret


def _configured_ttl_hours() -> int:
    try:
        ttl = current_app.config.get("JWT_TTL_HOURS")
    except RuntimeError:
        ttl = None
    if isinstance(ttl, int) and ttl > 0:
        return ttl
    return DEFAULT_TTL_HOURS


def create_access_token(user_id: str, role: str, ttl_hours: int | None = None) -> str:
    if not user_id or not role:
        raise ValueError("user_id and role are required")
    now = datetime.now(timezone.utc)
    exp_hours = ttl_hours if ttl_hours and ttl_hours > 0 else _configured_ttl_hours()
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=exp_hours)).timestamp()),
    }
    return jwt.encode(payload, _configured_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> TokenClaims:
    try:
        payload = jwt.decode(token, _configured_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid token") from exc
    if "sub" not in payload or "role" not in payload:
        raise TokenError("malformed token payload")
    return payload  # type: ignore[return-value]
