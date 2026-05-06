"""EduFish report template registry."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


BUILTIN_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "course-quality",
        "name": "Course Quality Review",
        "description": "Course performance, feedback quality, and improvement priorities.",
        "sections": [
            {"title": "Executive Summary", "focus": "executive_summary"},
            {"title": "Course Quality Signals", "focus": "course_quality"},
            {"title": "Student Feedback Themes", "focus": "student_feedback"},
            {"title": "Action Plan", "focus": "action_plan"},
        ],
    },
    {
        "id": "teacher-evaluation",
        "name": "Teacher Evaluation Review",
        "description": "Teacher-level teaching outcomes, comparison, and support recommendations.",
        "sections": [
            {"title": "Leadership Snapshot", "focus": "executive_summary"},
            {"title": "Teacher Performance", "focus": "teacher_performance"},
            {"title": "Course Delivery Risks", "focus": "course_quality"},
            {"title": "Support Recommendations", "focus": "action_plan"},
        ],
    },
    {
        "id": "student-feedback",
        "name": "Student Feedback Digest",
        "description": "Student sentiment, recurring themes, and evidence-backed recommendations.",
        "sections": [
            {"title": "Headline Findings", "focus": "executive_summary"},
            {"title": "Voice of Students", "focus": "student_feedback"},
            {"title": "Operational Hotspots", "focus": "risk_governance"},
            {"title": "Recommended Actions", "focus": "action_plan"},
        ],
    },
    {
        "id": "semester-governance",
        "name": "Semester Governance Report",
        "description": "Cross-course quality governance, department trends, and teaching risks.",
        "sections": [
            {"title": "Executive Summary", "focus": "executive_summary"},
            {"title": "Teaching Quality Overview", "focus": "course_quality"},
            {"title": "Faculty and Delivery", "focus": "teacher_performance"},
            {"title": "Governance Risks", "focus": "risk_governance"},
            {"title": "Action Plan", "focus": "action_plan"},
        ],
    },
]


def list_templates() -> list[dict[str, Any]]:
    return deepcopy(BUILTIN_TEMPLATES)


def get_template(template_id: str) -> dict[str, Any] | None:
    for template in BUILTIN_TEMPLATES:
        if template["id"] == template_id:
            return deepcopy(template)
    return None


def normalize_template(template_payload: dict[str, Any] | None, fallback_template_id: str) -> dict[str, Any]:
    if template_payload:
        sections = template_payload.get("sections") or []
        if not sections:
            raise ValueError("Custom template requires at least one section.")
        normalized_sections = []
        for section in sections:
            title = (section.get("title") or "").strip()
            focus = (section.get("focus") or "executive_summary").strip()
            if not title:
                raise ValueError("Each template section requires a title.")
            normalized_sections.append({
                "title": title,
                "focus": focus,
                "instructions": (section.get("instructions") or "").strip(),
            })
        return {
            "id": template_payload.get("id") or "custom-template",
            "name": template_payload.get("name") or "Custom EduFish Template",
            "description": template_payload.get("description") or "User-defined report template.",
            "sections": normalized_sections,
        }

    template = get_template(fallback_template_id)
    if not template:
        raise ValueError(f"Unknown template_id: {fallback_template_id}")
    return template
