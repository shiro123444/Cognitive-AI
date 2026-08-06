"""Background job queue for async processing.

Uses a simple thread-pool executor backed by the Job table for state.
This keeps material uploads snappy: we save the file, return the material ID,
and process embeddings + LLM extraction off the request thread.

For production we'd swap this for Celery/Dramatiq/RQ, but for MVP a thread
pool that survives the request is enough.
"""

from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable
from uuid import uuid4

from flask import Flask, current_app

from app.db import db
from app.models import Job

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


_JOB_HANDLERS: dict[str, Callable[[Flask, str, dict, "JobContext"], dict]] = {}


def register_handler(job_type: str):
    """Decorator registering a function as the handler for a job_type."""

    def decorator(func: Callable[[Flask, str, dict, "JobContext"], dict]) -> Callable:
        if job_type in _JOB_HANDLERS:
            raise ValueError(f"job handler already registered: {job_type}")
        _JOB_HANDLERS[job_type] = func
        return func

    return decorator


def _dispatch_webhook_if_configured(job: Job, result: dict | None, error: str | None = None) -> None:
    """Send webhook notification if the job has a webhook_url configured."""
    if not job.webhook_url:
        return

    event = "job.completed" if job.status == "completed" else "job.failed"
    data = {
        "job_id": job.id,
        "job_type": job.job_type,
        "target_id": job.target_id,
        "status": job.status,
    }
    if result:
        data["result"] = result
    if error:
        data["error"] = error

    from app.services.webhook import dispatch
    dispatch(job.webhook_url, event, data, job.webhook_secret)


class JobContext:
    """Helper passed to job handlers for reporting progress."""

    def __init__(self, app: Flask, job_id: str) -> None:
        self.app = app
        self.job_id = job_id

    def update(self, progress: int | None = None, message: str | None = None) -> None:
        with self.app.app_context():
            job = db.session.get(Job, self.job_id)
            if job is None:
                return
            if progress is not None:
                job.progress = max(0, min(100, int(progress)))
            if message is not None:
                job.progress_message = message
            db.session.commit()


class JobQueue:
    """Singleton-ish queue. Shared across app instances via module-level reference."""

    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="job-worker")
        self._lock = threading.Lock()

    def enqueue(
        self,
        app: Flask,
        job_type: str,
        target_id: str | None = None,
        payload: dict | None = None,
        webhook_url: str | None = None,
    ) -> Job:
        if job_type not in _JOB_HANDLERS:
            raise ValueError(f"no handler registered for job type: {job_type}")
        job_id = f"job-{uuid4().hex}"
        with app.app_context():
            job = Job(
                id=job_id,
                job_type=job_type,
                target_id=target_id,
                status="pending",
                payload_json=json.dumps(payload or {}, ensure_ascii=False),
                webhook_url=webhook_url,
            )
            db.session.add(job)
            db.session.commit()
            db.session.refresh(job)

        # Submit work — capture all needed values now since `app` is closed-over.
        if app.config.get("TESTING"):
            self._run(app, job_id, job_type, payload or {})
        else:
            self._executor.submit(self._run, app, job_id, job_type, payload or {})
        return job

    def _run(self, app: Flask, job_id: str, job_type: str, payload: dict) -> None:
        ctx = JobContext(app, job_id)
        # Mark running
        with app.app_context():
            job = db.session.get(Job, job_id)
            if job is None:
                logger.error("Job %s vanished before run", job_id)
                return
            job.status = "running"
            job.started_at = _now()
            db.session.commit()

        handler = _JOB_HANDLERS.get(job_type)
        try:
            result = handler(app, job_id, payload, ctx) if handler else {"error": "no handler"}
            with app.app_context():
                job = db.session.get(Job, job_id)
                if job is None:
                    return
                job.status = "completed"
                job.result_json = json.dumps(result or {}, ensure_ascii=False)
                job.progress = 100
                job.completed_at = _now()
                db.session.commit()
                _dispatch_webhook_if_configured(job, result)
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            with app.app_context():
                job = db.session.get(Job, job_id)
                if job is None:
                    return
                job.status = "failed"
                job.error_message = str(exc)
                job.completed_at = _now()
                db.session.commit()
                _dispatch_webhook_if_configured(job, None, error=str(exc))

    def get(self, job_id: str) -> Job | None:
        return db.session.get(Job, job_id)

    @staticmethod
    def serialize(job: Job) -> dict:
        try:
            payload = json.loads(job.payload_json or "{}")
        except json.JSONDecodeError:
            payload = {}
        try:
            result = json.loads(job.result_json or "{}")
        except json.JSONDecodeError:
            result = {}
        return {
            "id": job.id,
            "job_type": job.job_type,
            "target_id": job.target_id,
            "status": job.status,
            "progress": job.progress,
            "progress_message": job.progress_message,
            "payload": payload,
            "result": result,
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }


# Singleton queue instance
_queue_instance: JobQueue | None = None
_queue_lock = threading.Lock()


def get_queue() -> JobQueue:
    global _queue_instance
    if _queue_instance is None:
        with _queue_lock:
            if _queue_instance is None:
                _queue_instance = JobQueue()
    return _queue_instance


# Import handlers so they self-register
from app.services import job_handlers  # noqa: E402,F401
