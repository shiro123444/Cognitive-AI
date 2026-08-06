# EDUFISH NeuroLab MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable EDUFISH NeuroLab: `/lab` route, experiment templates, deterministic EEG replay/synthetic runs, artifacts, AI-style experiment reports, and progress tracking.

**Architecture:** Add a focused experiment domain beside the existing course/activity/assignment system. The backend owns experiment templates, runs, artifacts, reports, adapter execution, and API envelopes; the frontend owns a lab dashboard and run workspace that consume those APIs. BrainFlow/BrainGenix/Timeflux are represented through adapter boundaries, with the MVP executing a deterministic synthetic EEG adapter so tests and demos do not require hardware.

**Tech Stack:** Flask, SQLAlchemy, existing Job/Progress services, Vue 3, Vue Router, Axios API client, Vitest, pytest.

---

## Scope

This plan implements the first production-shaped slice from the NeuroLab design spec:

1. `/lab` becomes a real authenticated route.
2. Students can list experiment templates and run an EEG replay/synthetic experiment.
3. Runs produce structured artifacts and an experiment report.
4. The backend records `ran_lab` progress events.
5. The UI displays experiment status, signals, spectrum values, observations, and report text.

This plan does not implement real human EEG hardware, clinical interpretation, BrainGenix-NES deployment, Timeflux streaming, or teacher assignment authoring. Those remain future adapters once the core run/artifact/report lifecycle is stable.

---

## File Structure

### Backend

- Modify: `backend/app/models.py`
  - Add `ExperimentTemplate`, `ExperimentRun`, `ExperimentArtifact`, `ExperimentReport`.
- Modify: `backend/app/migrations.py`
  - Add idempotent `CREATE TABLE IF NOT EXISTS` migrations for experiment tables.
- Create: `backend/app/services/experiment_adapters.py`
  - Define adapter contract and deterministic `synthetic_eeg` adapter.
- Create: `backend/app/services/experiment_service.py`
  - Seed templates, list templates, create runs, execute runs, serialize results.
- Create: `backend/app/api/experiments.py`
  - Add `/api/v1/experiments`, `/api/v1/experiments/<id>`, `/api/v1/experiments/<id>/runs`, `/api/v1/experiment-runs/<id>`.
- Modify: `backend/app/api/__init__.py`
  - Import `experiments`.
- Test: `backend/app/tests/test_experiment_service.py`
- Test: `backend/app/tests/test_experiments_api.py`

### Frontend

- Create: `frontend/src/api/experiments.js`
  - API helpers for templates and runs.
- Create: `frontend/src/api/experiments.test.js`
  - API helper URL tests with mocked client.
- Create: `frontend/src/views/labViewState.js`
  - Pure state helpers for template labels, run summaries, signal stats.
- Create: `frontend/src/views/labViewState.test.js`
  - Unit tests for state helpers.
- Modify: `frontend/src/router/index.js`
  - Import `LabView` and register `/lab`.
- Modify: `frontend/src/views/LabView.vue`
  - Replace static cards with dashboard + run workspace.
- Modify: `frontend/src/components/AppShell.vue`
  - Add or fix lab nav entry if the shell has a primary navigation list.
- Modify: `frontend/src/styles/app.css`
  - No planned edits. Keep lab workspace styles scoped inside `LabView.vue` unless implementation verification proves a shared token gap.

---

## Task 1: Backend Experiment Models And Migrations

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/migrations.py`
- Test: `backend/app/tests/test_experiment_service.py`

- [ ] **Step 1: Write the failing model serialization test**

Create `backend/app/tests/test_experiment_service.py`:

```python
from app.db import db
from app.models import ExperimentArtifact, ExperimentReport, ExperimentRun, ExperimentTemplate


def test_experiment_models_store_json_fields(app):
    with app.app_context():
        template = ExperimentTemplate(
            id="exp-eeg-replay",
            title="EEG Replay Lab",
            experiment_type="eeg_replay",
            adapter="synthetic_eeg",
            summary="Explore alpha and beta band activity.",
            status="published",
            default_params_json='{"duration_seconds": 2, "sample_rate": 128}',
            linked_concept_ids_json='["concept-neural-networks"]',
            estimated_minutes=25,
        )
        db.session.add(template)
        run = ExperimentRun(
            id="run-test",
            template_id="exp-eeg-replay",
            student_id="student-ada",
            course_id="ai-intro",
            status="completed",
            params_json='{"duration_seconds": 2}',
            adapter="synthetic_eeg",
            summary_json='{"dominant_band": "alpha"}',
        )
        db.session.add(run)
        artifact = ExperimentArtifact(
            id="artifact-test",
            run_id="run-test",
            artifact_type="signal_summary",
            title="Synthetic EEG Summary",
            data_json='{"channels": 4}',
        )
        db.session.add(artifact)
        report = ExperimentReport(
            id="report-test",
            run_id="run-test",
            status="ready",
            content_json='{"sections": [{"title": "Observation", "body": "Alpha activity is visible."}]}',
        )
        db.session.add(report)
        db.session.commit()

        stored = db.session.get(ExperimentTemplate, "exp-eeg-replay")

    assert stored.title == "EEG Replay Lab"
    assert stored.adapter == "synthetic_eeg"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py::test_experiment_models_store_json_fields -q
