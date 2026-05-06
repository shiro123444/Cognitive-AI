import json

from flask import Response, jsonify, request, stream_with_context

from app.api import api_bp
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses
from app.services.tutor_service import TutorService


def _optional_string(body, key):
    value = body.get(key)
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    return value


@api_bp.post("/tutor/ask")
def ask_tutor():
    body = request.get_json(silent=True) or {}
    question = body.get("question", "") if isinstance(body, dict) else ""
    if not isinstance(question, str) or not question.strip():
        return jsonify({"success": False, "error": "question is required"}), 400
    try:
        course_id = _optional_string(body, "course_id")
        chapter_id = _optional_string(body, "chapter_id")
        concept_id = _optional_string(body, "concept_id")
        user_id = _optional_string(body, "user_id")
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    if not CourseService.list_courses():
        seed_courses()

    if course_id and CourseService.get_course(course_id) is None:
        return jsonify({"success": False, "error": "course_id not found"}), 400

    # Streaming mode
    if request.args.get("stream"):
        def generate():
            for event in TutorService.answer_stream(
                question,
                course_id=course_id,
                chapter_id=chapter_id,
                concept_id=concept_id,
                user_id=user_id or "",
            ):
                yield event

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming mode
    result = TutorService.answer(
        question,
        course_id=course_id,
        chapter_id=chapter_id,
        concept_id=concept_id,
        user_id=user_id or "",
    )
    return jsonify({"success": True, "data": result})
