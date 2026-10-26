"""Error types and HTTP mappings for the independent EduFish plugin.

The plugin wire protocol exposes a fixed set of error codes.  Keeping the
mapping in one module makes it hard for individual operations to accidentally
leak a different shape (or an HTTP status that conflicts with the contract).
"""

from __future__ import annotations

from typing import Final


_STATUS_BY_CODE: Final[dict[str, int]] = {
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "INVALID_ARGUMENT": 400,
    "UNKNOWN_OPERATION": 400,
    "IDEMPOTENCY_CONFLICT": 409,
    "UNAVAILABLE": 503,
}


class PluginError(Exception):
    """A safe, client-visible plugin failure.

    ``message`` is returned verbatim to the caller, so it must never contain
    stack traces, filesystem paths, credentials, or private answer content.
    """

    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        self.code = code
        self.message = message
        self.status = status if status is not None else _STATUS_BY_CODE.get(code, 400)
        super().__init__(message)


def unauthorized(message: str = "Authentication required") -> PluginError:
    return PluginError("UNAUTHORIZED", message)


def forbidden(message: str = "Access denied") -> PluginError:
    return PluginError("FORBIDDEN", message)


def not_found(message: str = "Resource not found") -> PluginError:
    return PluginError("NOT_FOUND", message)


def invalid(message: str) -> PluginError:
    return PluginError("INVALID_ARGUMENT", message)


def unknown_operation(operation: str) -> PluginError:
    return PluginError("UNKNOWN_OPERATION", f"unknown plugin operation: {operation}")


def idempotency_conflict() -> PluginError:
    return PluginError(
        "IDEMPOTENCY_CONFLICT",
        "request_id was already used with different arguments",
    )


def unavailable(message: str = "Plugin is temporarily unavailable") -> PluginError:
    return PluginError("UNAVAILABLE", message)


def payload_too_large(message: str) -> PluginError:
    # The contract's stable code set does not include a dedicated 413 code;
    # INVALID_ARGUMENT with an HTTP 413 status is the least surprising choice.
    return PluginError("INVALID_ARGUMENT", message, status=413)
