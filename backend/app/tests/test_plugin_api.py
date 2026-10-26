"""Backend tests for the independent EduFish plugin (protocol v1).

Coverage focuses on the contract's security and durability boundaries:
authentication/authorization, personal-knowledge and answer privacy, strict
validation, durable idempotent replay/conflict, progress persistence, and
experiment-run ownership.
"""

from __future__ import annotations

import json

from flask import current_app

from app import create_app
from app.db import db
from app.jwt_utils import create_access_token
from app.models import (
    Chapter,
    Chunk,
    Concept,
    Course,
    ExperimentArtifact,
    ExperimentRun,
    ExperimentTemplate,
    GraphEdge,
    Material,
    ProgressEvent,
    QuizItem,
    User,
)
from app.plugin.models import PluginIdempotencyRecord
from app.services.experiment_service import ExperimentService
from app.services.progress_service import ProgressService
from app.services.seed_data import seed_courses

PLUGIN_OPERATIONS = {
    "edufish.course.read",
    "edufish.material.search",
    "edufish.graph.neighborhood",
    "edufish.quiz.read",
    "edufish.quiz.submit",
    "edufish.progress.read",
    "edufish.lab.start",
    "edufish.lab.status",
}


def _seed_plugin_data() -> None:
    """Seed published courses plus global/personal/private fixture rows."""
    # Keep tests deterministic even if the developer shell exports plugin
    # configuration variables.
    current_app.config["PLUGIN_ALLOWED_COURSE_IDS"] = ""
    current_app.config["MULTI_TENANT_ENABLED"] = False
    seed_courses()

    db.session.merge(User(id="student-ada", name="Ada", role="student"))
    db.session.merge(User(id="student-bob", name="Bob", role="student"))
    db.session.merge(User(id="teacher-tess", name="Tess", role="teacher"))
    db.session.merge(User(id="admin-ann", name="Ann", role="admin"))

    db.session.merge(
        Course(
            id="draft-course",
            title="Draft Course",
            summary="Not published yet.",
            status="draft",
        )
    )
    db.session.merge(
        Chapter(
            id="draft-chapter",
            course_id="draft-course",
            order=1,
            title="Draft Chapter",
            objectives="Should be staff-only.",
        )
    )

    db.session.merge(
        Material(
            id="material-global",
            course_id="ai-intro",
            filename="global-notes.txt",
            path="/srv/app/global-notes.txt",
            scope_type="course_global",
            owner_id="",
        )
    )
    db.session.merge(
        Material(
            id="material-ada",
            course_id="ai-intro",
            filename="ada-private.txt",
            path="/home/ada/ada-private.txt",
            scope_type="student_personal",
            owner_id="student-ada",
        )
    )
    db.session.merge(
        Material(
            id="material-bob",
            course_id="ai-intro",
            filename="bob-private.txt",
            path="/home/bob/bob-private.txt",
            scope_type="student_personal",
            owner_id="student-bob",
        )
    )
    db.session.merge(
        Material(
            id="material-teacher",
            course_id="ai-intro",
            filename="teacher-private.txt",
            path="/home/tess/teacher-private.txt",
            scope_type="teacher_private",
            owner_id="teacher-tess",
        )
    )

    db.session.merge(
        Chunk(
            id="chunk-global-1",
            material_id="material-global",
            text="Neural networks learn layered representations from data.",
            citation_locator="global-notes.txt#page-1-chunk-0",
            page_number=1,
            heading="Neural Networks",
        )
    )
    db.session.merge(
        Chunk(
            id="chunk-global-2",
            material_id="material-global",
            text="Heuristic search uses estimates to guide problem solving.",
            citation_locator="global-notes.txt#page-2-chunk-1",
            page_number=2,
            heading="Search",
        )
    )
    db.session.merge(
        Chunk(
            id="chunk-ada-1",
            material_id="material-ada",
            text="Ada private note about neural network experiments.",
            citation_locator="ada-private.txt#page-1-chunk-0",
            page_number=1,
            heading="Ada Notes",
        )
    )
    db.session.merge(
        Chunk(
            id="chunk-bob-1",
            material_id="material-bob",
            text="Bob secret neural network answer.",
            citation_locator="bob-private.txt#page-1-chunk-0",
            page_number=1,
            heading="Bob Notes",
        )
    )
    db.session.merge(
        Chunk(
            id="chunk-teacher-1",
            material_id="material-teacher",
            text="Teacher private neural network notes.",
            citation_locator="teacher-private.txt#page-1-chunk-0",
            page_number=1,
            heading="Teacher Notes",
        )
    )

    db.session.merge(
        Concept(
            id="concept-ada-private",
            course_id="ai-intro",
            label="Ada Private Concept",
            definition="Ada private definition.",
            scope_type="student_personal",
            owner_id="student-ada",
        )
    )
    db.session.merge(
        Concept(
            id="concept-bob-private",
            course_id="ai-intro",
            label="Bob Private Concept",
            definition="Bob private definition.",
            scope_type="student_personal",
            owner_id="student-bob",
        )
    )
    db.session.merge(
        GraphEdge(
            id="edge-ada-private",
            course_id="ai-intro",
            source_id="concept-ada-private",
            target_id="concept-search",
            relationship="RELATES_TO",
            evidence="Ada private evidence.",
            scope_type="student_personal",
            owner_id="student-ada",
        )
    )
    db.session.merge(
        GraphEdge(
            id="edge-bob-private",
            course_id="ai-intro",
            source_id="concept-bob-private",
            target_id="concept-search",
            relationship="RELATES_TO",
            evidence="Bob private evidence.",
            scope_type="student_personal",
            owner_id="student-bob",
        )
    )
    db.session.merge(
        Concept(
            id="concept-ai-depth2",
            course_id="ai-intro",
            label="Deep Concept",
            definition="Reachable at graph depth two.",
            scope_type="course_global",
            owner_id="",
        )
    )
    db.session.merge(
        GraphEdge(
            id="edge-rl-depth2",
            course_id="ai-intro",
            source_id="concept-rl",
            target_id="concept-ai-depth2",
            relationship="RELATES_TO",
            evidence="Depth two evidence.",
            scope_type="course_global",
            owner_id="",
        )
    )

    db.session.merge(
        QuizItem(
            id="quiz-global-material",
            chapter_id="ai-search",
            material_id="material-global",
            prompt="Which mechanism learns layered representations?",
            answer="Neural networks",
            explanation="They learn layered representations.",
        )
    )
    db.session.merge(
        QuizItem(
            id="quiz-ada-private",
            chapter_id="ai-search",
            material_id="material-ada",
            prompt="Ada private quiz prompt",
            answer="ada secret answer",
            explanation="Ada private explanation.",
        )
    )
    db.session.merge(
        QuizItem(
            id="quiz-bob-private",
            chapter_id="ai-search",
            material_id="material-bob",
            prompt="Bob private quiz prompt",
            answer="bob secret answer",
            explanation="Bob private explanation.",
        )
    )
    db.session.merge(
        QuizItem(
            id="quiz-teacher-private",
            chapter_id="ai-search",
            material_id="material-teacher",
            prompt="Teacher private quiz prompt",
            answer="teacher secret answer",
            explanation="Teacher private explanation.",
        )
    )

    db.session.commit()


