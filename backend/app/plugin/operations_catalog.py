"""Catalog read operations: course, material search, and graph neighborhood."""

from __future__ import annotations

import re
from collections import defaultdict, deque

from sqlalchemy import or_

from app.db import db
from app.models import Chapter, Chunk, Concept, GraphEdge, Material

from .scrub import scrub_value
from .validation import (
    MAX_GRAPH_EDGES,
    MAX_MATERIAL_CANDIDATES,
    MAX_MATERIAL_CONTENT_CHARS,
)
from .visibility import (
    PluginUser,
    get_visible_course,
    material_scope_filter,
    published_knowledge_filter,
)

_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+|[一-鿿]")
_MAX_QUERY_TOKENS = 20


def _tokens(query: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for token in _TOKEN_RE.findall(query.lower()):
        if token not in seen:
            seen.add(token)
            ordered.append(token)
    return ordered


def _term_count(text: str, token: str) -> int:
    if token.isascii():
        # Do not turn a query for "no" into evidence from a word like
        # "note". CJK tokens keep character matching without requiring an
        # external segmentation service.
        return len(re.findall(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", text))
    return text.count(token)


def course_read(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])
    chapters = (
        Chapter.query.filter_by(course_id=course.id)
        .order_by(Chapter.order.asc(), Chapter.id.asc())
        .all()
    )
    return {
        "course": {
            "id": course.id,
            "title": course.title,
            "summary": course.summary,
            "status": course.status,
        },
        "chapters": [
            {
                "id": chapter.id,
                "title": chapter.title,
                "order": int(chapter.order or 0),
                "objectives": chapter.objectives or "",
            }
            for chapter in chapters
        ],
    }


def material_search(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])
    query = args["query"]
    tokens = _tokens(query)[:_MAX_QUERY_TOKENS]
    if not tokens:
        return {"results": [], "retrieval_method": "keyword"}

    match_conditions = [
        or_(Chunk.text.ilike(f"%{token}%"), Chunk.heading.ilike(f"%{token}%"))
        for token in tokens
    ]
    rows = (
        db.session.query(Chunk, Material)
        .join(Material, Chunk.material_id == Material.id)
        .filter(
            Material.course_id == course.id,
            material_scope_filter(user.id),
            or_(*match_conditions),
        )
        # Deterministic candidate window; scoring and final ordering happen in
        # Python so ranking is stable across database backends.
        .order_by(Chunk.id.asc())
        .limit(MAX_MATERIAL_CANDIDATES)
        .all()
    )

    query_lower = query.lower()
    scored: list[tuple[int, str, int, str, Chunk, Material]] = []
    for chunk, material in rows:
        text = chunk.text or ""
        text_lower = text.lower()
        heading_lower = (chunk.heading or "").lower()
        filename_lower = (material.filename or "").lower()

        score = 0
        matched = False
        for token in tokens:
            occurrences = _term_count(text_lower, token)
            if occurrences:
                score += 1 + min(occurrences, 5)
                matched = True
            if _term_count(heading_lower, token):
                score += 3
                matched = True
            if _term_count(filename_lower, token):
                score += 1
                matched = True
        if query_lower and query_lower in text_lower:
            score += 5
            matched = True
        if not matched:
            continue

        scored.append(
            (
                -score,
                (material.filename or "").lower(),
                int(chunk.page_number or 0),
                chunk.id,
                chunk,
                material,
            )
        )

    scored.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
    results = []
    for _score, _filename, _page, _chunk_id, chunk, material in scored[: args["limit"]]:
        results.append(
            {
                "chunk_id": chunk.id,
                "material_id": material.id,
                "course_id": material.course_id,
                "filename": scrub_value(material.filename or ""),
                "content": (chunk.text or "")[:MAX_MATERIAL_CONTENT_CHARS],
                "page_number": int(chunk.page_number or 0),
                "citation_locator": scrub_value(chunk.citation_locator or ""),
                "heading": chunk.heading or "",
            }
        )

    return {"results": results, "retrieval_method": "keyword"}


def graph_neighborhood(user: PluginUser, args: dict) -> dict:
    course = get_visible_course(user, args["course_id"])

    edges = (
        GraphEdge.query.filter(
            GraphEdge.course_id == course.id,
            published_knowledge_filter(GraphEdge, user.id),
        )
        .order_by(GraphEdge.id.asc())
        .all()
    )
    # An edge is not an authorization grant to its endpoint's course. Keep
    # this operation inside the explicitly requested course even when older
    # graph data contains cross-course links.
    concepts = (
        Concept.query.filter(
            Concept.course_id == course.id,
            published_knowledge_filter(Concept, user.id),
        )
        .order_by(Concept.id.asc())
        .all()
    )
    concept_by_id = {concept.id: concept for concept in concepts}

    # Keep only edges whose both endpoints are visible concepts.
    visible_edges = [
        edge
        for edge in edges
        if edge.source_id in concept_by_id and edge.target_id in concept_by_id
    ]

    if args["concept_id"] is not None:
        if args["concept_id"] not in concept_by_id:
            from .errors import not_found

            raise not_found("concept not found in the requested course graph")

        adjacency: dict[str, list[str]] = defaultdict(list)
        for edge in visible_edges:
            adjacency[edge.source_id].append(edge.target_id)
            adjacency[edge.target_id].append(edge.source_id)
        for node_id in adjacency:
            adjacency[node_id] = sorted(set(adjacency[node_id]))

        limit = args["limit"]
        selected: list[str] = [args["concept_id"]]
        visited = {args["concept_id"]}
        frontier: deque[str] = deque([args["concept_id"]])
        for _ in range(args["depth"]):
            if len(selected) >= limit:
                break
            next_frontier: deque[str] = deque()
            while frontier:
                if len(selected) >= limit:
                    break
                node_id = frontier.popleft()
                for neighbour in adjacency.get(node_id, []):
                    if neighbour in visited:
                        continue
                    visited.add(neighbour)
                    selected.append(neighbour)
                    next_frontier.append(neighbour)
                    if len(selected) >= limit:
                        break
            if len(selected) >= limit or not next_frontier:
                break
            frontier = next_frontier
    else:
        selected = sorted(concept_by_id.keys())[: args["limit"]]

    selected_set = set(selected)
    selected_edges = [
        edge
        for edge in visible_edges
        if edge.source_id in selected_set and edge.target_id in selected_set
    ]
    selected_edges.sort(key=lambda edge: edge.id)
    selected_edges = selected_edges[:MAX_GRAPH_EDGES]

    return {
        "nodes": [
            {
                "id": node_id,
                "label": concept_by_id[node_id].label,
                "definition": concept_by_id[node_id].definition or "",
            }
            for node_id in selected
            if node_id in concept_by_id
        ],
        "edges": [
            {
                "id": edge.id,
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "relationship": edge.relationship,
                "evidence": edge.evidence or "",
            }
            for edge in selected_edges
        ],
    }
