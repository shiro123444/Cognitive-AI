"""Strict, bounded argument validation for the EduFish plugin protocol.

Every operation rejects unknown keys.  Validation is deliberately hand-written
rather than schema-library driven so that error messages stay stable and no
coercion (for example, accepting ``True`` as an integer) can slip through.
"""

from __future__ import annotations

import json
from typing import Callable

from .errors import invalid

MAX_ID_LENGTH = 200
MAX_QUERY_LENGTH = 2000
MAX_ANSWER_LENGTH = 4000
MAX_REQUEST_ID_LENGTH = 200
MAX_PARAMS_BYTES = 16 * 1024
MAX_PARAMS_DEPTH = 8
DEFAULT_MAX_BODY_BYTES = 64 * 1024
MAX_MATERIAL_CONTENT_CHARS = 1200
MAX_MATERIAL_CANDIDATES = 2000
MAX_GRAPH_EDGES = 500


def _reject_unknown(mapping: dict, allowed: set[str], label: str) -> None:
    unexpected = sorted(key for key in mapping if key not in allowed)
    if unexpected:
        shown = ", ".join(str(key)[:80] for key in unexpected[:5])
        raise invalid(f"{label} contains unexpected key(s): {shown}")


def _require_object(value, label: str) -> dict:
    if not isinstance(value, dict):
        raise invalid(f"{label} must be an object")
    return value


def _clean_key_list(mapping: dict, allowed: set[str], label: str) -> dict:
    obj = _require_object(mapping, label)
    _reject_unknown(obj, allowed, label)
    return obj


def require_id(value, field: str) -> str:
    if not isinstance(value, str):
        raise invalid(f"{field} must be a string")
    if not value.strip():
        raise invalid(f"{field} must not be empty")
    if len(value) > MAX_ID_LENGTH:
        raise invalid(f"{field} must be at most {MAX_ID_LENGTH} characters")
    if any(ord(char) < 32 for char in value):
        raise invalid(f"{field} contains invalid control characters")
    return value


def require_query(value) -> str:
    if not isinstance(value, str):
        raise invalid("query must be a string")
    if len(value) > MAX_QUERY_LENGTH:
        raise invalid(f"query must be at most {MAX_QUERY_LENGTH} characters")
    cleaned = value.strip()
    if not cleaned:
        raise invalid("query must not be empty")
    return cleaned


def require_answer(value, field: str) -> str:
    if not isinstance(value, str):
        raise invalid(f"{field} must be a string")
    if len(value) > MAX_ANSWER_LENGTH:
        raise invalid(f"{field} must be at most {MAX_ANSWER_LENGTH} characters")
    return value


def optional_int(value, field: str, minimum: int, maximum: int) -> int:
    # bool is a subclass of int; never accept it as a numeric argument.
    if isinstance(value, bool) or not isinstance(value, int):
        raise invalid(f"{field} must be an integer")
    if value < minimum or value > maximum:
        raise invalid(f"{field} must be between {minimum} and {maximum}")
    return value


def optional_int_field(obj: dict, field: str, minimum: int, maximum: int, default: int) -> int:
    """Distinguish an absent optional field from an explicit JSON null."""
    if field not in obj:
        return default
    return optional_int(obj[field], field, minimum, maximum)


def _json_depth(value, depth: int = 0) -> int:
    if depth > MAX_PARAMS_DEPTH:
        raise invalid(f"params nesting must be at most {MAX_PARAMS_DEPTH} levels")
    if isinstance(value, dict):
        return max((_json_depth(item, depth + 1) for item in value.values()), default=depth)
    if isinstance(value, list):
        return max((_json_depth(item, depth + 1) for item in value), default=depth)
    return depth


def validate_params(value) -> dict:
    params = _require_object(value, "params")
    _json_depth(params)
    try:
        encoded = json.dumps(
            params,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError):
        raise invalid("params must be JSON serializable") from None
    if len(encoded.encode("utf-8")) > MAX_PARAMS_BYTES:
        raise invalid(f"params must be at most {MAX_PARAMS_BYTES} bytes")
    return params