def _bearer(user_id: str = "student-ada", role: str = "student") -> dict:
    return {"Authorization": f"Bearer {create_access_token(user_id=user_id, role=role)}"}


def _manifest(client, user_id="student-ada", role="student", headers=None):
    request_headers = _bearer(user_id, role)
    if headers:
        request_headers.update(headers)
    return client.get("/api/v1/plugin/manifest", headers=request_headers)


def _invoke(
    client,
    operation,
    arguments,
    request_id=None,
    user_id="student-ada",
    role="student",
    headers=None,
):
    payload = {"operation": operation, "arguments": arguments}
    if request_id is not None:
        payload["request_id"] = request_id
    request_headers = _bearer(user_id, role)
    if headers:
        request_headers.update(headers)
    return client.post("/api/v1/plugin/invoke", json=payload, headers=request_headers)


def _data(response) -> dict:
    payload = response.get_json()
    assert payload["success"] is True, payload
    return payload["data"]


def _error_code(response) -> str:
    payload = response.get_json()
    assert payload["success"] is False, payload
    return payload["error"]["code"]


# ── Manifest & protocol envelope ─────────────────────────────────────────────


def test_manifest_requires_authentication(client):
    response = client.get("/api/v1/plugin/manifest")

    assert response.status_code == 401
    assert _error_code(response) == "UNAUTHORIZED"


def test_manifest_matches_contract(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(_manifest(client))

    assert data["id"] == "edufish"
    assert data["version"] == "0.1.0"
    assert data["protocol_version"] == 1
    operations = {op["name"]: op for op in data["operations"]}
    assert set(operations) == PLUGIN_OPERATIONS
    assert operations["edufish.quiz.submit"]["mutates"] is True
    assert operations["edufish.lab.start"]["mutates"] is True
    for name in PLUGIN_OPERATIONS - {"edufish.quiz.submit", "edufish.lab.start"}:
        assert operations[name]["mutates"] is False
    for operation in operations.values():
        assert operation["input_schema"]["type"] == "object"
        assert operation["input_schema"]["additionalProperties"] is False
        assert operation["description"]


def test_manifest_rejects_runtime_service_token(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _manifest(client, user_id="runtime", role="runtime")

    assert response.status_code == 403
    assert _error_code(response) == "FORBIDDEN"


def test_invoke_rejects_identity_override_header(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "ai-intro"},
        headers={"X-Runtime-User-Id": "student-ada"},
    )

    assert response.status_code == 403
    assert _error_code(response) == "FORBIDDEN"


def test_invoke_rejects_identity_override_argument(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "ai-intro", "student_id": "student-bob"},
    )

    assert response.status_code == 400
    assert _error_code(response) == "INVALID_ARGUMENT"


