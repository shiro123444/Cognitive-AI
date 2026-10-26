"""Plugin service entry points shared by the HTTP route and tests."""

from __future__ import annotations

from . import operations_catalog, operations_lab, operations_learning
from .errors import invalid, unknown_operation
from .manifest import MUTATING_OPERATIONS, build_manifest
from .validation import VALIDATORS, validate_request_id
from .visibility import PluginUser, resolve_plugin_user


def get_manifest() -> dict:
    """Authenticated manifest read."""
    resolve_plugin_user()
    return build_manifest()


def invoke_operation(
    operation,
    arguments,
    request_id=None,
    user: PluginUser | None = None,
) -> dict:
    """Authenticate, validate, and dispatch one wire operation.

    ``user`` may be supplied by the HTTP route after an earlier authentication
    pass so that body-size/JSON handling cannot run before authorization.
    """
    if user is None:
        user = resolve_plugin_user()

    if not isinstance(operation, str) or not operation.strip():
        raise invalid("operation must be a non-empty string")
    if operation not in VALIDATORS:
        raise unknown_operation(operation)

    request_id = validate_request_id(request_id)
    if operation in MUTATING_OPERATIONS and request_id is None:
        raise invalid("request_id is required for this operation")

    args = VALIDATORS[operation](arguments)
    return _dispatch(user, operation, args, request_id)


def _dispatch(user: PluginUser, operation: str, args: dict, request_id: str | None) -> dict:
    if operation == "edufish.course.read":
        return operations_catalog.course_read(user, args)
    if operation == "edufish.material.search":
        return operations_catalog.material_search(user, args)
    if operation == "edufish.graph.neighborhood":
        return operations_catalog.graph_neighborhood(user, args)
    if operation == "edufish.quiz.read":
        return operations_learning.quiz_read(user, args)
    if operation == "edufish.quiz.submit":
        return operations_learning.quiz_submit(user, args, request_id or "")
    if operation == "edufish.progress.read":
        return operations_learning.progress_read(user, args)
    if operation == "edufish.lab.start":
        return operations_lab.lab_start(user, args, request_id or "")
    if operation == "edufish.lab.status":
        return operations_lab.lab_status(user, args)

    # VALIDATORS and the dispatch table are intentionally kept in lockstep;
    # reaching this line is a programming error, not a client error.
    raise unknown_operation(operation)
