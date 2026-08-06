from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from app.db import db
from app.models import (
    Chapter,
    Concept,
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

logger = logging.getLogger(__name__)


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
        "adapter": "neuron_simulator",
        "summary": "调节刺激强度，观察 LIF 神经元的膜电位轨迹、放电阈值与频率编码。",
        "status": "published",
        "data_source": "simulation",
        "difficulty": "basic",
        "estimated_minutes": 25,
        "default_params": {
            "pipeline": {
                "nodes": [
                    {"id": "stimulus"},
                    {"id": "integrate"},
                    {"id": "detect-spikes"},
                    {"id": "firing-rate"},
                    {"id": "ai-report"},
                ],
                "edges": [
                    ["stimulus", "integrate"],
                    ["integrate", "detect-spikes"],
                    ["detect-spikes", "firing-rate"],
                    ["firing-rate", "ai-report"],
                ],
            },
            "node_params": {
                "stimulus": {"stimulus_current": 8, "duration_ms": 120},
            },
        },
        "linked_concept_ids": ["concept-neural-networks"],
    },
    {
        "id": "exp-perceptron-train",
        "title": "Perceptron Trainer",
        "experiment_type": "ml_training",
        "adapter": "ml_train",
        "summary": "调节学习率与迭代轮数，观察感知机/逻辑回归的损失曲线、准确率与决策边界。",
        "status": "published",
        "data_source": "synthetic",
        "difficulty": "basic",
        "estimated_minutes": 25,
        "default_params": {
            "pipeline": {
                "nodes": [
                    {"id": "dataset"},
                    {"id": "model"},
                    {"id": "train"},
                    {"id": "evaluate"},
                    {"id": "ai-report"},
                ],
                "edges": [
                    ["dataset", "model"],
                    ["model", "train"],
                    ["train", "evaluate"],
                    ["evaluate", "ai-report"],
                ],
            },
            "node_params": {
                "dataset": {"dataset": "blobs"},
                "model": {"model": "perceptron", "learning_rate": 0.05, "epochs": 50},
            },
        },
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


def _tokenize(query: str) -> list[str]:
    latin = [t.lower() for t in re.findall(r"[a-zA-Z0-9]+", query)]
    cjk = re.findall(r"[\u4e00-\u9fff]", query)
    return latin + cjk


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
    def list_templates(status: str | None = None, concept_id: str | None = None) -> list[dict]:
        ExperimentService.ensure_default_templates(commit=False)
        query = ExperimentTemplate.query
        if status:
            query = query.filter_by(status=status)
        templates = query.order_by(ExperimentTemplate.created_at.asc()).all()
        if concept_id:
            templates = [
                item
                for item in templates
                if concept_id in _json_loads(item.linked_concept_ids_json, [])
            ]
        return [ExperimentService.serialize_template(item) for item in templates]

    @staticmethod
    def explore(query: str, limit: int = 8) -> list[dict]:
        """Score published templates against a natural-language query.

        Tokenizes latin words plus CJK characters, then scores title (3),
        linked concept labels (2) and summary (1) with substring matching.
        """
        query = (query or "").strip().lower()
        if not query:
            return []
        ExperimentService.ensure_default_templates(commit=False)
        terms = _tokenize(query)
        scored: list[tuple[int, dict]] = []
        templates = ExperimentTemplate.query.filter_by(status="published").all()
        for template in templates:
            title = (template.title or "").lower()
            summary = (template.summary or "").lower()
            linked_ids = _json_loads(template.linked_concept_ids_json, [])
            concepts = (
                {item.id: item for item in Concept.query.filter(Concept.id.in_(linked_ids)).all()}
                if linked_ids
                else {}
            )
            labels = [concepts[cid].label for cid in linked_ids if cid in concepts]
            label_text = " ".join(labels).lower()

            score = 0
            matched_labels: list[str] = []
            for term in terms:
                if term in title:
                    score += 3
                if term in label_text:
                    score += 2
                    matched_labels += [label for label in labels if term in label.lower()]
                elif term in summary:
                    score += 1
            if score > 0:
                item = ExperimentService.serialize_template(template)
                item["score"] = score
                item["matched_concepts"] = sorted(set(matched_labels))
                scored.append((score, item))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in scored[:limit]]

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
            "job_id": run.job_id,
            "progress": run.progress,
            "progress_message": run.progress_message,
            "pipeline_nodes": _json_loads(run.progress_json, {}),
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
    def create_pending_run(template_id: str, payload: dict) -> dict:
        """Validate payload + create an ExperimentRun row with status='pending'.

        Returns the serialized run dict. The caller is responsible for enqueueing
        a background job to actually execute the run via ``enqueue_run_job``.
        """
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

        # Validate params against the adapter BEFORE persisting the run. This
        # preserves the API contract where bad input returns 400 instead of a
        # 201 + status='failed' row.
        adapter = get_adapter(template.adapter)
        try:
            validated_params = adapter.validate_params(params)
        except ValueError:
            raise

        # Pre-seed pipeline_nodes as "ready" so the UI can render the pipeline
        # skeleton before the worker reports its first tick.
        default_params = _json_loads(template.default_params_json, {})
        node_ids = [
            node["id"]
            for node in (default_params.get("pipeline", {}) or {}).get("nodes", [])
            if isinstance(node, dict) and node.get("id")
        ]
        progress_map = {node_id: "ready" for node_id in node_ids}

        run = ExperimentRun(
            id=f"run-{uuid4().hex}",
            template_id=template.id,
            student_id=student_id,
            course_id=course_id,
            chapter_id=chapter_id,
            activity_id=activity_id,
            status="pending",
            adapter=template.adapter,
            params_json=_json_dump(params),
            summary_json="{}",
            progress=0,
            progress_message="Waiting for worker",
            progress_json=_json_dump(progress_map),
        )
        db.session.add(run)
        if student_id:
            ProgressService.record(
                student_id=student_id,
                event_type="ran_lab",
                course_id=course_id,
                chapter_id=chapter_id,
                activity_id=activity_id,
                payload={"experiment_run_id": run.id, "template_id": template.id, "async": True},
                commit=False,
            )
        db.session.commit()
        db.session.refresh(run)
        return ExperimentService.serialize_run(run)

    @staticmethod
    def enqueue_run_job(app, run_id: str) -> str:
        """Submit a background job that runs the experiment and return the job id.

        In ``app.config['TESTING']`` mode the queue runs jobs synchronously on
        the calling thread, so by the time this returns the run has already
        reached a terminal status. In production the worker picks it up
        asynchronously and the caller polls/SSEs for progress.
        """
        from app.services.job_queue import get_queue
        job = get_queue().enqueue(
            app,
            "run_experiment",
            target_id=run_id,
            payload={"run_id": run_id},
        )
        with app.app_context():
            run = db.session.get(ExperimentRun, run_id)
            if run is not None:
                run.job_id = job.id
                db.session.commit()
        return job.id

    @staticmethod
    def execute_run(app, run_id: str) -> None:
        """Worker body — runs the adapter, persists artifacts, updates progress.

        Called by the ``run_experiment`` job handler. Marks each pipeline node
        ``running`` then ``completed`` so SSE/polling clients see incremental
        progress; falls back to using the template's pipeline metadata when the
        adapter does not return ``pipeline_trace`` entries for every node.
        """
        with app.app_context():
            run = db.session.get(ExperimentRun, run_id)
            if run is None:
                raise ValueError(f"experiment run not found: {run_id}")
            template = db.session.get(ExperimentTemplate, run.template_id)
            if template is None:
                raise ValueError(f"experiment template not found: {run.template_id}")
            adapter = get_adapter(template.adapter)
            run.status = "running"
            run.progress = 5
            run.progress_message = "Starting experiment"
            db.session.commit()

            params = _json_loads(run.params_json, {})
            try:
                validated = adapter.validate_params(params)
            except ValueError as exc:
                run.status = "failed"
                run.error_message = str(exc)
                run.progress = 100
                run.progress_message = "Invalid parameters"
                ExperimentService._mark_nodes(run, "failed")
                db.session.commit()
                return

            # Mark the first node running so the UI shows motion immediately.
            ExperimentService._set_node_status(run, "running")
            run.progress = 15
            run.progress_message = "Running adapter"
            db.session.commit()

            try:
                result = adapter.run(validated)
            except Exception as exc:  # noqa: BLE001 — surface any adapter failure
                logger.exception("Experiment adapter %s failed for run %s", template.adapter, run_id)
                run.status = "failed"
                run.error_message = str(exc)
                run.progress = 100
                run.progress_message = "Adapter raised an exception"
                ExperimentService._mark_nodes(run, "failed")
                db.session.commit()
                return

            summary = adapter.summarize_artifacts(result)
            run.params_json = json.dumps(result.get("params", validated), ensure_ascii=False)
            run.summary_json = json.dumps(summary, ensure_ascii=False)

            # Build the per-node progress map. Prefer the adapter's
            # ``pipeline_trace`` (authoritative), fall back to template defaults.
            trace_by_id = {
                item["node_id"]: item.get("status", "completed")
                for item in (result.get("pipeline_trace") or [])
                if isinstance(item, dict) and item.get("node_id")
            }
            template_nodes = [
                node["id"]
                for node in _json_loads(template.default_params_json, {})
                .get("pipeline", {})
                .get("nodes", [])
                if isinstance(node, dict) and node.get("id")
            ]
            final_nodes = {node_id: trace_by_id.get(node_id, "completed") for node_id in template_nodes}
            run.progress_json = _json_dump(final_nodes)
            run.progress = 70
            run.progress_message = "Saving artifacts"
            db.session.commit()

            artifact = ExperimentArtifact(
                id=f"artifact-{uuid4().hex}",
                run_id=run.id,
                artifact_type="signal_summary",
                title=f"{template.title} output",
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
            db.session.commit()

            run.status = "completed"
            run.progress = 100
            run.progress_message = "Completed"
            run.completed_at = _now()
            db.session.commit()

    @staticmethod
    def _set_node_status(run: ExperimentRun, status: str, node_id: str | None = None) -> None:
        """Update one (or all) pipeline nodes' status in ``run.progress_json``."""
        nodes = _json_loads(run.progress_json, {})
        if not isinstance(nodes, dict):
            nodes = {}
        if node_id is not None:
            nodes[node_id] = status
        else:
            for key in list(nodes.keys()):
                nodes[key] = status
        run.progress_json = _json_dump(nodes)

    @staticmethod
    def _mark_nodes(run: ExperimentRun, status: str) -> None:
        ExperimentService._set_node_status(run, status)

    @staticmethod
    def _build_report_content(template: ExperimentTemplate, summary: dict, result: dict) -> dict:
        if template.adapter == "neuron_simulator":
            return ExperimentService._build_neuron_report_content(template, summary, result)
        if template.adapter == "ml_train":
            return ExperimentService._build_ml_report_content(template, summary, result)
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

    @staticmethod
    def _build_neuron_report_content(template: ExperimentTemplate, summary: dict, result: dict) -> dict:
        stimulus = result.get("params", {}).get("stimulus", {})
        current = stimulus.get("stimulus_current", 0)
        duration_ms = stimulus.get("duration_ms", 0)
        return {
            "title": f"{template.title} 实验报告",
            "purpose": "通过调节刺激电流，观察 LIF 神经元何时放电、以及放电频率如何编码刺激强度。",
            "observations": [
                f"本次运行时长 {duration_ms} ms，刺激强度 {current}。",
                f"共检测到 {summary.get('total_spikes')} 个动作电位，平均放电频率 {summary.get('firing_rate')} Hz。",
                "膜电位达到阈值后复位，并经历约 2 ms 的不应期，之后重新充电。",
            ],
            "limitations": "本实验使用简化 LIF 单神经元模型，不包含离子通道动力学、突触输入与真实噪声。",
            "next_steps": "逐步降低刺激强度直到放电停止，找出该神经元的放电阈值；再提高强度观察频率编码规律。",
            "node_explanations": [
                {
                    "node_id": "stimulus",
                    "title": "Stimulus Source",
                    "body": f"以恒定电流 {current} 刺激神经元，持续 {duration_ms} ms。",
                },
                {
                    "node_id": "integrate",
                    "title": "LIF Integrate",
                    "body": "膜电位按 RC 电路动力学充电：C dV/dt = -gL(V - EL) + I。",
                },
                {
                    "node_id": "detect-spikes",
                    "title": "Spike Detect",
                    "body": "当膜电位跨过 -55 mV 阈值时记录一个动作电位，并复位到 -70 mV。",
                },
                {
                    "node_id": "firing-rate",
                    "title": "Firing Rate",
                    "body": f"平均放电频率为 {summary.get('firing_rate')} Hz，刺激越强、放电越密。",
                },
                {
                    "node_id": "ai-report",
                    "title": "AI Experiment Report",
                    "body": "把膜电位轨迹、放电统计与模型限制汇总成教学解释。",
                },
            ],
        }

    @staticmethod
    def _build_ml_report_content(template: ExperimentTemplate, summary: dict, result: dict) -> dict:
        model = summary.get("model")
        dataset = summary.get("dataset")
        converged = summary.get("converged", False)
        params = result.get("params", {}).get("model", {})
        return {
            "title": f"{template.title} 实验报告",
            "purpose": "观察线性模型（感知机 / 逻辑回归）如何在两个二维数据集上学习决策边界。",
            "observations": [
                f"使用 {model} 在 {dataset} 数据集上训练 {summary.get('epochs')} 轮（学习率 {params.get('learning_rate')}）。",
                f"最终准确率 {summary.get('final_accuracy')}，损失 {summary.get('final_loss')}。",
                (
                    "模型已收敛：训练集上达到 100% 准确率，说明该数据线性可分。"
                    if converged
                    else "模型未收敛：换用螺旋数据集时线性模型无法完全分离两类，这是线性模型的表达上限。"
                ),
            ],
            "limitations": "仅支持二维两类问题与线性模型；学习率过大或轮数不足都可能导致不收敛。",
            "next_steps": "把数据集切到双螺旋观察失败模式；对比感知机与逻辑回归的损失曲线差异；调整学习率观察震荡。",
            "node_explanations": [
                {
                    "node_id": "dataset",
                    "title": "Dataset Source",
                    "body": f"加载 {summary.get('dataset')}：{result.get('dataset_name')}，共 {len(result.get('data_points', {}).get('y', []))} 个样本。",
                },
                {
                    "node_id": "model",
                    "title": "Linear Model",
                    "body": f"选择 {model}：感知机按误分类样本修正权重；逻辑回归用交叉熵损失做梯度下降。",
                },
                {
                    "node_id": "train",
                    "title": "Training Loop",
                    "body": f"迭代 {summary.get('epochs')} 轮，学习率 {params.get('learning_rate')}，权重初始化为小随机值。",
                },
                {
                    "node_id": "evaluate",
                    "title": "Evaluate",
                    "body": f"训练集准确率 {summary.get('final_accuracy')}，决策边界由权重向量 {result.get('weights')} 决定。",
                },
                {
                    "node_id": "ai-report",
                    "title": "AI Experiment Report",
                    "body": "把损失曲线、准确率与边界几何汇总成教学解释。",
                },
            ],
        }
