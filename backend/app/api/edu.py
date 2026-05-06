"""EduFish education-quality analysis API."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from flask import Response, current_app, jsonify, request

from app.api import api_bp
from app.db import db
from app.models import EduAnalysis, EduDataset, EduReport
from app.services.edu_analysis import EduAnalysisService
from app.services.edu_connectors import EducationDataIngestionService
from app.services.edu_prediction import EduPredictionService
from app.services.edu_report_export import EduReportExportService
from app.services.edu_report import EduReportService
from app.services.edu_storage import EduStorageService
from app.services.edu_templates import list_templates, normalize_template
from app.services.job_queue import get_queue


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


@api_bp.post("/edu/datasets")
def create_edufish_dataset():
    try:
        payload = request.get_json(silent=True) or {}
        dataset_meta = payload.get("dataset_meta") or {}
        normalized = _normalize_payload(payload)
        dataset = EduStorageService.create_dataset(
            dataset_meta=dataset_meta,
            normalized_payload=normalized,
            name=payload.get("dataset_name") or dataset_meta.get("name"),
        )
        return jsonify({"success": True, "data": EduStorageService.serialize_dataset(dataset)}), 201
    except Exception as exc:
        return _error(str(exc), 400)


@api_bp.get("/edu/datasets")
def list_edufish_datasets():
    limit = int(request.args.get("limit", 20))
    datasets = EduDataset.query.order_by(EduDataset.created_at.desc()).limit(limit).all()
    return jsonify({
        "success": True,
        "data": {
            "datasets": [EduStorageService.serialize_dataset(item, include_preview=False) for item in datasets],
            "count": len(datasets),
        },
    })


@api_bp.get("/edu/datasets/<dataset_id>")
def get_edufish_dataset(dataset_id):
    dataset = db.session.get(EduDataset, dataset_id)
    if dataset is None:
        return _error(f"dataset not found: {dataset_id}", 404)
    return jsonify({"success": True, "data": EduStorageService.serialize_dataset(dataset)})


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


@api_bp.post("/edu/analysis/run")
def run_edufish_analysis():
    try:
        payload = request.get_json(silent=True) or {}
        dataset_id = payload.get("dataset_id")
        if not dataset_id:
            return _error("dataset_id is required", 400)

        dataset = db.session.get(EduDataset, dataset_id)
        if dataset is None:
            return _error(f"dataset not found: {dataset_id}", 404)

        template = normalize_template(payload.get("custom_template"), payload.get("template_id") or "course-quality")
        audience_role = payload.get("audience_role") or "school_admin"
        scope = payload.get("scope") or {
            "department_name": payload.get("department_name", ""),
            "teacher_id": payload.get("teacher_id", ""),
            "teacher_name": payload.get("teacher_name", ""),
        }

        analysis = EduStorageService.create_analysis(
            dataset_id=dataset.id,
            template_id=template["id"],
            audience_role=audience_role,
            scope=scope,
        )
        report = EduStorageService.create_report(
            analysis_id=analysis.id,
            dataset_id=dataset.id,
            template_id=template["id"],
        )

        queue = get_queue()
        job = queue.enqueue(
            current_app._get_current_object(),
            "edu_analysis",
            target_id=analysis.id,
            payload={
                "dataset_id": dataset.id,
                "analysis_id": analysis.id,
                "report_id": report.id,
                "custom_template": payload.get("custom_template"),
            },
        )

        return jsonify({
            "success": True,
            "data": {
                "job_id": job.id,
                "analysis_id": analysis.id,
                "report_id": report.id,
                "status": "queued",
            },
        }), 202
    except Exception as exc:
        return _error(str(exc), 400)


@api_bp.get("/edu/analysis/status/<job_id>")
def get_edufish_analysis_status(job_id):
    job = get_queue().get(job_id)
    if job is None:
        return _error(f"job not found: {job_id}", 404)
    return jsonify({"success": True, "data": get_queue().serialize(job)})


@api_bp.get("/edu/analysis")
def list_edufish_analyses():
    limit = int(request.args.get("limit", 20))
    analyses = EduAnalysis.query.order_by(EduAnalysis.created_at.desc()).limit(limit).all()
    return jsonify({
        "success": True,
        "data": {
            "analyses": [EduStorageService.serialize_analysis(item) for item in analyses],
            "count": len(analyses),
        },
    })


@api_bp.get("/edu/analysis/latest")
def get_latest_edufish_analysis():
    course_id = request.args.get("course_id", "").strip()
    if not course_id:
        return _error("course_id is required", 400)

    analyses = EduAnalysis.query.order_by(EduAnalysis.updated_at.desc()).all()
    for analysis in analyses:
        serialized = EduStorageService.serialize_analysis(analysis)
        if serialized["status"] != "completed":
            continue
        if (serialized.get("scope") or {}).get("course_id") != course_id:
            continue
        return jsonify({
            "success": True,
            "data": {
                "analysis_id": serialized["analysis_id"],
                "report_id": serialized["report_id"],
                "status": serialized["status"],
                "scope": serialized["scope"],
                "summary": serialized["summary"],
            },
        })

    return _error(f"completed analysis not found for course: {course_id}", 404)


@api_bp.get("/edu/analysis/<analysis_id>")
def get_edufish_analysis(analysis_id):
    analysis = db.session.get(EduAnalysis, analysis_id)
    if analysis is None:
        return _error(f"analysis not found: {analysis_id}", 404)
    return jsonify({"success": True, "data": EduStorageService.serialize_analysis(analysis)})


@api_bp.get("/edu/analysis/<analysis_id>/graph")
def get_edufish_analysis_graph(analysis_id):
    analysis = db.session.get(EduAnalysis, analysis_id)
    if analysis is None:
        return _error(f"analysis not found: {analysis_id}", 404)
    graph = EduStorageService.analysis_graph(analysis)
    if not graph:
        return _error(f"graph not found for analysis: {analysis_id}", 404)
    return jsonify({"success": True, "data": graph})


@api_bp.get("/edu/analysis/<analysis_id>/prediction")
def get_edufish_analysis_prediction(analysis_id):
    analysis = db.session.get(EduAnalysis, analysis_id)
    if analysis is None:
        return _error(f"analysis not found: {analysis_id}", 404)
    serialized = EduStorageService.serialize_analysis(analysis)
    if serialized["status"] != "completed":
        return _error(f"analysis is not completed: {analysis_id}", 409)
    prediction = EduPredictionService().build(serialized)
    return jsonify({"success": True, "data": prediction})


@api_bp.get("/edu/reports/<report_id>")
def get_edufish_report(report_id):
    report = db.session.get(EduReport, report_id)
    if report is None:
        return _error(f"report not found: {report_id}", 404)
    return jsonify({"success": True, "data": EduStorageService.serialize_report(report)})


@api_bp.get("/edu/reports/<report_id>/preview")
def preview_edufish_report(report_id):
    report = db.session.get(EduReport, report_id)
    if report is None:
        return _error(f"report not found: {report_id}", 404)
    html = EduReportExportService().render_preview_html(EduStorageService.serialize_report(report))
    return Response(html, mimetype="text/html")


@api_bp.get("/edu/reports/<report_id>/pdf")
def export_edufish_report_pdf(report_id):
    report = db.session.get(EduReport, report_id)
    if report is None:
        return _error(f"report not found: {report_id}", 404)
    pdf = EduReportExportService().render_pdf(EduStorageService.serialize_report(report))
    disposition = "attachment" if request.args.get("download") == "1" else "inline"
    filename = f"{report_id}.pdf"
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# ── Global-awareness Agent endpoints ────────────────────────────────────────


@api_bp.post("/edu/collect-and-analyze")
def collect_and_analyze():
    """Trigger the global-awareness agent: collect real student data → analyze.

    This is the single entry point that replaces the hardcoded demo data flow.
    It calls the same analysis pipeline but feeds it real platform data.
    """
    try:
        payload = request.get_json(silent=True) or {}
        course_id = payload.get("course_id")
        time_range_days = int(payload.get("time_range_days", 30))
        audience_role = payload.get("audience_role", "school_admin")

        from app.agents.tools.edu_collector_tools import collect_edu_data, trigger_edu_analysis

        # Step 1: Collect real data
        collection_result = collect_edu_data(
            course_id=course_id,
            time_range_days=time_range_days,
        )

        if collection_result["status"] != "collected":
            return _error("Data collection failed", 500)

        summary = collection_result["summary"]
        if summary["students"] == 0 and summary["grade_records"] == 0:
            return jsonify({
                "success": True,
                "data": {
                    "status": "no_data",
                    "message": "没有找到学生学习数据。请确认学生端已有作业提交或学习记录。",
                    "summary": summary,
                },
            })

        # Step 2: Trigger analysis
        analysis_result = trigger_edu_analysis(
            collected_payload=collection_result["payload"],
            audience_role=audience_role,
        )

        return jsonify({
            "success": True,
            "data": {
                "status": "queued",
                "collection_summary": summary,
                **analysis_result,
            },
        }), 202
    except Exception as exc:
        return _error(str(exc), 500)


@api_bp.get("/edu/collect-preview")
def collect_preview():
    """Dry-run: show what data the collector agent would gather, without triggering analysis."""
    try:
        course_id = request.args.get("course_id")
        time_range_days = int(request.args.get("time_range_days", 30))

        from app.agents.tools.edu_collector_tools import collect_edu_data

        result = collect_edu_data(
            course_id=course_id,
            time_range_days=time_range_days,
        )

        return jsonify({
            "success": True,
            "data": {
                "summary": result["summary"],
                "sample_preview": {
                    key: result["payload"]["dataset"].get(key, [])[:3]
                    for key in ("courses", "students", "feedback", "grades", "attendance")
                },
            },
        })
    except Exception as exc:
        return _error(str(exc), 500)
