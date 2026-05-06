# Automated Material Agent and Knowledge Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic material-analysis Agent pipeline that publishes validated teacher materials into the shared course graph, keeps student materials in personal knowledge overlays, and exposes real run events to the frontend.

**Architecture:** Keep the current Flask monolith and thread-backed `JobQueue`. Add `AgentRun` and `AgentEvent` as a small event layer on top of jobs, extend material/concept/edge records with knowledge scope metadata, and reuse the existing review/publish flow as the validation and audit boundary.

**Tech Stack:** Flask, SQLAlchemy, SQLite lightweight migrations, ChromaDB, Vue 3, Vite, Vitest, existing CSS design tokens.

---

## Scope Check

The spec touches backend automation, data scope, frontend teacher workspace cleanup, and upload progress UI. These are one cohesive feature because all work supports a single material ingestion loop: upload → agent events → scoped knowledge stores → teacher/student consumption. The plan is split into tasks that can each pass tests independently.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/app/models.py` | Add scope fields and AgentRun/AgentEvent persistence models. |
| `backend/app/migrations.py` | Add idempotent SQLite column migrations for existing local databases. |
| `backend/app/services/agent_run_service.py` | Create runs, append events, serialize run/event state, mark completion/failure. |
| `backend/app/services/material_service.py` | Save scoped uploads, create runs for async ingestion, write scoped vector metadata. |
| `backend/app/services/job_handlers.py` | Convert `ingest_material` into an event-emitting material agent pipeline. |
| `backend/app/services/review_service.py` | Add automatic graph publish with validation, confidence gate, and review fallback. |
| `backend/app/services/course_service.py` | Filter graph output by public and personal knowledge scopes. |
| `backend/app/services/tutor_service.py` | Include personal chunks and graph overlay when `user_id` is provided. |
| `backend/app/api/materials.py` | Parse upload scope and return `run_id`; list materials by scope. |
| `backend/app/api/agent_runs.py` | Expose run summaries and event lists. |
| `backend/app/api/tutor.py` | Accept optional `user_id` for personal tutor scope. |
| `backend/app/api/__init__.py` | Register new AgentRun API module. |
| `backend/app/tests/test_material_agent_pipeline.py` | Backend automation and event tests. |
| `backend/app/tests/test_knowledge_scope.py` | Scope isolation tests for graph, materials, and tutor lookup. |
| `frontend/src/api/materials.js` | Send `scope_type` and `owner_id`; keep async upload wrapper. |
| `frontend/src/api/agentRuns.js` | Fetch run summaries and event lists. |
| `frontend/src/api/agent-runs.test.js` | API wrapper coverage for new endpoints. |
| `frontend/src/api/teacher-studio.test.js` | Update upload wrapper expectations for optional scoped fields. |
| `frontend/src/components/MaterialUploadStudio.vue` | Poll real AgentRun events and show result summaries. |
| `frontend/src/views/UploadView.vue` | Configure teacher/student upload scope through route query. |
| `frontend/src/views/TeacherStudioView.vue` | Remove duplicated upload form; keep `OPEN EDUFISH OS` and `MODEL CONFIG`. |

---

### Task 1: Persist Agent Runs and Knowledge Scope

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/migrations.py`
- Create: `backend/app/services/agent_run_service.py`
- Test: `backend/app/tests/test_material_agent_pipeline.py`

- [ ] **Step 1: Write failing persistence tests**

Add this test file:

```python
# backend/app/tests/test_material_agent_pipeline.py
import json

from app.db import db
from app.models import AgentEvent, AgentRun, Material
from app.services.agent_run_service import AgentRunService
from app.services.seed_data import seed_courses


def test_agent_run_service_records_material_events(app):
    with app.app_context():
        seed_courses()
        material = Material(
            id="material-agent-test",
            course_id="ai-intro",
            filename="agent.txt",
            path="/tmp/agent.txt",
            scope_type="course_global",
            owner_id="",
        )
        db.session.add(material)
        db.session.commit()

        run = AgentRunService.create_for_material(material, job_id="", scope_type="course_global", owner_id="")
        event = AgentRunService.emit_event(
            run_id=run.id,
            job_id="job-1",
            material_id=material.id,
            course_id=material.course_id,
            scope_type="course_global",
            owner_id="",
            event_type="embedding",
            status="running",
            message="Embedding 1 chunk",
            progress=40,
            payload={"chunk_count": 1},
        )
        AgentRunService.complete_run(run.id, summary={"published_concepts": 1})

        stored_run = db.session.get(AgentRun, run.id)
        stored_event = db.session.get(AgentEvent, event.id)

        assert stored_run.status == "completed"
        assert stored_run.job_id == "job-1"
        assert json.loads(stored_run.summary_json)["published_concepts"] == 1
        assert stored_event.event_type == "embedding"
        assert json.loads(stored_event.payload_json)["chunk_count"] == 1
        assert AgentRunService.serialize_run(stored_run)["summary"]["published_concepts"] == 1
        assert AgentRunService.serialize_event(stored_event)["payload"]["chunk_count"] == 1
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py::test_agent_run_service_records_material_events -q
```

Expected: failure because `AgentRun`, `AgentEvent`, and `AgentRunService` do not exist.

- [ ] **Step 3: Add models**

In `backend/app/models.py`, add fields to existing models:

```python
class Concept(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    label = db.Column(db.String, nullable=False)
    definition = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="published")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
```

```python
class GraphEdge(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    source_id = db.Column(db.String, db.ForeignKey("concept.id"), nullable=False)
    target_id = db.Column(db.String, db.ForeignKey("concept.id"), nullable=False)
    relationship = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default="published")
    evidence = db.Column(db.Text, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    source = db.relationship("Concept", foreign_keys=[source_id], backref=db.backref("outgoing_edges", lazy=True))
    target = db.relationship("Concept", foreign_keys=[target_id], backref=db.backref("incoming_edges", lazy=True))
```