def test_invoke_rejects_unknown_envelope_key(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = client.post(
        "/api/v1/plugin/invoke",
        json={
            "operation": "edufish.course.read",
            "arguments": {"course_id": "ai-intro"},
            "role": "admin",
        },
        headers=_bearer(),
    )

    assert response.status_code == 400
    assert _error_code(response) == "INVALID_ARGUMENT"


def test_invoke_rejects_unknown_operation(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(client, "edufish.unknown", {})

    assert response.status_code == 400
    assert _error_code(response) == "UNKNOWN_OPERATION"


def test_invoke_rejects_engine_api_key_without_user_bearer(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = client.post(
        "/api/v1/plugin/invoke",
        json={"operation": "edufish.course.read", "arguments": {"course_id": "ai-intro"}},
        headers={"X-API-Key": "not-a-user-token"},
    )

    assert response.status_code == 401
    assert _error_code(response) == "UNAUTHORIZED"


def test_multi_tenant_mode_refuses_plugin(client, app):
    with app.app_context():
        _seed_plugin_data()
    app.config["MULTI_TENANT_ENABLED"] = True

    manifest_response = _manifest(client)
    invoke_response = _invoke(
        client, "edufish.course.read", {"course_id": "ai-intro"}
    )

    assert manifest_response.status_code == 503
    assert _error_code(manifest_response) == "UNAVAILABLE"
    assert invoke_response.status_code == 503
    assert _error_code(invoke_response) == "UNAVAILABLE"


# ── Course & visibility ──────────────────────────────────────────────────────


def test_course_read_returns_chapters_without_body(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(
        _invoke(client, "edufish.course.read", {"course_id": "ai-intro"})
    )

    assert data["course"] == {
        "id": "ai-intro",
        "title": "人工智能导论",
        "summary": (
            "Search, reasoning, machine learning, neural networks, reinforcement "
            "learning, language, vision, knowledge graphs, and AI ethics."
        ),
        "status": "published",
    }
    chapter = next(item for item in data["chapters"] if item["id"] == "ai-search")
    assert set(chapter) == {"id", "title", "order", "objectives"}
    assert "body" not in json.dumps(data)


def test_course_read_unknown_course_is_not_found(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client, "edufish.course.read", {"course_id": "missing-course"}
    )

    assert response.status_code == 404
    assert _error_code(response) == "NOT_FOUND"


def test_draft_course_visibility_follows_role(client, app):
    with app.app_context():
        _seed_plugin_data()

    student_response = _invoke(
        client, "edufish.course.read", {"course_id": "draft-course"}
    )
    teacher_response = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "draft-course"},
        user_id="teacher-tess",
        role="teacher",
    )
    admin_response = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "draft-course"},
        user_id="admin-ann",
        role="admin",
    )

    assert student_response.status_code == 404
    assert _error_code(student_response) == "NOT_FOUND"
    assert teacher_response.status_code == 200
    assert admin_response.status_code == 200


def test_course_allowlist_fails_closed(client, app):
    with app.app_context():
        _seed_plugin_data()
    app.config["PLUGIN_ALLOWED_COURSE_IDS"] = {"student-ada": ["ai-intro"]}

    allowed = _invoke(client, "edufish.course.read", {"course_id": "ai-intro"})
    not_listed_course = _invoke(
        client, "edufish.course.read", {"course_id": "brain-cog-intro"}
    )
    not_listed_user = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "ai-intro"},
        user_id="student-bob",
        role="student",
    )

    assert allowed.status_code == 200
    assert not_listed_course.status_code == 404
    assert _error_code(not_listed_course) == "NOT_FOUND"
    assert not_listed_user.status_code == 403
    assert _error_code(not_listed_user) == "FORBIDDEN"


# ── Material search ──────────────────────────────────────────────────────────


def test_material_search_returns_only_visible_real_chunks(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "neural", "limit": 20},
        )
    )

    assert data["retrieval_method"] == "keyword"
    by_id = {item["chunk_id"]: item for item in data["results"]}
    assert "chunk-global-1" in by_id
    assert "chunk-ada-1" in by_id
    assert "chunk-bob-1" not in by_id
    assert "chunk-teacher-1" not in by_id
    for item in data["results"]:
        assert set(item) == {
            "chunk_id",
            "material_id",
            "course_id",
            "filename",
            "content",
            "page_number",
            "citation_locator",
            "heading",
        }
        assert item["course_id"] == "ai-intro"
        assert len(item["content"]) <= 1200

    body = json.dumps(data)
    assert "/srv/app" not in body
    assert "/home/ada" not in body


def test_material_search_does_not_leak_other_users_private_chunks(client, app):
    with app.app_context():
        _seed_plugin_data()

    ada_data = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "secret"},
        )
    )
    bob_data = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "secret"},
            user_id="student-bob",
            role="student",
        )
    )
    teacher_data = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "secret"},
            user_id="teacher-tess",
            role="teacher",
        )
    )

    assert ada_data["results"] == []
    assert {item["chunk_id"] for item in bob_data["results"]} == {"chunk-bob-1"}
    # teacher_private is outside the plugin's global+personal scope.
    assert teacher_data["results"] == []


def test_material_search_is_bounded_and_never_fabricates_results(client, app):
    with app.app_context():
        _seed_plugin_data()

    limited = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "neural", "limit": 1},
        )
    )
    empty = _data(
        _invoke(
            client,
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "zzzz-no-such-term"},
        )
    )

    assert len(limited["results"]) == 1
    assert empty == {"results": [], "retrieval_method": "keyword"}


