"""Pydantic data models for EDUFISH SDK."""

from __future__ import annotations

from typing import Any


class DatasetMeta:
    """Metadata for a dataset."""

    def __init__(self, name: str = "", description: str = "", source: str = ""):
        self.name = name
        self.description = description
        self.source = source

    def to_dict(self) -> dict:
        return {"name": self.name, "description": self.description, "source": self.source}


class EduDataset:
    """Raw education dataset keyed by domain."""

    def __init__(self, data: dict[str, Any] | None = None):
        self.data = data or {}

    def to_dict(self) -> dict:
        return {"dataset": self.data}


class CreateDatasetRequest:
    """Request to create a persisted dataset."""

    def __init__(
        self,
        dataset: dict[str, Any] | None = None,
        dataset_meta: DatasetMeta | None = None,
        dataset_name: str = "",
    ):
        self.dataset = dataset or {}
        self.dataset_meta = dataset_meta or DatasetMeta()
        self.dataset_name = dataset_name

    def to_dict(self) -> dict:
        return {
            "dataset": self.dataset,
            "dataset_meta": self.dataset_meta.to_dict(),
            "dataset_name": self.dataset_name,
        }


class EduDatasetResponse:
    """Response from dataset CRUD endpoints."""

    def __init__(self, raw: dict[str, Any]):
        self.id = raw.get("id", "")
        self.name = raw.get("name", "")
        self.status = raw.get("status", "")
        self.created_at = raw.get("created_at", "")
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class AnalysisPreviewRequest:
    """Request for a synchronous analysis preview."""

    def __init__(
        self,
        dataset: dict[str, Any] | None = None,
        dataset_meta: DatasetMeta | None = None,
        template_id: str = "course-quality",
        audience_role: str = "school_admin",
        department_name: str = "",
        teacher_id: str = "",
        teacher_name: str = "",
    ):
        self.dataset = dataset or {}
        self.dataset_meta = dataset_meta or DatasetMeta()
        self.template_id = template_id
        self.audience_role = audience_role
        self.department_name = department_name
        self.teacher_id = teacher_id
        self.teacher_name = teacher_name

    def to_dict(self) -> dict:
        return {
            "dataset": self.dataset,
            "dataset_meta": self.dataset_meta.to_dict(),
            "template_id": self.template_id,
            "audience_role": self.audience_role,
            "scope": {
                "department_name": self.department_name,
                "teacher_id": self.teacher_id,
                "teacher_name": self.teacher_name,
            },
        }


class AnalysisRunRequest:
    """Request to enqueue an async analysis job."""

    def __init__(
        self,
        dataset_id: str,
        template_id: str = "course-quality",
        audience_role: str = "school_admin",
        department_name: str = "",
        teacher_id: str = "",
        teacher_name: str = "",
    ):
        self.dataset_id = dataset_id
        self.template_id = template_id
        self.audience_role = audience_role
        self.department_name = department_name
        self.teacher_id = teacher_id
        self.teacher_name = teacher_name

    def to_dict(self) -> dict:
        return {
            "dataset_id": self.dataset_id,
            "template_id": self.template_id,
            "audience_role": self.audience_role,
            "scope": {
                "department_name": self.department_name,
                "teacher_id": self.teacher_id,
                "teacher_name": self.teacher_name,
            },
        }


class AnalysisResult:
    """Completed analysis result."""

    def __init__(self, raw: dict[str, Any]):
        self.id = raw.get("analysis_id", raw.get("id", ""))
        self.status = raw.get("status", "")
        self.summary = raw.get("summary", "")
        self.metrics = raw.get("metrics", {})
        self.insights = raw.get("insights", [])
        self.scope = raw.get("scope", {})
        self.created_at = raw.get("created_at", "")
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class AnalysisStatus:
    """Async analysis job status."""

    def __init__(self, raw: dict[str, Any]):
        self.job_id = raw.get("id", raw.get("job_id", ""))
        self.status = raw.get("status", "")
        self.target_id = raw.get("target_id", "")
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class KnowledgeGraph:
    """Evidence knowledge graph."""

    def __init__(self, raw: dict[str, Any]):
        self.nodes = raw.get("nodes", [])
        self.edges = raw.get("edges", raw.get("links", []))
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class PredictionResult:
    """Intervention prediction result."""

    def __init__(self, raw: dict[str, Any]):
        self.scenarios = raw.get("scenarios", [])
        self.recommendations = raw.get("recommendations", [])
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class ReportResponse:
    """Analysis report."""

    def __init__(self, raw: dict[str, Any]):
        self.id = raw.get("report_id", raw.get("id", ""))
        self.status = raw.get("status", "")
        self.html = raw.get("html", "")
        self.created_at = raw.get("created_at", "")
        self._raw = raw

    def to_dict(self) -> dict:
        return self._raw


class CollectAnalyzeRequest:
    """Request to collect real platform data and run analysis."""

    def __init__(
        self,
        course_id: str | None = None,
        time_range_days: int = 30,
        audience_role: str = "school_admin",
    ):
        self.course_id = course_id
        self.time_range_days = time_range_days
        self.audience_role = audience_role

    def to_dict(self) -> dict:
        return {
            "course_id": self.course_id,
            "time_range_days": self.time_range_days,
            "audience_role": self.audience_role,
        }