```python
class Material(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    filename = db.Column(db.String, nullable=False)
    path = db.Column(db.String, nullable=False)
    parser_status = db.Column(db.String, nullable=False, default="uploaded")
    chunk_count = db.Column(db.Integer, nullable=False, default=0)
    extraction_method = db.Column(db.String, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    course = db.relationship("Course", backref=db.backref("materials", lazy=True))
```

Add new models after `Job`:

```python
class AgentRun(db.Model):
    id = db.Column(db.String, primary_key=True)
    job_id = db.Column(db.String, nullable=False, default="")
    material_id = db.Column(db.String, db.ForeignKey("material.id"), nullable=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=True)
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="pending")
    summary_json = db.Column(db.Text, nullable=False, default="{}")
    error_message = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    completed_at = db.Column(db.DateTime, nullable=True)
    material = db.relationship("Material", backref=db.backref("agent_runs", lazy=True))


class AgentEvent(db.Model):
    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("agent_run.id"), nullable=False)
    job_id = db.Column(db.String, nullable=False, default="")
    material_id = db.Column(db.String, nullable=False, default="")
    course_id = db.Column(db.String, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    event_type = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default="running")
    message = db.Column(db.Text, nullable=False, default="")
    progress = db.Column(db.Integer, nullable=False, default=0)
    payload_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("AgentRun", backref=db.backref("events", lazy=True))
```

- [ ] **Step 4: Add SQLite migrations**

In `backend/app/migrations.py`, append to `run_migrations()`:

```python
    # Knowledge scope metadata
    _add_column_if_missing("material", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("material", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("concept", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("concept", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("graph_edge", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("graph_edge", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
```

- [ ] **Step 5: Implement AgentRunService**

Create `backend/app/services/agent_run_service.py`:

```python
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
    def emit_event(run_id, job_id, material_id, course_id, scope_type, owner_id, event_type, status, message, progress, payload=None):
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
        run.status = "completed"
        run.summary_json = _json(summary)
        run.updated_at = _now()
        run.completed_at = _now()
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def fail_run(run_id, error_message, summary=None):
        run = db.session.get(AgentRun, run_id)
        if run is None:
            return None
        run.status = "failed"
        run.error_message = error_message or ""
        run.summary_json = _json(summary)
        run.updated_at = _now()
        run.completed_at = _now()
        db.session.commit()
        db.session.refresh(run)
        return run

    @staticmethod
    def list_events(run_id):
        return AgentEvent.query.filter_by(run_id=run_id).order_by(AgentEvent.created_at.asc()).all()

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
```

- [ ] **Step 6: Run the persistence test**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py::test_agent_run_service_records_material_events -q
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/services/agent_run_service.py backend/app/tests/test_material_agent_pipeline.py
git commit -m "feat: add agent run event persistence"
```

---

### Task 2: Add AgentRun API and Scoped Upload Contract

**Files:**
- Modify: `backend/app/api/materials.py`
- Create: `backend/app/api/agent_runs.py`
- Modify: `backend/app/api/__init__.py`
- Modify: `backend/app/services/material_service.py`
- Test: `backend/app/tests/test_material_agent_pipeline.py`

- [ ] **Step 1: Add failing API tests**

Append to `backend/app/tests/test_material_agent_pipeline.py`:

```python
import io


def test_async_upload_returns_run_id_and_scope(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "course_global",
            "file": (io.BytesIO(b"Automated public material."), "public.txt"),
        },
        content_type="multipart/form-data",
    )
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    data = payload["data"]
    assert data["run_id"].startswith("run-")
    assert data["job_id"].startswith("job-")
    assert data["material"]["scope_type"] == "course_global"
    assert data["material"]["owner_id"] == ""


def test_student_personal_upload_requires_owner_id(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "student_personal",
            "file": (io.BytesIO(b"Private note."), "private.txt"),
        },
        content_type="multipart/form-data",
    )

    assert res.status_code == 400
    assert res.get_json()["error"] == "owner_id is required for student_personal materials"


def test_agent_run_events_endpoint_returns_ordered_events(client, app):
    with app.app_context():
        seed_courses()
        material = Material(
            id="material-events-api",
            course_id="ai-intro",
            filename="events.txt",
            path="/tmp/events.txt",
            scope_type="course_global",
            owner_id="",
        )
        db.session.add(material)
        db.session.commit()
        run = AgentRunService.create_for_material(material)
        AgentRunService.emit_event(run.id, "job-1", material.id, material.course_id, "course_global", "", "received", "running", "Received", 5)
        AgentRunService.emit_event(run.id, "job-1", material.id, material.course_id, "course_global", "", "completed", "completed", "Completed", 100)

    run_res = client.get(f"/api/agent-runs/{run.id}")
    events_res = client.get(f"/api/agent-runs/{run.id}/events")

    assert run_res.status_code == 200
    assert run_res.get_json()["data"]["id"] == run.id
    assert events_res.status_code == 200
    assert [event["event_type"] for event in events_res.get_json()["data"]] == ["received", "completed"]
```

- [ ] **Step 2: Run API tests and verify they fail**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py::test_async_upload_returns_run_id_and_scope backend/app/tests/test_material_agent_pipeline.py::test_student_personal_upload_requires_owner_id backend/app/tests/test_material_agent_pipeline.py::test_agent_run_events_endpoint_returns_ordered_events -q
```

Expected: failure because upload does not return `run_id`, scope validation is absent, and `/api/agent-runs` is not registered.

- [ ] **Step 3: Update material serialization and scope validation**

In `backend/app/api/materials.py`, replace `_serialize()` and add helpers:

```python
ALLOWED_SCOPE_TYPES = {"course_global", "student_personal", "teacher_private"}


def _serialize(material):
    return {
        "id": material.id,
        "course_id": material.course_id,
        "filename": material.filename,
        "parser_status": material.parser_status,
        "chunk_count": material.chunk_count,
        "extraction_method": material.extraction_method,
        "scope_type": material.scope_type,
        "owner_id": material.owner_id,
    }


def _upload_scope():
    scope_type = request.form.get("scope_type") or "course_global"
    owner_id = request.form.get("owner_id") or ""
    if scope_type not in ALLOWED_SCOPE_TYPES:
        raise ValueError("scope_type must be course_global, student_personal, or teacher_private")
    if scope_type == "student_personal" and not owner_id:
        raise ValueError("owner_id is required for student_personal materials")
    return scope_type, owner_id
```