def test_material_search_validates_bounds(client, app):
    with app.app_context():
        _seed_plugin_data()

    for arguments in (
        {"course_id": "ai-intro", "query": "neural", "limit": 0},
        {"course_id": "ai-intro", "query": "neural", "limit": 21},
        {"course_id": "ai-intro", "query": "   "},
        {"course_id": "ai-intro", "query": "x" * 2001},
    ):
        response = _invoke(client, "edufish.material.search", arguments)
        assert response.status_code == 400, arguments
        assert _error_code(response) == "INVALID_ARGUMENT"


# ── Graph neighborhood ───────────────────────────────────────────────────────


def test_graph_neighborhood_is_scoped_and_edges_are_closed(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(
        _invoke(
            client,
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "concept_id": "concept-search", "depth": 1},
        )
    )

    nodes = {node["id"]: node for node in data["nodes"]}
    assert "concept-search" in nodes
    assert "concept-ada-private" in nodes
    assert "concept-bob-private" not in nodes
    edge_ids = {edge["id"] for edge in data["edges"]}
    assert "edge-ada-private" in edge_ids
    assert "edge-bob-private" not in edge_ids
    for edge in data["edges"]:
        assert set(edge) == {
            "id",
            "source_id",
            "target_id",
            "relationship",
            "evidence",
        }
        assert edge["source_id"] in nodes
        assert edge["target_id"] in nodes
    for node in nodes.values():
        assert set(node) == {"id", "label", "definition"}

    body = json.dumps(data)
    assert "Bob Private Concept" not in body
    assert "Bob private evidence" not in body

    whole = _data(
        _invoke(
            client,
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "limit": 100},
        )
    )
    whole_ids = {node["id"] for node in whole["nodes"]}
    whole_edge_ids = {edge["id"] for edge in whole["edges"]}
    assert "concept-neural-networks" in whole_ids
    # Cross-course links exist in legacy seed data, but the edge is not an
    # authorization grant to the other course's concepts.
    assert "concept-human-attention" not in whole_ids
    assert "concept-reward-system" not in whole_ids
    assert "edge-attention-related" not in whole_edge_ids
    assert "edge-rl-reward" not in whole_edge_ids
    for edge in whole["edges"]:
        assert edge["source_id"] in whole_ids
        assert edge["target_id"] in whole_ids


def test_graph_neighborhood_respects_depth_and_limit(client, app):
    with app.app_context():
        _seed_plugin_data()

    depth_one = _data(
        _invoke(
            client,
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "concept_id": "concept-search", "depth": 1},
        )
    )
    depth_two = _data(
        _invoke(
            client,
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "concept_id": "concept-search", "depth": 2},
        )
    )
    limited = _data(
        _invoke(
            client,
            "edufish.graph.neighborhood",
            {
                "course_id": "ai-intro",
                "concept_id": "concept-search",
                "depth": 2,
                "limit": 1,
            },
        )
    )

    depth_one_ids = {node["id"] for node in depth_one["nodes"]}
    depth_two_ids = {node["id"] for node in depth_two["nodes"]}
    assert "concept-ai-depth2" not in depth_one_ids
    assert "concept-ai-depth2" in depth_two_ids
    assert "concept-reward-system" not in depth_two_ids
    assert "concept-human-attention" not in depth_two_ids
    assert [node["id"] for node in limited["nodes"]] == ["concept-search"]
    assert limited["edges"] == []


def test_graph_neighborhood_rejects_invisible_concept(client, app):
    with app.app_context():
        _seed_plugin_data()

    private = _invoke(
        client,
        "edufish.graph.neighborhood",
        {"course_id": "ai-intro", "concept_id": "concept-bob-private"},
    )
    cross_course = _invoke(
        client,
        "edufish.graph.neighborhood",
        {"course_id": "ai-intro", "concept_id": "concept-human-attention"},
    )

    assert private.status_code == 404
    assert _error_code(private) == "NOT_FOUND"
    assert cross_course.status_code == 404
    assert _error_code(cross_course) == "NOT_FOUND"


# ── Quiz read / submit ───────────────────────────────────────────────────────


