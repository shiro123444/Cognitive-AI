from flask import jsonify, request

from app.api import api_bp
from app.services.experiment_service import ExperimentService


@api_bp.get("/experiments")
def list_experiments():
    status = request.args.get("status")
    return jsonify({"success": True, "data": ExperimentService.list_templates(status=status)})


@api_bp.get("/experiments/<experiment_id>")
def get_experiment(experiment_id):
    template = ExperimentService.get_template(experiment_id)
    if template is None:
        return jsonify({"success": False, "error": f"experiment template not found: {experiment_id}"}), 404
    return jsonify({"success": True, "data": ExperimentService.serialize_template(template)})


@api_bp.post("/experiments/<experiment_id>/runs")
def create_experiment_run(experiment_id):
    template = ExperimentService.get_template(experiment_id)
    if template is None:
        return jsonify({"success": False, "error": f"experiment template not found: {experiment_id}"}), 404
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "request body must be an object."}), 400
    try:
        run = ExperimentService.create_and_execute_run(experiment_id, payload)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": run}), 201


@api_bp.get("/experiment-runs/<run_id>")
def get_experiment_run(run_id):
    run = ExperimentService.get_run(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"experiment run not found: {run_id}"}), 404
    return jsonify({"success": True, "data": ExperimentService.serialize_run(run)})
