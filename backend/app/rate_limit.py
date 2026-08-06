"""Rate limiting for EDUFISH engine endpoints."""

from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

_limiter: Limiter | None = None


def get_limiter() -> Limiter | None:
    return _limiter


def init_rate_limiter(app: Flask) -> Limiter | None:
    """Initialize Flask-Limiter. No-op if RATE_LIMIT_ENABLED is not set."""
    global _limiter

    if not app.config.get("RATE_LIMIT_ENABLED", False):
        return None

    default_limit = app.config.get("RATE_LIMIT_DEFAULT", "60/minute")

    _limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[default_limit],
        storage_uri="memory://",
    )
    _limiter.init_app(app)
    return _limiter