def test_quiz_read_never_returns_answers_or_explanations(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(
        _invoke(
            client,
            "edufish.quiz.read",
            {"course_id": "ai-intro", "chapter_id": "ai-search", "limit": 20},
        )
    )

    by_id = {item["id"]: item for item in data["items"]}
    assert "quiz-ai-search-1" in by_id
    assert "quiz-global-material" in by_id
    assert "quiz-ada-private" in by_id
    assert "quiz-bob-private" not in by_id
    assert "quiz-teacher-private" not in by_id
    for item in data["items"]:
        assert set(item) == {"id", "prompt"}

    body = json.dumps(data)
    for private_value in (
        "It estimates which states are more promising.",
        "ada secret answer",
        "Ada private explanation.",
        "bob secret answer",
        "teacher secret answer",
    ):
        assert private_value not in body


def test_quiz_read_validates_chapter_course_relationship(client, app):
    with app.app_context():
        _seed_plugin_data()

    mismatch = _invoke(
        client,
        "edufish.quiz.read",
        {"course_id": "brain-cog-intro", "chapter_id": "ai-search"},
    )
    missing = _invoke(
        client,
        "edufish.quiz.read",
        {"course_id": "ai-intro", "chapter_id": "missing-chapter"},
    )

    assert mismatch.status_code == 400
    assert _error_code(mismatch) == "INVALID_ARGUMENT"
    assert missing.status_code == 404
    assert _error_code(missing) == "NOT_FOUND"


def _quiz_answers():
    return [
        {
            "quiz_id": "quiz-ai-search-1",
            "answer": "  it ESTIMATES which states are   more promising. ",
        },
        {"quiz_id": "quiz-global-material", "answer": "neural networks"},
        {"quiz_id": "quiz-ada-private", "answer": "not the right answer"},
    ]


def test_quiz_submit_scores_normalized_answers_and_persists_progress(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client,
        "edufish.quiz.submit",
        {
            "course_id": "ai-intro",
            "chapter_id": "ai-search",
            "answers": _quiz_answers(),
        },
        request_id="submit-1",
    )

    assert response.status_code == 200
    data = _data(response)
    assert data["score"] == 2
    assert data["total"] == 3
    assert data["submission_id"]
    by_quiz = {item["quiz_id"]: item for item in data["results"]}
    assert by_quiz["quiz-ai-search-1"]["correct"] is True
    assert by_quiz["quiz-global-material"]["correct"] is True
    assert by_quiz["quiz-ada-private"]["correct"] is False
    assert by_quiz["quiz-ada-private"]["feedback"].startswith("Incorrect.")

    progress = _data(
        _invoke(client, "edufish.progress.read", {"course_id": "ai-intro"})
    )
    assert progress["student_id"] == "student-ada"
    assert progress["event_counts"]["answered_quiz"] == 1
    assert len(progress["quiz_submissions"]) == 1
    submission = progress["quiz_submissions"][0]
    assert submission["submission_id"] == data["submission_id"]
    assert submission["chapter_id"] == "ai-search"
    assert submission["score"] == 2
    assert submission["total"] == 3
    assert isinstance(submission["created_at"], str)

    with app.app_context():
        events = ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).all()
    assert len(events) == 1


def test_quiz_submit_requires_request_id(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client,
        "edufish.quiz.submit",
        {
            "course_id": "ai-intro",
            "chapter_id": "ai-search",
            "answers": _quiz_answers(),
        },
    )

    assert response.status_code == 400
    assert _error_code(response) == "INVALID_ARGUMENT"


def test_quiz_submit_replays_same_request_without_duplicate_event(client, app):
    with app.app_context():
        _seed_plugin_data()

    arguments = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": _quiz_answers(),
    }
    first = _data(
        _invoke(client, "edufish.quiz.submit", arguments, request_id="submit-replay")
    )
    second = _data(
        _invoke(client, "edufish.quiz.submit", arguments, request_id="submit-replay")
    )

    assert first["submission_id"] == second["submission_id"]
    with app.app_context():
        events = ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).all()
    assert len(events) == 1


def test_quiz_submit_conflicts_when_request_id_payload_changes(client, app):
    with app.app_context():
        _seed_plugin_data()

    original = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "correct-ish"}],
    }
    changed = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "different"}],
    }
    first = _invoke(
        client, "edufish.quiz.submit", original, request_id="submit-conflict"
    )
    second = _invoke(
        client, "edufish.quiz.submit", changed, request_id="submit-conflict"
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert _error_code(second) == "IDEMPOTENCY_CONFLICT"
    with app.app_context():
        events = ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).all()
    assert len(events) == 1


def test_quiz_submit_idempotency_scope_is_per_user(client, app):
    with app.app_context():
        _seed_plugin_data()

    arguments = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "anything"}],
    }
    ada = _data(
        _invoke(
            client,
            "edufish.quiz.submit",
            arguments,
            request_id="shared-request",
        )
    )
    bob = _data(
        _invoke(
            client,
            "edufish.quiz.submit",
            arguments,
            request_id="shared-request",
            user_id="student-bob",
            role="student",
        )
    )

    assert ada["submission_id"] != bob["submission_id"]
    with app.app_context():
        assert ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).count() == 1
        assert ProgressEvent.query.filter_by(
            student_id="student-bob", event_type="answered_quiz"
        ).count() == 1


def test_quiz_submit_repeated_answers_are_not_reported_as_mastery(client, app):
    with app.app_context():
        _seed_plugin_data()

    arguments = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "correct-ish"}],
    }
    _invoke(client, "edufish.quiz.submit", arguments, request_id="repeat-1")
    _invoke(client, "edufish.quiz.submit", arguments, request_id="repeat-2")

    progress = _data(
        _invoke(client, "edufish.progress.read", {"course_id": "ai-intro"})
    )
    assert progress["event_counts"]["answered_quiz"] == 2
    assert len(progress["quiz_submissions"]) == 2
    assert "mastery" not in json.dumps(progress).lower()