In `upload_material()`, call `_upload_scope()` before service calls and return `run_id` for async uploads:

```python
        scope_type, owner_id = _upload_scope()
        if use_async:
            material, job, run = MaterialService.ingest_upload_async(
                course_id,
                file_storage,
                scope_type=scope_type,
                owner_id=owner_id,
                auto_publish=True,
            )
            return jsonify({
                "success": True,
                "data": {
                    "material": _serialize(material),
                    "job_id": job.id,
                    "run_id": run.id,
                    "async": True,
                },
            })
        material, review_item = MaterialService.ingest_upload(
            course_id,
            file_storage,
            scope_type=scope_type,
            owner_id=owner_id,
        )
```

In `list_materials()`, add filters:

```python
    scope_type = request.args.get("scope_type")
    owner_id = request.args.get("owner_id")
    if scope_type:
        query = query.filter_by(scope_type=scope_type)
    if owner_id is not None:
        query = query.filter_by(owner_id=owner_id)
```

- [ ] **Step 4: Update MaterialService async creation**

In `backend/app/services/material_service.py`, update signatures:

```python
    def save_upload(course_id, file_storage, commit=True, scope_type="course_global", owner_id=""):
```

Set the fields when creating `Material`:

```python
        material = Material(
            id=material_id,
            course_id=course_id,
            filename=filename,
            path=path,
            scope_type=scope_type,
            owner_id=owner_id or "",
        )
```

Update `ingest_upload()`:

```python
    def ingest_upload(course_id, file_storage, scope_type="course_global", owner_id=""):
```

and call:

```python
            material = MaterialService.save_upload(
                course_id,
                file_storage,
                commit=False,
                scope_type=scope_type,
                owner_id=owner_id,
            )
```

Update `ingest_upload_async()`:

```python
    def ingest_upload_async(course_id, file_storage, scope_type="course_global", owner_id="", auto_publish=True):
```

Inside it, create the run before enqueue:

```python
        from app.services.agent_run_service import AgentRunService
```

```python
            material = MaterialService.save_upload(
                course_id,
                file_storage,
                commit=True,
                scope_type=scope_type,
                owner_id=owner_id,
            )
            run = AgentRunService.create_for_material(
                material,
                job_id="",
                scope_type=scope_type,
                owner_id=owner_id,
            )
```

Pass run metadata to the job:

```python
            payload={
                "material_id": material.id,
                "run_id": run.id,
                "scope_type": scope_type,
                "owner_id": owner_id or "",
                "auto_publish": bool(auto_publish),
            },
```

Return:

```python
        return material, job, run
```

- [ ] **Step 5: Add AgentRun API**

Create `backend/app/api/agent_runs.py`:

```python
from flask import jsonify

from app.api import api_bp
from app.models import AgentRun
from app.services.agent_run_service import AgentRunService


@api_bp.get("/agent-runs/<run_id>")
def get_agent_run(run_id):
    run = AgentRun.query.get(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"agent run not found: {run_id}"}), 404
    return jsonify({"success": True, "data": AgentRunService.serialize_run(run)})


@api_bp.get("/agent-runs/<run_id>/events")
def list_agent_run_events(run_id):
    run = AgentRun.query.get(run_id)
    if run is None:
        return jsonify({"success": False, "error": f"agent run not found: {run_id}"}), 404
    events = AgentRunService.list_events(run_id)
    return jsonify({"success": True, "data": [AgentRunService.serialize_event(event) for event in events]})
```

In `backend/app/api/__init__.py`, add:

```python
from . import agent_runs  # noqa: E402,F401
```

- [ ] **Step 6: Run API tests**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py -q
```

Expected: Task 1 tests and new API tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/app/api/materials.py backend/app/api/agent_runs.py backend/app/api/__init__.py backend/app/services/material_service.py backend/app/tests/test_material_agent_pipeline.py
git commit -m "feat: expose scoped material agent runs"
```

---

### Task 3: Emit Material Agent Events and Auto-Publish Valid Graph Payloads

**Files:**
- Modify: `backend/app/services/job_handlers.py`
- Modify: `backend/app/services/material_service.py`
- Modify: `backend/app/services/review_service.py`
- Test: `backend/app/tests/test_material_agent_pipeline.py`

- [ ] **Step 1: Add failing auto-publish tests**

Append:

```python
from app.models import Concept, ReviewItem


def test_async_material_job_auto_publishes_valid_fallback_graph(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "course_global",
            "file": (io.BytesIO(b"Attention selects useful signals for learning."), "attention-upload.txt"),
        },
        content_type="multipart/form-data",
    )
    data = res.get_json()["data"]

    with app.app_context():
        run = db.session.get(AgentRun, data["run_id"])
        material = db.session.get(Material, data["material"]["id"])
        review_items = ReviewItem.query.order_by(ReviewItem.created_at.desc()).all()
        uploaded_concept = Concept.query.filter_by(id=f"concept-upload-{material.id}").first()
        events = AgentRunService.list_events(run.id)

        assert run.status == "completed"
        assert material.parser_status in {"chunked", "embedded"}
        assert uploaded_concept is not None
        assert uploaded_concept.status == "published"
        assert uploaded_concept.scope_type == "course_global"
        assert review_items[0].status == "published"
        assert [event.event_type for event in events] == [
            "received",
            "extracting",
            "chunking",
            "embedding",
            "extracting_graph",
            "publishing",
            "completed",
        ]


def test_low_confidence_graph_stays_in_review_queue(app):
    with app.app_context():
        seed_courses()
        item = ReviewService.create_graph_suggestion(
            "Low confidence",
            {
                "course_id": "ai-intro",
                "concepts": [
                    {
                        "id": "concept-low-confidence",
                        "course_id": "ai-intro",
                        "label": "Low Confidence",
                        "definition": "Not enough evidence.",
                        "confidence": 0.2,
                    }
                ],
                "edges": [],
            },
        )

        result = ReviewService.auto_publish_graph_suggestion(item.id, scope_type="course_global", owner_id="")

        assert result["published"] is False
        assert result["needs_review"] is True
        assert db.session.get(ReviewItem, item.id).status == "needs_review"
        assert db.session.get(Concept, "concept-low-confidence") is None
```

