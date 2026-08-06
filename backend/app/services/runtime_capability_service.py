"""Runtime capability service — bridges the Node Agent Runtime to the platform's
real agent tool registry.

The Node runtime discovers capabilities via ``GET /runtime/capabilities`` and
invokes them via ``POST /runtime/capabilities/invoke``. This module exposes every
registered agent tool (``search_materials``, ``search_concept_graph``,
``collect_edu_data``, ...) as a capability, so the runtime can drive real domain
logic instead of a stub echo.
"""

from __future__ import annotations

from app.agents.registry import registry

# Importing the tool modules triggers their self-registration on the global
# registry (see app.agents.definitions for the same pattern).
from app.agents.tools import course_tools  # noqa: F401
from app.agents.tools import edu_collector_tools  # noqa: F401


def _echo_capability() -> dict:
    return {
        "capability_id": "runtime.echo",
        "kind": "tool",
        "description": "Echo text back to the runtime for bridge verification.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    }


def list_capabilities() -> list[dict]:
    """Return every registered agent tool as a runtime capability.

    Tools self-register at import time. The echo capability is appended last as
    a deterministic self-test that does not require application configuration.
    """
    capabilities: list[dict] = []
    for schema in registry.all_schemas():
        function = schema.get("function", {})
        capabilities.append(
            {
                "capability_id": function.get("name"),
                "kind": "tool",
                "description": function.get("description", ""),
                "input_schema": function.get("parameters", {}),
            }
        )
    capabilities.append(_echo_capability())
    return capabilities


def invoke_capability(
    capability_id: str,
    arguments: dict,
    user_context: dict | None = None,
) -> dict:
    """Invoke a capability by id.

    ``runtime.echo`` is handled inline. Any other id is resolved against the
    tool registry and executed via ``tool.handler(**arguments)``. Tool handlers
    rely on the Flask application/request context, which is available on the
    HTTP invoke path.

    ``user_context`` (when set) is forwarded to the tool handler as a
    keyword argument named ``user_context``. Tools that should attribute
    their work to a real user (rather than the runtime service account)
    read it from there.
    """
    if capability_id == "runtime.echo":
        return {
            "status": "completed",
            "result": {
                "text": arguments.get("text", ""),
                "user_context": user_context,
            },
            "events": [
                {"type": "tool.started", "message": "Echo started"},
                {"type": "tool.completed", "message": "Echo completed"},
            ],
        }

    tool = registry.get(capability_id)
    if tool is None:
        return {
            "status": "failed",
            "result": {"error": f"unknown capability: {capability_id}"},
            "events": [
                {"type": "tool.failed", "message": f"unknown capability: {capability_id}"}
            ],
        }

    try:
        result = tool.handler(**(arguments or {}))
    except Exception as exc:  # noqa: BLE001 — bridge must surface tool errors, not crash
        return {
            "status": "failed",
            "result": {"error": str(exc)},
            "events": [
                {"type": "tool.failed", "message": f"{capability_id} failed: {exc}"}
            ],
        }

    return {
        "status": "completed",
        "result": result,
        "events": [
            {"type": "tool.started", "message": f"{capability_id} started"},
            {"type": "tool.completed", "message": f"{capability_id} completed"},
        ],
    }
