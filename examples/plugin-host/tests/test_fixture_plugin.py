"""Tests for the dev-only plugin-host fixture backend."""

from __future__ import annotations

import json
from pathlib import Path

from app.db import db
from app.jwt_utils import create_access_token
from app.models import ExperimentRun, ProgressEvent, User

from fixture_plugin import (
    _CHAPTER_SEARCH,
    _COURSE_ID,
    _DRAFT_COURSE_ID,
    create_fixture_app,
)


def _bearer(app, user_id: str) -> dict[str, str]:
    with app.app_context():
        user = db.session.get(User, user_id)
        assert user is not None, f"missing fixture user {user_id}"
        token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _invoke(client, headers, operation, arguments, request_id=None):
    body = {"operation": operation, "arguments": arguments}
    if request_id is not None:
        body["request_id"] = request_id
    return client.post("/api/v1/plugin/invoke", json=body, headers=headers)


def _assert_no_answer_keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            assert key not in {"answer", "explanation"}, f"leaked quiz field: {key}"
            _assert_no_answer_keys(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_answer_keys(item)


def _assert_no_path_keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).casefold() in {
                "path",
                "file_path",
                "filepath",
                "local_path",
                "storage_path",
                "output_path",
                "upload_path",
            }:
                assert item in ("", "[redacted]", None), f"leaked path under {key}: {item!r}"
            _assert_no_path_keys(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_path_keys(item)


def test_manifest_lists_all_eight_operations(fixture_app, client):
    response = client.get("/api/v1/plugin/manifest", headers=_bearer(fixture_app, "fixture-student"))
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["success"] is True
    data = payload["data"]
    assert data["id"] == "edufish"
    assert data["version"] == "0.1.0"
    assert data["protocol_version"] == 1
    names = {item["name"] for item in data["operations"]}
    assert names == {
        "edufish.course.read",
        "edufish.material.search",
        "edufish.graph.neighborhood",
        "edufish.quiz.read",
        "edufish.quiz.submit",
        "edufish.progress.read",
        "edufish.lab.start",
        "edufish.lab.status",
    }
    mutating = {item["name"] for item in data["operations"] if item["mutates"]}
    assert mutating == {"edufish.quiz.submit", "edufish.lab.start"}


def test_manifest_requires_authentication(fixture_app, client):
    response = client.get("/api/v1/plugin/manifest")
    payload = response.get_json()
    assert response.status_code == 401
    assert payload["error"]["code"] == "UNAUTHORIZED"


def test_rejects_runtime_tokens_and_identity_overrides(fixture_app, client):
    runtime_headers = _bearer(fixture_app, "fixture-runtime")
    response = _invoke(
        client,
        runtime_headers,
        "edufish.course.read",
        {"course_id": _COURSE_ID},
    )
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "FORBIDDEN"

    override_headers = _bearer(fixture_app, "fixture-student")
    override_headers["X-Runtime-User-Id"] = "fixture-other-student"
    response = _invoke(client, override_headers, "edufish.course.read", {"course_id": _COURSE_ID})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "FORBIDDEN"

    response = _invoke(
        client,
        _bearer(fixture_app, "fixture-student"),
        "edufish.course.read",
        {"course_id": _COURSE_ID, "user_id": "fixture-other-student"},
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_ARGUMENT"


def test_course_visibility_and_grants(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    response = _invoke(client, student, "edufish.course.read", {"course_id": _COURSE_ID})
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["data"]["course"]["id"] == _COURSE_ID
    assert payload["data"]["course"]["status"] == "published"
    assert {chapter["id"] for chapter in payload["data"]["chapters"]} == {
        _CHAPTER_SEARCH,
        "chapter-fixture-lab",
    }

    response = _invoke(client, student, "edufish.course.read", {"course_id": _DRAFT_COURSE_ID})
    # The default fixture configures PLUGIN_ALLOWED_COURSE_IDS, and the student
    # is not granted the draft course, so the production visibility layer
    # returns a non-leaking NOT_FOUND.
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"

    teacher = _bearer(fixture_app, "fixture-teacher")
    response = _invoke(client, teacher, "edufish.course.read", {"course_id": _DRAFT_COURSE_ID})
    assert response.status_code == 200
    assert response.get_json()["data"]["course"]["status"] == "draft"

    unlisted = _bearer(fixture_app, "fixture-unlisted")
    response = _invoke(client, unlisted, "edufish.course.read", {"course_id": _COURSE_ID})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "FORBIDDEN"


def test_published_only_visibility_without_grants(tmp_path):
    app = create_fixture_app(
        tmp_path,
        handshake_secret="no-grants",
        use_default_grants=False,
        jwt_secret="no-grants-secret-that-is-long-enough-for-hs256",
    )
    client = app.test_client()

    student = _bearer(app, "fixture-student")
    assert (
        _invoke(client, student, "edufish.course.read", {"course_id": _COURSE_ID}).status_code
        == 200
    )
    draft = _invoke(client, student, "edufish.course.read", {"course_id": _DRAFT_COURSE_ID})
    assert draft.status_code == 404
    assert draft.get_json()["error"]["code"] == "NOT_FOUND"

    teacher = _bearer(app, "fixture-teacher")
    draft = _invoke(client, teacher, "edufish.course.read", {"course_id": _DRAFT_COURSE_ID})
    assert draft.status_code == 200

    with app.app_context():
        db.session.remove()
        db.engine.dispose()


def test_search_returns_real_stored_chunks_and_respects_visibility(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    response = _invoke(
        client,
        student,
        "edufish.material.search",
        {"course_id": _COURSE_ID, "query": "estimates which states are more promising"},
    )
    payload = response.get_json()
    assert response.status_code == 200
    data = payload["data"]
    assert data["retrieval_method"] == "keyword"
    assert data["results"]
    top = data["results"][0]
    assert top["chunk_id"] == "chunk-fixture-heuristic-1"
    assert "estimates which states are more promising" in top["content"]
    assert top["filename"] == "heuristic-search.md"
    assert top["page_number"] == 3
    assert top["citation_locator"] == "p.3 §1.2"
    assert "path" not in top
    _assert_no_path_keys(data)

    personal = _invoke(
        client,
        student,
        "edufish.material.search",
        {"course_id": _COURSE_ID, "query": "private note"},
    ).get_json()["data"]["results"]
    chunk_ids = {item["chunk_id"] for item in personal}
    assert "chunk-fixture-personal-1" in chunk_ids
    assert "chunk-fixture-other-personal-1" not in chunk_ids
    assert all("secret study plan" not in item["content"] for item in personal)

    empty = _invoke(
        client,
        student,
        "edufish.material.search",
        {"course_id": _COURSE_ID, "query": "quasarxyz"},
    ).get_json()["data"]
    assert empty == {"results": [], "retrieval_method": "keyword"}

    limited = _invoke(
        client,
        student,
        "edufish.material.search",
        {"course_id": _COURSE_ID, "query": "heuristic", "limit": 1},
    ).get_json()["data"]
    assert len(limited["results"]) == 1


def test_quiz_read_never_returns_answers_or_invisible_quizzes(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    response = _invoke(
        client,
        student,
        "edufish.quiz.read",
        {"course_id": _COURSE_ID, "chapter_id": _CHAPTER_SEARCH},
    )
    payload = response.get_json()
    assert response.status_code == 200
    items = payload["data"]["items"]
    ids = {item["id"] for item in items}
    assert {"quiz-fixture-heuristic", "quiz-fixture-astar", "quiz-fixture-personal"} <= ids
    assert "quiz-fixture-hidden" not in ids
    _assert_no_answer_keys(payload["data"])
    assert all(set(item) == {"id", "prompt"} for item in items)


def test_submit_replay_conflict_and_progress(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    answers = {
        "course_id": _COURSE_ID,
        "chapter_id": _CHAPTER_SEARCH,
        "answers": [
            {
                "quiz_id": "quiz-fixture-heuristic",
                # Deliberately messy casing/whitespace to exercise normalization.
                "answer": "  it ESTIMATES   which states are more promising. ",
            }
        ],
    }

    first = _invoke(client, student, "edufish.quiz.submit", answers, request_id="quiz-req-1")
    assert first.status_code == 200
    first_data = first.get_json()["data"]
    assert first_data["score"] == 1
    assert first_data["total"] == 1
    assert first_data["results"][0]["correct"] is True
    assert "answer" not in first_data["results"][0]
    _assert_no_answer_keys(first_data)

    replay = _invoke(client, student, "edufish.quiz.submit", answers, request_id="quiz-req-1")
    assert replay.status_code == 200
    assert replay.get_json()["data"]["submission_id"] == first_data["submission_id"]

    conflict = _invoke(
        client,
        student,
        "edufish.quiz.submit",
        {
            **answers,
            "answers": [{"quiz_id": "quiz-fixture-heuristic", "answer": "a different answer"}],
        },
        request_id="quiz-req-1",
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    second = _invoke(client, student, "edufish.quiz.submit", answers, request_id="quiz-req-2")
    assert second.status_code == 200
    assert second.get_json()["data"]["submission_id"] != first_data["submission_id"]

    progress = _invoke(
        client, student, "edufish.progress.read", {"course_id": _COURSE_ID}
    ).get_json()["data"]
    assert progress["student_id"] == "fixture-student"
    assert progress["event_counts"]["answered_quiz"] == 2
    assert len(progress["quiz_submissions"]) == 2
    assert {item["submission_id"] for item in progress["quiz_submissions"]} == {
        first_data["submission_id"],
        second.get_json()["data"]["submission_id"],
    }
    assert all(item["chapter_id"] == _CHAPTER_SEARCH for item in progress["quiz_submissions"])
    # There is no mastery field: repeated attempts are just events.
    assert "mastery" not in progress
    with fixture_app.app_context():
        events = ProgressEvent.query.filter_by(
            student_id="fixture-student", event_type="answered_quiz"
        ).all()
        assert len(events) == 2
        assert all(
            "answer" not in (event.payload_json or "").casefold() for event in events
        )


def test_submit_rejects_bad_or_invisible_quizzes(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")

    missing_request_id = _invoke(
        client,
        student,
        "edufish.quiz.submit",
        {
            "course_id": _COURSE_ID,
            "chapter_id": _CHAPTER_SEARCH,
            "answers": [{"quiz_id": "quiz-fixture-heuristic", "answer": "x"}],
        },
    )
    assert missing_request_id.status_code == 400
    assert missing_request_id.get_json()["error"]["code"] == "INVALID_ARGUMENT"

    hidden = _invoke(
        client,
        student,
        "edufish.quiz.submit",
        {
            "course_id": _COURSE_ID,
            "chapter_id": _CHAPTER_SEARCH,
            "answers": [{"quiz_id": "quiz-fixture-hidden", "answer": "x"}],
        },
        request_id="quiz-hidden-1",
    )
    assert hidden.status_code == 400
    assert hidden.get_json()["error"]["code"] == "INVALID_ARGUMENT"

    duplicate = _invoke(
        client,
        student,
        "edufish.quiz.submit",
        {
            "course_id": _COURSE_ID,
            "chapter_id": _CHAPTER_SEARCH,
            "answers": [
                {"quiz_id": "quiz-fixture-heuristic", "answer": "a"},
                {"quiz_id": "quiz-fixture-heuristic", "answer": "b"},
            ],
        },
        request_id="quiz-duplicate-1",
    )
    assert duplicate.status_code == 400
    assert duplicate.get_json()["error"]["code"] == "INVALID_ARGUMENT"

    identity_override = _invoke(
        client,
        student,
        "edufish.quiz.submit",
        {
            "course_id": _COURSE_ID,
            "chapter_id": _CHAPTER_SEARCH,
            "student_id": "fixture-other-student",
            "answers": [{"quiz_id": "quiz-fixture-heuristic", "answer": "x"}],
        },
        request_id="quiz-override-1",
    )
    assert identity_override.status_code == 400
    assert identity_override.get_json()["error"]["code"] == "INVALID_ARGUMENT"


def test_graph_neighborhood_visibility_and_bounds(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    response = _invoke(
        client,
        student,
        "edufish.graph.neighborhood",
        {
            "course_id": _COURSE_ID,
            "concept_id": "concept-fixture-heuristic",
            "depth": 2,
        },
    )
    payload = response.get_json()
    assert response.status_code == 200
    data = payload["data"]
    node_ids = {node["id"] for node in data["nodes"]}
    assert {"concept-fixture-heuristic", "concept-fixture-astar", "concept-fixture-frontier"} <= node_ids
    assert "concept-fixture-personal" in node_ids
    assert "concept-fixture-other-personal" not in node_ids
    assert "concept-fixture-draft" not in node_ids
    assert all(edge["source_id"] in node_ids and edge["target_id"] in node_ids for edge in data["edges"])

    other = _bearer(fixture_app, "fixture-other-student")
    other_data = _invoke(
        client,
        other,
        "edufish.graph.neighborhood",
        {"course_id": _COURSE_ID, "concept_id": "concept-fixture-heuristic", "depth": 2},
    ).get_json()["data"]
    other_node_ids = {node["id"] for node in other_data["nodes"]}
    assert "concept-fixture-other-personal" in other_node_ids
    assert "concept-fixture-personal" not in other_node_ids

    too_deep = _invoke(
        client,
        student,
        "edufish.graph.neighborhood",
        {"course_id": _COURSE_ID, "concept_id": "concept-fixture-heuristic", "depth": 3},
    )
    assert too_deep.status_code == 400
    assert too_deep.get_json()["error"]["code"] == "INVALID_ARGUMENT"

    foreign_concept = _invoke(
        client,
        student,
        "edufish.graph.neighborhood",
        {"course_id": _COURSE_ID, "concept_id": "concept-fixture-draft-course"},
    )
    assert foreign_concept.status_code == 404


def test_lab_start_status_replay_conflict_and_ownership(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    arguments = {
        "course_id": _COURSE_ID,
        "template_id": "exp-neuron-spike",
        "params": {"stimulus": {"stimulus_current": 8, "duration_ms": 120}},
    }
    response = _invoke(client, student, "edufish.lab.start", arguments, request_id="lab-req-1")
    payload = response.get_json()
    assert response.status_code == 200
    run = payload["data"]["run"]
    assert run["status"] == "completed"
    assert run["student_id"] == "fixture-student"
    assert run["course_id"] == _COURSE_ID
    assert run["id"].startswith("run-")
    assert run["artifacts"]
    assert run["report"]["status"] == "ready"
    _assert_no_path_keys(run)

    replay = _invoke(client, student, "edufish.lab.start", arguments, request_id="lab-req-1")
    assert replay.status_code == 200
    assert replay.get_json()["data"]["run"]["id"] == run["id"]

    conflict = _invoke(
        client,
        student,
        "edufish.lab.start",
        {
            **arguments,
            "params": {"stimulus": {"stimulus_current": 9, "duration_ms": 120}},
        },
        request_id="lab-req-1",
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    status = _invoke(
        client,
        student,
        "edufish.lab.status",
        {"course_id": _COURSE_ID, "run_id": run["id"]},
    )
    assert status.status_code == 200
    assert status.get_json()["data"]["run"]["id"] == run["id"]

    other = _bearer(fixture_app, "fixture-other-student")
    denied = _invoke(
        client, other, "edufish.lab.status", {"course_id": _COURSE_ID, "run_id": run["id"]}
    )
    assert denied.status_code == 404
    assert denied.get_json()["error"]["code"] == "NOT_FOUND"

    teacher = _bearer(fixture_app, "fixture-teacher")
    denied_teacher = _invoke(
        client, teacher, "edufish.lab.status", {"course_id": _COURSE_ID, "run_id": run["id"]}
    )
    assert denied_teacher.status_code == 404

    with fixture_app.app_context():
        runs = ExperimentRun.query.filter_by(
            student_id="fixture-student", course_id=_COURSE_ID
        ).all()
        assert len(runs) == 1

    missing_request_id = _invoke(client, student, "edufish.lab.start", arguments)
    assert missing_request_id.status_code == 400
    assert missing_request_id.get_json()["error"]["code"] == "INVALID_ARGUMENT"


def test_lab_start_validates_params_and_status_is_course_scoped(fixture_app, client):
    student = _bearer(fixture_app, "fixture-student")
    bad_params = _invoke(
        client,
        student,
        "edufish.lab.start",
        {
            "course_id": _COURSE_ID,
            "template_id": "exp-neuron-spike",
            "params": {"stimulus": {"stimulus_current": 0, "duration_ms": 120}},
        },
        request_id="lab-bad-1",
    )
    assert bad_params.status_code == 400
    assert bad_params.get_json()["error"]["code"] == "INVALID_ARGUMENT"

    # A teacher may access the draft course. The run is bound to that course,
    # and lab.status must reject a different course even for the same owner.
    teacher = _bearer(fixture_app, "fixture-teacher")
    started = _invoke(
        client,
        teacher,
        "edufish.lab.start",
        {"course_id": _DRAFT_COURSE_ID, "template_id": "exp-neuron-spike", "params": {}},
        request_id="teacher-lab-1",
    )
    assert started.status_code == 200
    teacher_run = started.get_json()["data"]["run"]
    assert teacher_run["course_id"] == _DRAFT_COURSE_ID

    wrong_course = _invoke(
        client,
        teacher,
        "edufish.lab.status",
        {"course_id": _COURSE_ID, "run_id": teacher_run["id"]},
    )
    assert wrong_course.status_code == 404
    assert wrong_course.get_json()["error"]["code"] == "NOT_FOUND"


def test_multitenant_mode_refuses_plugin(fixture_app, client):
    fixture_app.config["MULTI_TENANT_ENABLED"] = True
    try:
        response = _invoke(
            client,
            _bearer(fixture_app, "fixture-student"),
            "edufish.course.read",
            {"course_id": _COURSE_ID},
        )
        assert response.status_code == 503
        assert response.get_json()["error"]["code"] == "UNAVAILABLE"
    finally:
        fixture_app.config["MULTI_TENANT_ENABLED"] = False


def test_fixture_token_handshake_is_explicit_and_guarded(fixture_app, client):
    hidden = client.get("/__fixture__/token?user_id=fixture-student")
    assert hidden.status_code == 404

    wrong = client.get(
        "/__fixture__/token?user_id=fixture-student",
        headers={"X-Fixture-Handshake": "wrong"},
    )
    assert wrong.status_code == 404

    unknown = client.get(
        "/__fixture__/token?user_id=no-such-user",
        headers={"X-Fixture-Handshake": "test-handshake"},
    )
    assert unknown.status_code == 404

    response = client.get(
        "/__fixture__/token?user_id=fixture-student",
        headers={"X-Fixture-Handshake": "test-handshake"},
    )
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["data"]["token"]
    assert payload["data"]["user"] == {"id": "fixture-student", "role": "student"}
    assert response.headers["Cache-Control"] == "no-store"
    # The token must not appear on any other fixture endpoint.
    manifest = client.get(
        "/api/v1/plugin/manifest",
        headers={"Authorization": f"Bearer {payload['data']['token']}"},
    ).get_json()
    assert payload["data"]["token"] not in json.dumps(manifest)


def test_idempotency_survives_app_restart(tmp_path):
    jwt_secret = "restart-test-secret-that-is-long-enough-for-hs256"
    app1 = create_fixture_app(
        tmp_path,
        handshake_secret="restart-handshake",
        use_default_grants=True,
        jwt_secret=jwt_secret,
    )
    client1 = app1.test_client()
    headers = _bearer(app1, "fixture-student")
    arguments = {
        "course_id": _COURSE_ID,
        "chapter_id": _CHAPTER_SEARCH,
        "answers": [{"quiz_id": "quiz-fixture-heuristic", "answer": "it estimates which states are more promising."}],
    }
    first = _invoke(client1, headers, "edufish.quiz.submit", arguments, request_id="restart-req-1")
    assert first.status_code == 200
    submission_id = first.get_json()["data"]["submission_id"]

    with app1.app_context():
        db.session.remove()
        db.engine.dispose()

    app2 = create_fixture_app(
        tmp_path,
        handshake_secret="restart-handshake",
        use_default_grants=True,
        jwt_secret=jwt_secret,
    )
    client2 = app2.test_client()
    replay = _invoke(client2, headers, "edufish.quiz.submit", arguments, request_id="restart-req-1")
    assert replay.status_code == 200
    assert replay.get_json()["data"]["submission_id"] == submission_id

    with app2.app_context():
        events = ProgressEvent.query.filter_by(
            student_id="fixture-student", event_type="answered_quiz"
        ).all()
        assert len(events) == 1
        db.session.remove()
        db.engine.dispose()
