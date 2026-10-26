"""Experiment operations: start a lab run and read its status."""

from __future__ import annotations

from flask import current_app
from sqlalchemy.exc import IntegrityError

from app.db import db
from app.models import ExperimentRun
from app.services.experiment_adapters import get_adapter
from app.services.experiment_service import ExperimentService

from .errors import invalid, not_found, unavailable
from .idempotency import (
    find_record,
    mark_completed,
    new_reservation,
    replay_or_conflict,
    request_hash,
)
from .models import PluginIdempotencyRecord
from .scrub import scrub_value
from .visibility import PluginUser, get_visible_course

_OPERATION = "edufish.lab.start"


def _serialized_run(run: ExperimentRun) -> dict:
    return scrub_value(ExperimentService.serialize_run(run))


def _release_reservation(record_id: str) -> None:
    """Drop a still-reserved idempotency row after a validation failure."""
    db.session.rollback()
    record = db.session.get(PluginIdempotencyRecord, record_id)
    if record is not None and record.state == "reserved":
        db.session.delete(record)
        db.session.commit()


def lab_start(user: PluginUser, args: dict, request_id: str) -> dict:
    course = get_visible_course(user, args["course_id"])

    digest = request_hash(args)
    existing = find_record(user.id, _OPERATION, request_id)
    if existing is not None:
        return replay_or_conflict(existing, digest)

    template = ExperimentService.get_template(args["template_id"])
    if template is None or template.status != "published":
        raise not_found("experiment template not found or not available")

    # Validate parameters against the real adapter before reserving the request
    # id, so invalid input never leaves an orphan reservation behind.
    try:
        get_adapter(template.adapter).validate_params(args["params"])
    except (TypeError, ValueError) as exc:
        raise invalid(str(exc)) from None

    reservation = new_reservation(user.id, _OPERATION, request_id, digest)
    db.session.add(reservation)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        winner = find_record(user.id, _OPERATION, request_id)
        if winner is None:
            raise
        return replay_or_conflict(winner, digest)

    record_id = reservation.id
    try:
        # This persists the ExperimentRun reservation and the ran_lab progress
        # event through the real domain service.
        run_data = ExperimentService.create_pending_run(
            template.id,
            {
                "student_id": user.id,
                "course_id": course.id,
                "params": args["params"],
            },
        )
    except (TypeError, ValueError) as exc:
        _release_reservation(record_id)
        raise invalid(str(exc)) from None
    except Exception:
        # Unknown failure: keep the reservation so a retry cannot duplicate a
        # run that may have been committed.  The route translates this into a
        # stable UNAVAILABLE response.
        db.session.rollback()
        raise

    # Persist the run reservation response *before* enqueueing work, so even
    # an immediate replay cannot enqueue a duplicate job.
    record = db.session.get(PluginIdempotencyRecord, record_id)
    if record is None:
        raise unavailable("idempotency reservation was lost")
    pending_response = {"run": scrub_value(run_data)}
    mark_completed(record, pending_response)
    db.session.commit()

    try:
        ExperimentService.enqueue_run_job(
            current_app._get_current_object(), run_data["id"]
        )
    except Exception:
        # The run row exists but could not be queued.  Mark it failed rather
        # than leaving it pending forever; the stored replay response stays
        # stable and no duplicate job is enqueued on a retry.
        db.session.rollback()
        failed_run = ExperimentService.get_run(run_data["id"])
        if failed_run is None:
            response = pending_response
        else:
            failed_run.status = "failed"
            failed_run.error_message = "experiment run could not be queued"
            failed_run.progress = 100
            failed_run.progress_message = "Queue unavailable"
            db.session.commit()
            response = {"run": _serialized_run(failed_run)}
    else:
        # The worker commits in its own app context/session.
        db.session.expire_all()
        final_run = ExperimentService.get_run(run_data["id"])
        if final_run is None:
            raise unavailable("experiment run could not be loaded after enqueue")
        response = {"run": _serialized_run(final_run)}

    record = db.session.get(PluginIdempotencyRecord, record_id)
    if record is not None:
        mark_completed(record, response)
        db.session.commit()
    return response


def lab_status(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])
    run = ExperimentService.get_run(args["run_id"])
    if run is None:
        raise not_found("experiment run not found")
    # Current-user ownership and exact course association are both required;
    # staff do not get an implicit override on someone else's run.
    if run.student_id != user.id:
        raise not_found("experiment run not found")
    if run.course_id != course.id:
        raise not_found("experiment run not found")
    return {"run": _serialized_run(run)}
