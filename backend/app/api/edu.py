"""EduFish education-quality analysis API."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from flask import jsonify, request

from app.api import api_bp
from app.services.edu_analysis import EduAnalysisService
from app.services.edu_connectors import EducationDataIngestionService
from app.services.edu_report import EduReportService
from app.services.edu_templates import list_templates, normalize_template


def _error(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_payload(payload: dict):
    raw_dataset = payload.get("dataset") or {}
    if not isinstance(raw_dataset, dict):
        raise ValueError("dataset must be an object keyed by education domains")
    return EducationDataIngestionService().normalize_domains(raw_dataset)


@api_bp.get("/edu/templates")
def list_edufish_templates():
    return jsonify({"success": True, "data": {"templates": list_templates()}})


@api_bp.post("/edu/datasets/normalize")
def normalize_edufish_dataset():
    try:
        payload = request.get_json(silent=True) or {}
        normalized = _normalize_payload(payload)
        return jsonify({"success": True, "data": normalized})
    except Exception as exc:
        return _error(str(exc), 400)


@api_bp.post("/edu/analysis/preview")
def preview_edufish_analysis():
    """Run a synchronous EduFish analysis for imported school data.

    This endpoint is intentionally stateless for the first verticalization pass.
    The current app already has a Job table; a later pass can wrap this same
    service call in an async persisted workflow without changing the analysis
    contract returned here.
    """

    try:
        payload = request.get_json(silent=True) or {}
        dataset_meta = payload.get("dataset_meta") or {}
        normalized = _normalize_payload(payload)
        dataset = normalized["normalized_data"]
        template = normalize_template(payload.get("custom_template"), payload.get("template_id") or "course-quality")
        audience_role = payload.get("audience_role") or "school_admin"
        scope = payload.get("scope") or {
            "department_name": payload.get("department_name", ""),
            "teacher_id": payload.get("teacher_id", ""),
            "teacher_name": payload.get("teacher_name", ""),
        }

        analysis_result = EduAnalysisService().analyze(
            dataset_meta=dataset_meta,
            dataset=dataset,
            audience_role=audience_role,
            scope=scope,
        )
        analysis = {
            "analysis_id": f"edu_an_{uuid4().hex[:12]}",
            "status": "completed",
            "template_id": template["id"],
            "audience_role": audience_role,
            "scope": scope,
            "created_at": _now_iso(),
            "summary": analysis_result["summary"],
            "metrics": analysis_result["metrics"],
            "insights": analysis_result["insights"],
        }
        report = EduReportService().build_report(
            dataset_meta=dataset_meta,
            analysis_meta=analysis,
            analysis_result=analysis_result,
            template=template,
        )
        report = {
            "report_id": f"edu_rp_{uuid4().hex[:12]}",
            "status": "completed",
            "template_id": template["id"],
            "created_at": _now_iso(),
            **report,
        }
        return jsonify({
            "success": True,
            "data": {
                "normalized_dataset": normalized,
                "analysis": analysis,
                "report": report,
                "graph": analysis_result["graph"],
                "graph_summary": analysis_result["graph_summary"],
            },
        })
    except Exception as exc:
        return _error(str(exc), 400)