- [ ] **Step 2: Run auto-publish tests and verify they fail**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py::test_async_material_job_auto_publishes_valid_fallback_graph backend/app/tests/test_material_agent_pipeline.py::test_low_confidence_graph_stays_in_review_queue -q
```

Expected: failure because event emission and automatic publishing are absent.

- [ ] **Step 3: Add confidence helpers and auto-publish**

In `backend/app/services/review_service.py`, add helpers:

```python
    @staticmethod
    def _payload_confidence_ok(payload, threshold=0.65):
        for concept in payload.get("concepts", []):
            confidence = concept.get("confidence")
            if confidence is not None and float(confidence) < threshold:
                return False
        for edge in payload.get("edges", []):
            confidence = edge.get("confidence")
            if confidence is not None and float(confidence) < threshold:
                return False
        return True

    @staticmethod
    def auto_publish_graph_suggestion(item_id, scope_type="course_global", owner_id="", reviewer="material-agent"):
        item = db.get_or_404(ReviewItem, item_id)
        payload = ReviewService.get_payload(item)
        if not ReviewService._payload_confidence_ok(payload):
            item.status = "needs_review"
            item.reviewer = reviewer
            item.decision_notes = "Automatic publish skipped because confidence was below threshold."
            db.session.commit()
            return {"published": False, "needs_review": True, "reason": "low_confidence"}

        concepts, edges = ReviewService._validate_graph_payload(item)
        try:
            for concept in concepts:
                db.session.merge(
                    Concept(
                        id=concept["id"],
                        course_id=concept["course_id"],
                        label=concept["label"],
                        definition=concept["definition"],
                        status="published",
                        scope_type=scope_type,
                        owner_id=owner_id or "",
                    )
                )
            for edge in edges:
                db.session.merge(
                    GraphEdge(
                        id=edge["id"],
                        course_id=edge["course_id"],
                        source_id=edge["source_id"],
                        target_id=edge["target_id"],
                        relationship=edge["relationship"],
                        status="published",
                        evidence=edge["evidence"],
                        scope_type=scope_type,
                        owner_id=owner_id or "",
                    )
                )
            item.status = "published"
            item.reviewer = reviewer
            item.decision_notes = "Automatically published by material analysis agent."
            db.session.commit()
        except Exception:
            db.session.rollback()
            item.status = "needs_review"
            item.reviewer = reviewer
            item.decision_notes = "Automatic publish failed during graph write."
            db.session.commit()
            return {"published": False, "needs_review": True, "reason": "publish_failed"}

        return {"published": True, "needs_review": False, "concepts": len(concepts), "edges": len(edges)}
```

Update `_validate_graph_payload()` so normalized concepts and edges carry scope data:

```python
            scope_type = concept.get("scope_type") or payload.get("scope_type") or "course_global"
            owner_id = concept.get("owner_id") or payload.get("owner_id") or ""
```

Add the values to `normalized_concepts.append()`:

```python
                "scope_type": scope_type,
                "owner_id": owner_id,
```

Do the same in the edge loop:

```python
            scope_type = edge.get("scope_type") or payload.get("scope_type") or "course_global"
            owner_id = edge.get("owner_id") or payload.get("owner_id") or ""
```

and add to `normalized_edges.append()`:

```python
                "scope_type": scope_type,
                "owner_id": owner_id,
```

Update `publish_item()` to preserve normalized scope:

```python
                        scope_type=concept["scope_type"],
                        owner_id=concept["owner_id"],
```

and:

```python
                        scope_type=edge["scope_type"],
                        owner_id=edge["owner_id"],
```

- [ ] **Step 4: Add scope metadata to graph suggestions**

In `MaterialService._simple_suggestion()`, include confidence:

```python
                "confidence": 1.0,
```

In `MaterialService._llm_suggestion()`, include optional fields:

```python
                "confidence": float(c.get("confidence", 0.8) or 0.8),
                "tags": c.get("tags", []),
                "difficulty": c.get("difficulty", ""),
                "evidence_chunk_ids": c.get("evidence_chunk_ids", []),
```

and for edges:

```python
                "confidence": float(e.get("confidence", 0.8) or 0.8),
                "evidence_chunk_ids": e.get("evidence_chunk_ids", []),
```

- [ ] **Step 5: Convert job handler into event-emitting agent pipeline**

In `backend/app/services/job_handlers.py`, import:

```python
from app.services.agent_run_service import AgentRunService
from app.services.review_service import ReviewService
```

At the start of `handle_ingest_material()`:

```python
    run_id = payload.get("run_id")
    scope_type = payload.get("scope_type") or "course_global"
    owner_id = payload.get("owner_id") or ""
    auto_publish = payload.get("auto_publish", True)
```

After loading `material`:

```python
        if run_id:
            AgentRunService.mark_running(run_id, job_id=job_id)

        def emit(event_type, status, message, progress, event_payload=None):
            ctx.update(progress=progress, message=message)
            if run_id:
                AgentRunService.emit_event(
                    run_id=run_id,
                    job_id=job_id,
                    material_id=material.id,
                    course_id=material.course_id,
                    scope_type=scope_type,
                    owner_id=owner_id,
                    event_type=event_type,
                    status=status,
                    message=message,
                    progress=progress,
                    payload=event_payload or {},
                )
```

Replace progress calls with:

```python
        emit("received", "running", "Material received", 5, {"filename": material.filename})
        emit("extracting", "running", "Extracting text", 15)
        chunks = MaterialService.extract_and_chunk(material, commit=True)
        emit("chunking", "running", f"Created {len(chunks)} chunks", 35, {"chunk_count": len(chunks)})
