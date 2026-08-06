"""Background job handlers.

Each handler implements the heavy work for a specific job type.
Handlers receive the Flask app instance so they can push their own app_context.
"""

from __future__ import annotations

import logging

from app.db import db
from app.models import EduAnalysis, EduDataset, EduReport, Material
from app.services.job_queue import JobContext, register_handler

logger = logging.getLogger(__name__)


@register_handler("ingest_material")
def handle_ingest_material(app, job_id: str, payload: dict, ctx: JobContext) -> dict:
    """Heavy material processing: extract → chunk → embed → LLM concept extraction.

    Assumes the file is already saved and the Material row exists.
    """
    from app.services.agent_run_service import AgentRunService
    from app.services.material_service import MaterialService
    from app.services.review_service import ReviewService

    material_id = payload.get("material_id")
    if not material_id:
        raise ValueError("payload.material_id is required")
    run_id = payload.get("run_id")
    scope_type = payload.get("scope_type") or "course_global"
    owner_id = payload.get("owner_id") or ""
    auto_publish = payload.get("auto_publish", True)

    with app.app_context():
        material = db.session.get(Material, material_id)
        if material is None:
            raise ValueError(f"material not found: {material_id}")

        if run_id:
            AgentRunService.mark_running(run_id, job_id=job_id)

        def emit(event_type, status, message, progress, event_payload=None):
            ctx.update(progress=progress, message=message)
            if run_id:
                AgentRunService.emit_event(
                    run_id=run_id,
                    job_id=job_id,
                    material_id=material.id,
                    course_id=material.course_id,
                    scope_type=scope_type,
                    owner_id=owner_id,
                    event_type=event_type,
                    status=status,
                    message=message,
                    progress=progress,
                    payload=event_payload or {},
                )

        try:
            emit("received", "running", "Material received", 5, {"filename": material.filename})
            emit("extracting", "running", "Extracting text", 15)
            chunks = MaterialService.extract_and_chunk(material, commit=True)
            emit("chunking", "running", f"Created {len(chunks)} chunks", 35, {"chunk_count": len(chunks)})
            if not chunks:
                summary = {
                    "material_id": material_id,
                    "chunks": 0,
                    "review_item_id": None,
                    "published": False,
                    "needs_review": False,
                    "note": "no extractable text",
                }
                emit("completed", "completed", "No extractable text", 100, summary)
                if run_id:
                    AgentRunService.complete_run(run_id, summary=summary)
                return summary

            emit("embedding", "running", f"Embedding {len(chunks)} chunks", 55, {"chunk_count": len(chunks)})
            try:
                MaterialService.embed_and_store(material, chunks)
                db.session.commit()
            except Exception as exc:
                logger.exception("Embedding failed; continuing without vector index")
                material.parser_status = "chunked"
                db.session.commit()
                emit(
                    "embedding",
                    "failed",
                    "Embedding failed; continuing with graph extraction",
                    60,
                    {"error": str(exc)},
                )

            emit("extracting_graph", "running", "Extracting concepts and relationships", 75)
            review_item = MaterialService.create_review_suggestion_from_chunks(
                material, chunks, commit=True
            )

            publish_result = {"published": False, "needs_review": True}
            if auto_publish:
                emit(
                    "publishing",
                    "running",
                    "Validating and publishing graph",
                    90,
                    {"review_item_id": review_item.id},
                )
                publish_result = ReviewService.auto_publish_graph_suggestion(
                    review_item.id,
                    scope_type=scope_type,
                    owner_id=owner_id,
                )

            summary = {
                "material_id": material_id,
                "chunks": len(chunks),
                "review_item_id": review_item.id if review_item else None,
                "parser_status": material.parser_status,
                "published": publish_result.get("published", False),
                "needs_review": publish_result.get("needs_review", False),
                "published_concepts": publish_result.get("concepts", 0),
                "published_edges": publish_result.get("edges", 0),
            }
            emit("completed", "completed", "Material analysis complete", 100, summary)
            if run_id:
                AgentRunService.complete_run(run_id, summary=summary)
            return summary
        except Exception as exc:
            if run_id:
                AgentRunService.fail_run(run_id, str(exc))
            raise


@register_handler("edu_analysis")
def handle_edu_analysis(app, job_id: str, payload: dict, ctx: JobContext) -> dict:
    """Run EduFish analysis and report generation for a persisted dataset."""
    from app.services.edu_analysis import EduAnalysisService
    from app.services.edu_report import EduReportService
    from app.services.edu_storage import EduStorageService
    from app.services.edu_templates import normalize_template

    dataset_id = payload.get("dataset_id")
    analysis_id = payload.get("analysis_id")
    report_id = payload.get("report_id")
    if not dataset_id or not analysis_id or not report_id:
        raise ValueError("payload.dataset_id, analysis_id, and report_id are required")

    with app.app_context():
        dataset = db.session.get(EduDataset, dataset_id)
        analysis = db.session.get(EduAnalysis, analysis_id)
        report = db.session.get(EduReport, report_id)
        if dataset is None:
            raise ValueError(f"dataset not found: {dataset_id}")
        if analysis is None:
            raise ValueError(f"analysis not found: {analysis_id}")
        if report is None:
            raise ValueError(f"report not found: {report_id}")

        try:
            ctx.update(progress=10, message="Preparing teaching-quality dataset")
            analysis.status = "running"
            db.session.commit()

            template = normalize_template(payload.get("custom_template"), analysis.template_id)
            dataset_meta = EduStorageService.dataset_meta(dataset)
            dataset_data = EduStorageService.dataset_data(dataset)
            scope = EduStorageService.serialize_analysis(analysis).get("scope", {})

            ctx.update(progress=45, message="Analyzing feedback, outcomes, and attendance")
            result = EduAnalysisService().analyze(
                dataset_meta=dataset_meta,
                dataset=dataset_data,
                audience_role=analysis.audience_role,
                scope=scope,
            )

            ctx.update(progress=75, message="Building evidence graph and report")
            report_payload = EduReportService().build_report(
                dataset_meta=dataset_meta,
                analysis_meta=EduStorageService.serialize_analysis(analysis),
                analysis_result=result,
                template=template,
            )
            EduStorageService.save_completed_analysis(analysis, result, report, report_payload)

            ctx.update(progress=100, message="EduFish analysis complete")
            return {
                "dataset_id": dataset.id,
                "analysis_id": analysis.id,
                "report_id": report.id,
                "graph_summary": result.get("graph_summary", {}),
            }
        except Exception as exc:
            logger.exception("EduFish analysis failed")
            EduStorageService.save_failed_analysis(analysis, report, str(exc))
            raise
