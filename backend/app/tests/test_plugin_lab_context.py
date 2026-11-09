"""Lab linkage is opt-in, durable and distinct from completion/mastery claims."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, event, inspect, select

from app import create_app
from app.db import db
from app.jwt_utils import create_access_token
from app.models import (
    Chapter,
    Concept,
    Course,
    ExperimentArtifact,
    ExperimentLearningContext,
    ExperimentReport,
    ExperimentRun,
    ExperimentTemplate,
    LearningActivity,
    ProgressEvent,
    User,
)
from app.plugin import operations_lab
from app.plugin.idempotency import request_hash
from app.plugin.models import PluginIdempotencyRecord
from app.plugin.validation import (
    validate_lab_start,
    validate_lab_status,
    validate_progress_read,
)
from app.services.experiment_service import ExperimentService
from app.services.progress_service import ProgressService

_COURSE = "context-course"
_TEMPLATE = "context-template"
_USER = "context-ada"
_SNAPSHOT = "a1" * 32
_RUN_KEYS = {
    "id", "template_id", "student_id", "course_id", "status", "adapter",
    "params", "summary", "error_message", "job_id", "progress",
    "progress_message", "pipeline_nodes", "artifacts", "report",
    "created_at", "completed_at",
}


def _seed_context_data():
    db.session.add_all([
        User(id=_USER, name="Ada", role="student"),
        User(id="context-bob", name="Bob", role="student"),
        User(id="context-staff", name="Staff", role="teacher"),
        Course(id=_COURSE, title="Neurons", status="published"),
        Course(id="context-other-course", title="Other", status="published"),
        Course(id="context-draft-course", title="Draft", status="draft"),
    ])
    db.session.flush()
    db.session.add_all([
        Chapter(id="context-chapter", course_id=_COURSE, title="Spikes"),
        Chapter(id="context-second-chapter", course_id=_COURSE, title="Networks"),
        Chapter(id="context-other-chapter", course_id="context-other-course", title="Other"),
        Chapter(id="context-hidden-chapter", course_id="context-draft-course", title="Hidden"),
    ])
    for concept_id, overrides in [
        ("context-visible", {}),
        ("context-personal", {"scope_type": "student_personal", "owner_id": _USER}),
        ("context-foreign-personal", {"scope_type": "student_personal", "owner_id": "context-bob"}),
        ("context-private", {"scope_type": "teacher_private", "owner_id": "context-staff"}),
        ("context-draft", {"status": "draft"}),
        ("context-foreign", {"course_id": "context-other-course"}),
        ("context-unlinked", {}),
    ]:
        db.session.add(Concept(**{
            "id": concept_id, "course_id": _COURSE, "label": "HIDDEN-CONCEPT-LABEL",
            "definition": "HIDDEN-CONCEPT-DEFINITION", **overrides,
        }))
    db.session.add(ExperimentTemplate(
        id=_TEMPLATE, title="Neuron", experiment_type="neuron_simulation",
        adapter="neuron_simulator", status="published",
        linked_concept_ids_json=json.dumps([
            "context-visible", "context-personal", "context-foreign-personal",
            "context-private", "context-draft", "context-foreign",
        ]),
    ))
    db.session.add(ExperimentTemplate(
        id="context-draft-template", title="Draft", experiment_type="neuron_simulation",
        adapter="neuron_simulator", status="draft", linked_concept_ids_json='["context-visible"]',
    ))
    db.session.flush()
    base = {
        "course_id": _COURSE, "chapter_id": "context-chapter", "status": "published",
        "activity_type": "cognitive_experiment",
        "config_json": json.dumps({"template_id": _TEMPLATE}),
        "linked_concept_ids_json": '["context-visible", "context-personal"]',
    }
    for activity_id, overrides in [
        ("context-activity", {}),
        ("context-activity-draft", {"status": "draft"}),
        ("context-activity-scheduled", {"status": "scheduled"}),
        ("context-activity-archived", {"status": "archived"}),
        ("context-activity-future", {"release_at": datetime.now(timezone.utc) + timedelta(days=1)}),
        ("context-activity-cross", {"course_id": "context-other-course", "chapter_id": "context-other-chapter"}),
        ("context-activity-bad-chapter", {"chapter_id": "context-other-chapter"}),
        ("context-activity-unchaptered", {"chapter_id": None}),
        ("context-activity-reading", {"activity_type": "reading"}),
        ("context-activity-template", {"config_json": '{"template_id":"another-template"}'}),
        ("context-activity-experiment-template", {"config_json": '{"experiment_template_id":"another-template"}'}),
        ("context-activity-two-bindings", {"config_json": json.dumps({"template_id": _TEMPLATE, "experiment_template_id": "another-template"})}),
        ("context-activity-unlinked", {"linked_concept_ids_json": '[]'}),
        ("context-activity-malformed-links", {"linked_concept_ids_json": '{"context-visible":true}'}),
        ("context-activity-malformed-config", {"config_json": '[]'}),
    ]:
        db.session.add(LearningActivity(id=activity_id, title=activity_id, **{**base, **overrides}))
    db.session.commit()


@pytest.fixture()
def lab_seed(app):
    app.config.update(PLUGIN_ALLOWED_COURSE_IDS="", MULTI_TENANT_ENABLED=False)
    with app.app_context():
        _seed_context_data()


@pytest.fixture()
def pending_queue(monkeypatch):
    calls = []

    def enqueue(app, run_id):
        calls.append(run_id)
        return "job-context-test"

    monkeypatch.setattr(ExperimentService, "enqueue_run_job", enqueue)
    return calls


def _invoke(client, app, operation, arguments, *, request_id=None, user_id=_USER, role="student"):
    with app.app_context():
        token = create_access_token(user_id, role)
    payload = {"operation": operation, "arguments": arguments}
    if request_id is not None:
        payload["request_id"] = request_id
    return client.post(
        "/api/v1/plugin/invoke", json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )


def _start(client, app, *, context=None, request_id="context-start", **arguments):
    args = {"course_id": _COURSE, "template_id": _TEMPLATE, **arguments}
    if context is not None:
        args["learning_context"] = context
    return _invoke(client, app, "edufish.lab.start", args, request_id=request_id)


def _status(client, app, run_id, **arguments):
    return _invoke(client, app, "edufish.lab.status", {
        "course_id": _COURSE, "run_id": run_id, **arguments,
    })


def _progress(client, app, **arguments):
    return _invoke(client, app, "edufish.progress.read", {"course_id": _COURSE, **arguments})


def _data(response):
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def _error(response, status, code):
    assert response.status_code == status, response.get_json()
    assert response.get_json()["error"]["code"] == code


def _expected_context(*, chapter_id=None, activity_id=None, concept_id=None, graph_snapshot_id=None):
    return {
        "version": 1, "course_id": _COURSE, "chapter_id": chapter_id,
        "activity_id": activity_id, "concept_id": concept_id,
        "graph_snapshot_id": graph_snapshot_id,
    }


def _domain_counts():
    return tuple(model.query.count() for model in (
        ExperimentRun, ExperimentLearningContext, ProgressEvent,
    ))


def test_legacy_shapes_and_normalized_arguments_are_unchanged(client, app, lab_seed, pending_queue):
    arguments = {"course_id": _COURSE, "template_id": _TEMPLATE}
    normalized = validate_lab_start(arguments)
    assert normalized == {**arguments, "params": {}}
    canonical = '{"course_id":"context-course","params":{},"template_id":"context-template"}'
    assert request_hash(normalized) == hashlib.sha256(canonical.encode()).hexdigest()
    assert validate_lab_status({"course_id": _COURSE, "run_id": "run-old"}) == {
        "course_id": _COURSE, "run_id": "run-old",
    }
    assert validate_progress_read({"course_id": _COURSE}) == {"course_id": _COURSE}

    started = _data(_start(client, app))
    assert set(started) == {"run"}
    assert set(started["run"]) == _RUN_KEYS
    for args in ({}, {"include_context": False}):
        assert _data(_status(client, app, started["run"]["id"], **args)) == started
    legacy_progress = _data(_progress(client, app))
    assert set(legacy_progress) == {"course_id", "student_id", "event_counts", "quiz_submissions"}
    assert _data(_progress(client, app, include_lab_evidence=False)) == legacy_progress
    with app.app_context():
        assert ExperimentLearningContext.query.count() == 0
        assert PluginIdempotencyRecord.query.one().request_hash == request_hash(normalized)


def test_start_status_and_completed_evidence_round_trip(client, app, lab_seed):
    context = {
        "chapter_id": "context-chapter", "activity_id": "context-activity",
        "concept_id": "context-visible", "graph_snapshot_id": _SNAPSHOT,
    }
    data = _data(_start(client, app, context=context))
    expected = _expected_context(**context)
    assert data["run"]["status"] == "completed"
    assert data["learning_context"] == expected
    assert set(data["run"]) == _RUN_KEYS
    assert set(_data(_status(client, app, data["run"]["id"]))) == {"run"}
    assert _data(_status(client, app, data["run"]["id"], include_context=True)) == data
    evidence = _data(_progress(client, app, include_lab_evidence=True))["lab_evidence"]
    assert evidence == {"version": 1, "runs": [{
        "run_id": data["run"]["id"], "template_id": _TEMPLATE,
        "adapter": "neuron_simulator", "status": "completed",
        "completed_at": data["run"]["completed_at"], "learning_context": expected,
        "artifact_count": len(data["run"]["artifacts"]),
        "artifact_ids": sorted(item["id"] for item in data["run"]["artifacts"]),
        "report_id": data["run"]["report"]["id"],
    }]}
    with app.app_context():
        run = db.session.get(ExperimentRun, data["run"]["id"])
        assert (run.course_id, run.chapter_id, run.activity_id) == (_COURSE, "context-chapter", "context-activity")
        stored = db.session.get(ExperimentLearningContext, run.id)
        assert (stored.concept_id, stored.graph_snapshot_id) == ("context-visible", _SNAPSHOT)
        attempt = ProgressEvent.query.one()
        assert attempt.event_type == "ran_lab"
        assert (attempt.chapter_id, attempt.activity_id) == (run.chapter_id, run.activity_id)


@pytest.mark.parametrize("context,expected", [
    ({"activity_id": "context-activity"}, _expected_context(chapter_id="context-chapter", activity_id="context-activity")),
    ({"chapter_id": "context-chapter"}, _expected_context(chapter_id="context-chapter")),
    ({"concept_id": "context-personal"}, _expected_context(concept_id="context-personal")),
    ({"activity_id": "context-activity-unchaptered"}, _expected_context(activity_id="context-activity-unchaptered")),
])
def test_sparse_context_is_persisted_and_activity_infers_chapter(client, app, lab_seed, pending_queue, context, expected):
    args = {"course_id": _COURSE, "template_id": _TEMPLATE, "learning_context": context}
    assert validate_lab_start(args)["learning_context"] == context
    data = _data(_start(client, app, context=context))
    assert data["learning_context"] == expected
    assert data["run"]["status"] == "pending"
    assert _data(_status(client, app, data["run"]["id"], include_context=True))["learning_context"] == expected
    assert _data(_progress(client, app, include_lab_evidence=True))["lab_evidence"]["runs"] == []
    with app.app_context():
        assert ExperimentLearningContext.query.count() == 1


@pytest.mark.parametrize("context", [
    None, {}, [], "context", {"chapter_id": None}, {"activity_id": None}, {"concept_id": None},
    {"chapter_id": ""}, {"concept_id": "x" * 201}, {"concept_id": "bad\ncontrol"},
    {"user_id": _USER}, {"chapter_id": "context-chapter", "student_id": "context-bob"},
    {"concept_id": "context-visible", "session_id": "session"},
    {"concept_id": "context-visible", "message_id": "message"},
    {"concept_id": {"user_id": "context-bob"}},
    {"chapter_id": {"nested": {"session_id": "session"}}},
    {"graph_snapshot_id": _SNAPSHOT},
    {"chapter_id": "context-chapter", "graph_snapshot_id": _SNAPSHOT},
    *({"concept_id": "context-visible", "graph_snapshot_id": value} for value in (
        None, 64, {}, "a" * 63, "a" * 65, "A" * 64, "g" * 64, "a" * 64 + "\n",
    )),
])
def test_context_rejects_null_unknown_identity_and_invalid_hash(client, app, lab_seed, context):
    response = _invoke(client, app, "edufish.lab.start", {
        "course_id": _COURSE, "template_id": _TEMPLATE, "learning_context": context,
    }, request_id="invalid-context")
    _error(response, 400, "INVALID_ARGUMENT")
    with app.app_context():
        assert _domain_counts() == (0, 0, 0)
        assert PluginIdempotencyRecord.query.count() == 0


@pytest.mark.parametrize("operation,field,base", [
    ("edufish.lab.status", "include_context", {"run_id": "run-missing"}),
    ("edufish.progress.read", "include_lab_evidence", {}),
])
@pytest.mark.parametrize("value", [None, 0, 1, "true", [], {}])
def test_read_flags_reject_coercion(client, app, lab_seed, operation, field, base, value):
    response = _invoke(client, app, operation, {"course_id": _COURSE, **base, field: value})
    _error(response, 400, "INVALID_ARGUMENT")


@pytest.mark.parametrize("field,value", [
    ("chapter_id", "missing-chapter"), ("chapter_id", "context-other-chapter"),
    ("chapter_id", "context-hidden-chapter"),
    ("activity_id", "missing-activity"), ("activity_id", "context-activity-cross"),
    ("activity_id", "context-activity-draft"), ("activity_id", "context-activity-scheduled"),
    ("activity_id", "context-activity-archived"), ("activity_id", "context-activity-future"),
    ("activity_id", "context-activity-bad-chapter"),
    ("concept_id", "missing-concept"), ("concept_id", "context-foreign"),
    ("concept_id", "context-foreign-personal"), ("concept_id", "context-private"),
    ("concept_id", "context-draft"),
])
def test_hidden_or_cross_course_context_is_non_leaking_not_found(client, app, lab_seed, field, value):
    response = _start(client, app, context={field: value})
    _error(response, 404, "NOT_FOUND")
    assert value not in response.get_json()["error"]["message"]
    with app.app_context():
        assert _domain_counts() == (0, 0, 0)
        assert PluginIdempotencyRecord.query.count() == 0


@pytest.mark.parametrize("context", [
    {"chapter_id": "context-second-chapter", "activity_id": "context-activity"},
    {"chapter_id": "context-chapter", "activity_id": "context-activity-unchaptered"},
    {"concept_id": "context-unlinked"},
    {"activity_id": "context-activity-reading"},
    {"activity_id": "context-activity-template"},
    {"activity_id": "context-activity-experiment-template"},
    {"activity_id": "context-activity-two-bindings"},
    {"activity_id": "context-activity-malformed-config"},
    {"activity_id": "context-activity-unlinked", "concept_id": "context-visible"},
    {"activity_id": "context-activity-malformed-links", "concept_id": "context-visible"},
])
def test_inconsistent_visible_relationships_are_invalid(client, app, lab_seed, context):
    _error(_start(client, app, context=context), 400, "INVALID_ARGUMENT")
    with app.app_context():
        assert _domain_counts() == (0, 0, 0)
        assert PluginIdempotencyRecord.query.count() == 0


@pytest.mark.parametrize("links", ['[]', '{}', 'null', 'bad-json', '["context-visible", 1]'])
def test_concept_requires_valid_explicit_template_links(client, app, lab_seed, links):
    with app.app_context():
        db.session.get(ExperimentTemplate, _TEMPLATE).linked_concept_ids_json = links
        db.session.commit()
    _error(_start(client, app, context={"concept_id": "context-visible"}), 400, "INVALID_ARGUMENT")


@pytest.mark.parametrize("template_id", ["context-draft-template", "missing-template"])
def test_context_does_not_make_unpublished_or_missing_template_runnable(client, app, lab_seed, template_id):
    _error(_start(client, app, context={"concept_id": "context-visible"}, template_id=template_id), 404, "NOT_FOUND")


def test_context_replays_unchanged_and_changed_context_conflicts(client, app, lab_seed, pending_queue):
    context = {"activity_id": "context-activity", "concept_id": "context-visible", "graph_snapshot_id": _SNAPSHOT}
    first = _data(_start(client, app, context=context))
    with app.app_context():
        record = PluginIdempotencyRecord.query.one()
        stored_bytes = record.response_json
        # Visibility is checked when a new run starts. Replay returns its saved
        # response even after the linked content changes or disappears.
        db.session.get(LearningActivity, "context-activity").status = "archived"
        db.session.get(ExperimentTemplate, _TEMPLATE).status = "draft"
        db.session.delete(db.session.get(Concept, "context-visible"))
        db.session.commit()
    assert _data(_start(client, app, context=context)) == first
    assert _data(_status(client, app, first["run"]["id"], include_context=True))["learning_context"] == first["learning_context"]
    for changed in ({**context, "graph_snapshot_id": "b2" * 32}, {"chapter_id": "context-chapter"}):
        _error(_start(client, app, context=changed), 409, "IDEMPOTENCY_CONFLICT")
    _error(_start(client, app, context=context, request_id="new-context-start"), 404, "NOT_FOUND")
    with app.app_context():
        assert _domain_counts() == (1, 1, 1)
        assert PluginIdempotencyRecord.query.one().response_json == stored_bytes
    assert pending_queue == [first["run"]["id"]]


@pytest.mark.parametrize("with_context", [False, True])
def test_lab_replay_survives_restart_without_changing_saved_response(tmp_path, pending_queue, with_context):
    config = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'lab-restart.sqlite').as_posix()}",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "RUNTIME_CONFIG_PATH": str(tmp_path / "runtime.json"),
        "PLUGIN_ALLOWED_COURSE_IDS": "", "MULTI_TENANT_ENABLED": False,
    }
    context = {"activity_id": "context-activity", "concept_id": "context-visible", "graph_snapshot_id": _SNAPSHOT} if with_context else None
    first_app = create_app(config)
    with first_app.app_context():
        _seed_context_data()
    first = _data(_start(first_app.test_client(), first_app, context=context))
    with first_app.app_context():
        stored_bytes = PluginIdempotencyRecord.query.one().response_json
        db.session.remove()
        db.engine.dispose()
    second_app = create_app(config)
    second = _data(_start(second_app.test_client(), second_app, context=context))
    assert second == first
    with second_app.app_context():
        assert PluginIdempotencyRecord.query.one().response_json == stored_bytes
        assert _domain_counts() == (1, int(with_context), 1)
        db.session.remove()
        db.engine.dispose()
    assert pending_queue == [first["run"]["id"]]


def test_preexisting_legacy_digest_and_response_bytes_replay(client, app, lab_seed, pending_queue):
    canonical = '{"course_id":"context-course","params":{},"template_id":"context-template"}'
    stored_bytes = '{ "run": { "status": "pending", "id": "historical-run" } }'
    with app.app_context():
        db.session.add(PluginIdempotencyRecord(
            id="legacy-record", user_id=_USER, operation="edufish.lab.start",
            request_id="context-start", request_hash=hashlib.sha256(canonical.encode()).hexdigest(),
            state="completed", response_json=stored_bytes,
        ))
        db.session.commit()
    assert _data(_start(client, app)) == json.loads(stored_bytes)
    assert _data(_start(client, app, params={})) == json.loads(stored_bytes)
    with app.app_context():
        assert PluginIdempotencyRecord.query.one().response_json == stored_bytes
        assert _domain_counts() == (0, 0, 0)
    assert pending_queue == []


@pytest.mark.parametrize("failure_at", ["response", "commit"])
def test_run_context_attempt_and_response_roll_back_together(client, app, lab_seed, pending_queue, monkeypatch, failure_at):
    original_mark_completed = operations_lab.mark_completed
    injected = []

    def fail_response(record, response):
        original_mark_completed(record, response)
        assert _domain_counts() == (1, 1, 1)
        injected.append(True)
        raise RuntimeError("injected response persistence failure")

    session = db.session()

    def fail_commit(session):
        record = PluginIdempotencyRecord.query.first()
        if record is not None and record.state == "completed":
            assert _domain_counts() == (1, 1, 1)
            assert "learning_context" in json.loads(record.response_json)
            injected.append(True)
            raise RuntimeError("injected transaction commit failure")

    if failure_at == "response":
        monkeypatch.setattr(operations_lab, "mark_completed", fail_response)
    else:
        event.listen(session, "before_commit", fail_commit)
    try:
        response = _start(client, app, context={"concept_id": "context-visible"})
    finally:
        if failure_at == "commit":
            event.remove(session, "before_commit", fail_commit)
    _error(response, 503, "UNAVAILABLE")
    assert injected == [True]
    with app.app_context():
        assert _domain_counts() == (0, 0, 0)
        reservation = PluginIdempotencyRecord.query.one()
        assert (reservation.state, reservation.response_json) == ("reserved", "{}")
    assert pending_queue == []
    _error(_start(client, app, context={"concept_id": "context-visible"}), 503, "UNAVAILABLE")


def test_queue_failure_preserves_context_for_response_status_and_replay(client, app, lab_seed, monkeypatch):
    calls = []

    def fail_queue(app, run_id):
        calls.append(run_id)
        raise RuntimeError("queue down")

    monkeypatch.setattr(ExperimentService, "enqueue_run_job", fail_queue)
    context = {"activity_id": "context-activity", "concept_id": "context-visible"}
    first = _data(_start(client, app, context=context))
    assert first["run"]["status"] == "failed"
    assert first["learning_context"] == _expected_context(
        chapter_id="context-chapter", activity_id="context-activity", concept_id="context-visible",
    )
    assert _data(_start(client, app, context=context)) == first
    assert _data(_status(client, app, first["run"]["id"], include_context=True)) == first
    assert _data(_progress(client, app, include_lab_evidence=True))["lab_evidence"]["runs"] == []
    with app.app_context():
        assert _domain_counts() == (1, 1, 1)
    assert calls == [first["run"]["id"]]


def _add_run(run_id, *, completed_at, **overrides):
    run = ExperimentRun(**{
        "id": run_id, "template_id": _TEMPLATE, "student_id": _USER,
        "course_id": _COURSE, "chapter_id": "context-chapter",
        "activity_id": "context-activity", "status": "completed",
        "adapter": "neuron_simulator", "completed_at": completed_at,
        "params_json": '{"secret":"HIDDEN-RUN-PARAMS"}',
        "summary_json": '{"secret":"HIDDEN-RUN-METRICS"}', **overrides,
    })
    db.session.add(run)
    return run


def test_legacy_run_context_derives_existing_fields_and_keeps_ownership_checks(client, app, lab_seed):
    with app.app_context():
        _add_run("legacy-domain-run", completed_at=datetime(2026, 11, 1))
        db.session.commit()
    data = _data(_status(client, app, "legacy-domain-run", include_context=True))
    assert data["learning_context"] == _expected_context(chapter_id="context-chapter", activity_id="context-activity")
    assert set(data["run"]) == _RUN_KEYS
    for user_id, role in (("context-bob", "student"), ("context-staff", "teacher")):
        response = _invoke(client, app, "edufish.lab.status", {
            "course_id": _COURSE, "run_id": "legacy-domain-run", "include_context": True,
        }, user_id=user_id, role=role)
        _error(response, 404, "NOT_FOUND")
    _error(_status(client, app, "legacy-domain-run", include_context=True, course_id="context-other-course"), 404, "NOT_FOUND")
    with app.app_context():
        assert ExperimentLearningContext.query.count() == 0


def test_evidence_filters_real_completed_runs_and_returns_deterministic_references(client, app, lab_seed):
    completed = datetime(2026, 11, 8, 12, 0)
    with app.app_context():
        for run_id, overrides in [
            ("run-evidence-a", {}), ("run-evidence-z", {}),
            ("run-evidence-older", {"completed_at": completed - timedelta(days=1)}),
            ("run-excluded-bob", {"student_id": "context-bob"}),
            ("run-excluded-course", {"course_id": "context-other-course"}),
            ("run-excluded-unbound", {"course_id": None}),
            ("run-excluded-pending", {"status": "pending"}),
            ("run-excluded-running", {"status": "running"}),
            ("run-excluded-failed", {"status": "failed"}),
            ("run-excluded-undated", {"completed_at": None}),
        ]:
            _add_run(run_id, **{"completed_at": completed, **overrides})
        db.session.flush()
        db.session.add(ExperimentLearningContext(
            run_id="run-evidence-z", concept_id="historical-deleted-concept", graph_snapshot_id=_SNAPSHOT,
        ))
        for index in reversed(range(25)):
            db.session.add(ExperimentArtifact(
                id=f"artifact-evidence-{index:02}", run_id="run-evidence-z",
                artifact_type="signal_summary", title="HIDDEN-ARTIFACT-TITLE",
                data_json='{"secret":"HIDDEN-ARTIFACT-DATA"}',
            ))
        for report_id, created_at in [
            ("report-evidence-a", completed), ("report-evidence-z", completed),
            ("report-evidence-new-id-old-date", completed - timedelta(days=1)),
        ]:
            db.session.add(ExperimentReport(
                id=report_id, run_id="run-evidence-z", created_at=created_at,
                content_json='{"secret":"HIDDEN-REPORT-CONTENT"}',
            ))
        db.session.add(ExperimentArtifact(
            id="artifact-foreign-run", run_id="run-excluded-bob",
            artifact_type="private", title="Private", data_json='{}',
        ))
        db.session.commit()
        ProgressService.record(
            _USER, "completed", course_id=_COURSE, activity_id="context-activity",
            payload={"experiment_run_id": "forged-completed-run", "status": "completed"},
        )
        counts_before = [model.query.count() for model in (
            ExperimentRun, ExperimentLearningContext, ProgressEvent, ExperimentTemplate,
            ExperimentArtifact, ExperimentReport, PluginIdempotencyRecord,
        )]
        engine = db.engine

    statements = []

    def read_only(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)
        assert statement.lstrip().upper().startswith(("SELECT", "PRAGMA")), statement
        for column in ("experiment_artifact.data_json", "experiment_report.content_json", "experiment_run.params_json", "experiment_run.summary_json"):
            assert column not in statement

    event.listen(engine, "before_cursor_execute", read_only)
    try:
        data = _data(_progress(client, app, include_lab_evidence=True))
        again = _data(_progress(client, app, include_lab_evidence=True))
    finally:
        event.remove(engine, "before_cursor_execute", read_only)
    assert data == again
    assert statements
    evidence = data["lab_evidence"]
    assert evidence["version"] == 1
    runs = evidence["runs"]
    assert [row["run_id"] for row in runs] == ["run-evidence-z", "run-evidence-a", "run-evidence-older"]
    assert runs[0] == {
        "run_id": "run-evidence-z", "template_id": _TEMPLATE, "adapter": "neuron_simulator",
        "status": "completed", "completed_at": completed.isoformat(),
        "learning_context": _expected_context(
            chapter_id="context-chapter", activity_id="context-activity",
            concept_id="historical-deleted-concept", graph_snapshot_id=_SNAPSHOT,
        ),
        "artifact_count": 25, "artifact_ids": [f"artifact-evidence-{index:02}" for index in range(20)],
        "report_id": "report-evidence-z",
    }
    assert runs[1]["artifact_count"] == 0
    assert runs[1]["artifact_ids"] == []
    assert runs[1]["report_id"] is None
    assert runs[1]["learning_context"] == _expected_context(chapter_id="context-chapter", activity_id="context-activity")
    assert data["event_counts"] == {"completed": 1}
    serialized = json.dumps(evidence)
    for hidden in ("HIDDEN-", "forged-completed-run", "artifact-foreign-run", "params", "metrics", "mastery"):
        assert hidden not in serialized
    with app.app_context():
        assert [model.query.count() for model in (
            ExperimentRun, ExperimentLearningContext, ProgressEvent, ExperimentTemplate,
            ExperimentArtifact, ExperimentReport, PluginIdempotencyRecord,
        )] == counts_before


def test_generic_completed_events_never_create_lab_evidence(client, app, lab_seed):
    with app.app_context():
        ProgressService.record(_USER, "completed", course_id=_COURSE, payload={
            "run_id": "forged-run", "template_id": _TEMPLATE, "status": "completed",
            "completed_at": "2026-11-08T12:00:00",
        })
    data = _data(_progress(client, app, include_lab_evidence=True))
    assert data["event_counts"] == {"completed": 1}
    assert data["lab_evidence"] == {"version": 1, "runs": []}


def test_evidence_is_bounded_to_newest_fifty_runs_and_current_course_access(client, app, lab_seed):
    with app.app_context():
        for index in range(55):
            _add_run(f"run-bounded-{index:02}", completed_at=datetime(2026, 11, 8, 12, 0))
        db.session.commit()
    evidence = _data(_progress(client, app, include_lab_evidence=True))["lab_evidence"]
    assert [row["run_id"] for row in evidence["runs"]] == [f"run-bounded-{index:02}" for index in reversed(range(5, 55))]
    app.config["PLUGIN_ALLOWED_COURSE_IDS"] = {_USER: ["context-other-course"]}
    _error(_progress(client, app, include_lab_evidence=True), 404, "NOT_FOUND")
    app.config["PLUGIN_ALLOWED_COURSE_IDS"] = ""
    _error(_progress(client, app, include_lab_evidence=True, course_id="context-draft-course"), 404, "NOT_FOUND")


def test_context_options_are_advertised_in_strict_manifest(client, app, lab_seed):
    with app.app_context():
        token = create_access_token(_USER, "student")
    manifest = _data(client.get("/api/v1/plugin/manifest", headers={"Authorization": f"Bearer {token}"}))
    schemas = {op["name"]: op["input_schema"] for op in manifest["operations"]}
    context = schemas["edufish.lab.start"]["properties"]["learning_context"]
    assert context["additionalProperties"] is False
    assert set(context["properties"]) == {"chapter_id", "activity_id", "concept_id", "graph_snapshot_id"}
    assert context["dependencies"] == {"graph_snapshot_id": ["concept_id"]}
    assert context["properties"]["graph_snapshot_id"]["pattern"] == "^[0-9a-f]{64}$"
    assert schemas["edufish.lab.status"]["properties"]["include_context"]["type"] == "boolean"
    assert schemas["edufish.progress.read"]["properties"]["include_lab_evidence"]["type"] == "boolean"


def test_adjunct_keeps_deleted_concept_history_and_cascades_with_run(app, lab_seed):
    with app.app_context():
        run = ExperimentService.create_pending_run(_TEMPLATE, {
            "student_id": _USER, "course_id": _COURSE,
        }, learning_context={"concept_id": "context-visible", "graph_snapshot_id": _SNAPSHOT})
        run_id = run["id"]
        db.session.remove()
        with db.engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys = ON")
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            connection.execute(delete(Concept).where(Concept.id == "context-visible"))
            stored = connection.execute(select(ExperimentLearningContext).where(
                ExperimentLearningContext.run_id == run_id,
            )).mappings().one()
            assert stored["concept_id"] == "context-visible"
            assert stored["graph_snapshot_id"] == _SNAPSHOT
            connection.execute(delete(ExperimentRun).where(ExperimentRun.id == run_id))
            assert connection.execute(select(ExperimentLearningContext.run_id)).first() is None


def test_startup_adds_adjunct_to_existing_database_without_changing_run_columns(tmp_path):
    config = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'existing-lab.sqlite').as_posix()}",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "RUNTIME_CONFIG_PATH": str(tmp_path / "runtime.json"),
        "PLUGIN_ALLOWED_COURSE_IDS": "", "MULTI_TENANT_ENABLED": False,
    }
    first_app = create_app(config)
    with first_app.app_context():
        _seed_context_data()
        _add_run("run-before-adjunct", completed_at=datetime(2026, 11, 8))
        db.session.commit()
        original_columns = {
            column["name"]: (str(column["type"]), column["nullable"], column["default"], column["primary_key"])
            for column in inspect(db.engine).get_columns("experiment_run")
        }
        ExperimentLearningContext.__table__.drop(db.engine)
        db.session.remove()
        db.engine.dispose()
    second_app = create_app(config)
    with second_app.app_context():
        assert inspect(db.engine).has_table("experiment_learning_context")
        assert {
            column["name"]: (str(column["type"]), column["nullable"], column["default"], column["primary_key"])
            for column in inspect(db.engine).get_columns("experiment_run")
        } == original_columns
        assert db.session.get(ExperimentRun, "run-before-adjunct").status == "completed"
        assert ExperimentLearningContext.query.count() == 0
        db.session.remove()
        db.engine.dispose()


def test_create_pending_run_commit_false_leaves_context_and_event_to_caller(app, lab_seed):
    with app.app_context():
        run = ExperimentService.create_pending_run(_TEMPLATE, {
            "student_id": _USER, "course_id": _COURSE, "chapter_id": "context-chapter",
            "activity_id": "context-activity", "params": {},
        }, commit=False, learning_context={"concept_id": "context-visible", "graph_snapshot_id": _SNAPSHOT})
        assert _domain_counts() == (1, 1, 1)
        assert set(run) == _RUN_KEYS
        db.session.rollback()
        assert _domain_counts() == (0, 0, 0)
        # Existing callers still commit without needing any new keyword.
        legacy = ExperimentService.create_pending_run(_TEMPLATE, {"student_id": _USER, "course_id": _COURSE})
        db.session.rollback()
        assert db.session.get(ExperimentRun, legacy["id"]) is not None
        assert ExperimentLearningContext.query.count() == 0
