"""Tools for searching and retrieving course materials."""

from __future__ import annotations

from flask import current_app

from app.agents.registry import register_tool
from app.models import Chapter, Concept, GraphEdge, QuizItem


@register_tool(
    name="search_materials",
    description=(
        "在课程材料中进行语义搜索，返回与查询最相关的内容片段。"
        "用于查找具体的课程内容、定义、解释。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "搜索查询，应该是自然语言描述要查找的内容",
            },
            "course_id": {
                "type": "string",
                "description": "可选：限定在某个课程内搜索（如 'ai-intro' 或 'brain-cog-intro'）",
            },
            "n_results": {
                "type": "integer",
                "description": "返回结果数量，默认 5，最多 10",
                "default": 5,
            },
        },
        "required": ["query"],
    },
)
def search_materials(query: str, course_id: str | None = None, n_results: int = 5) -> dict:
    """Semantic search over course material chunks via vector store."""
    from app.rag.embedding import EmbeddingClient
    from app.services.material_service import MaterialService

    cfg = current_app.config
    if not cfg.get("EMBEDDING_API_KEY"):
        return {
            "results": [],
            "message": "向量搜索未配置（需要 EMBEDDING_API_KEY）",
        }

    n_results = max(1, min(10, int(n_results)))
    embedder = EmbeddingClient(
        base_url=cfg["EMBEDDING_BASE_URL"],
        api_key=cfg["EMBEDDING_API_KEY"],
        model=cfg["EMBEDDING_MODEL"],
        query_input_type=cfg.get("EMBEDDING_QUERY_INPUT_TYPE", ""),
        passage_input_type=cfg.get("EMBEDDING_PASSAGE_INPUT_TYPE", ""),
        truncate=cfg.get("EMBEDDING_TRUNCATE", ""),
    )
    try:
        query_embedding = embedder.embed_query(query)
    except Exception as exc:
        return {"results": [], "error": f"embedding failed: {exc}"}

    try:
        chunk_results = MaterialService.search_chunks(
            query_embedding, course_id=course_id, n_results=n_results
        )
    except Exception as exc:
        return {"results": [], "error": f"vector search failed: {exc}"}

    docs = chunk_results.get("documents", [[]])[0] or []
    metas = chunk_results.get("metadatas", [[]])[0] or []
    distances = chunk_results.get("distances", [[]])[0] or []

    results = []
    for doc, meta, dist in zip(docs, metas, distances):
        results.append({
            "content": doc,
            "page_number": meta.get("page_number", 0),
            "heading": meta.get("heading", ""),
            "material_id": meta.get("material_id", ""),
            "course_id": meta.get("course_id", ""),
            "similarity": round(1.0 - float(dist), 4),
        })
    return {"results": results, "count": len(results)}


@register_tool(
    name="search_concept_graph",
    description=(
        "查询知识图谱中的概念和关系。"
        "用于了解概念之间的依赖、相关性，或查找某个概念的定义。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "概念名称或关键词",
            },
            "course_id": {
                "type": "string",
                "description": "可选：限定课程",
            },
        },
        "required": ["query"],
    },
)
def search_concept_graph(query: str, course_id: str | None = None) -> dict:
    """Search the concept graph for concepts and relationships."""
    query_lower = query.lower()

    concept_query = Concept.query.filter_by(status="published")
    if course_id:
        concept_query = concept_query.filter_by(course_id=course_id)
    concepts = concept_query.all()

    matched_concepts = []
    matched_concept_ids = set()
    for c in concepts:
        if query_lower in c.label.lower() or query_lower in c.definition.lower():
            matched_concepts.append({
                "id": c.id,
                "label": c.label,
                "definition": c.definition,
                "course_id": c.course_id,
            })
            matched_concept_ids.add(c.id)

    edge_query = GraphEdge.query.filter_by(status="published")
    if course_id:
        edge_query = edge_query.filter_by(course_id=course_id)
    edges = edge_query.all()

    matched_edges = []
    for e in edges:
        if e.source_id in matched_concept_ids or e.target_id in matched_concept_ids:
            matched_edges.append({
                "id": e.id,
                "source_id": e.source_id,
                "target_id": e.target_id,
                "relationship": e.relationship,
                "evidence": e.evidence,
            })

    return {
        "concepts": matched_concepts[:10],
        "edges": matched_edges[:15],
        "concept_count": len(matched_concepts),
        "edge_count": len(matched_edges),
    }


@register_tool(
    name="get_chapter",
    description=(
        "获取某个章节的完整内容（标题、目标、正文）。"
        "用于回答关于具体章节的问题。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "string",
                "description": "章节 ID",
            },
        },
        "required": ["chapter_id"],
    },
)
def get_chapter(chapter_id: str) -> dict:
    """Retrieve a chapter's full content."""
    from app.db import db
    chapter = db.session.get(Chapter, chapter_id)
    if chapter is None:
        return {"error": f"Chapter not found: {chapter_id}"}
    return {
        "id": chapter.id,
        "course_id": chapter.course_id,
        "order": chapter.order,
        "title": chapter.title,
        "objectives": chapter.objectives,
        "body": chapter.body,
    }


@register_tool(
    name="list_chapters",
    description="列出某门课程的所有章节（标题和顺序）。",
    parameters={
        "type": "object",
        "properties": {
            "course_id": {
                "type": "string",
                "description": "课程 ID",
            },
        },
        "required": ["course_id"],
    },
)
def list_chapters(course_id: str) -> dict:
    """List all chapters in a course."""
    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
    return {
        "chapters": [
            {
                "id": c.id,
                "order": c.order,
                "title": c.title,
                "objectives": c.objectives,
            }
            for c in chapters
        ],
        "count": len(chapters),
    }


@register_tool(
    name="get_quiz_items_for_chapter",
    description="获取某章节下的所有测试题目。",
    parameters={
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "string",
                "description": "章节 ID",
            },
        },
        "required": ["chapter_id"],
    },
)
def get_quiz_items_for_chapter(chapter_id: str) -> dict:
    """Get quiz items for a chapter."""
    items = QuizItem.query.filter_by(chapter_id=chapter_id).all()
    return {
        "items": [
            {
                "id": q.id,
                "prompt": q.prompt,
                "answer": q.answer,
                "explanation": q.explanation,
            }
            for q in items
        ],
        "count": len(items),
    }
