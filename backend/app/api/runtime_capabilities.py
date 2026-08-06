from __future__ import annotations

from flask import g, jsonify, request

from . import api_bp
from app.rbac import require_authenticated, require_runtime_or_user, runtime_user_context
from app.services.runtime_capability_service import invoke_capability, list_capabilities


@api_bp.get("/runtime/capabilities")
@require_authenticated
def get_runtime_capabilities():
    """Discover capabilities — requires any user or the runtime service JWT."""
    return jsonify({"capabilities": list_capabilities()})


@api_bp.post("/runtime/capabilities/invoke")
@require_runtime_or_user
def post_runtime_capability_invoke():
    """Invoke a capability — requires a user or runtime JWT.

    For runtime-brokered calls, the originating user is read from the
    ``X-Runtime-User-Id`` / ``X-Runtime-User-Role`` headers and stored on
    ``g.runtime_user_context`` so tools can attribute the call.
    """
    payload = request.get_json(silent=True) or {}
    user_context = runtime_user_context()
    # Mirror the user context onto g so tools that read ``g.current_user`` /
    # request-local state still see the originating user when invoked via
    # the runtime service account.
    if user_context:
        g.current_user = user_context
    result = invoke_capability(
        payload.get("capability_id", ""),
        payload.get("arguments", {}),
        user_context=user_context,
    )
    status = 200 if result["status"] != "failed" else 400
    return jsonify(result), status