```

Expected: FAIL with an import error for `ExperimentTemplate`.

- [ ] **Step 3: Add experiment models**

In `backend/app/models.py`, append these classes after `AgentRun`:

```python
class ExperimentTemplate(db.Model):
    id = db.Column(db.String, primary_key=True)
    title = db.Column(db.String, nullable=False)
    experiment_type = db.Column(db.String, nullable=False)
    adapter = db.Column(db.String, nullable=False)
    summary = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="draft")
    data_source = db.Column(db.String, nullable=False, default="synthetic")
    difficulty = db.Column(db.String, nullable=False, default="basic")
    estimated_minutes = db.Column(db.Integer, nullable=False, default=25)
    default_params_json = db.Column(db.Text, nullable=False, default="{}")
    linked_concept_ids_json = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class ExperimentRun(db.Model):
    id = db.Column(db.String, primary_key=True)
    template_id = db.Column(db.String, db.ForeignKey("experiment_template.id"), nullable=False)
    student_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=True)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=True)
    activity_id = db.Column(db.String, db.ForeignKey("learning_activity.id"), nullable=True)
    status = db.Column(db.String, nullable=False, default="pending")
    adapter = db.Column(db.String, nullable=False)
    params_json = db.Column(db.Text, nullable=False, default="{}")
    summary_json = db.Column(db.Text, nullable=False, default="{}")
    error_message = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    completed_at = db.Column(db.DateTime, nullable=True)
    template = db.relationship("ExperimentTemplate", backref=db.backref("runs", lazy=True))


class ExperimentArtifact(db.Model):
    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("experiment_run.id"), nullable=False)
    artifact_type = db.Column(db.String, nullable=False)
    title = db.Column(db.String, nullable=False)
    data_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("ExperimentRun", backref=db.backref("artifacts", lazy=True))


class ExperimentReport(db.Model):
    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("experiment_run.id"), nullable=False)
    status = db.Column(db.String, nullable=False, default="draft")
    content_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("ExperimentRun", backref=db.backref("reports", lazy=True))