def test_quiz_submit_rejects_duplicate_and_invisible_quiz_ids(client, app):
    with app.app_context():
        _seed_plugin_data()

    duplicate = _invoke(
        client,
        "edufish.quiz.submit",
        {
            "course_id": "ai-intro",
            "chapter_id": "ai-search",
            "answers": [
                {"quiz_id": "quiz-ai-search-1", "answer": "a"},
                {"quiz_id": "quiz-ai-search-1", "answer": "b"},
            ],
        },
        request_id="duplicate-quiz",
    )
    invisible = _invoke(
        client,
        "edufish.quiz.submit",
        {
            "course_id": "ai-intro",
            "chapter_id": "ai-search",
            "answers": [{"quiz_id": "quiz-bob-private", "answer": "bob"}],
        },
        request_id="invisible-quiz",
    )

    assert duplicate.status_code == 400
    assert _error_code(duplicate) == "INVALID_ARGUMENT"
    assert invisible.status_code == 400
    assert _error_code(invisible) == "INVALID_ARGUMENT"
    with app.app_context():
        assert ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).count() == 0


def test_quiz_submit_rejects_quiz_from_another_chapter(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client,
        "edufish.quiz.submit",
        {
            "course_id": "ai-intro",
            "chapter_id": "ai-learning",
            "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "anything"}],
        },
        request_id="wrong-chapter",
    )

    assert response.status_code == 400
    assert _error_code(response) == "INVALID_ARGUMENT"


# ── Progress privacy ─────────────────────────────────────────────────────────


def test_progress_read_only_returns_current_user_and_course(client, app):
    with app.app_context():
        _seed_plugin_data()
        ProgressService.record(
            student_id="student-ada",
            event_type="viewed",
            course_id="ai-intro",
            chapter_id="ai-search",
        )
        ProgressService.record(
            student_id="student-ada",
            event_type="viewed",
            course_id="brain-cog-intro",
            chapter_id="brain-attention",
        )
        ProgressService.record(
            student_id="student-bob",
            event_type="viewed",
            course_id="ai-intro",
            chapter_id="ai-search",
        )

    data = _data(
        _invoke(client, "edufish.progress.read", {"course_id": "ai-intro"})
    )

    assert data["student_id"] == "student-ada"
    assert data["event_counts"] == {"viewed": 1}
    assert data["quiz_submissions"] == []


def test_progress_read_hides_draft_course_from_students(client, app):
    with app.app_context():
        _seed_plugin_data()

    response = _invoke(
        client, "edufish.progress.read", {"course_id": "draft-course"}
    )

    assert response.status_code == 404
    assert _error_code(response) == "NOT_FOUND"


# ── Experiments ─────────────────────────────────────────────────────────────


def test_lab_start_and_status_flow(client, app):
    with app.app_context():
        _seed_plugin_data()

    data = _data(
        _invoke(
            client,
            "edufish.lab.start",
            {
                "course_id": "ai-intro",
                "template_id": "exp-neuron-spike",
                "params": {
                    "stimulus": {"stimulus_current": 8, "duration_ms": 120}
                },
            },
            request_id="lab-1",
        )
    )
    run = data["run"]
    assert run["status"] == "completed"
    assert run["student_id"] == "student-ada"
    assert run["course_id"] == "ai-intro"
    assert run["id"].startswith("run-")
    assert run["job_id"].startswith("job-")

    status = _data(
        _invoke(
            client,
            "edufish.lab.status",
            {"course_id": "ai-intro", "run_id": run["id"]},
        )
    )
    assert status["run"]["id"] == run["id"]

    with app.app_context():
        assert ExperimentRun.query.filter_by(student_id="student-ada").count() == 1
        assert ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="ran_lab"
        ).count() == 1


def test_lab_start_replays_without_duplicate_run_or_event(client, app):
    with app.app_context():
        _seed_plugin_data()

    arguments = {
        "course_id": "ai-intro",
        "template_id": "exp-neuron-spike",
        "params": {"stimulus": {"stimulus_current": 8, "duration_ms": 120}},
    }
    first = _data(
        _invoke(client, "edufish.lab.start", arguments, request_id="lab-replay")
    )
    second = _data(
        _invoke(client, "edufish.lab.start", arguments, request_id="lab-replay")
    )

    assert first["run"]["id"] == second["run"]["id"]
    with app.app_context():
        assert ExperimentRun.query.filter_by(student_id="student-ada").count() == 1
        assert ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="ran_lab"
        ).count() == 1


def test_lab_start_rejects_conflict_invalid_params_and_unpublished_template(
    client, app
):
    with app.app_context():
        _seed_plugin_data()
        db.session.merge(
            ExperimentTemplate(
                id="exp-draft-template",
                title="Draft Lab",
                experiment_type="neuron_simulation",
                adapter="neuron_simulator",
                status="draft",
            )
        )
        db.session.commit()

    arguments = {
        "course_id": "ai-intro",
        "template_id": "exp-neuron-spike",
        "params": {"stimulus": {"stimulus_current": 8, "duration_ms": 120}},
    }
    first = _invoke(client, "edufish.lab.start", arguments, request_id="lab-conflict")
    conflict = _invoke(
        client,
        "edufish.lab.start",
        {
            "course_id": "ai-intro",
            "template_id": "exp-neuron-spike",
            "params": {"stimulus": {"stimulus_current": 12, "duration_ms": 120}},
        },
        request_id="lab-conflict",
    )
    invalid_params = _invoke(
        client,
        "edufish.lab.start",
        {
            "course_id": "ai-intro",
            "template_id": "exp-neuron-spike",
            "params": {"stimulus": {"stimulus_current": 99, "duration_ms": 120}},
        },
        request_id="lab-invalid-params",
    )
    missing_template = _invoke(
        client,
        "edufish.lab.start",
        {"course_id": "ai-intro", "template_id": "exp-missing"},
        request_id="lab-missing",
    )
    draft_template = _invoke(
        client,
        "edufish.lab.start",
        {"course_id": "ai-intro", "template_id": "exp-draft-template"},
        request_id="lab-draft",
    )

    assert first.status_code == 200
    assert conflict.status_code == 409
    assert _error_code(conflict) == "IDEMPOTENCY_CONFLICT"
    assert invalid_params.status_code == 400
    assert _error_code(invalid_params) == "INVALID_ARGUMENT"
    assert missing_template.status_code == 404
    assert _error_code(missing_template) == "NOT_FOUND"
    assert draft_template.status_code == 404
    assert _error_code(draft_template) == "NOT_FOUND"

    with app.app_context():
        assert ExperimentRun.query.count() == 1


