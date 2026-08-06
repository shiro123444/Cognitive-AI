from __future__ import annotations

from flask import jsonify, request

from . import api_bp
from app.services.runtime_capability_service import invoke_capability, list_capabilities


@api_bp.get("/runtime/capabilities")
def get_runtime_capabilities():
    return jsonify({"capabilities": list_capabilities()})


@api_bp.post("/runtime/capabilities/invoke")
def post_runtime_capability_invoke():
    payload = request.get_json(silent=True) or {}
    result = invoke_capability(payload.get("capability_id", ""), payload.get("arguments", {}))
    status = 200 if result["status"] != "failed" else 400
    return jsonify(result), status
