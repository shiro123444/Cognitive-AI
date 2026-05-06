import json
from datetime import datetime, timezone
from uuid import uuid4

from app.db import db
from app.models import AgentEvent, AgentRun


def _now():
    return datetime.now(timezone.utc)


def _json(data):
    return json.dumps(data or {}, ensure_ascii=False)


def _loads(raw, fallback):
    try:
        return json.loads(raw or fallback)
    except json.JSONDecodeError:
        return json.loads(fallback)


class AgentRunService:
    @staticmethod
    def create_for_material(material, job_id="", scope_type="course_global", owner_id=""):
        run = AgentRun(
            id=f"run-{uuid4().hex}",
            job_id=job_id or "",
            material_id=material.id,
            course_id=material.course_id,
            scope_type=scope_type or material.scope_type or "course_global",
            owner_id=owner_id if owner_id is not None else material.owner_id,
            status="pending",
        )
        db.session.add(run)
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def mark_running(run_id, job_id=""):
        run = db.session.get(AgentRun, run_id)
        if run is None:
            return None
        if job_id:
            run.job_id = job_id
        run.status = "running"
        run.updated_at = _now()
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def emit_event(
        run_id,
        job_id,
        material_id,
        course_id,
        scope_type,
        owner_id,
        event_type,
        status,
        message,
        progress,
        payload=None,
    ):
        event = AgentEvent(
            id=f"event-{uuid4().hex}",
            run_id=run_id,
            job_id=job_id or "",
            material_id=material_id or "",
            course_id=course_id or "",
            scope_type=scope_type or "course_global",
            owner_id=owner_id or "",
            event_type=event_type,
            status=status,
            message=message or "",
            progress=max(0, min(100, int(progress or 0))),
            payload_json=_json(payload),
        )
        run = db.session.get(AgentRun, run_id)
        if run is not None:
            if job_id:
                run.job_id = job_id
            run.status = "failed" if status == "failed" else "running"
            run.updated_at = _now()
        db.session.add(event)
        db.session.commit()
        db.session.refresh(event)
        return event

    @staticmethod
    def complete_run(run_id, summary=None):
        run = db.session.get(AgentRun, run_id)
        if run is None:
            return None
        now = _now()
        run.status = "completed"
        run.summary_json = _json(summary)
        run.updated_at = now
        run.completed_at = now
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def fail_run(run_id, error_message, summary=None):
        run = db.session.get(AgentRun, run_id)
        if run is None:
            return None
        now = _now()
        run.status = "failed"
        run.error_message = error_message or ""
        run.summary_json = _json(summary)
        run.updated_at = now
        run.completed_at = now
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def list_events(run_id):
        return (
            AgentEvent.query
            .filter_by(run_id=run_id)
            .order_by(AgentEvent.created_at.asc())
            .all()
        )

    @staticmethod
    def serialize_run(run):
        return {
            "id": run.id,
            "job_id": run.job_id,
            "material_id": run.material_id,
            "course_id": run.course_id,
            "scope_type": run.scope_type,
            "owner_id": run.owner_id,
            "status": run.status,
            "summary": _loads(run.summary_json, "{}"),
            "error_message": run.error_message,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "updated_at": run.updated_at.isoformat() if run.updated_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }

    @staticmethod
    def serialize_event(event):
        return {
            "id": event.id,
            "run_id": event.run_id,
            "job_id": event.job_id,
            "material_id": event.material_id,
            "course_id": event.course_id,
            "scope_type": event.scope_type,
            "owner_id": event.owner_id,
            "event_type": event.event_type,
            "status": event.status,
            "message": event.message,
            "progress": event.progress,
            "payload": _loads(event.payload_json, "{}"),
            "created_at": event.created_at.isoformat() if event.created_at else None,
        }