```

For no chunks:

```python
        if not chunks:
            summary = {"chunks": 0, "review_item_id": None, "published": False}
            emit("completed", "completed", "No extractable text", 100, summary)
            if run_id:
                AgentRunService.complete_run(run_id, summary=summary)
            return summary
```

Embedding block:

```python
        emit("embedding", "running", f"Embedding {len(chunks)} chunks", 55, {"chunk_count": len(chunks)})
        try:
            MaterialService.embed_and_store(material, chunks)
            db.session.commit()
        except Exception as exc:
            logger.exception("Embedding failed; continuing without vector index")
            material.parser_status = "chunked"
            db.session.commit()
            emit("embedding", "failed", "Embedding failed; continuing with graph extraction", 60, {"error": str(exc)})
```

Graph and publish block:

```python
        emit("extracting_graph", "running", "Extracting concepts and relationships", 75)
        review_item = MaterialService.create_review_suggestion_from_chunks(material, chunks, commit=True)

        publish_result = {"published": False, "needs_review": True}
        if auto_publish:
            emit("publishing", "running", "Validating and publishing graph", 90, {"review_item_id": review_item.id})
            publish_result = ReviewService.auto_publish_graph_suggestion(
                review_item.id,
                scope_type=scope_type,
                owner_id=owner_id,
            )

        summary = {
            "material_id": material_id,
            "chunks": len(chunks),
            "review_item_id": review_item.id if review_item else None,
            "parser_status": material.parser_status,
            "published": publish_result.get("published", False),
            "needs_review": publish_result.get("needs_review", False),
            "published_concepts": publish_result.get("concepts", 0),
            "published_edges": publish_result.get("edges", 0),
        }
        emit("completed", "completed", "Material analysis complete", 100, summary)
        if run_id:
            AgentRunService.complete_run(run_id, summary=summary)
        return summary
```

Wrap the function body so exceptions call:

```python
        if run_id:
            AgentRunService.fail_run(run_id, str(exc))
```

before re-raising.

- [ ] **Step 6: Run auto-publish tests**

Run:

```bash
uv run pytest backend/app/tests/test_material_agent_pipeline.py -q
```

Expected: all material agent pipeline tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/app/services/job_handlers.py backend/app/services/material_service.py backend/app/services/review_service.py backend/app/tests/test_material_agent_pipeline.py
git commit -m "feat: auto publish material agent graph output"
```

---

### Task 4: Enforce Scope Isolation in Graph, Materials, Vectors, and Tutor

**Files:**
- Modify: `backend/app/services/course_service.py`
- Modify: `backend/app/services/material_service.py`
- Modify: `backend/app/services/tutor_service.py`
- Modify: `backend/app/api/tutor.py`
- Test: `backend/app/tests/test_knowledge_scope.py`

- [ ] **Step 1: Add failing scope tests**

Create `backend/app/tests/test_knowledge_scope.py`:

```python
from app.db import db
from app.models import Concept, GraphEdge, Material
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses
from app.services.tutor_service import TutorService


def test_public_graph_excludes_student_personal_overlay(app):
    with app.app_context():
        seed_courses()
        db.session.add(
            Concept(
                id="concept-personal-note",
                course_id="ai-intro",
                label="Personal Note",
                definition="A private student-only note.",
                scope_type="student_personal",
                owner_id="student-1",
            )
        )
        db.session.commit()

        public_graph = CourseService.get_graph("ai-intro")
        personal_graph = CourseService.get_graph("ai-intro", owner_id="student-1", include_personal=True)

        assert "concept-personal-note" not in {node["id"] for node in public_graph["nodes"]}
        assert "concept-personal-note" in {node["id"] for node in personal_graph["nodes"]}


def test_student_personal_materials_are_filtered_by_owner(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Material(id="material-public", course_id="ai-intro", filename="public.txt", path="/tmp/public.txt", scope_type="course_global", owner_id=""),
            Material(id="material-s1", course_id="ai-intro", filename="s1.txt", path="/tmp/s1.txt", scope_type="student_personal", owner_id="student-1"),
            Material(id="material-s2", course_id="ai-intro", filename="s2.txt", path="/tmp/s2.txt", scope_type="student_personal", owner_id="student-2"),
        ])
        db.session.commit()

    res = client.get("/api/materials?course_id=ai-intro&scope_type=student_personal&owner_id=student-1")
    ids = {item["id"] for item in res.get_json()["data"]}

    assert ids == {"material-s1"}


def test_tutor_with_user_id_can_use_personal_graph_overlay(app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-personal-weakness",
                course_id="ai-intro",
                label="Spaced Retrieval Weakness",
                definition="The student repeatedly misses spaced retrieval questions.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            Concept(
                id="concept-personal-plan",
                course_id="ai-intro",
                label="Personal Review Plan",
                definition="A student-specific review plan for spaced retrieval.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            GraphEdge(
                id="edge-personal-plan",
                course_id="ai-intro",
                source_id="concept-personal-weakness",
                target_id="concept-personal-plan",
                relationship="recommends",
                evidence="Private learning history shows repeated misses.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

        without_user = TutorService.answer("spaced retrieval weakness", course_id="ai-intro")
        with_user = TutorService.answer("spaced retrieval weakness", course_id="ai-intro", user_id="student-1")

    assert without_user["insufficient_evidence"] is True
    assert with_user["insufficient_evidence"] is False
    assert any(citation["id"] == "edge-personal-plan" for citation in with_user["citations"])
```

- [ ] **Step 2: Run scope tests and verify they fail**

Run:

```bash
uv run pytest backend/app/tests/test_knowledge_scope.py -q
```

Expected: graph and tutor currently do not filter or include personal scope correctly.

- [ ] **Step 3: Add graph scope filters**

In `backend/app/services/course_service.py`, change signature:

```python
    def get_graph(course_id=None, owner_id="", include_personal=False):
```

Update imports:

```python
from sqlalchemy import and_, or_
```

