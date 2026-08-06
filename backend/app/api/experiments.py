import json
import time

from flask import Response, current_app, jsonify, request, stream_with_context

from app.api import api_bp
from app.db import db
from app.models import ExperimentRun
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
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "request body must be an object."}), 400
    if current_role() == "student":
        payload = {**payload, "student_id": current_user_id()}
    if ExperimentService.get_template(experiment_id) is None:
        return jsonify({"success": False, "error": f"experiment template not found: {experiment_id}"}), 404
    try:
        run = ExperimentService.create_pending_run(experiment_id, payload)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    # Enqueue the heavy work. In TESTING the queue runs jobs synchronously on
    # the calling thread so the run is finalised by the time we return.
    ExperimentService.enqueue_run_job(current_app._get_current_object(), run["id"])
    # The worker commits via its own session; force a refresh here so the
    # response reflects the final state in both TESTING and production.
    db.session.expire_all()
    final = ExperimentService.get_run(run["id"])
    return jsonify({"success": True, "data": ExperimentService.serialize_run(final)}), 201


@api_bp.get("/experiment-runs/<run_id>")
@require_authenticated
def get_experiment_run(run_id):
    run = ExperimentService.get_run(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"experiment run not found: {run_id}"}), 404
    return jsonify({"success": True, "data": ExperimentService.serialize_run(run)})


@api_bp.get("/experiment-runs/<run_id>/events/stream")
@require_authenticated
def stream_experiment_run_events(run_id):
    """SSE stream of an ExperimentRun's progress.

    Emits an initial ``snapshot`` event with the full run serialization, then
    polls the row every ~400ms and emits an ``update`` event until the run
    reaches a terminal state (``completed`` / ``failed``). Front-ends use this
    to drive the pipeline node visualisation in real time.
    """
    run = ExperimentService.get_run(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"experiment run not found: {run_id}"}), 404

    def generate():
        deadline = time.monotonic() + 90
        last_serialized = ""
        # Send an initial snapshot immediately so the client has the run state.
        snapshot = ExperimentService.serialize_run(run)
        last_serialized = json.dumps(snapshot, sort_keys=True, ensure_ascii=False)
        yield f"event: snapshot\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
        if snapshot["status"] in {"completed", "failed"}:
            yield f"event: done\ndata: {json.dumps({'status': snapshot['status']}, ensure_ascii=False)}\n\n"
            return

        while time.monotonic() < deadline:
            time.sleep(0.4)
            fresh = db.session.get(ExperimentRun, run_id)
            if fresh is None:
                yield "event: error\ndata: run vanished\n\n"
                return
            serialized = ExperimentService.serialize_run(fresh)
            payload = json.dumps(serialized, sort_keys=True, ensure_ascii=False)
            if payload != last_serialized:
                yield f"event: update\ndata: {json.dumps(serialized, ensure_ascii=False)}\n\n"
                last_serialized = payload
            if serialized["status"] in {"completed", "failed"}:
                yield f"event: done\ndata: {json.dumps({'status': serialized['status']}, ensure_ascii=False)}\n\n"
                return

        # Hit the deadline — tell the client to reconnect / fall back to polling.
        yield "event: timeout\ndata: {}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
