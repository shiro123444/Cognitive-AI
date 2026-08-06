from flask import jsonify

from app.api import api_bp
from app.db import db
from app.models import AgentRun
from app.services.agent_run_service import AgentRunService


@api_bp.get("/agent-runs/<run_id>")
def get_agent_run(run_id):
    run = db.session.get(AgentRun, run_id)
    if run is None:
        return jsonify({"success": False, "error": f"agent run not found: {run_id}"}), 404
    return jsonify({"success": True, "data": AgentRunService.serialize_run(run)})


@api_bp.get("/agent-runs/<run_id>/events")
def list_agent_run_events(run_id):
    run = db.session.get(AgentRun, run_id)
    if run is None:
        return jsonify({"success": False, "error": f"agent run not found: {run_id}"}), 404
    events = AgentRunService.list_events(run_id)
    return jsonify({
        "success": True,
        "data": [AgentRunService.serialize_event(event) for event in events],
    })