def test_lab_start_rejects_identity_argument_and_oversized_params(client, app):
    with app.app_context():
        _seed_plugin_data()

    spoofed = _invoke(
        client,
        "edufish.lab.start",
        {
            "course_id": "ai-intro",
            "template_id": "exp-neuron-spike",
            "student_id": "student-bob",
        },
        request_id="lab-spoofed",
    )
    oversized = _invoke(
        client,
        "edufish.lab.start",
        {
            "course_id": "ai-intro",
            "template_id": "exp-neuron-spike",
            "params": {"blob": "x" * 20000},
        },
        request_id="lab-oversized",
    )

    assert spoofed.status_code == 400
    assert _error_code(spoofed) == "INVALID_ARGUMENT"
    assert oversized.status_code == 400
    assert _error_code(oversized) == "INVALID_ARGUMENT"
    with app.app_context():
        assert ExperimentRun.query.count() == 0


def test_lab_status_enforces_current_user_ownership_and_course(client, app):
    with app.app_context():
        _seed_plugin_data()

    run = _data(
        _invoke(
            client,
            "edufish.lab.start",
            {
                "course_id": "ai-intro",
                "template_id": "exp-neuron-spike",
                "params": {"stimulus": {"stimulus_current": 8, "duration_ms": 120}},
            },
            request_id="lab-owner",
        )
    )["run"]

    own = _invoke(
        client,
        "edufish.lab.status",
        {"course_id": "ai-intro", "run_id": run["id"]},
    )
    other_user = _invoke(
        client,
        "edufish.lab.status",
        {"course_id": "ai-intro", "run_id": run["id"]},
        user_id="student-bob",
        role="student",
    )
    other_course = _invoke(
        client,
        "edufish.lab.status",
        {"course_id": "brain-cog-intro", "run_id": run["id"]},
    )
    staff = _invoke(
        client,
        "edufish.lab.status",
        {"course_id": "ai-intro", "run_id": run["id"]},
        user_id="teacher-tess",
        role="teacher",
    )
    missing = _invoke(
        client,
        "edufish.lab.status",
        {"course_id": "ai-intro", "run_id": "run-missing"},
    )

    assert own.status_code == 200
    for response in (other_user, other_course, staff, missing):
        assert response.status_code == 404
        assert _error_code(response) == "NOT_FOUND"


def test_lab_status_scrubs_local_paths(client, app):
    with app.app_context():
        _seed_plugin_data()
        ExperimentService.ensure_default_templates()
        run = ExperimentRun(
            id="run-scrub-test",
            template_id="exp-neuron-spike",
            student_id="student-ada",
            course_id="ai-intro",
            status="completed",
            adapter="neuron_simulator",
            params_json=json.dumps(
                {
                    "stimulus": {"stimulus_current": 8, "duration_ms": 120},
                    "path": "/home/ada/secret-params.json",
                }
            ),
            summary_json="{}",
        )
        db.session.add(run)
        db.session.add(
            ExperimentArtifact(
                id="artifact-scrub-test",
                run_id=run.id,
                artifact_type="signal_summary",
                title="Scrub test",
                data_json=json.dumps(
                    {
                        "path": "C:\\secret\\file.h5",
                        "file_path": "/home/ada/data.bin",
                        "note": "kept",
                        "nested": {
                            "storage_path": "/var/lib/app/x",
                            "value": "C:\\tmp\\y",
                        },
                        "url": "https://example.com/page",
                        "traceback": (
                            'Traceback (most recent call last):\n'
                            '  File "/app/worker.py", line 42, in run'
                        ),
                    }
                ),
            )
        )
        db.session.commit()

    data = _data(
        _invoke(
            client,
            "edufish.lab.status",
            {"course_id": "ai-intro", "run_id": "run-scrub-test"},
        )
    )
    run = data["run"]
    artifact_data = run["artifacts"][0]["data"]

    assert "path" not in run["params"]
    assert "path" not in artifact_data
    assert "file_path" not in artifact_data
    assert artifact_data["note"] == "kept"
    assert "storage_path" not in artifact_data["nested"]
    assert artifact_data["url"] == "https://example.com/page"
    assert artifact_data["traceback"] == "[redacted]"

    body = json.dumps(data)
    for secret in (
        "/home/ada/secret-params.json",
        "C:\\\\secret\\\\file.h5",
        "/home/ada/data.bin",
        "/var/lib/app/x",
        "C:\\\\tmp\\\\y",
        "Traceback (most recent call last)",
        'File "/app/worker.py", line 42',
    ):
        assert secret not in body
    assert "kept" in body