Before querying, compute scopes:

```python
        allowed_scopes = ["course_global"]
        if include_personal and owner_id:
            allowed_scopes.append("student_personal")
```

Apply filters:

```python
                GraphEdge.scope_type.in_(allowed_scopes),
                Concept.scope_type.in_(allowed_scopes),
```

For personal rows, add owner rule:

```python
        def _scope_visible(model):
            if include_personal and owner_id:
                return or_(
                    model.scope_type == "course_global",
                    and_(model.scope_type == "student_personal", model.owner_id == owner_id),
                )
            return model.scope_type == "course_global"
```

Use `_scope_visible(GraphEdge)` in `edges_query` and `_scope_visible(Concept)` in `concepts_query`.

Include scope data in returned nodes and edges:

```python
                "scope_type": concept.scope_type,
                "owner_id": concept.owner_id,
```

and:

```python
                    "scope_type": edge.scope_type,
                    "owner_id": edge.owner_id,
```

- [ ] **Step 4: Add vector metadata and scoped query filters**

In `MaterialService.embed_and_store()`, add metadata:

```python
                "scope_type": material.scope_type,
                "owner_id": material.owner_id or "",
```

Add helper:

```python
    @staticmethod
    def _vector_scope_where(course_id=None, owner_id="", include_personal=False):
        filters = []
        if course_id:
            filters.append({"course_id": course_id})
        if include_personal and owner_id:
            filters.append({
                "$or": [
                    {"scope_type": "course_global"},
                    {"$and": [{"scope_type": "student_personal"}, {"owner_id": owner_id}]},
                ]
            })
        else:
            filters.append({"scope_type": "course_global"})
        if not filters:
            return None
        if len(filters) == 1:
            return filters[0]
        return {"$and": filters}
```

Update `search_chunks()`:

```python
    def search_chunks(query_embedding, course_id=None, n_results=5, owner_id="", include_personal=False):
        vector_store = _get_vector_store()
        where = MaterialService._vector_scope_where(course_id, owner_id, include_personal)
        return vector_store.query(query_embedding, n_results=n_results, where=where)
```

- [ ] **Step 5: Add tutor personal scope**

In `backend/app/api/tutor.py`, parse:

```python
        user_id = _optional_string(body, "user_id")
```

Pass `user_id=user_id` to `TutorService.answer()` and `TutorService.answer_stream()`.

In `TutorService`, update signatures:

```python
    def answer(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
    def answer_stream(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
    def _rag_answer(question, course_id, chapter_id, concept_id, cfg, user_id=""):
    def _rag_answer_stream(question, course_id, chapter_id, concept_id, cfg, user_id=""):
    def _graph_context(question, course_id, chapter_id, concept_id, user_id=""):
    def _keyword_answer(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
```

Pass vector scope:

```python
            chunk_results = MaterialService.search_chunks(
                query_embedding,
                course_id=course_id,
                n_results=profile["search_results"],
                owner_id=user_id or "",
                include_personal=bool(user_id),
            )
```

Pass graph scope:

```python
        graph = CourseService.get_graph(
            course_id=course_id,
            owner_id=user_id or "",
            include_personal=bool(user_id),
        )
```

Apply this in both `_graph_context()` and `_keyword_answer()`.

- [ ] **Step 6: Run scope tests**

Run:

```bash
uv run pytest backend/app/tests/test_knowledge_scope.py backend/app/tests/test_tutor_service.py -q
```

Expected: new scope tests pass and existing tutor behavior remains unchanged.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/app/services/course_service.py backend/app/services/material_service.py backend/app/services/tutor_service.py backend/app/api/tutor.py backend/app/tests/test_knowledge_scope.py
git commit -m "feat: isolate course and personal knowledge scopes"
```

---

### Task 5: Add Frontend AgentRun API Wrappers and Scoped Upload Parameters

**Files:**
- Modify: `frontend/src/api/materials.js`
- Create: `frontend/src/api/agentRuns.js`
- Create: `frontend/src/api/agent-runs.test.js`
- Modify: `frontend/src/api/teacher-studio.test.js`

- [ ] **Step 1: Add failing frontend API tests**

Create `frontend/src/api/agent-runs.test.js`:

```javascript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

const { default: apiClient } = await import('./client');
const { getAgentRun, listAgentRunEvents } = await import('./agentRuns');
const { uploadMaterialAsync } = await import('./materials');

describe('agent run and scoped material APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches an agent run and its events', async () => {
    apiClient.get.mockResolvedValueOnce({ id: 'run-1' });
    apiClient.get.mockResolvedValueOnce([{ id: 'event-1' }]);

    await expect(getAgentRun('run-1')).resolves.toEqual({ id: 'run-1' });
    await expect(listAgentRunEvents('run-1')).resolves.toEqual([{ id: 'event-1' }]);

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/agent-runs/run-1');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/agent-runs/run-1/events');
  });

  it('uploads async materials with scope metadata', async () => {
    const file = new File(['private note'], 'note.txt', { type: 'text/plain' });
    apiClient.post.mockResolvedValue({ job_id: 'job-1', run_id: 'run-1' });

    await uploadMaterialAsync('ai-intro', file, {
      scopeType: 'student_personal',
      ownerId: 'student-1'
    });

    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toBe('/api/materials/upload?async=1');
    expect(body.get('course_id')).toBe('ai-intro');
    expect(body.get('scope_type')).toBe('student_personal');
    expect(body.get('owner_id')).toBe('student-1');
    expect(body.get('file')).toBe(file);
  });
});
```

Update `frontend/src/api/teacher-studio.test.js` by adding after the existing upload test:

```javascript
  it('keeps scoped upload metadata optional for old callers', async () => {
    const file = new File(['chapter notes'], 'chapter.txt', { type: 'text/plain' });
    apiClient.post.mockResolvedValue({ job_id: 'job-1' });

    await uploadMaterial('ai-intro', file);

    const [, body] = apiClient.post.mock.calls[0];
    expect(body.get('scope_type')).toBe(null);
    expect(body.get('owner_id')).toBe(null);
  });
