"""Persistence helpers for EduFish datasets, analyses, and reports."""

from __future__ import annotations

import json
from uuid import uuid4

from flask import g

from app.db import db
from app.models import EduAnalysis, EduDataset, EduReport, utc_now


def _loads(value: str, fallback):
    try:
        return json.loads(value or "")
    except json.JSONDecodeError:
        return fallback


def _dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


class EduStorageService:
    @staticmethod
    def create_dataset(dataset_meta: dict, normalized_payload: dict, name: str | None = None) -> EduDataset:
        dataset = EduDataset(
            id=f"edu_ds_{uuid4().hex[:12]}",
            name=name or dataset_meta.get("name") or "EduFish Dataset",
            school_name=dataset_meta.get("school_name", ""),
            department_name=dataset_meta.get("department_name", ""),
            status="ready",
            source_summary_json=_dumps(normalized_payload.get("source_summary", {})),
            record_counts_json=_dumps(normalized_payload.get("record_counts", {})),
            sample_preview_json=_dumps(normalized_payload.get("sample_preview", {})),
            normalized_data_json=_dumps(normalized_payload.get("normalized_data", {})),
            tenant_id=getattr(g, "tenant_id", "default"),
        )
        db.session.add(dataset)
        db.session.commit()
        db.session.refresh(dataset)
        return dataset

    @staticmethod
    def create_analysis(dataset_id: str, template_id: str, audience_role: str, scope: dict) -> EduAnalysis:
        analysis = EduAnalysis(
            id=f"edu_an_{uuid4().hex[:12]}",
            dataset_id=dataset_id,
            template_id=template_id,
            audience_role=audience_role,
            status="pending",
            scope_json=_dumps(scope),
            tenant_id=getattr(g, "tenant_id", "default"),
        )
        db.session.add(analysis)
        db.session.commit()
        db.session.refresh(analysis)
        return analysis

    @staticmethod
    def create_report(analysis_id: str, dataset_id: str, template_id: str) -> EduReport:
        report = EduReport(
            id=f"edu_rp_{uuid4().hex[:12]}",
            analysis_id=analysis_id,
            dataset_id=dataset_id,
            template_id=template_id,
            status="pending",
            tenant_id=getattr(g, "tenant_id", "default"),
        )
        db.session.add(report)
        db.session.commit()
        db.session.refresh(report)
        return report

    @staticmethod
    def dataset_data(dataset: EduDataset) -> dict:
        return _loads(dataset.normalized_data_json, {})

    @staticmethod
    def dataset_meta(dataset: EduDataset) -> dict:
        return {
            "dataset_id": dataset.id,
            "name": dataset.name,
            "school_name": dataset.school_name,
            "department_name": dataset.department_name,
        }

    @staticmethod
    def serialize_dataset(dataset: EduDataset, include_preview: bool = True) -> dict:
        payload = {
            "dataset_id": dataset.id,
            "name": dataset.name,
            "school_name": dataset.school_name,
            "department_name": dataset.department_name,
            "status": dataset.status,
            "source_summary": _loads(dataset.source_summary_json, {}),
            "record_counts": _loads(dataset.record_counts_json, {}),
            "created_at": dataset.created_at.isoformat() if dataset.created_at else None,
            "updated_at": dataset.updated_at.isoformat() if dataset.updated_at else None,
        }
        if include_preview:
            payload["sample_preview"] = _loads(dataset.sample_preview_json, {})
        return payload

    @staticmethod
    def serialize_analysis(analysis: EduAnalysis) -> dict:
        return {
            "analysis_id": analysis.id,
            "dataset_id": analysis.dataset_id,
            "template_id": analysis.template_id,
            "audience_role": analysis.audience_role,
            "status": analysis.status,
            "scope": _loads(analysis.scope_json, {}),
            "summary": _loads(analysis.summary_json, {}),
            "metrics": _loads(analysis.metrics_json, {}),
            "insights": _loads(analysis.insights_json, []),
            "graph_summary": _loads(analysis.graph_summary_json, {}),
            "report_id": analysis.report_id,
            "error": analysis.error_message or None,
            "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
            "updated_at": analysis.updated_at.isoformat() if analysis.updated_at else None,
        }

    @staticmethod
    def serialize_report(report: EduReport) -> dict:
        return {
            "report_id": report.id,
            "analysis_id": report.analysis_id,
            "dataset_id": report.dataset_id,
            "template_id": report.template_id,
            "status": report.status,
            "title": report.title,
            "sections": _loads(report.sections_json, []),
            "markdown_content": report.markdown_content,
            "error": report.error_message or None,
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        }

    @staticmethod
    def analysis_graph(analysis: EduAnalysis) -> dict:
        return _loads(analysis.graph_json, {})

    @staticmethod
    def save_completed_analysis(analysis: EduAnalysis, result: dict, report: EduReport, report_payload: dict) -> None:
        now = utc_now()
        analysis.status = "completed"
        analysis.summary_json = _dumps(result.get("summary", {}))
        analysis.metrics_json = _dumps(result.get("metrics", {}))
        analysis.insights_json = _dumps(result.get("insights", []))
        analysis.graph_json = _dumps(result.get("graph", {}))
        analysis.graph_summary_json = _dumps(result.get("graph_summary", {}))
        analysis.report_id = report.id
        analysis.updated_at = now

        report.status = "completed"
        report.title = report_payload.get("title", "")
        report.sections_json = _dumps(report_payload.get("sections", []))
        report.markdown_content = report_payload.get("markdown_content", "")
        report.updated_at = now

        db.session.commit()

    @staticmethod
    def save_failed_analysis(analysis: EduAnalysis, report: EduReport | None, error: str) -> None:
        now = utc_now()
        analysis.status = "failed"
        analysis.error_message = error
        analysis.updated_at = now
        if report is not None:
            report.status = "failed"
            report.error_message = error
            report.updated_at = now
        db.session.commit()