# ── Validation & body bounds ────────────────────────────────────────────────


def test_validation_bounds(client, app):
    with app.app_context():
        _seed_plugin_data()

    cases = [
        ("edufish.course.read", {"course_id": "x" * 201}),
        (
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "x" * 2001},
        ),
        (
            "edufish.quiz.submit",
            {
                "course_id": "ai-intro",
                "chapter_id": "ai-search",
                "answers": [
                    {"quiz_id": "quiz-ai-search-1", "answer": "x" * 4001}
                ],
            },
        ),
        (
            "edufish.quiz.submit",
            {
                "course_id": "ai-intro",
                "chapter_id": "ai-search",
                "answers": [
                    {"quiz_id": "quiz-ai-search-1", "answer": "x"},
                    {"quiz_id": "quiz-ai-search-1", "answer": "y"},
                ],
            },
        ),
    ]
    for operation, arguments in cases:
        response = _invoke(
            client, operation, arguments, request_id="validation-case"
        )
        assert response.status_code == 400, operation
        assert _error_code(response) == "INVALID_ARGUMENT"

    long_request_id = _invoke(
        client,
        "edufish.course.read",
        {"course_id": "ai-intro"},
        request_id="x" * 201,
    )
    assert long_request_id.status_code == 400
    assert _error_code(long_request_id) == "INVALID_ARGUMENT"


def test_optional_fields_reject_explicit_null(client, app):
    with app.app_context():
        _seed_plugin_data()

    for operation, arguments in (
        (
            "edufish.material.search",
            {"course_id": "ai-intro", "query": "neural", "limit": None},
        ),
        (
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "depth": None},
        ),
        (
            "edufish.graph.neighborhood",
            {"course_id": "ai-intro", "concept_id": None},
        ),
    ):
        response = _invoke(client, operation, arguments)
        assert response.status_code == 400, operation
        assert _error_code(response) == "INVALID_ARGUMENT"

    null_request_id = client.post(
        "/api/v1/plugin/invoke",
        json={
            "operation": "edufish.course.read",
            "arguments": {"course_id": "ai-intro"},
            "request_id": None,
        },
        headers=_bearer(),
    )
    assert null_request_id.status_code == 400
    assert _error_code(null_request_id) == "INVALID_ARGUMENT"


def test_invoke_rejects_non_object_arguments_and_malformed_json(client, app):
    with app.app_context():
        _seed_plugin_data()

    non_object = client.post(
        "/api/v1/plugin/invoke",
        json={"operation": "edufish.course.read", "arguments": []},
        headers=_bearer(),
    )
    malformed = client.post(
        "/api/v1/plugin/invoke",
        data="{",
        content_type="application/json",
        headers=_bearer(),
    )

    assert non_object.status_code == 400
    assert _error_code(non_object) == "INVALID_ARGUMENT"
    assert malformed.status_code == 400
    assert _error_code(malformed) == "INVALID_ARGUMENT"


def test_invoke_enforces_body_size_bound(client, app):
    with app.app_context():
        _seed_plugin_data()
    app.config["PLUGIN_MAX_BODY_BYTES"] = 64 * 1024

    oversized = json.dumps(
        {
            "operation": "edufish.course.read",
            "arguments": {"course_id": "ai-intro"},
            "padding": "x" * (70 * 1024),
        }
    )
    response = client.post(
        "/api/v1/plugin/invoke",
        data=oversized,
        content_type="application/json",
        headers=_bearer(),
    )

    assert response.status_code == 413
    assert _error_code(response) == "INVALID_ARGUMENT"


# ── Durable idempotency across application restarts ─────────────────────────


def test_quiz_submit_idempotency_survives_app_restart(tmp_path):
    database_path = tmp_path / "plugin-restart.sqlite"
    config = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_path.as_posix()}",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "RUNTIME_CONFIG_PATH": str(tmp_path / "runtime_config.json"),
        "PLUGIN_ALLOWED_COURSE_IDS": "",
        "MULTI_TENANT_ENABLED": False,
    }

    arguments = {
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
        "answers": [{"quiz_id": "quiz-ai-search-1", "answer": "anything"}],
    }

    first_app = create_app(config)
    with first_app.app_context():
        db.drop_all()
        db.create_all()
        _seed_plugin_data()
    first_client = first_app.test_client()
    first = _data(
        _invoke(
            first_client,
            "edufish.quiz.submit",
            arguments,
            request_id="restart-request",
        )
    )
    with first_app.app_context():
        db.session.remove()
        db.engine.dispose()

    second_app = create_app(config)
    second_client = second_app.test_client()
    second = _data(
        _invoke(
            second_client,
            "edufish.quiz.submit",
            arguments,
            request_id="restart-request",
        )
    )

    assert first["submission_id"] == second["submission_id"]
    with second_app.app_context():
        assert ProgressEvent.query.filter_by(
            student_id="student-ada", event_type="answered_quiz"
        ).count() == 1
        assert PluginIdempotencyRecord.query.count() == 1
