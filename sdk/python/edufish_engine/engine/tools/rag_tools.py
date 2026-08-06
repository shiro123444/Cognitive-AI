"""Built-in RAG tools — registered as agent tools.

These tools let the agent decide when to search materials.
The RAG pipeline is injected via a module-level setup function,
so it works with both local (CLI) and server stores.
"""

from __future__ import annotations

from typing import Any

from . import ToolRegistry

# Module-level RAG pipeline reference (set by setup_rag_tools)
_rag_pipeline = None
_graph_data = None  # Cached knowledge graph {nodes: [...], edges: [...]}


def setup_rag_tools(
    registry: ToolRegistry,
    rag_pipeline=None,
    graph_data: dict | None = None,
) -> None:
    """Register RAG tools into a tool registry.

    Call this during app initialization with the appropriate pipeline:
    - CLI: local ChromaDB + local embedder
    - Web: server ChromaDB + server embedder
    """
    global _rag_pipeline, _graph_data
    _rag_pipeline = rag_pipeline
    _graph_data = graph_data

    @registry.register(
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
                    "description": "搜索查询，自然语言描述要查找的内容",
                },
                "course_id": {
                    "type": "string",
                    "description": "可选：限定在某个课程内搜索",
                },
                "n_results": {
                    "type": "integer",
                    "description": "返回结果数量，默认 5",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    )
    def search_materials(query: str, course_id: str | None = None, n_results: int = 5) -> dict:
        if _rag_pipeline is None:
            return {"results": [], "message": "RAG pipeline 未配置"}

        n_results = max(1, min(10, int(n_results)))
        try:
            results = _rag_pipeline.search(query, course_id=course_id, n_results=n_results)
            return {
                "results": [
                    {
                        "content": r["content"],
                        "heading": r["metadata"].get("heading", ""),
                        "source_id": r["metadata"].get("source_id", ""),
                        "similarity": r["similarity"],
                    }
                    for r in results
                ],
                "count": len(results),
            }
        except Exception as exc:
            return {"results": [], "error": str(exc)}

    @registry.register(
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
            },
            "required": ["query"],
        },
    )
    def search_concept_graph(query: str) -> dict:
        if _graph_data is None:
            return {"concepts": [], "edges": [], "message": "知识图谱未加载"}

        query_lower = query.lower()
        nodes = _graph_data.get("nodes", [])
        edges = _graph_data.get("edges", [])

        matched_concepts = []
        matched_ids = set()
        for node in nodes:
            label = node.get("label", "")
            definition = node.get("definition", "")
            if query_lower in label.lower() or query_lower in definition.lower():
                matched_concepts.append({
                    "id": node.get("id", ""),
                    "label": label,
                    "definition": definition,
                })
                matched_ids.add(node.get("id", ""))

        matched_edges = []
        for edge in edges:
            if edge.get("source") in matched_ids or edge.get("target") in matched_ids:
                matched_edges.append({
                    "source": edge.get("source", ""),
                    "target": edge.get("target", ""),
                    "relationship": edge.get("relationship", ""),
                    "evidence": edge.get("evidence", ""),
                })

        return {
            "concepts": matched_concepts[:10],
            "edges": matched_edges[:15],
            "concept_count": len(matched_concepts),
            "edge_count": len(matched_edges),
        }