```

- [ ] **Step 4: Add idempotent SQLite migrations**

In `backend/app/migrations.py`, import nothing new and append these statements inside `run_migrations()` after the auth columns:

```python
    with db.engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_template (
                id VARCHAR NOT NULL PRIMARY KEY,
                title VARCHAR NOT NULL,
                experiment_type VARCHAR NOT NULL,
                adapter VARCHAR NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                status VARCHAR NOT NULL DEFAULT 'draft',
                data_source VARCHAR NOT NULL DEFAULT 'synthetic',
                difficulty VARCHAR NOT NULL DEFAULT 'basic',
                estimated_minutes INTEGER NOT NULL DEFAULT 25,
                default_params_json TEXT NOT NULL DEFAULT '{}',
                linked_concept_ids_json TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_run (
                id VARCHAR NOT NULL PRIMARY KEY,
                template_id VARCHAR NOT NULL,
                student_id VARCHAR,
                course_id VARCHAR,
                chapter_id VARCHAR,
                activity_id VARCHAR,
                status VARCHAR NOT NULL DEFAULT 'pending',
                adapter VARCHAR NOT NULL,
                params_json TEXT NOT NULL DEFAULT '{}',
                summary_json TEXT NOT NULL DEFAULT '{}',
                error_message TEXT NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL,
                completed_at DATETIME,
                FOREIGN KEY(template_id) REFERENCES experiment_template (id)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_artifact (
                id VARCHAR NOT NULL PRIMARY KEY,
                run_id VARCHAR NOT NULL,
                artifact_type VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME NOT NULL,
                FOREIGN KEY(run_id) REFERENCES experiment_run (id)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_report (
                id VARCHAR NOT NULL PRIMARY KEY,
                run_id VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'draft',
                content_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(run_id) REFERENCES experiment_run (id)
            )
        """))
```

- [ ] **Step 5: Run the model test**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py::test_experiment_models_store_json_fields -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/tests/test_experiment_service.py
git commit -m "feat: add experiment domain models"
```

---

## Task 2: Experiment Adapter And Service

**Files:**
- Create: `backend/app/services/experiment_adapters.py`
- Create: `backend/app/services/experiment_service.py`
- Modify: `backend/app/tests/test_experiment_service.py`

- [ ] **Step 1: Add failing service tests**

Append to `backend/app/tests/test_experiment_service.py`:

```python
from app.models import ProgressEvent
from app.services.experiment_service import ExperimentService
from app.services.seed_data import seed_courses, seed_users


def test_experiment_service_seeds_templates(app):
    with app.app_context():
        templates = ExperimentService.ensure_default_templates()

    assert {template["id"] for template in templates} >= {"exp-eeg-replay"}
    eeg = next(template for template in templates if template["id"] == "exp-eeg-replay")
    assert eeg["adapter"] == "synthetic_eeg"
    assert eeg["data_source"] == "synthetic"


def test_experiment_service_runs_synthetic_eeg_and_records_progress(app):
    with app.app_context():
        seed_courses()
        seed_users()
        ExperimentService.ensure_default_templates()

        run = ExperimentService.create_and_execute_run(
            "exp-eeg-replay",
            {
                "student_id": "student-ada",
                "course_id": "ai-intro",
                "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
            },
        )

        stored_events = ProgressEvent.query.filter_by(event_type="ran_lab").all()

    assert run["status"] == "completed"
    assert run["summary"]["sample_count"] == 128
    assert run["summary"]["dominant_band"] in {"alpha", "beta"}
    assert run["artifacts"][0]["artifact_type"] == "signal_summary"
    assert run["report"]["status"] == "ready"
    assert "synthetic/sample" in run["report"]["content"]["limitations"]
    assert len(stored_events) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py -q
```

Expected: FAIL with missing `app.services.experiment_service`.

- [ ] **Step 3: Implement adapter contract and synthetic EEG adapter**

Create `backend/app/services/experiment_adapters.py`:

```python
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol


class ExperimentAdapter(Protocol):
    def validate_params(self, params: dict) -> dict:
        ...

    def run(self, params: dict) -> dict:
        ...

    def summarize_artifacts(self, result: dict) -> dict:
        ...


@dataclass
class SyntheticEegAdapter:
    """Deterministic EEG-like signal generator for hardware-free MVP runs."""

    def validate_params(self, params: dict) -> dict:
        duration_seconds = int(params.get("duration_seconds", 4))
        sample_rate = int(params.get("sample_rate", 128))
        channels = int(params.get("channels", 4))
        if duration_seconds < 1 or duration_seconds > 30:
            raise ValueError("duration_seconds must be between 1 and 30.")
        if sample_rate not in {64, 128, 256}:
            raise ValueError("sample_rate must be one of 64, 128, 256.")
        if channels < 1 or channels > 8:
            raise ValueError("channels must be between 1 and 8.")
        return {
            "duration_seconds": duration_seconds,
            "sample_rate": sample_rate,
            "channels": channels,
        }

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        sample_count = validated["duration_seconds"] * validated["sample_rate"]
        sample_rate = validated["sample_rate"]
        channels = validated["channels"]
        preview = []
        channel_power = []
        for channel_index in range(channels):
            alpha_amp = 12 - channel_index
            beta_amp = 4 + channel_index
            values = []
            for index in range(sample_count):
                t = index / sample_rate
                alpha = alpha_amp * math.sin(2 * math.pi * 10 * t)
                beta = beta_amp * math.sin(2 * math.pi * 20 * t)
                drift = 0.8 * math.sin(2 * math.pi * 1.5 * t)
                values.append(round(alpha + beta + drift, 4))
            preview.append(values[:96])
            channel_power.append({
                "channel": f"CH{channel_index + 1}",
                "alpha": round(alpha_amp * alpha_amp / 2, 3),
                "beta": round(beta_amp * beta_amp / 2, 3),
            })
        return {
            "params": validated,
            "sample_count": sample_count,
            "signal_preview": preview,
            "channel_power": channel_power,
        }

    def summarize_artifacts(self, result: dict) -> dict:
        alpha_total = sum(item["alpha"] for item in result["channel_power"])
        beta_total = sum(item["beta"] for item in result["channel_power"])
        dominant_band = "alpha" if alpha_total >= beta_total else "beta"
        return {
            "sample_count": result["sample_count"],
            "channels": len(result["channel_power"]),
            "dominant_band": dominant_band,
            "alpha_power": round(alpha_total, 3),
            "beta_power": round(beta_total, 3),
        }


ADAPTERS = {
    "synthetic_eeg": SyntheticEegAdapter(),
}


def get_adapter(adapter_name: str) -> ExperimentAdapter:
    adapter = ADAPTERS.get(adapter_name)
    if adapter is None:
        raise ValueError(f"unsupported experiment adapter: {adapter_name}")
    return adapter
```

- [ ] **Step 4: Implement experiment service**

Create `backend/app/services/experiment_service.py`:

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from app.db import db
from app.models import (
    Course,
    ExperimentArtifact,
    ExperimentReport,
    ExperimentRun,
    ExperimentTemplate,
    User,
)
from app.services.experiment_adapters import get_adapter
from app.services.progress_service import ProgressService


DEFAULT_TEMPLATES = [
    {
        "id": "exp-eeg-replay",
        "title": "EEG Replay Lab",
        "experiment_type": "eeg_replay",
        "adapter": "synthetic_eeg",
        "summary": "使用合成 EEG 信号观察 alpha/beta 频段、采样率和通道功率变化。",
        "status": "published",
        "data_source": "synthetic",
        "difficulty": "intermediate",
        "estimated_minutes": 30,
        "default_params": {"duration_seconds": 4, "sample_rate": 128, "channels": 4},
        "linked_concept_ids": ["concept-neural-networks"],
    },
    {
        "id": "exp-neuron-spike",
        "title": "Neuron Spike Lab",
        "experiment_type": "neuron_simulation",
        "adapter": "local_neuron_simulator",
        "summary": "调整刺激强度并观察神经元放电阈值。此实验将在下一阶段启用。",
        "status": "coming_soon",
        "data_source": "simulation",
        "difficulty": "basic",
        "estimated_minutes": 25,
        "default_params": {"stimulus_current": 8, "duration_ms": 120},
        "linked_concept_ids": ["concept-neural-networks"],
    },
]


def _json_loads(value, fallback):
    try:
        parsed = json.loads(value or "")
    except json.JSONDecodeError:
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def _now():
    return datetime.now(timezone.utc)


class ExperimentService:
    @staticmethod
    def ensure_default_templates() -> list[dict]:
        for spec in DEFAULT_TEMPLATES:
            existing = db.session.get(ExperimentTemplate, spec["id"])
            if existing:
                continue
            template = ExperimentTemplate(
                id=spec["id"],
                title=spec["title"],
                experiment_type=spec["experiment_type"],
                adapter=spec["adapter"],
                summary=spec["summary"],
                status=spec["status"],
                data_source=spec["data_source"],
                difficulty=spec["difficulty"],
                estimated_minutes=spec["estimated_minutes"],
                default_params_json=json.dumps(spec["default_params"], ensure_ascii=False),
                linked_concept_ids_json=json.dumps(spec["linked_concept_ids"], ensure_ascii=False),
            )
            db.session.add(template)
        db.session.commit()
        return [ExperimentService.serialize_template(item) for item in ExperimentTemplate.query.order_by(ExperimentTemplate.created_at.asc()).all()]

    @staticmethod
    def list_templates(status: str | None = None) -> list[dict]:
        ExperimentService.ensure_default_templates()
        query = ExperimentTemplate.query
        if status:
            query = query.filter_by(status=status)
        return [ExperimentService.serialize_template(item) for item in query.order_by(ExperimentTemplate.created_at.asc()).all()]

    @staticmethod
    def get_template(template_id: str) -> ExperimentTemplate | None:
        ExperimentService.ensure_default_templates()
        return db.session.get(ExperimentTemplate, template_id)

    @staticmethod
    def serialize_template(template: ExperimentTemplate) -> dict:
        return {
            "id": template.id,
            "title": template.title,
            "experiment_type": template.experiment_type,
            "adapter": template.adapter,
            "summary": template.summary,
            "status": template.status,
            "data_source": template.data_source,
            "difficulty": template.difficulty,
            "estimated_minutes": template.estimated_minutes,
            "default_params": _json_loads(template.default_params_json, {}),
            "linked_concept_ids": _json_loads(template.linked_concept_ids_json, []),
            "created_at": template.created_at.isoformat() if template.created_at else None,
        }

    @staticmethod
    def create_and_execute_run(template_id: str, payload: dict) -> dict:
        template = ExperimentService.get_template(template_id)
        if template is None:
            raise ValueError(f"experiment template not found: {template_id}")
        if template.status != "published":
            raise ValueError("experiment template is not runnable.")
        student_id = payload.get("student_id")
        course_id = payload.get("course_id")
        if student_id and db.session.get(User, student_id) is None:
            raise ValueError(f"student not found: {student_id}")
        if course_id and db.session.get(Course, course_id) is None:
            raise ValueError(f"course not found: {course_id}")
        params = payload.get("params") or {}
        if not isinstance(params, dict):
            raise ValueError("params must be an object.")
        adapter = get_adapter(template.adapter)
        result = adapter.run(params)
        summary = adapter.summarize_artifacts(result)
        run = ExperimentRun(
            id=f"run-{uuid4().hex}",
            template_id=template.id,
            student_id=student_id,
            course_id=course_id,
            chapter_id=payload.get("chapter_id"),
            activity_id=payload.get("activity_id"),
            status="completed",
            adapter=template.adapter,
            params_json=json.dumps(result["params"], ensure_ascii=False),
            summary_json=json.dumps(summary, ensure_ascii=False),
            completed_at=_now(),
        )
        db.session.add(run)
        db.session.flush()
        artifact = ExperimentArtifact(
            id=f"artifact-{uuid4().hex}",
            run_id=run.id,
            artifact_type="signal_summary",
            title="Synthetic EEG Signal Summary",
            data_json=json.dumps(result, ensure_ascii=False),
        )
        db.session.add(artifact)
        report = ExperimentReport(
            id=f"report-{uuid4().hex}",
            run_id=run.id,
            status="ready",
            content_json=json.dumps(ExperimentService._build_report_content(template, summary), ensure_ascii=False),
            updated_at=_now(),
        )
        db.session.add(report)
        if student_id:
            ProgressService.record(
                student_id=student_id,
                event_type="ran_lab",
                course_id=course_id,
                chapter_id=payload.get("chapter_id"),
                activity_id=payload.get("activity_id"),
                payload={"experiment_run_id": run.id, "template_id": template.id},
                commit=False,
            )
        db.session.commit()
        db.session.refresh(run)
        return ExperimentService.serialize_run(run)

    @staticmethod
    def get_run(run_id: str) -> ExperimentRun | None:
        return db.session.get(ExperimentRun, run_id)

    @staticmethod
    def serialize_run(run: ExperimentRun) -> dict:
        artifacts = [
            {
                "id": artifact.id,
                "run_id": artifact.run_id,
                "artifact_type": artifact.artifact_type,
                "title": artifact.title,
                "data": _json_loads(artifact.data_json, {}),
                "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
            }
            for artifact in run.artifacts
        ]
        report = run.reports[-1] if run.reports else None
        return {
            "id": run.id,
            "template_id": run.template_id,
            "student_id": run.student_id,
            "course_id": run.course_id,
            "status": run.status,
            "adapter": run.adapter,
            "params": _json_loads(run.params_json, {}),
            "summary": _json_loads(run.summary_json, {}),
            "error_message": run.error_message,
            "artifacts": artifacts,
            "report": ExperimentService.serialize_report(report) if report else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }

    @staticmethod
    def serialize_report(report: ExperimentReport) -> dict:
        return {
            "id": report.id,
            "run_id": report.run_id,
            "status": report.status,
            "content": _json_loads(report.content_json, {}),
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        }

    @staticmethod
    def _build_report_content(template: ExperimentTemplate, summary: dict) -> dict:
        dominant = summary.get("dominant_band", "unknown")
        return {
            "title": f"{template.title} 实验报告",
            "purpose": "观察合成 EEG 信号中的频段能量变化，并理解采样率、通道数量和频域特征的关系。",
            "observations": [
                f"本次运行生成 {summary.get('sample_count')} 个采样点。",
                f"主导频段为 {dominant}。",
                f"alpha 总功率为 {summary.get('alpha_power')}，beta 总功率为 {summary.get('beta_power')}。",
            ],
            "limitations": "本实验使用 synthetic/sample 数据，不代表真实人体脑电，也不能用于医疗判断。",
            "next_steps": "尝试改变采样率或通道数量，比较频段功率摘要是否稳定。",
        }
```

- [ ] **Step 5: Run service tests**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/experiment_adapters.py backend/app/services/experiment_service.py backend/app/tests/test_experiment_service.py
git commit -m "feat: add neurolab experiment service"
```

---

## Task 3: Experiment API

**Files:**
- Create: `backend/app/api/experiments.py`
- Modify: `backend/app/api/__init__.py`
- Test: `backend/app/tests/test_experiments_api.py`

- [ ] **Step 1: Write failing API tests**

Create `backend/app/tests/test_experiments_api.py`:

```python
from app.services.seed_data import seed_courses, seed_users


def test_list_experiments_returns_seeded_templates(client):
    res = client.get("/api/v1/experiments")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert {item["id"] for item in payload["data"]} >= {"exp-eeg-replay"}


def test_create_experiment_run_returns_completed_run(client, app):
    with app.app_context():
        seed_courses()
        seed_users()

    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "student_id": "student-ada",
        "course_id": "ai-intro",
        "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
    })
    payload = res.get_json()

    assert res.status_code == 201
    assert payload["success"] is True
    assert payload["data"]["status"] == "completed"
    assert payload["data"]["summary"]["sample_count"] == 128
    assert payload["data"]["artifacts"]
    assert payload["data"]["report"]["status"] == "ready"


def test_create_experiment_run_rejects_invalid_params(client):
    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "params": {"duration_seconds": 99, "sample_rate": 64, "channels": 2},
    })
    payload = res.get_json()

    assert res.status_code == 400
    assert payload["success"] is False
    assert "duration_seconds" in payload["error"]
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
uv run pytest backend/app/tests/test_experiments_api.py -q
```

Expected: FAIL with 404 routes.

- [ ] **Step 3: Implement experiment routes**

Create `backend/app/api/experiments.py`:

```python
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
```

- [ ] **Step 4: Register routes**

In `backend/app/api/__init__.py`, add this import near the other route modules:

```python
from . import experiments  # noqa: E402,F401
```

- [ ] **Step 5: Run backend experiment tests**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/__init__.py backend/app/api/experiments.py backend/app/tests/test_experiments_api.py
git commit -m "feat: expose neurolab experiment api"
```

---

## Task 4: Frontend API And Lab State Helpers

**Files:**
- Create: `frontend/src/api/experiments.js`
- Create: `frontend/src/api/experiments.test.js`
- Create: `frontend/src/views/labViewState.js`
- Create: `frontend/src/views/labViewState.test.js`

- [ ] **Step 1: Write failing frontend API tests**

Create `frontend/src/api/experiments.test.js`:

```javascript
import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({ url })),
    post: vi.fn((url, payload) => Promise.resolve({ url, payload }))
  }
}));

const apiClient = (await import('./client')).default;
const { getExperimentRun, listExperiments, runExperiment } = await import('./experiments');

describe('experiments api', () => {
  it('lists experiments', async () => {
    await listExperiments();

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiments', { params: {} });
  });

  it('runs an experiment', async () => {
    await runExperiment('exp-eeg-replay', { params: { sample_rate: 64 } });

    expect(apiClient.post).toHaveBeenCalledWith('/api/experiments/exp-eeg-replay/runs', {
      params: { sample_rate: 64 }
    });
  });

  it('gets a run', async () => {
    await getExperimentRun('run-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/experiment-runs/run-1');
  });
});
```

- [ ] **Step 2: Write failing state helper tests**

Create `frontend/src/views/labViewState.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { bandLabel, firstSignalPreview, templateStatusLabel, summarizeRun } from './labViewState';

describe('labViewState', () => {
  it('labels template status for students', () => {
    expect(templateStatusLabel('published')).toBe('可运行');
    expect(templateStatusLabel('coming_soon')).toBe('即将开放');
  });

  it('labels eeg bands', () => {
    expect(bandLabel('alpha')).toBe('Alpha / 放松节律');
    expect(bandLabel('gamma')).toBe('Gamma');
  });

  it('extracts first signal preview channel', () => {
    const run = {
      artifacts: [{ data: { signal_preview: [[0.1, 0.2], [0.3, 0.4]] } }]
    };

    expect(firstSignalPreview(run)).toEqual([0.1, 0.2]);
  });

  it('summarizes completed run', () => {
    expect(summarizeRun({ status: 'completed', summary: { sample_count: 128, dominant_band: 'alpha' } }))
      .toEqual('128 samples · Alpha / 放松节律');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/api/experiments.test.js src/views/labViewState.test.js
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement frontend API helper**

Create `frontend/src/api/experiments.js`:

```javascript
import apiClient from './client';

export function listExperiments(params = {}) {
  return apiClient.get('/api/experiments', { params });
}

export function getExperiment(experimentId) {
  return apiClient.get(`/api/experiments/${experimentId}`);
}

export function runExperiment(experimentId, payload) {
  return apiClient.post(`/api/experiments/${experimentId}/runs`, payload);
}

export function getExperimentRun(runId) {
  return apiClient.get(`/api/experiment-runs/${runId}`);
}
```

- [ ] **Step 5: Implement lab view state helpers**

Create `frontend/src/views/labViewState.js`:

```javascript
export function templateStatusLabel(status) {
  const labels = {
    published: '可运行',
    draft: '草稿',
    coming_soon: '即将开放',
    archived: '已归档'
  };
  return labels[status] || status || '未知';
}

export function bandLabel(band) {
  const labels = {
    alpha: 'Alpha / 放松节律',
    beta: 'Beta / 注意加工',
    theta: 'Theta / 记忆加工'
  };
  return labels[band] || (band ? `${band.charAt(0).toUpperCase()}${band.slice(1)}` : '未知频段');
}

export function firstSignalPreview(run) {
  const preview = run?.artifacts?.[0]?.data?.signal_preview;
  return Array.isArray(preview?.[0]) ? preview[0] : [];
}

export function summarizeRun(run) {
  if (!run) return '尚未运行';
  if (run.status !== 'completed') return run.status || '运行中';
  const sampleCount = run.summary?.sample_count || 0;
  return `${sampleCount} samples · ${bandLabel(run.summary?.dominant_band)}`;
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
npm test -- src/api/experiments.test.js src/views/labViewState.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/experiments.js frontend/src/api/experiments.test.js frontend/src/views/labViewState.js frontend/src/views/labViewState.test.js
git commit -m "feat: add neurolab frontend api state"
```

---

## Task 5: Register `/lab` Route And Navigation

**Files:**
- Modify: `frontend/src/router/index.js`
- Modify: `frontend/src/components/AppShell.vue`
- Test: `frontend/src/router/index.test.js`

- [ ] **Step 1: Add failing router test**

In `frontend/src/router/index.test.js`, add:

```javascript
it('registers the lab route as an authenticated student route', () => {
  const lab = routes.find((route) => route.path === '/lab');

  expect(lab).toBeTruthy();
  expect(lab.name).toBe('lab');
  expect(lab.meta).toEqual({ requiresAuth: true });
});
```

- [ ] **Step 2: Run router test to verify it fails**

Run:

```bash
npm test -- src/router/index.test.js
```

Expected: FAIL because `/lab` is not registered.

- [ ] **Step 3: Register the lab route**

In `frontend/src/router/index.js`, add the import:

```javascript
import LabView from '../views/LabView.vue';
```

Add this route after `/tutor`:

```javascript
  {
    path: '/lab',
    name: 'lab',
    component: LabView,
    meta: { requiresAuth: true }
  },
```

- [ ] **Step 4: Add navigation entry if missing**

In `frontend/src/components/AppShell.vue`, find the primary navigation array. Add this item only if no lab item already exists:

```javascript
{
  label: '实验平台',
  to: '/lab',
  roles: ['student', 'teacher', 'admin']
}
```

If `AppShell.vue` uses a different shape, preserve its current object keys and add the same route target `/lab` with label `实验平台`.

- [ ] **Step 5: Run router tests**

Run:

```bash
npm test -- src/router/index.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/router/index.js frontend/src/router/index.test.js frontend/src/components/AppShell.vue
git commit -m "feat: register neurolab route"
```

---

## Task 6: Build Lab Dashboard And Run Workspace

**Files:**
- Modify: `frontend/src/views/LabView.vue`
- Modify: `frontend/src/styles/app.css`
  - No planned edits. Leave unchanged unless `npm run build` exposes a missing shared class used by `LabView.vue`.
- Test: `frontend/src/views/labViewState.test.js`

- [ ] **Step 1: Add one more state test for report extraction**

Append to `frontend/src/views/labViewState.test.js`:

```javascript
import { reportSections } from './labViewState';

it('extracts report sections in display order', () => {
  const run = {
    report: {
      content: {
        purpose: 'Observe EEG bands.',
        observations: ['Alpha is dominant.'],
        limitations: 'Synthetic data only.',
        next_steps: 'Change sample rate.'
      }
    }
  };

  expect(reportSections(run)).toEqual([
    { title: '实验目的', body: 'Observe EEG bands.' },
    { title: '关键观察', body: 'Alpha is dominant.' },
    { title: '限制说明', body: 'Synthetic data only.' },
    { title: '下一步', body: 'Change sample rate.' }
  ]);
});
```

- [ ] **Step 2: Run the state test to verify it fails**

Run:

```bash
npm test -- src/views/labViewState.test.js
```

Expected: FAIL with missing `reportSections`.

- [ ] **Step 3: Implement report section helper**

In `frontend/src/views/labViewState.js`, append:

```javascript
export function reportSections(run) {
  const content = run?.report?.content || {};
  const observations = Array.isArray(content.observations) ? content.observations.join('\n') : '';
  return [
    { title: '实验目的', body: content.purpose || '' },
    { title: '关键观察', body: observations },
    { title: '限制说明', body: content.limitations || '' },
    { title: '下一步', body: content.next_steps || '' }
  ].filter((section) => section.body);
}
```

- [ ] **Step 4: Replace `LabView.vue` with dashboard/workspace UI**

In `frontend/src/views/LabView.vue`, keep Vue 3 `<script setup>` and replace static experiment card data with:

```javascript
import { computed, onMounted, ref } from 'vue';
import { listExperiments, runExperiment } from '../api/experiments';
import {
  firstSignalPreview,
  reportSections,
  summarizeRun,
  templateStatusLabel
} from './labViewState';

const templates = ref([]);
const selectedExperimentId = ref('exp-eeg-replay');
const selectedRun = ref(null);
const isLoading = ref(false);
const isRunning = ref(false);
const errorMessage = ref('');
const params = ref({
  duration_seconds: 4,
  sample_rate: 128,
  channels: 4
});

const selectedExperiment = computed(() => (
  templates.value.find((item) => item.id === selectedExperimentId.value) || templates.value[0] || null
));

const signalPreview = computed(() => firstSignalPreview(selectedRun.value));
const runSummary = computed(() => summarizeRun(selectedRun.value));
const sections = computed(() => reportSections(selectedRun.value));

async function loadExperiments() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    templates.value = await listExperiments();
    if (!selectedExperiment.value && templates.value.length > 0) {
      selectedExperimentId.value = templates.value[0].id;
    }
  } catch (error) {
    errorMessage.value = error?.message || '实验模板加载失败';
  } finally {
    isLoading.value = false;
  }
}

function selectExperiment(template) {
  selectedExperimentId.value = template.id;
  selectedRun.value = null;
  params.value = {
    duration_seconds: template.default_params?.duration_seconds || 4,
    sample_rate: template.default_params?.sample_rate || 128,
    channels: template.default_params?.channels || 4
  };
}

async function startRun() {
  if (!selectedExperiment.value || selectedExperiment.value.status !== 'published') return;
  isRunning.value = true;
  errorMessage.value = '';
  try {
    selectedRun.value = await runExperiment(selectedExperiment.value.id, { params: params.value });
  } catch (error) {
    errorMessage.value = error?.message || '实验运行失败';
  } finally {
    isRunning.value = false;
  }
}

onMounted(loadExperiments);
```

The template must include these visible regions:

```html
<section class="lab-view neurolab">
  <header class="lab-hero">
    <p class="eyebrow">EDUFISH NeuroLab</p>
    <h1>虚拟脑与脑机实验平台</h1>
    <p>运行合成 EEG 与神经科学实验，把参数、信号、观察和 AI 报告连接回课程知识图谱。</p>
  </header>

  <p v-if="errorMessage" class="lab-error">{{ errorMessage }}</p>

  <div class="lab-workspace">
    <aside class="lab-template-list">
      <button
        v-for="template in templates"
        :key="template.id"
        class="lab-template-button"
        :class="{ active: template.id === selectedExperimentId }"
        type="button"
        @click="selectExperiment(template)"
      >
        <span>{{ template.title }}</span>
        <small>{{ templateStatusLabel(template.status) }} · {{ template.data_source }}</small>
      </button>
    </aside>

    <main class="lab-run-panel" v-if="selectedExperiment">
      <div class="lab-run-header">
        <div>
          <p class="eyebrow">{{ selectedExperiment.experiment_type }}</p>
          <h2>{{ selectedExperiment.title }}</h2>
          <p>{{ selectedExperiment.summary }}</p>
        </div>
        <button class="btn btn-primary" type="button" :disabled="isRunning || selectedExperiment.status !== 'published'" @click="startRun">
          {{ isRunning ? '运行中...' : '运行实验' }}
        </button>
      </div>

      <div class="lab-controls">
        <label>
          时长
          <input v-model.number="params.duration_seconds" type="number" min="1" max="30">
        </label>
        <label>
          采样率
          <select v-model.number="params.sample_rate">
            <option :value="64">64 Hz</option>
            <option :value="128">128 Hz</option>
            <option :value="256">256 Hz</option>
          </select>
        </label>
        <label>
          通道
          <input v-model.number="params.channels" type="number" min="1" max="8">
        </label>
      </div>

      <section class="lab-signal">
        <div class="lab-signal-header">
          <h3>Signal Preview</h3>
          <span>{{ runSummary }}</span>
        </div>
        <div class="lab-sparkline" aria-label="Synthetic EEG signal preview">
          <i
            v-for="(point, index) in signalPreview"
            :key="index"
            :style="{ height: `${Math.max(6, Math.min(72, 36 + point * 1.6))}px` }"
          />
        </div>
      </section>

      <section class="lab-report" v-if="sections.length">
        <article v-for="section in sections" :key="section.title">
          <h3>{{ section.title }}</h3>
          <p>{{ section.body }}</p>
        </article>
      </section>
    </main>
  </div>
</section>
```

- [ ] **Step 5: Add focused styling**

Use scoped styles in `LabView.vue` first. Include these layout rules:

```css
.neurolab {
  min-height: 100vh;
  padding: calc(var(--nav-height) + 48px) clamp(20px, 4vw, 64px) 72px;
  background: var(--surface-0);
}

.lab-hero {
  max-width: 920px;
  margin-bottom: 32px;
}

.lab-hero h1 {
  margin: 0 0 14px;
  color: var(--text-1);
  font-size: clamp(2rem, 5vw, 4.5rem);
  letter-spacing: 0;
}

.lab-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 24px;
}

.lab-template-list,
.lab-run-panel {
  border: 1px solid var(--border-default);
  background: var(--surface-1);
}

.lab-template-button {
  width: 100%;
  min-height: 76px;
  padding: 16px;
  border: 0;
  border-bottom: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-2);
  text-align: left;
  cursor: pointer;
}

.lab-template-button.active {
  color: var(--text-1);
  background: var(--surface-2);
}

.lab-run-panel {
  padding: clamp(20px, 3vw, 32px);
}

.lab-run-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
}

.lab-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 24px 0;
}

.lab-controls label {
  display: grid;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
}

.lab-controls input,
.lab-controls select {
  min-height: 42px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  color: var(--text-1);
  padding: 0 12px;
}

.lab-sparkline {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 96px;
  padding: 12px;
  overflow: hidden;
  border: 1px solid var(--border-default);
}

.lab-sparkline i {
  display: block;
  width: 3px;
  background: var(--primary);
}

.lab-report {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.lab-report article {
  border: 1px solid var(--border-default);
  padding: 16px;
}

@media (max-width: 840px) {
  .lab-workspace,
  .lab-controls,
  .lab-report {
    grid-template-columns: 1fr;
  }

  .lab-run-header {
    flex-direction: column;
  }
}
```

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
npm test -- src/views/labViewState.test.js src/api/experiments.test.js src/router/index.test.js
npm run build
```

Expected: tests PASS and build PASS. Existing Vite chunk-size warnings are acceptable.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/LabView.vue frontend/src/views/labViewState.js frontend/src/views/labViewState.test.js
git commit -m "feat: build neurolab workspace ui"
```

---

## Task 7: End-To-End Verification

**Files:**
- No required source changes unless verification finds a concrete bug.

- [ ] **Step 1: Run backend experiment tests**

Run:

```bash
uv run pytest backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py -q
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
npm test -- src/api/experiments.test.js src/views/labViewState.test.js src/router/index.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full frontend build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Rollup PURE annotation and chunk-size warnings can remain.

- [ ] **Step 4: Start local services**

Run backend:

```bash
backend/.venv/bin/python backend/run.py
```

Run frontend in another shell:

```bash
npm run dev
```

Expected:

1. Backend listens on `http://127.0.0.1:5001`.
2. Frontend listens on `http://localhost:3025/` or the next available Vite port.

- [ ] **Step 5: Manual browser check**

Open `/lab` while authenticated. Verify:

1. The lab route loads instead of 404.
2. `EEG Replay Lab` appears and is marked `可运行`.
3. Clicking `运行实验` creates a completed run.
4. Signal bars appear in the preview region.
5. Report sections appear with `实验目的`, `关键观察`, `限制说明`, `下一步`.
6. The limitation text says the data is synthetic/sample and not real human EEG.

- [ ] **Step 6: Commit any verification fixes**

If verification required fixes in the planned NeuroLab files, commit only the changed files from this explicit set:

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/services/experiment_adapters.py backend/app/services/experiment_service.py backend/app/api/__init__.py backend/app/api/experiments.py backend/app/tests/test_experiment_service.py backend/app/tests/test_experiments_api.py frontend/src/api/experiments.js frontend/src/api/experiments.test.js frontend/src/views/labViewState.js frontend/src/views/labViewState.test.js frontend/src/router/index.js frontend/src/router/index.test.js frontend/src/components/AppShell.vue frontend/src/views/LabView.vue
git commit -m "fix: verify neurolab mvp flow"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

1. Lab Dashboard is covered by Tasks 5 and 6.
2. Experiment Workspace is covered by Task 6.
3. Backend template/run/artifact/report model is covered by Tasks 1 and 2.
4. Adapter contract and deterministic synthetic EEG adapter are covered by Task 2.
5. API lifecycle is covered by Task 3.
6. AI report panel is covered by Tasks 2 and 6.
7. `ran_lab` progress event is covered by Task 2.
8. Safety labeling is covered by Task 2 report content and Task 7 manual check.

Intentional deferrals:

1. BrainGenix-NES is not deployed in this MVP because the spec marks it as a future adapter after platform skeleton.
2. Timeflux streaming is not implemented because the MVP avoids live data streams.
3. Real hardware BrainFlow boards are not implemented because the MVP avoids live human hardware and device setup.
4. Teacher assignment authoring is deferred until the run/artifact/report lifecycle is stable.

Placeholder scan:

1. No unresolved marker text is present.
2. Each task has concrete files, test commands, implementation snippets, and expected results.

Type consistency:

1. Backend route names use `experiments` and `experiment-runs`.
2. Frontend API helper paths match the backend routes through the existing `/api` rewrite convention.
3. Run summaries use `sample_count`, `dominant_band`, `alpha_power`, and `beta_power` consistently.