def validate_request_id(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise invalid("request_id must be a string")
    if not value.strip():
        raise invalid("request_id must not be empty")
    if len(value) > MAX_REQUEST_ID_LENGTH:
        raise invalid(f"request_id must be at most {MAX_REQUEST_ID_LENGTH} characters")
    return value


def validate_course_read(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id"}, "arguments")
    if "course_id" not in obj:
        raise invalid("course_id is required")
    return {"course_id": require_id(obj["course_id"], "course_id")}


def validate_material_search(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id", "query", "limit"}, "arguments")
    for key in ("course_id", "query"):
        if key not in obj:
            raise invalid(f"{key} is required")
    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "query": require_query(obj["query"]),
        "limit": optional_int_field(obj, "limit", 1, 20, 20),
    }


def validate_graph_neighborhood(arguments) -> dict:
    obj = _clean_key_list(
        arguments, {"course_id", "concept_id", "depth", "limit"}, "arguments"
    )
    if "course_id" not in obj:
        raise invalid("course_id is required")
    concept_id = None
    if "concept_id" in obj:
        concept_id = require_id(obj["concept_id"], "concept_id")
    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "concept_id": concept_id,
        "depth": optional_int_field(obj, "depth", 1, 2, 1),
        "limit": optional_int_field(obj, "limit", 1, 100, 50),
    }


def validate_quiz_read(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id", "chapter_id", "limit"}, "arguments")
    for key in ("course_id", "chapter_id"):
        if key not in obj:
            raise invalid(f"{key} is required")
    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "chapter_id": require_id(obj["chapter_id"], "chapter_id"),
        "limit": optional_int_field(obj, "limit", 1, 20, 20),
    }


def validate_quiz_submit(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id", "chapter_id", "answers"}, "arguments")
    for key in ("course_id", "chapter_id", "answers"):
        if key not in obj:
            raise invalid(f"{key} is required")

    raw_answers = obj["answers"]
    if not isinstance(raw_answers, list):
        raise invalid("answers must be an array")
    if not 1 <= len(raw_answers) <= 20:
        raise invalid("answers must contain between 1 and 20 items")

    answers: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, raw_answer in enumerate(raw_answers):
        entry = _clean_key_list(raw_answer, {"quiz_id", "answer"}, f"answers[{index}]")
        if "quiz_id" not in entry or "answer" not in entry:
            raise invalid(f"answers[{index}] requires quiz_id and answer")
        quiz_id = require_id(entry["quiz_id"], f"answers[{index}].quiz_id")
        if quiz_id in seen:
            raise invalid(f"answers contains duplicate quiz_id: {quiz_id}")
        seen.add(quiz_id)
        answers.append(
            {
                "quiz_id": quiz_id,
                "answer": require_answer(entry["answer"], f"answers[{index}].answer"),
            }
        )

    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "chapter_id": require_id(obj["chapter_id"], "chapter_id"),
        "answers": answers,
    }


def validate_progress_read(arguments) -> dict:
    return validate_course_read(arguments)


def validate_lab_start(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id", "template_id", "params"}, "arguments")
    for key in ("course_id", "template_id"):
        if key not in obj:
            raise invalid(f"{key} is required")
    params = obj.get("params", {})
    if params is None:
        # ``params`` is optional; an explicit null is not an object.
        raise invalid("params must be an object")
    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "template_id": require_id(obj["template_id"], "template_id"),
        "params": validate_params(params),
    }


def validate_lab_status(arguments) -> dict:
    obj = _clean_key_list(arguments, {"course_id", "run_id"}, "arguments")
    for key in ("course_id", "run_id"):
        if key not in obj:
            raise invalid(f"{key} is required")
    return {
        "course_id": require_id(obj["course_id"], "course_id"),
        "run_id": require_id(obj["run_id"], "run_id"),
    }


VALIDATORS: dict[str, Callable[[dict], dict]] = {
    "edufish.course.read": validate_course_read,
    "edufish.material.search": validate_material_search,
    "edufish.graph.neighborhood": validate_graph_neighborhood,
    "edufish.quiz.read": validate_quiz_read,
    "edufish.quiz.submit": validate_quiz_submit,
    "edufish.progress.read": validate_progress_read,
    "edufish.lab.start": validate_lab_start,
    "edufish.lab.status": validate_lab_status,
}


def max_body_bytes(configured) -> int:
    """Resolve the route body bound, clamped to a sane range."""
    try:
        value = int(configured)
    except (TypeError, ValueError):
        return DEFAULT_MAX_BODY_BYTES
    return max(1024, min(value, 1024 * 1024))
