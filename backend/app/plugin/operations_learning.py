"""Learning operations: quiz read/submit and per-user progress."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter

from sqlalchemy.exc import IntegrityError

from app.db import db
from app.models import Chapter, Material, ProgressEvent, QuizItem
from app.services.progress_service import ProgressService

from .errors import invalid, not_found
from .idempotency import (
    find_record,
    mark_completed,
    new_reservation,
    replay_or_conflict,
    request_hash,
)
from .visibility import (
    PluginUser,
    get_visible_course,
    material_is_visible,
)


def _chapter_for_course(course, chapter_id: str) -> Chapter:
    chapter = db.session.get(Chapter, chapter_id)
    if chapter is None:
        raise not_found("chapter not found")
    if chapter.course_id != course.id:
        raise invalid("chapter does not belong to the requested course")
    return chapter


def _visible_quiz_items(user: PluginUser, course, chapter: Chapter) -> list[QuizItem]:
    """Return quiz items whose chapter *and* optional material are visible.

    A quiz attached to another user's personal material is treated as
    invisible rather than as an error, matching the material/graph rules.
    """
    items = (
        QuizItem.query.filter_by(chapter_id=chapter.id)
        .order_by(QuizItem.id.asc())
        .all()
    )
    material_ids = {item.material_id for item in items if item.material_id}
    materials = {}
    if material_ids:
        materials = {
            material.id: material
            for material in Material.query.filter(Material.id.in_(sorted(material_ids))).all()
        }

    visible: list[QuizItem] = []
    for item in items:
        if item.material_id:
            material = materials.get(item.material_id)
            if material is None:
                continue
            if material.course_id != course.id:
                continue
            if not material_is_visible(material, user.id):
                continue
        visible.append(item)
    return visible


def _normalize_answer(value: str) -> str:
    """Deterministic comparison: NFKC, case folding, whitespace collapsing.

    This intentionally does not try to judge semantic equivalence: punctuation,
    word order, and synonyms remain significant.
    """
    normalized = unicodedata.normalize("NFKC", value).strip().casefold()
    return re.sub(r"\s+", " ", normalized)


def _feedback(item: QuizItem, correct: bool) -> str:
    prefix = "Correct." if correct else "Incorrect."
    explanation = (item.explanation or "").strip()
    if explanation:
        return f"{prefix} {explanation[:500]}"
    return prefix


def quiz_read(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])
    chapter = _chapter_for_course(course, args["chapter_id"])
    visible = _visible_quiz_items(user, course, chapter)[: args["limit"]]
    return {
        "items": [{"id": item.id, "prompt": item.prompt} for item in visible]
    }


def quiz_submit(user: PluginUser, args: dict, request_id: str) -> dict:
    course = get_visible_course(user, args["course_id"])
    chapter = _chapter_for_course(course, args["chapter_id"])

    operation = "edufish.quiz.submit"
    digest = request_hash(args)
    existing = find_record(user.id, operation, request_id)
    if existing is not None:
        return replay_or_conflict(existing, digest)

    visible_by_id = {
        item.id: item for item in _visible_quiz_items(user, course, chapter)
    }
    for answer in args["answers"]:
        if answer["quiz_id"] not in visible_by_id:
            raise invalid(
                "quiz_id does not belong to the requested chapter or is not visible"
            )

    results: list[dict] = []
    score = 0
    for answer in args["answers"]:
        item = visible_by_id[answer["quiz_id"]]
        correct = _normalize_answer(answer["answer"]) == _normalize_answer(item.answer)
        if correct:
            score += 1
        results.append(
            {
                "quiz_id": item.id,
                "correct": bool(correct),
                "feedback": _feedback(item, correct),
            }
        )

    total = len(args["answers"])
    # The progress event and the idempotency record commit together so a
    # client retry can never observe one without the other.
    event = ProgressService.record(
        student_id=user.id,
        event_type="answered_quiz",
        course_id=course.id,
        chapter_id=chapter.id,
        payload={
            "score": score,
            "total": total,
            "quiz_ids": [answer["quiz_id"] for answer in args["answers"]],
        },
        commit=False,
    )
    submission_id = event.id
    event.payload_json = json.dumps(
        {
            "submission_id": submission_id,
            "score": score,
            "total": total,
            "quiz_ids": [answer["quiz_id"] for answer in args["answers"]],
        },
        ensure_ascii=False,
    )

    response = {
        "submission_id": submission_id,
        "score": score,
        "total": total,
        "results": results,
    }

    record = new_reservation(user.id, operation, request_id, digest)
    mark_completed(record, response)
    db.session.add(record)
    try:
        db.session.commit()
    except IntegrityError:
        # A concurrent request won the reservation.  Discard our progress
        # event and replay the winner's stored response.
        db.session.rollback()
        winner = find_record(user.id, operation, request_id)
        if winner is None:
            raise
        return replay_or_conflict(winner, digest)

    return response


def _json_object(raw: str) -> dict:
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _safe_int(value, default: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        return default
    return value


def progress_read(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])
    events = (
        ProgressEvent.query.filter_by(student_id=user.id, course_id=course.id)
        .order_by(ProgressEvent.created_at.asc(), ProgressEvent.id.asc())
        .all()
    )

    event_counts = dict(Counter(event.event_type for event in events))
    quiz_submissions = []
    for event in events:
        if event.event_type != "answered_quiz":
            continue
        payload = _json_object(event.payload_json)
        submission_id = payload.get("submission_id") or event.id
        quiz_submissions.append(
            {
                "submission_id": str(submission_id),
                "chapter_id": event.chapter_id,
                "score": _safe_int(payload.get("score")),
                "total": _safe_int(payload.get("total")),
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
        )

    return {
        "course_id": course.id,
        "student_id": user.id,
        "event_counts": event_counts,
        "quiz_submissions": quiz_submissions,
    }
