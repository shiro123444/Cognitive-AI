"""Dev-only fixture backend for the independent EduFish plugin example.

This module deliberately does **not** implement the plugin wire protocol.  It
builds a temporary Flask app around the *production* ``app.api.api_bp``
blueprint (which includes ``/api/v1/plugin/manifest`` and
``/api/v1/plugin/invoke``) and the production ``app.plugin`` service, SQL
models, visibility rules and idempotency store.

Only fixture concerns live here:

* deterministic seed data (users, course/chapter, chunks, graph, quizzes,
  experiment templates),
* a loopback-only dev token handshake,
* health and graceful-shutdown endpoints,
* a temporary SQLite database / instance / upload directory.

It must never be deployed or pointed at real data.
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path
from typing import Any

from flask import Blueprint, Flask, current_app, jsonify, request

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_DIR = _REPO_ROOT / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# Importing ``app.api`` also imports ``app.api.plugin``, which in turn imports
# ``app.plugin.models``.  That registration must happen before ``db.create_all``.
from app.api import api_bp  # noqa: E402
from app.api.errors import register_error_handlers  # noqa: E402
from app.auth import register_auth  # noqa: E402
from app.db import db  # noqa: E402
from app.jwt_utils import create_access_token  # noqa: E402
from app.models import (  # noqa: E402
    Chapter,
    Chunk,
    Concept,
    Course,
    GraphEdge,
    Material,
    QuizItem,
    User,
)
from app.plugin import models as _plugin_models  # noqa: E402,F401
from app.services.experiment_service import ExperimentService  # noqa: E402
from app.tenant import register_tenant_middleware  # noqa: E402

# ---------------------------------------------------------------------------
# Fixture identities and grants
# ---------------------------------------------------------------------------

_COURSE_ID = "course-fixture-published"
_DRAFT_COURSE_ID = "course-fixture-draft"
_CHAPTER_SEARCH = "chapter-fixture-search"
_CHAPTER_LAB = "chapter-fixture-lab"
_STUDENT_ID = "fixture-student"
_OTHER_STUDENT_ID = "fixture-other-student"
_TEACHER_ID = "fixture-teacher"
_UNLISTED_ID = "fixture-unlisted"
_RUNTIME_ID = "fixture-runtime"

# The default fixture exercises the optional allowlist: missing users fail
# closed, and students are not granted the draft course.
DEFAULT_FIXTURE_GRANTS: dict[str, list[str]] = {
    _STUDENT_ID: [_COURSE_ID],
    _OTHER_STUDENT_ID: [_COURSE_ID],
    _TEACHER_ID: [_COURSE_ID, _DRAFT_COURSE_ID],
    "fixture-admin": [_COURSE_ID, _DRAFT_COURSE_ID],
}

_LOOPBACK_ADDRESSES = frozenset({"127.0.0.1", "::1", "::ffff:127.0.0.1"})

fixture_bp = Blueprint("fixture_dev", __name__)


# ---------------------------------------------------------------------------
# Dev-only handshake / lifecycle routes
# ---------------------------------------------------------------------------


def _is_loopback(address: str | None) -> bool:
    return address in _LOOPBACK_ADDRESSES


def _handshake_ok() -> bool:
    expected = str(current_app.config.get("FIXTURE_HANDSHAKE_SECRET") or "")
    provided = request.headers.get("X-Fixture-Handshake", "")
    return bool(expected and provided and secrets.compare_digest(provided, expected))


@fixture_bp.get("/health")
def health():
    return jsonify({"status": "ok", "fixture": True})


@fixture_bp.get("/__fixture__/token")
def fixture_token():
    """Dev-only handshake: mint a short-lived token for a seeded user.

    This is the only place the fixture emits a token.  It is loopback-only,
    requires the per-run handshake secret and sets ``Cache-Control: no-store``.
    The fixture server never logs request/response bodies or tokens.
    """
    if not _is_loopback(request.remote_addr) or not _handshake_ok():
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Not found."}}), 404

    user_id = (request.args.get("user_id") or "").strip()
    user = db.session.get(User, user_id) if user_id else None
    if user is None:
        return jsonify(
            {"success": False, "error": {"code": "NOT_FOUND", "message": "Unknown fixture user."}}
        ), 404

    token = create_access_token(user.id, user.role, ttl_hours=1)
    response = jsonify(
        {
            "success": True,
            "data": {
                "token": token,
                "user": {"id": user.id, "role": user.role},
                "expires_in": 3600,
            },
        }
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return response


@fixture_bp.post("/__fixture__/shutdown")
def fixture_shutdown():
    if not _is_loopback(request.remote_addr) or not _handshake_ok():
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Not found."}}), 404
    callback = current_app.config.get("FIXTURE_SHUTDOWN_CALLBACK")
    if not callable(callback):
        return jsonify(
            {
                "success": False,
                "error": {"code": "UNAVAILABLE", "message": "Shutdown is not available."},
            }
        ), 503
    callback()
    return jsonify({"success": True, "data": {"stopping": True}})


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _ensure_user(user_id: str, name: str, role: str) -> None:
    if db.session.get(User, user_id) is None:
        db.session.add(User(id=user_id, name=name, email=f"{user_id}@fixture.invalid", role=role))


def _ensure_course(course_id: str, title: str, summary: str, status: str) -> None:
    if db.session.get(Course, course_id) is None:
        db.session.add(Course(id=course_id, title=title, summary=summary, status=status))


def _ensure_chapter(
    chapter_id: str, course_id: str, order: int, title: str, objectives: str, body: str
) -> None:
    if db.session.get(Chapter, chapter_id) is None:
        db.session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                order=order,
                title=title,
                objectives=objectives,
                body=body,
            )
        )


def _ensure_concept(
    concept_id: str,
    course_id: str,
    label: str,
    definition: str,
    *,
    status: str = "published",
    scope_type: str = "course_global",
    owner_id: str = "",
) -> None:
    if db.session.get(Concept, concept_id) is None:
        db.session.add(
            Concept(
                id=concept_id,
                course_id=course_id,
                label=label,
                definition=definition,
                status=status,
                scope_type=scope_type,
                owner_id=owner_id,
            )
        )


def _ensure_material(
    material_id: str,
    course_id: str,
    filename: str,
    *,
    scope_type: str = "course_global",
    owner_id: str = "",
) -> None:
    if db.session.get(Material, material_id) is None:
        db.session.add(
            Material(
                id=material_id,
                course_id=course_id,
                filename=filename,
                path=f"fixture/{filename}",
                parser_status="chunked",
                chunk_count=0,
                extraction_method="fixture",
                scope_type=scope_type,
                owner_id=owner_id,
            )
        )


def _ensure_chunk(
    chunk_id: str,
    material_id: str,
    text: str,
    *,
    page_number: int = 1,
    citation_locator: str = "",
    heading: str | None = None,
) -> None:
    if db.session.get(Chunk, chunk_id) is None:
        db.session.add(
            Chunk(
                id=chunk_id,
                material_id=material_id,
                text=text,
                page_number=page_number,
                citation_locator=citation_locator,
                heading=heading,
            )
        )


def _ensure_edge(
    edge_id: str,
    course_id: str,
    source_id: str,
    target_id: str,
    relationship: str,
    evidence: str,
    *,
    status: str = "published",
    scope_type: str = "course_global",
    owner_id: str = "",
) -> None:
    if db.session.get(GraphEdge, edge_id) is None:
        db.session.add(
            GraphEdge(
                id=edge_id,
                course_id=course_id,
                source_id=source_id,
                target_id=target_id,
                relationship=relationship,
                evidence=evidence,
                status=status,
                scope_type=scope_type,
                owner_id=owner_id,
            )
        )


def _ensure_quiz(
    quiz_id: str,
    chapter_id: str,
    prompt: str,
    answer: str,
    explanation: str,
    *,
    material_id: str | None = None,
) -> None:
    if db.session.get(QuizItem, quiz_id) is None:
        db.session.add(
            QuizItem(
                id=quiz_id,
                chapter_id=chapter_id,
                material_id=material_id,
                prompt=prompt,
                answer=answer,
                explanation=explanation,
            )
        )


def seed_fixture_data() -> None:
    """Idempotently seed deterministic users, course data, graph and quizzes."""
    _ensure_user(_STUDENT_ID, "Fixture Student", "student")
    _ensure_user(_OTHER_STUDENT_ID, "Other Fixture Student", "student")
    _ensure_user(_TEACHER_ID, "Fixture Teacher", "teacher")
    _ensure_user("fixture-admin", "Fixture Admin", "admin")
    _ensure_user(_UNLISTED_ID, "Unlisted Fixture Student", "student")
    _ensure_user(_RUNTIME_ID, "Fixture Runtime Service", "runtime")

    _ensure_course(
        _COURSE_ID,
        "Plugin Fixture Course",
        "Deterministic course seeded for the independent plugin example.",
        "published",
    )
    _ensure_course(
        _DRAFT_COURSE_ID,
        "Plugin Fixture Draft Course",
        "Draft course visible only to teachers/admins.",
        "draft",
    )

    _ensure_chapter(
        _CHAPTER_SEARCH,
        _COURSE_ID,
        1,
        "Heuristic Search",
        "Explain how heuristics guide search.",
        "Heuristics rank frontier states so promising paths are explored first.",
    )
    _ensure_chapter(
        _CHAPTER_LAB,
        _COURSE_ID,
        2,
        "Neural Simulation Lab",
        "Run a small LIF neuron simulation.",
        "A leaky integrate-and-fire neuron turns current into spikes.",
    )
    _ensure_chapter(
        "chapter-fixture-draft",
        _DRAFT_COURSE_ID,
        1,
        "Draft Chapter",
        "Teacher-only draft content.",
        "Draft body.",
    )

    _ensure_concept(
        "concept-fixture-heuristic",
        _COURSE_ID,
        "Heuristic Search",
        "A strategy that uses estimates to decide which states to explore first.",
    )
    _ensure_concept(
        "concept-fixture-astar",
        _COURSE_ID,
        "A* Search",
        "A best-first search combining path cost with a heuristic estimate.",
    )
    _ensure_concept(
        "concept-fixture-frontier",
        _COURSE_ID,
        "Search Frontier",
        "The collection of states waiting to be expanded.",
    )
    _ensure_concept(
        "concept-neural-networks",
        _COURSE_ID,
        "Neural Networks",
        "Interconnected units that learn layered representations.",
    )
    _ensure_concept(
        "concept-fixture-personal",
        _COURSE_ID,
        "My Study Note",
        "A personal concept owned by the fixture student.",
        scope_type="student_personal",
        owner_id=_STUDENT_ID,
    )
    _ensure_concept(
        "concept-fixture-other-personal",
        _COURSE_ID,
        "Other Student Note",
        "Personal material belonging to another student.",
        scope_type="student_personal",
        owner_id=_OTHER_STUDENT_ID,
    )
    _ensure_concept(
        "concept-fixture-draft",
        _COURSE_ID,
        "Draft Concept",
        "Unpublished concept that must not be returned.",
        status="draft",
    )
    _ensure_concept(
        "concept-fixture-draft-course",
        _DRAFT_COURSE_ID,
        "Draft Course Concept",
        "A published concept inside a draft course.",
    )

    _ensure_material("material-fixture-reading", _COURSE_ID, "heuristic-search.md")
    _ensure_material("material-fixture-lab", _COURSE_ID, "neuron-lab.md")
    _ensure_material(
        "material-fixture-personal",
        _COURSE_ID,
        "student-private-note.md",
        scope_type="student_personal",
        owner_id=_STUDENT_ID,
    )
    _ensure_material(
        "material-fixture-other-personal",
        _COURSE_ID,
        "other-student-private-note.md",
        scope_type="student_personal",
        owner_id=_OTHER_STUDENT_ID,
    )
    _ensure_material(
        "material-fixture-draft-course",
        _DRAFT_COURSE_ID,
        "draft-course-notes.md",
    )

    _ensure_chunk(
        "chunk-fixture-heuristic-1",
        "material-fixture-reading",
        "A heuristic estimates which states are more promising during search. "
        "It guides the order in which the frontier is explored without "
        "guaranteeing optimality.",
        page_number=3,
        citation_locator="p.3 §1.2",
        heading="Heuristics",
    )
    _ensure_chunk(
        "chunk-fixture-heuristic-2",
        "material-fixture-reading",
        "A* combines the path cost g(n) with a heuristic estimate h(n). When h is "
        "admissible, A* is guaranteed to find an optimal path.",
        page_number=4,
        citation_locator="p.4 §2.1",
        heading="A* Search",
    )
    _ensure_chunk(
        "chunk-fixture-lab-1",
        "material-fixture-lab",
        "A leaky integrate-and-fire neuron charges its membrane potential until it "
        "crosses threshold and emits a spike, then resets.",
        page_number=1,
        citation_locator="p.1 §1",
        heading="LIF Neuron",
    )
    _ensure_chunk(
        "chunk-fixture-personal-1",
        "material-fixture-personal",
        "Private note from the fixture student: my heuristic checklist for the exam.",
        page_number=1,
        citation_locator="note:1",
        heading="My Notes",
    )
    _ensure_chunk(
        "chunk-fixture-other-personal-1",
        "material-fixture-other-personal",
        "Another student's private note: secret study plan that must never be returned.",
        page_number=1,
        citation_locator="note:1",
        heading="Other Notes",
    )
    _ensure_chunk(
        "chunk-fixture-draft-1",
        "material-fixture-draft-course",
        "Draft lecture text about beam search; only teachers should see this.",
        page_number=1,
        citation_locator="draft:1",
        heading="Beam Search",
    )

    _ensure_edge(
        "edge-fixture-heuristic-astar",
        _COURSE_ID,
        "concept-fixture-heuristic",
        "concept-fixture-astar",
        "PREREQUISITE_OF",
        "Understanding heuristic estimates helps explain A* search.",
    )
    _ensure_edge(
        "edge-fixture-heuristic-frontier",
        _COURSE_ID,
        "concept-fixture-heuristic",
        "concept-fixture-frontier",
        "RELATED_TO",
        "Heuristics rank states inside the search frontier.",
    )
    _ensure_edge(
        "edge-fixture-personal-heuristic",
        _COURSE_ID,
        "concept-fixture-personal",
        "concept-fixture-heuristic",
        "RELATED_TO",
        "Personal study note linked to heuristic search.",
        scope_type="student_personal",
        owner_id=_STUDENT_ID,
    )
    _ensure_edge(
        "edge-fixture-other-personal",
        _COURSE_ID,
        "concept-fixture-other-personal",
        "concept-fixture-heuristic",
        "RELATED_TO",
        "Another student's personal link that must stay hidden.",
        scope_type="student_personal",
        owner_id=_OTHER_STUDENT_ID,
    )
    _ensure_edge(
        "edge-fixture-draft-target",
        _COURSE_ID,
        "concept-fixture-heuristic",
        "concept-fixture-draft",
        "RELATED_TO",
        "Edge pointing at an unpublished concept must be hidden.",
    )
    _ensure_edge(
        "edge-fixture-draft-course",
        _DRAFT_COURSE_ID,
        "concept-fixture-draft-course",
        "concept-fixture-draft-course",
        "RELATED_TO",
        "Self edge in a draft course.",
    )

    _ensure_quiz(
        "quiz-fixture-heuristic",
        _CHAPTER_SEARCH,
        "What is the role of a heuristic in search?",
        "It estimates which states are more promising.",
        "A heuristic guides search without guaranteeing optimality.",
        material_id="material-fixture-reading",
    )
    _ensure_quiz(
        "quiz-fixture-astar",
        _CHAPTER_SEARCH,
        "What does A* combine?",
        "A* combines path cost and a heuristic estimate.",
        "A* adds g(n) and h(n).",
        material_id="material-fixture-reading",
    )
    _ensure_quiz(
        "quiz-fixture-personal",
        _CHAPTER_SEARCH,
        "What is in the student's private checklist?",
        "A heuristic checklist.",
        "Personal quiz attached to the student's own material.",
        material_id="material-fixture-personal",
    )
    _ensure_quiz(
        "quiz-fixture-hidden",
        _CHAPTER_SEARCH,
        "What is the other student's secret?",
        "A hidden answer owned by another student.",
        "This quiz must never be visible to fixture-student.",
        material_id="material-fixture-other-personal",
    )
    _ensure_quiz(
        "quiz-fixture-draft-course",
        "chapter-fixture-draft",
        "Draft-only question?",
        "Draft answer.",
        "Only teachers can read this chapter.",
        material_id="material-fixture-draft-course",
    )

    db.session.commit()
    # Real experiment templates used by edufish.lab.start.
    ExperimentService.ensure_default_templates(commit=True)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_fixture_app(
    temp_dir: str | Path,
    *,
    handshake_secret: str,
    allowed_courses: dict[str, list[str]] | None = None,
    use_default_grants: bool = True,
    jwt_secret: str | None = None,
    seed: bool = True,
):
    """Build an isolated Flask app that exposes the production plugin routes."""
    temp_path = Path(temp_dir).resolve()
    (temp_path / "instance").mkdir(parents=True, exist_ok=True)
    (temp_path / "uploads").mkdir(parents=True, exist_ok=True)
    (temp_path / "data").mkdir(parents=True, exist_ok=True)
    db_path = (temp_path / "data" / "fixture.sqlite").as_posix()

    if use_default_grants:
        grants: Any = DEFAULT_FIXTURE_GRANTS
    elif allowed_courses is None:
        # Explicitly disable the allowlist instead of falling through to the
        # process environment.
        grants = ""
    else:
        grants = allowed_courses

    app = Flask(
        "edufish_plugin_fixture",
        instance_path=str(temp_path / "instance"),
    )
    app.config.update(
        {
            "TESTING": True,
            "SECRET_KEY": secrets.token_urlsafe(32),
            "JWT_SECRET": jwt_secret or secrets.token_urlsafe(48),
            "JWT_TTL_HOURS": 1,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "UPLOAD_DIR": str(temp_path / "uploads"),
            "ENGINE_API_KEY": "",
            "MULTI_TENANT_ENABLED": False,
            "PLUGIN_ALLOWED_COURSE_IDS": grants,
            "PLUGIN_MAX_BODY_BYTES": 64 * 1024,
            "FIXTURE_HANDSHAKE_SECRET": handshake_secret,
            "FIXTURE_TEMP_DIR": str(temp_path),
        }
    )

    db.init_app(app)
    register_auth(app)
    register_tenant_middleware(app)
    register_error_handlers(app)

    # Production plugin wire API, plus the fixture-only lifecycle routes.
    app.register_blueprint(api_bp)
    app.register_blueprint(fixture_bp)

    with app.app_context():
        # ``app.api.plugin`` imported ``app.plugin.models`` above, so the
        # production idempotency table is part of this schema.
        db.create_all()
        if seed:
            seed_fixture_data()

    return app
