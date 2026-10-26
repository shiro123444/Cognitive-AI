"""Immutable manifest for the independent EduFish plugin (protocol v1)."""

from __future__ import annotations

import copy
from typing import Final

PLUGIN_ID: Final[str] = "edufish"
PLUGIN_VERSION: Final[str] = "0.1.0"
PROTOCOL_VERSION: Final[int] = 1

_ID_SCHEMA: Final[dict] = {
    "type": "string",
    "minLength": 1,
    "maxLength": 200,
}

_LIMIT_20: Final[dict] = {"type": "integer", "minimum": 1, "maximum": 20}
_LIMIT_100: Final[dict] = {"type": "integer", "minimum": 1, "maximum": 100}
_DEPTH: Final[dict] = {"type": "integer", "minimum": 1, "maximum": 2}
_QUERY: Final[dict] = {"type": "string", "minLength": 1, "maxLength": 2000}
_ANSWER: Final[dict] = {"type": "string", "maxLength": 4000}
_PARAMS: Final[dict] = {"type": "object"}

_COURSE_ARG = {"course_id": _ID_SCHEMA}


def _schema(properties: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


_OPERATIONS: Final[tuple[dict, ...]] = (
    {
        "name": "edufish.course.read",
        "description": "Read a visible course and its ordered chapters. Chapter bodies are not returned.",
        "input_schema": _schema(dict(_COURSE_ARG), ["course_id"]),
        "mutates": False,
    },
    {
        "name": "edufish.material.search",
        "description": (
            "Deterministic keyword search over stored material chunks visible to the "
            "authenticated user. Retrieval method is keyword matching, not vector search."
        ),
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "query": _QUERY,
                "limit": _LIMIT_20,
            },
            ["course_id", "query"],
        ),
        "mutates": False,
    },
    {
        "name": "edufish.graph.neighborhood",
        "description": (
            "Bounded expansion of the visible published concept graph for a course. "
            "Edges are only returned when both endpoints are returned visible nodes."
        ),
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "concept_id": _ID_SCHEMA,
                "depth": _DEPTH,
                "limit": _LIMIT_100,
            },
            ["course_id"],
        ),
        "mutates": False,
    },
    {
        "name": "edufish.quiz.read",
        "description": (
            "List visible quiz prompts for a chapter. Answers and explanations are "
            "never returned by this read operation."
        ),
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "chapter_id": _ID_SCHEMA,
                "limit": _LIMIT_20,
            },
            ["course_id", "chapter_id"],
        ),
        "mutates": False,
    },
    {
        "name": "edufish.quiz.submit",
        "description": (
            "Submit up to 20 answers for a chapter. Answers are compared by a "
            "deterministic normalized exact match (Unicode NFKC, case folding, and "
            "whitespace collapsing). Requires an envelope request_id for durable "
            "idempotent replay. Records an answered_quiz progress event."
        ),
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "chapter_id": _ID_SCHEMA,
                "answers": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 20,
                    "items": {
                        "type": "object",
                        "properties": {
                            "quiz_id": _ID_SCHEMA,
                            "answer": _ANSWER,
                        },
                        "required": ["quiz_id", "answer"],
                        "additionalProperties": False,
                    },
                },
            },
            ["course_id", "chapter_id", "answers"],
        ),
        "mutates": True,
    },
    {
        "name": "edufish.progress.read",
        "description": "Read the authenticated user's own course-scoped progress events and quiz submissions.",
        "input_schema": _schema(dict(_COURSE_ARG), ["course_id"]),
        "mutates": False,
    },
    {
        "name": "edufish.lab.start",
        "description": (
            "Start a published experiment template as the authenticated user. "
            "Requires an envelope request_id; repeats with the same arguments replay "
            "the original run without enqueueing duplicate work."
        ),
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "template_id": _ID_SCHEMA,
                "params": _PARAMS,
            },
            ["course_id", "template_id"],
        ),
        "mutates": True,
    },
    {
        "name": "edufish.lab.status",
        "description": "Read one experiment run owned by the authenticated user in the requested course.",
        "input_schema": _schema(
            {
                "course_id": _ID_SCHEMA,
                "run_id": _ID_SCHEMA,
            },
            ["course_id", "run_id"],
        ),
        "mutates": False,
    },
)

OPERATION_NAMES: Final[frozenset[str]] = frozenset(op["name"] for op in _OPERATIONS)
MUTATING_OPERATIONS: Final[frozenset[str]] = frozenset(
    op["name"] for op in _OPERATIONS if op["mutates"]
)


def build_manifest() -> dict:
    """Return a fresh, caller-owned copy of the immutable manifest."""
    return {
        "id": PLUGIN_ID,
        "version": PLUGIN_VERSION,
        "protocol_version": PROTOCOL_VERSION,
        "operations": copy.deepcopy(list(_OPERATIONS)),
    }
