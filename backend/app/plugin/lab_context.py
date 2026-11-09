"""Validated lab links and read-only projections of persisted run evidence.

Graph snapshot IDs are unverified caller correlations. Historical resource IDs
are retained without reauthorizing those resources or implying learning mastery.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, or_

from app.db import db
from app.models import (
    Chapter,
    Concept,
    ExperimentArtifact,
    ExperimentLearningContext,
    ExperimentReport,
    ExperimentRun,
    ExperimentTemplate,
    LearningActivity,
)

from .errors import invalid, not_found
from .visibility import PluginUser, published_knowledge_filter

_LAB_ACTIVITY_TYPES = frozenset({
    "code_lab", "notebook_lab", "cognitive_experiment", "bci_dataset_lab",
})
_MAX_RUNS = 50
_MAX_ARTIFACT_IDS = 20


def _linked_ids(raw: str) -> set[str]:
    if not isinstance(raw, str) or len(raw) > 64 * 1024:
        return set()
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return set()
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        return set()
    return set(parsed)


def _project_context(
    course_id: str,
    chapter_id: str | None,
    activity_id: str | None,
    concept_id: str | None,
    graph_snapshot_id: str | None,
) -> dict:
    return {
        "version": 1,
        "course_id": course_id,
        "chapter_id": chapter_id,
        "activity_id": activity_id,
        "concept_id": concept_id,
        "graph_snapshot_id": graph_snapshot_id,
    }


def resolve_learning_context(
    user: PluginUser,
    course_id: str,
    template: ExperimentTemplate,
    context: dict,
) -> dict:
    """Validate current visibility and explicit relationships at start only."""
    chapter_id = context.get("chapter_id")
    activity_id = context.get("activity_id")
    concept_id = context.get("concept_id")
    if chapter_id is not None:
        chapter = Chapter.query.filter_by(id=chapter_id, course_id=course_id).first()
        if chapter is None:
            raise not_found("chapter not found")

    activity = None
    if activity_id is not None:
        activity = (
            LearningActivity.query.outerjoin(Chapter, LearningActivity.chapter_id == Chapter.id)
            .filter(
                LearningActivity.id == activity_id,
                LearningActivity.course_id == course_id,
                LearningActivity.status == "published",
                or_(LearningActivity.release_at.is_(None), LearningActivity.release_at <= datetime.now(timezone.utc)),
                or_(LearningActivity.chapter_id.is_(None), Chapter.course_id == course_id),
            )
            .first()
        )
        if activity is None:
            raise not_found("activity not found")

    if concept_id is not None:
        concept = Concept.query.filter(
            Concept.id == concept_id,
            Concept.course_id == course_id,
            published_knowledge_filter(Concept, user.id),
        ).first()
        if concept is None:
            raise not_found("concept not found")
        if concept_id not in _linked_ids(template.linked_concept_ids_json):
            raise invalid("concept is not explicitly linked to the selected template")

    if activity is not None:
        if chapter_id is not None and chapter_id != activity.chapter_id:
            raise invalid("chapter does not match the selected activity")
        chapter_id = activity.chapter_id
        if activity.activity_type not in _LAB_ACTIVITY_TYPES:
            raise invalid("activity is not a lab activity")
        try:
            config = json.loads(activity.config_json)
        except (TypeError, ValueError):
            raise invalid("activity configuration must be an object") from None
        if not isinstance(config, dict):
            raise invalid("activity configuration must be an object")
        for field in ("template_id", "experiment_template_id"):
            if field in config and config[field] != template.id:
                raise invalid("activity does not match the selected template")
        if concept_id is not None and concept_id not in _linked_ids(activity.linked_concept_ids_json):
            raise invalid("concept is not explicitly linked to the selected activity")

    return _project_context(
        course_id, chapter_id, activity_id, concept_id, context.get("graph_snapshot_id")
    )


def learning_context_for_run(run: ExperimentRun) -> dict:
    """Project saved linkage, falling back to existing fields for legacy runs."""
    context = db.session.get(ExperimentLearningContext, run.id)
    return _project_context(
        run.course_id,
        run.chapter_id,
        run.activity_id,
        context.concept_id if context is not None else None,
        context.graph_snapshot_id if context is not None else None,
    )


def build_lab_evidence(user: PluginUser, course_id: str) -> dict:
    """Read bounded completed-run references without loading artifact/report data."""
    rows = (
        db.session.query(
            ExperimentRun.id.label("run_id"),
            ExperimentRun.template_id,
            ExperimentRun.adapter,
            ExperimentRun.completed_at,
            ExperimentRun.chapter_id,
            ExperimentRun.activity_id,
            ExperimentLearningContext.concept_id,
            ExperimentLearningContext.graph_snapshot_id,
        )
        .outerjoin(ExperimentLearningContext, ExperimentLearningContext.run_id == ExperimentRun.id)
        .filter(
            ExperimentRun.student_id == user.id,
            ExperimentRun.course_id == course_id,
            ExperimentRun.status == "completed",
            ExperimentRun.completed_at.isnot(None),
        )
        .order_by(ExperimentRun.completed_at.desc(), ExperimentRun.id.desc())
        .limit(_MAX_RUNS)
        .all()
    )
    if not rows:
        return {"version": 1, "runs": []}

    run_ids = [row.run_id for row in rows]
    artifact_counts = dict(
        db.session.query(ExperimentArtifact.run_id, func.count(ExperimentArtifact.id))
        .filter(ExperimentArtifact.run_id.in_(run_ids))
        .group_by(ExperimentArtifact.run_id)
        .all()
    )
    ranked_artifacts = (
        db.session.query(
            ExperimentArtifact.run_id,
            ExperimentArtifact.id,
            func.row_number().over(
                partition_by=ExperimentArtifact.run_id,
                order_by=ExperimentArtifact.id.asc(),
            ).label("position"),
        )
        .filter(ExperimentArtifact.run_id.in_(run_ids))
        .subquery()
    )
    artifact_ids = defaultdict(list)
    for row in (
        db.session.query(ranked_artifacts.c.run_id, ranked_artifacts.c.id)
        .filter(ranked_artifacts.c.position <= _MAX_ARTIFACT_IDS)
        .order_by(ranked_artifacts.c.run_id.asc(), ranked_artifacts.c.id.asc())
        .all()
    ):
        artifact_ids[row.run_id].append(row.id)

    ranked_reports = (
        db.session.query(
            ExperimentReport.run_id,
            ExperimentReport.id,
            func.row_number().over(
                partition_by=ExperimentReport.run_id,
                order_by=(ExperimentReport.created_at.desc(), ExperimentReport.id.desc()),
            ).label("position"),
        )
        .filter(ExperimentReport.run_id.in_(run_ids))
        .subquery()
    )
    report_ids = dict(
        db.session.query(ranked_reports.c.run_id, ranked_reports.c.id)
        .filter(ranked_reports.c.position == 1)
        .all()
    )
    return {
        "version": 1,
        "runs": [
            {
                "run_id": row.run_id,
                "template_id": row.template_id,
                "adapter": row.adapter,
                "status": "completed",
                "completed_at": row.completed_at.isoformat(),
                "learning_context": _project_context(
                    course_id, row.chapter_id, row.activity_id,
                    row.concept_id, row.graph_snapshot_id,
                ),
                "artifact_count": artifact_counts.get(row.run_id, 0),
                "artifact_ids": artifact_ids[row.run_id],
                "report_id": report_ids.get(row.run_id),
            }
            for row in rows
        ],
    }
