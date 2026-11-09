"""Read-only, course-scoped references for an explicitly requested graph snapshot.

Domain IDs are deliberately not translated to Qingzhou file IDs here. The host
resolves these references with its own authenticated resource mapping.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import or_

from app.db import db
from app.models import (
    Chapter,
    Chunk,
    ExperimentTemplate,
    GraphEvidence,
    LearningActivity,
    Material,
)

from .scrub import scrub_value
from .visibility import PluginUser, material_scope_filter

_MAX_SOURCES = 10
_MAX_LINKS = 20
_MAX_LINK_CANDIDATES = 2000


def _linked_ids(raw: str) -> set[str]:
    if not isinstance(raw, str) or len(raw) > 64 * 1024:
        return set()
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return set()
    if not isinstance(parsed, list):
        return set()
    return {item for item in parsed if isinstance(item, str)}


def _text(value: str | None, limit: int) -> str:
    return scrub_value(value or "")[:limit]


def _sources(user: PluginUser, course_id: str, node_ids: set[str], edge_ids: set[str]):
    by_concept: dict[str, list[dict]] = defaultdict(list)
    by_edge: dict[str, list[dict]] = defaultdict(list)
    if not node_ids and not edge_ids:
        return by_concept, by_edge

    rows = (
        db.session.query(GraphEvidence, Chunk, Material)
        .join(Chunk, GraphEvidence.chunk_id == Chunk.id)
        .join(Material, Chunk.material_id == Material.id)
        .filter(
            or_(GraphEvidence.concept_id.in_(node_ids), GraphEvidence.edge_id.in_(edge_ids)),
            Material.course_id == course_id,
            material_scope_filter(user.id),
        )
        .order_by(GraphEvidence.chunk_id.asc(), GraphEvidence.id.asc())
        .all()
    )
    for evidence, chunk, material in rows:
        digest = hashlib.sha256((chunk.text or "").encode("utf-8")).hexdigest()
        if evidence.content_sha256 != digest:
            # The reviewed source changed: do not silently cite its new content.
            continue
        if evidence.concept_id in node_ids:
            target = by_concept[evidence.concept_id]
        elif evidence.edge_id in edge_ids:
            target = by_edge[evidence.edge_id]
        else:
            continue
        if len(target) >= _MAX_SOURCES:
            continue
        target.append({
            "course_id": course_id,
            "material_id": material.id,
            "chunk_id": chunk.id,
            "filename": _text(material.filename, 500),
            "page_number": max(0, int(chunk.page_number or 0)),
            "citation_locator": _text(chunk.citation_locator, 500),
            "content_sha256": digest,
        })
    return by_concept, by_edge


def _activities(course_id: str, node_ids: set[str]) -> dict[str, list[dict]]:
    by_concept: dict[str, list[dict]] = defaultdict(list)
    if not node_ids:
        return by_concept
    rows = (
        LearningActivity.query.outerjoin(Chapter, LearningActivity.chapter_id == Chapter.id)
        .filter(
            LearningActivity.course_id == course_id,
            LearningActivity.status == "published",
            or_(LearningActivity.release_at.is_(None), LearningActivity.release_at <= datetime.now(timezone.utc)),
            or_(LearningActivity.chapter_id.is_(None), Chapter.course_id == course_id),
        )
        .order_by(LearningActivity.id.asc())
        .limit(_MAX_LINK_CANDIDATES)
        .all()
    )
    for activity in rows:
        reference = {
            "activity_id": activity.id,
            "chapter_id": activity.chapter_id,
            "title": _text(activity.title, 500),
            "activity_type": _text(activity.activity_type, 50),
        }
        for concept_id in node_ids & _linked_ids(activity.linked_concept_ids_json):
            if len(by_concept[concept_id]) < _MAX_LINKS:
                by_concept[concept_id].append(reference)
    return by_concept


def _experiments(node_ids: set[str]) -> dict[str, list[dict]]:
    by_concept: dict[str, list[dict]] = defaultdict(list)
    if not node_ids:
        return by_concept
    # Read persisted published templates; do not create defaults during a read.
    rows = (
        ExperimentTemplate.query.filter_by(status="published")
        .order_by(ExperimentTemplate.id.asc())
        .limit(_MAX_LINK_CANDIDATES)
        .all()
    )
    for template in rows:
        reference = {
            "template_id": template.id,
            "title": _text(template.title, 500),
            "adapter": _text(template.adapter, 100),
        }
        for concept_id in node_ids & _linked_ids(template.linked_concept_ids_json):
            if len(by_concept[concept_id]) < _MAX_LINKS:
                by_concept[concept_id].append(reference)
    return by_concept


def build_graph_context(user: PluginUser, course_id: str, graph: dict) -> dict:
    """Attach references only to nodes/edges already authorized by the caller."""
    node_ids = {node["id"] for node in graph["nodes"]}
    edge_ids = {edge["id"] for edge in graph["edges"]}
    concept_sources, edge_sources = _sources(user, course_id, node_ids, edge_ids)
    activities = _activities(course_id, node_ids)
    experiments = _experiments(node_ids)
    context = {
        "version": 1,
        "course_id": course_id,
        "concepts": [
            {
                "concept_id": node["id"],
                "sources": concept_sources[node["id"]],
                "activities": activities[node["id"]],
                "experiments": experiments[node["id"]],
            }
            for node in graph["nodes"]
        ],
        "edges": [
            {"edge_id": edge["id"], "sources": edge_sources[edge["id"]]}
            for edge in graph["edges"]
        ],
    }
    encoded = json.dumps(
        {**graph, "context": context},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    context["snapshot_id"] = hashlib.sha256(encoded).hexdigest()
    return context
