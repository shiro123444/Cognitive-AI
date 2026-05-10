from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from app.db import db
from app.models import (
    Chapter,
    Course,
    ExperimentArtifact,
    ExperimentReport,
    ExperimentRun,
    ExperimentTemplate,
    LearningActivity,
    User,
)
from app.services.experiment_adapters import get_adapter
from app.services.progress_service import ProgressService


DEFAULT_TEMPLATES = [
    {
        "id": "exp-eeg-replay",
        "title": "EEG Replay Lab",
        "experiment_type": "eeg_replay",
        "adapter": "synthetic_eeg",
        "summary": "使用合成 EEG 信号观察 alpha/beta 频段、滤波和通道功率变化。",
        "status": "published",
        "data_source": "synthetic",
        "difficulty": "intermediate",
        "estimated_minutes": 30,
        "default_params": {
            "pipeline": {
                "nodes": [
                    {"id": "source"},
                    {"id": "filter"},
                    {"id": "psd"},
                    {"id": "band-power"},
                    {"id": "ai-report"},
                ],
                "edges": [
                    ["source", "filter"],
                    ["filter", "psd"],
                    ["psd", "band-power"],
                    ["band-power", "ai-report"],
                ],
            },
            "node_params": {
                "source": {"duration_seconds": 4, "sample_rate": 128, "channels": 4},
                "filter": {"low_hz": 1, "high_hz": 40},
            },
        },
        "linked_concept_ids": ["concept-neural-networks"],
    },
    {
        "id": "exp-neuron-spike",
        "title": "Neuron Spike Lab",
        "experiment_type": "neuron_simulation",
        "adapter": "local_neuron_simulator",
        "summary": "调整刺激强度并观察神经元放电阈值。此实验将在下一阶段启用。",
        "status": "coming_soon",
        "data_source": "simulation",
        "difficulty": "basic",
        "estimated_minutes": 25,
        "default_params": {"stimulus_current": 8, "duration_ms": 120},
        "linked_concept_ids": ["concept-neural-networks"],
    },
]