```

- [ ] **Step 2: Run frontend tests and verify they fail**

Run:

```bash
npm run test -- frontend/src/api/agent-runs.test.js frontend/src/api/teacher-studio.test.js --run
```

Expected: failure because `agentRuns.js` is missing and `uploadMaterialAsync()` does not accept options.

- [ ] **Step 3: Implement frontend wrappers**

Create `frontend/src/api/agentRuns.js`:

```javascript
import apiClient from './client';

export function getAgentRun(runId) {
  return apiClient.get(`/api/agent-runs/${runId}`);
}

export function listAgentRunEvents(runId) {
  return apiClient.get(`/api/agent-runs/${runId}/events`);
}
```

Update `frontend/src/api/materials.js`:

```javascript
function appendScope(formData, options = {}) {
  if (options.scopeType) {
    formData.append('scope_type', options.scopeType);
  }
  if (options.ownerId) {
    formData.append('owner_id', options.ownerId);
  }
}
```

Keep `uploadMaterial()` backward-compatible:

```javascript
export function uploadMaterial(courseId, file, options = {}) {
  const formData = new FormData();
  formData.append('course_id', courseId);
  formData.append('file', file);
  appendScope(formData, options);

  return apiClient.post('/api/materials/upload', formData);
}
```

Update `uploadMaterialAsync()`:

```javascript
export function uploadMaterialAsync(courseId, file, options = {}) {
  const formData = new FormData();
  formData.append('course_id', courseId);
  formData.append('file', file);
  appendScope(formData, options);

  return apiClient.post('/api/materials/upload?async=1', formData);
}
```

- [ ] **Step 4: Run frontend API tests**

Run:

```bash
npm run test -- frontend/src/api/agent-runs.test.js frontend/src/api/teacher-studio.test.js --run
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/api/materials.js frontend/src/api/agentRuns.js frontend/src/api/agent-runs.test.js frontend/src/api/teacher-studio.test.js
git commit -m "feat: add frontend agent run api"
```

---

### Task 6: Show Real Agent Events in Material Upload Studio

**Files:**
- Modify: `frontend/src/components/MaterialUploadStudio.vue`
- Modify: `frontend/src/views/UploadView.vue`
- Test: `frontend/src/api/agent-runs.test.js`

- [ ] **Step 1: Add upload scope configuration test**

Append to `frontend/src/api/agent-runs.test.js`:

```javascript
import { materialUploadScopeFromRoute } from '../views/uploadViewState';

describe('upload view scope state', () => {
  it('maps route query to teacher public scope by default', () => {
    expect(materialUploadScopeFromRoute({})).toEqual({
      scopeType: 'course_global',
      ownerId: '',
      mode: 'teacher'
    });
  });

  it('maps student query to personal scope', () => {
    expect(materialUploadScopeFromRoute({ mode: 'student', owner: 'student-1' })).toEqual({
      scopeType: 'student_personal',
      ownerId: 'student-1',
      mode: 'student'
    });
  });
});
```

- [ ] **Step 2: Create upload state helper**

Create `frontend/src/views/uploadViewState.js`:

```javascript
export function materialUploadScopeFromRoute(query = {}) {
  const mode = query.mode === 'student' ? 'student' : 'teacher';
  if (mode === 'student') {
    return {
      mode,
      scopeType: 'student_personal',
      ownerId: typeof query.owner === 'string' && query.owner ? query.owner : 'student-demo'
    };
  }
  return {
    mode,
    scopeType: 'course_global',
    ownerId: ''
  };
}
```

- [ ] **Step 3: Pass scope into UploadView**

In `frontend/src/views/UploadView.vue`:

```vue
<MaterialUploadStudio
  :course-id="activeCourseId"
  :scope-type="uploadScope.scopeType"
  :owner-id="uploadScope.ownerId"
  :mode="uploadScope.mode"
  @uploaded="onUploaded"
/>
```

Add:

```javascript
import { materialUploadScopeFromRoute } from './uploadViewState';
```

and:

```javascript
const uploadScope = computed(() => materialUploadScopeFromRoute(route.query));
```

- [ ] **Step 4: Poll AgentRun events in MaterialUploadStudio**

In `frontend/src/components/MaterialUploadStudio.vue`, import:

```javascript
import { listAgentRunEvents } from '../api/agentRuns';
```

Add props:

```javascript
  scopeType: { type: String, default: 'course_global' },
  ownerId: { type: String, default: '' },
  mode: { type: String, default: 'teacher' }
```

When adding queue items, include:

```javascript
      runId: null,
      events: [],
      summary: null,
```

Call async upload with scope:

```javascript
    const res = await uploadMaterialAsync(props.courseId, next.file, {
      scopeType: props.scopeType,
      ownerId: props.ownerId
    });
    next.jobId = res.job_id;
    next.runId = res.run_id;
```

Add event polling:

```javascript
async function pollRunEvents(item) {
  if (!item.runId) return;
  try {
    const events = await listAgentRunEvents(item.runId);
    item.events = Array.isArray(events) ? events : [];
    const latest = item.events[item.events.length - 1];
    if (latest) {
      item.progress = latest.progress || item.progress;
      item.progressMessage = latest.message || item.progressMessage;
    }
  } catch {
    return;
  }
}
```

Call it inside `pollJob()` before status checks:

```javascript
    await pollRunEvents(item);
```

When job completes:

```javascript
      item.summary = job.result || null;
```

In the queue item template, after status text add result summary:

```vue
<span v-if="item.summary?.published" class="queue-item-status">
  已发布 {{ item.summary.published_concepts || 0 }} 节点 · {{ item.summary.published_edges || 0 }} 关系
</span>
<span v-else-if="item.summary?.needs_review" class="queue-item-status">
  已进入审核队列
</span>
```

Add an event trace under each processing item:

```vue
<ol v-if="item.events?.length" class="agent-event-list">
  <li v-for="event in item.events.slice(-5)" :key="event.id">
    <span>{{ event.event_type }}</span>
    <strong>{{ event.progress }}%</strong>
    <em>{{ event.message }}</em>
  </li>
