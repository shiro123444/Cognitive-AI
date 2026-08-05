from flask import jsonify, request

from app.api import api_bp
from app.rbac import current_role, current_user_id, require_authenticated
from app.services.experiment_service import ExperimentService


@api_bp.get("/experiments")
def list_experiments():
    status = request.args.get("status")
    concept_id = request.args.get("concept")
    return jsonify({
        "success": True,
        "data": ExperimentService.list_templates(status=status, concept_id=concept_id),
    })


@api_bp.get("/experiments/explore")
def explore_experiments():
    query = request.args.get("q", "")
    return jsonify({"success": True, "data": ExperimentService.explore(query)})


@api_bp.get("/experiments/<experiment_id>")
def get_experiment(experiment_id):
    template = ExperimentService.get_template(experiment_id)
    if template is None:
        return jsonify({"success": False, "error": f"experiment template not found: {experiment_id}"}), 404
    return jsonify({"success": True, "data": ExperimentService.serialize_template(template)})


@api_bp.post("/experiments/<experiment_id>/runs")
@require_authenticated
def create_experiment_run(experiment_id):
    template = ExperimentService.get_template(experiment_id)
    if template is None:
        return jsonify({"success": False, "error": f"experiment template not found: {experiment_id}"}), 404
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "request body must be an object."}), 400
    if current_role() == "student":
        payload = {**payload, "student_id": current_user_id()}
    try:
        run = ExperimentService.create_and_execute_run(experiment_id, payload)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": run}), 201


@api_bp.get("/experiment-runs/<run_id>")
@require_authenticated
def get_experiment_run(run_id):
    run = ExperimentService.get_run(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"experiment run not found: {run_id}"}), 404
    return jsonify({"success": True, "data": ExperimentService.serialize_run(run)})