def _json_loads(value, fallback):
    try:
        parsed = json.loads(value or "")
    except json.JSONDecodeError:
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def _json_dump(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _now():
    return datetime.now(timezone.utc)


class ExperimentService:
    @staticmethod
    def _sync_template(existing: ExperimentTemplate, spec: dict) -> bool:
        next_defaults = _json_dump(spec["default_params"])
        next_concepts = _json_dump(spec["linked_concept_ids"])
        changed = False

        for attr in [
            "title",
            "experiment_type",
            "adapter",
            "summary",
            "status",
            "data_source",
            "difficulty",
            "estimated_minutes",
        ]:
            if getattr(existing, attr) != spec[attr]:
                setattr(existing, attr, spec[attr])
                changed = True

        if existing.default_params_json != next_defaults:
            existing.default_params_json = next_defaults
            changed = True
        if existing.linked_concept_ids_json != next_concepts:
            existing.linked_concept_ids_json = next_concepts
            changed = True

        return changed

    @staticmethod
    def ensure_default_templates(commit: bool = True) -> list[dict]:
        changed = False
        for spec in DEFAULT_TEMPLATES:
            existing = db.session.get(ExperimentTemplate, spec["id"])
            if existing:
                changed = ExperimentService._sync_template(existing, spec) or changed
                continue
            template = ExperimentTemplate(
                id=spec["id"],
                title=spec["title"],
                experiment_type=spec["experiment_type"],
                adapter=spec["adapter"],
                summary=spec["summary"],
                status=spec["status"],
                data_source=spec["data_source"],
                difficulty=spec["difficulty"],
                estimated_minutes=spec["estimated_minutes"],
                default_params_json=_json_dump(spec["default_params"]),
                linked_concept_ids_json=_json_dump(spec["linked_concept_ids"]),
            )
            db.session.add(template)
            changed = True
        if changed:
            if commit:
                db.session.commit()
            else:
                db.session.flush()
        return [
            ExperimentService.serialize_template(item)
            for item in ExperimentTemplate.query.order_by(ExperimentTemplate.created_at.asc()).all()
        ]

    @staticmethod
    def list_templates(status: str | None = None) -> list[dict]:
        ExperimentService.ensure_default_templates(commit=False)
        query = ExperimentTemplate.query
        if status:
            query = query.filter_by(status=status)
        return [
            ExperimentService.serialize_template(item)
            for item in query.order_by(ExperimentTemplate.created_at.asc()).all()
        ]

    @staticmethod
    def get_template(template_id: str) -> ExperimentTemplate | None:
        ExperimentService.ensure_default_templates(commit=False)
        return db.session.get(ExperimentTemplate, template_id)

    @staticmethod
    def serialize_template(template: ExperimentTemplate) -> dict:
        return {
            "id": template.id,
            "title": template.title,
            "experiment_type": template.experiment_type,
            "adapter": template.adapter,
            "summary": template.summary,
            "status": template.status,
            "data_source": template.data_source,
            "difficulty": template.difficulty,
            "estimated_minutes": template.estimated_minutes,
            "default_params": _json_loads(template.default_params_json, {}),
            "linked_concept_ids": _json_loads(template.linked_concept_ids_json, []),
            "created_at": template.created_at.isoformat() if template.created_at else None,
        }

    @staticmethod
    def create_and_execute_run(template_id: str, payload: dict) -> dict:
        template = ExperimentService.get_template(template_id)
        if template is None:
            raise ValueError(f"experiment template not found: {template_id}")
        if template.status != "published":
            raise ValueError("experiment template is not runnable.")
        student_id = payload.get("student_id")
        course_id = payload.get("course_id")
        chapter_id = payload.get("chapter_id")
        activity_id = payload.get("activity_id")
        if student_id and db.session.get(User, student_id) is None:
            raise ValueError(f"student not found: {student_id}")
        if course_id and db.session.get(Course, course_id) is None:
            raise ValueError(f"course not found: {course_id}")
        if chapter_id:
            chapter = db.session.get(Chapter, chapter_id)
            if chapter is None:
                raise ValueError(f"chapter not found: {chapter_id}")
            if course_id and chapter.course_id != course_id:
                raise ValueError(f"chapter does not belong to course: {chapter_id}")
        if activity_id:
            activity = db.session.get(LearningActivity, activity_id)
            if activity is None:
                raise ValueError(f"activity not found: {activity_id}")
            if course_id and activity.course_id != course_id:
                raise ValueError(f"activity does not belong to course: {activity_id}")
        params = payload.get("params", {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise ValueError("params must be an object.")
        adapter = get_adapter(template.adapter)
        result = adapter.run(params)
        summary = adapter.summarize_artifacts(result)
        run = ExperimentRun(
            id=f"run-{uuid4().hex}",
            template_id=template.id,
            student_id=student_id,
            course_id=course_id,
            chapter_id=chapter_id,
            activity_id=activity_id,
            status="completed",
            adapter=template.adapter,
            params_json=json.dumps(result["params"], ensure_ascii=False),
            summary_json=json.dumps(summary, ensure_ascii=False),
            completed_at=_now(),
        )
        db.session.add(run)
        db.session.flush()
        artifact = ExperimentArtifact(
            id=f"artifact-{uuid4().hex}",
            run_id=run.id,
            artifact_type="signal_summary",
            title="Synthetic EEG Signal Summary",
            data_json=json.dumps(result, ensure_ascii=False),
        )
        db.session.add(artifact)
        report = ExperimentReport(
            id=f"report-{uuid4().hex}",
            run_id=run.id,
            status="ready",
            content_json=json.dumps(
                ExperimentService._build_report_content(template, summary, result),
                ensure_ascii=False,
            ),
            updated_at=_now(),
        )
        db.session.add(report)
        if student_id:
            ProgressService.record(
                student_id=student_id,
                event_type="ran_lab",
                course_id=course_id,
                chapter_id=chapter_id,
                activity_id=activity_id,
                payload={"experiment_run_id": run.id, "template_id": template.id},
                commit=False,
            )
        db.session.commit()
        db.session.refresh(run)
        return ExperimentService.serialize_run(run)

    @staticmethod
    def get_run(run_id: str) -> ExperimentRun | None:
        return db.session.get(ExperimentRun, run_id)

    @staticmethod
    def serialize_run(run: ExperimentRun) -> dict:
        artifacts = [
            {
                "id": artifact.id,
                "run_id": artifact.run_id,
                "artifact_type": artifact.artifact_type,
                "title": artifact.title,
                "data": _json_loads(artifact.data_json, {}),
                "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
            }
            for artifact in run.artifacts
        ]
        report = run.reports[-1] if run.reports else None
        return {
            "id": run.id,
            "template_id": run.template_id,
            "student_id": run.student_id,
            "course_id": run.course_id,
            "status": run.status,
            "adapter": run.adapter,
            "params": _json_loads(run.params_json, {}),
            "summary": _json_loads(run.summary_json, {}),
            "error_message": run.error_message,
            "artifacts": artifacts,
            "report": ExperimentService.serialize_report(report) if report else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }

    @staticmethod
    def serialize_report(report: ExperimentReport) -> dict:
        return {
            "id": report.id,
            "run_id": report.run_id,
            "status": report.status,
            "content": _json_loads(report.content_json, {}),
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        }

    @staticmethod
    def _build_report_content(template: ExperimentTemplate, summary: dict, result: dict) -> dict:
        dominant = summary.get("dominant_band", "unknown")
        source = result.get("params", {}).get("source", {})
        filter_params = result.get("params", {}).get("filter", {})
        return {
            "title": f"{template.title} 实验报告",
            "purpose": "观察合成 EEG 信号中的频段能量变化，并理解采样率、滤波和通道数量的关系。",
            "observations": [
                f"本次运行生成 {summary.get('sample_count')} 个采样点。",
                f"主导频段为 {dominant}。",
                f"alpha 总功率为 {summary.get('alpha_power')}，beta 总功率为 {summary.get('beta_power')}。",
            ],
            "limitations": "本实验使用 synthetic/sample 数据，不代表真实人体脑电，也不能用于医疗判断。",
            "next_steps": "尝试调整滤波参数或通道数量，比较波形和频谱如何变化。",
            "node_explanations": [
                {
                    "node_id": "source",
                    "title": "Synthetic EEG Source",
                    "body": f"生成了 {source.get('channels')} 个通道、{source.get('sample_rate')} Hz 的合成 EEG 片段。",
                },
                {
                    "node_id": "filter",
                    "title": "Bandpass Filter",
                    "body": f"保留 {filter_params.get('low_hz')} 到 {filter_params.get('high_hz')} Hz 的频段，用于压制漂移和高频噪声。",
                },
                {
                    "node_id": "psd",
                    "title": "PSD Spectrum",
                    "body": "把时域波形映射到频域，便于比较 alpha 和 beta 能量分布。",
                },
                {
                    "node_id": "band-power",
                    "title": "Band Power",
                    "body": "按通道聚合 alpha/beta 功率，方便课堂对比不同脑区的节律强度。",
                },
                {
                    "node_id": "ai-report",
                    "title": "AI Experiment Report",
                    "body": "将信号摘要、频谱和限制说明汇总成教学解释，而不是医疗结论。",
                },
            ],
        }