</ol>
```

Add compact CSS:

```css
.agent-event-list {
  grid-column: 1 / -1;
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--border-subtle);
  list-style: none;
}

.agent-event-list li {
  display: grid;
  grid-template-columns: 120px 48px 1fr;
  gap: 12px;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-4);
}

.agent-event-list strong {
  color: var(--primary);
  font-weight: 800;
}

.agent-event-list em {
  color: var(--text-3);
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
}
```

- [ ] **Step 5: Run frontend tests and build**

Run:

```bash
npm run test -- frontend/src/api/agent-runs.test.js --run
npm run build
```

Expected: targeted tests pass and production build completes.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/components/MaterialUploadStudio.vue frontend/src/views/UploadView.vue frontend/src/views/uploadViewState.js frontend/src/api/agent-runs.test.js
git commit -m "feat: show material agent event progress"
```

---

### Task 7: Simplify Teacher Studio to Entry Hub

**Files:**
- Modify: `frontend/src/views/TeacherStudioView.vue`
- Test: `frontend/src/api/teacher-studio.test.js`

- [ ] **Step 1: Add state helper test for teacher entry links**

Append to `frontend/src/api/teacher-studio.test.js`:

```javascript
const { teacherStudioEntries } = await import('../views/teacherStudioState');
```

Inside the describe block:

```javascript
  it('keeps teacher studio focused on the two primary entries', () => {
    expect(teacherStudioEntries()).toEqual([
      { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
      { label: 'MODEL CONFIG', to: '/teacher/model-config' }
    ]);
  });
```

- [ ] **Step 2: Update state helper**

In `frontend/src/views/teacherStudioState.js`, add:

```javascript
export function teacherStudioEntries() {
  return [
    { label: 'OPEN EDUFISH OS', to: '/teacher/edufish' },
    { label: 'MODEL CONFIG', to: '/teacher/model-config' }
  ];
}
```

- [ ] **Step 3: Remove duplicated upload logic from TeacherStudioView**

In `frontend/src/views/TeacherStudioView.vue`, remove imports for:

```javascript
import { listCourses } from '../api/courses';
import { uploadMaterial } from '../api/materials';
import {
  approveReviewItem,
  listReviewItems,
  publishReviewItem,
  rejectReviewItem
} from '../api/review';
import ReviewQueue from '../components/ReviewQueue.vue';
import { createReviewActionTracker, reviewItemCreatedMessage } from './teacherStudioState';
```

Replace with:

```javascript
import { teacherStudioEntries } from './teacherStudioState';

const entries = teacherStudioEntries();
```

Remove upload, review queue, progress interval, file input, selected course, selected file, and review action state.

Replace the left hero content with:

```vue
<div class="upload-content teacher-entry-content">
  <div class="process-tag mono">TEACHER CONTROL SURFACE</div>
  <h1 class="upload-title display">Studio</h1>
  <p class="upload-desc">课程分析、模型配置与教学质量工作流入口。</p>
  <div class="studio-entry-stack">
    <RouterLink
      v-for="entry in entries"
      :key="entry.to"
      :to="entry.to"
      class="studio-entry mono"
    >
      {{ entry.label }} <span aria-hidden="true">→</span>
    </RouterLink>
  </div>
</div>
```

Remove the form, upload progress container, cancel footer, and review section from the template. Keep the right-side network visual and ambient readouts.

Change upload watermark copy:

```vue
<div class="watermark-percent" aria-hidden="true">OS</div>
```

Change right header:

```vue
<span class="indicator mono"><span class="dot"></span> TEACHING INTELLIGENCE SURFACE</span>
```

- [ ] **Step 4: Run frontend tests and build**

Run:

```bash
npm run test -- frontend/src/api/teacher-studio.test.js --run
npm run build
```

Expected: test and build pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/views/TeacherStudioView.vue frontend/src/views/teacherStudioState.js frontend/src/api/teacher-studio.test.js
git commit -m "refactor: simplify teacher studio entry hub"
```

---

### Task 8: Final Verification

**Files:**
- Verify all modified backend and frontend files.

- [ ] **Step 1: Run backend tests**

Run:

```bash
uv run pytest backend/app/tests -q
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm run test -- --run
```

Expected: all frontend tests pass.

- [ ] **Step 3: Build frontend**

Run:

```bash
npm run build
```

Expected: Vite production build completes.

- [ ] **Step 4: Smoke test APIs locally**

Start backend if it is not running:

```bash
backend/.venv/bin/python backend/run.py
```

In a second shell, run:

```bash
curl -sS http://127.0.0.1:5000/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 5: Frontend visual smoke**

Start frontend if it is not running:

```bash
npm run dev
```

Open:

```text
http://localhost:3003/teacher
http://localhost:3003/upload?course=ai-intro
http://localhost:3003/upload?course=ai-intro&mode=student&owner=student-demo
```

Expected: teacher page shows only the two primary links; upload page shows scoped material studio and real event progress after an upload.

- [ ] **Step 6: Final commit for verification fixes**

If verification required small fixes, commit only those files:

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/services/agent_run_service.py backend/app/services/material_service.py backend/app/services/job_handlers.py backend/app/services/review_service.py backend/app/services/course_service.py backend/app/services/tutor_service.py backend/app/api/materials.py backend/app/api/agent_runs.py backend/app/api/tutor.py backend/app/api/__init__.py backend/app/tests/test_material_agent_pipeline.py backend/app/tests/test_knowledge_scope.py frontend/src/api/materials.js frontend/src/api/agentRuns.js frontend/src/api/agent-runs.test.js frontend/src/api/teacher-studio.test.js frontend/src/components/MaterialUploadStudio.vue frontend/src/views/UploadView.vue frontend/src/views/uploadViewState.js frontend/src/views/TeacherStudioView.vue frontend/src/views/teacherStudioState.js
git commit -m "fix: stabilize material agent verification"
```

If no fixes were required, do not create an empty commit.
