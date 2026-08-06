"""Pydantic request-validation models for EDUFISH API endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


# ── Shared primitives ──────────────────────────────────────────────────────────


class CourseScope(BaseModel):
    department_name: str = ""
    teacher_id: str = ""
    teacher_name: str = ""
    course_id: str = ""


# ── Dataset ────────────────────────────────────────────────────────────────────


class DatasetMeta(BaseModel):
    name: str = ""
    description: str = ""
    source: str = ""


class NormalizeRequest(BaseModel):
    dataset: dict[str, Any] = Field(default_factory=dict)


class CreateDatasetRequest(BaseModel):
    dataset: dict[str, Any] = Field(default_factory=dict)
    dataset_meta: DatasetMeta = Field(default_factory=DatasetMeta)
    dataset_name: str = ""

    @model_validator(mode="after")
    def _ensure_name(self):
        if not self.dataset_name and not self.dataset_meta.name:
            self.dataset_name = "Untitled Dataset"
        return self


# ── Analysis ───────────────────────────────────────────────────────────────────


class AnalysisPreviewRequest(BaseModel):
    dataset: dict[str, Any] = Field(default_factory=dict)
    dataset_meta: DatasetMeta = Field(default_factory=DatasetMeta)
    template_id: str = "course-quality"
    custom_template: dict[str, Any] | None = None
    audience_role: str = "school_admin"
    scope: CourseScope = Field(default_factory=CourseScope)
    department_name: str = ""
    teacher_id: str = ""
    teacher_name: str = ""


class AnalysisRunRequest(BaseModel):
    dataset_id: str
    template_id: str = "course-quality"
    custom_template: dict[str, Any] | None = None
    audience_role: str = "school_admin"
    scope: CourseScope = Field(default_factory=CourseScope)
    department_name: str = ""
    teacher_id: str = ""
    teacher_name: str = ""
    webhook_url: str | None = None


# ── Collect & Analyze ──────────────────────────────────────────────────────────


class CollectAnalyzeRequest(BaseModel):
    course_id: str | None = None
    time_range_days: int = Field(default=30, ge=1, le=365)
    audience_role: str = "school_admin"


# ── Validator helpers ──────────────────────────────────────────────────────────


def validate_or_422(model_cls, data: dict) -> dict:
    """Return validated data dict or abort with 422 + field details."""
    from flask import abort

    try:
        return model_cls(**data).model_dump()
    except Exception as exc:
        abort(422, description=str(exc))
