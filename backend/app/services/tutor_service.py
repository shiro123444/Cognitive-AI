"""AI Tutor service with RAG pipeline.

Flow: embed question → vector search chunks → graph context → LLM generate answer.
Falls back to keyword matching if LLM/embedding is not configured.
"""

import json

from flask import current_app

from app.models import Chapter
from app.services.course_service import CourseService


COURSE_PROFILES = {
    "ai-intro": {
        "mode": "ai_engineering",
        "label": "人工智能导论",
        "retrieval_focus": "算法、模型、数据、推理链、工程约束与模型边界",
        "answer_style": "优先解释算法机制、建模假设、适用条件、局限性和可操作的学习路径。",
        "prompt_rules": [
            "围绕算法机制和模型边界组织回答",
            "区分工程实现、理论假设和经验效果",
            "当材料涉及类脑或认知类比时，明确类比的边界",
        ],
        "search_results": 6,
    },
    "brain-cog-intro": {
        "mode": "cognitive_neuroscience",
        "label": "脑与认知科学导论",
        "retrieval_focus": "神经机制、认知过程、实验范式、行为证据与脑成像证据",
        "answer_style": "优先解释神经机制、认知功能、实验范式、证据强度和与 AI 类比的限制。",
        "prompt_rules": [
            "围绕神经机制和认知过程组织回答",
            "说明相关实验范式、行为指标或脑成像证据",
            "当材料涉及 AI 模型类比时，明确生物系统与计算模型的差异",
        ],
        "search_results": 7,
    },
}

DEFAULT_COURSE_PROFILE = {
    "mode": "general_course",
    "label": "课程助教",
    "retrieval_focus": "课程材料、知识图谱和章节证据",
    "answer_style": "基于课程证据给出准确、简洁、有教育意义的回答。",
    "prompt_rules": [
        "基于提供的课程材料和知识图谱回答",
        "如果材料不足以回答，诚实说明",
    ],
    "search_results": 5,
}


class TutorService:
    @staticmethod
    def course_profile(course_id=None):
        """Return the course-specific tutor mode and retrieval profile."""
        return COURSE_PROFILES.get(course_id, DEFAULT_COURSE_PROFILE)

    @staticmethod
    def answer(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
        """Answer a question using RAG + LLM, or fall back to keyword matching."""
        cfg = current_app.config
        api_key = cfg.get("LLM_API_KEY", "")

        if not api_key:
            return TutorService._keyword_answer(question, course_id, chapter_id, concept_id, user_id=user_id)

        try:
            return TutorService._rag_answer(question, course_id, chapter_id, concept_id, cfg, user_id=user_id)
        except Exception:
            current_app.logger.exception("RAG answer failed, falling back to keyword")
            return TutorService._keyword_answer(question, course_id, chapter_id, concept_id, user_id=user_id)

    @staticmethod
    def answer_stream(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
        """Streaming answer — yields text chunks via SSE."""
        cfg = current_app.config
        api_key = cfg.get("LLM_API_KEY", "")

        if not api_key:
            result = TutorService._keyword_answer(question, course_id, chapter_id, concept_id, user_id=user_id)
            yield TutorService._sse("metadata", {"course_mode": result.get("course_mode"), "course_profile": result.get("course_profile")})
            yield TutorService._sse("answer", result["answer"])
            if result.get("citations"):
                yield TutorService._sse("citations", result["citations"])
            yield "data: [DONE]\n\n"
            return

        try:
            yield from TutorService._rag_answer_stream(question, course_id, chapter_id, concept_id, cfg, user_id=user_id)
        except Exception as exc:
            current_app.logger.exception("RAG stream failed, falling back to keyword")
            yield TutorService._sse("error", TutorService._runtime_error_message(exc))
            result = TutorService._keyword_answer(question, course_id, chapter_id, concept_id, user_id=user_id)
            yield TutorService._sse("metadata", {"course_mode": result.get("course_mode"), "course_profile": result.get("course_profile")})
            yield TutorService._sse("answer", result["answer"])
            if result.get("citations"):
                yield TutorService._sse("citations", result["citations"])
            yield "data: [DONE]\n\n"

    @staticmethod
    def _rag_answer(question, course_id, chapter_id, concept_id, cfg, user_id=""):
        """RAG-based answer: embed → search → context → LLM."""
        from app.rag.embedding import EmbeddingClient
        from app.services.material_service import MaterialService
        from app.llm_client import LLMClient

        profile = TutorService.course_profile(course_id)

        chunk_context = ""
        citations = []
        try:
            # 1. Embed question
            embedder = EmbeddingClient(
                base_url=cfg["EMBEDDING_BASE_URL"],
                api_key=cfg["EMBEDDING_API_KEY"],
                model=cfg["EMBEDDING_MODEL"],
                query_input_type=cfg.get("EMBEDDING_QUERY_INPUT_TYPE", ""),
                passage_input_type=cfg.get("EMBEDDING_PASSAGE_INPUT_TYPE", ""),
                truncate=cfg.get("EMBEDDING_TRUNCATE", ""),
            )
            query_embedding = embedder.embed_query(question)

            # 2. Vector search for relevant chunks
            chunk_results = MaterialService.search_chunks(
                query_embedding,
                course_id=course_id,
                n_results=profile["search_results"],
                owner_id=user_id or "",
                include_personal=bool(user_id),
            )
            chunk_docs = chunk_results.get("documents", [[]])[0] if chunk_results.get("documents") else []
            chunk_metas = chunk_results.get("metadatas", [[]])[0] if chunk_results.get("metadatas") else []

            # 3. Build context from chunks
            chunk_context, citations = TutorService._chunk_context_and_citations(chunk_docs, chunk_metas)
        except Exception:
            current_app.logger.exception("Embedding lookup failed, continuing with graph context")

        # 4. Also get graph context (existing keyword match logic as supplement)
        graph_context = TutorService._graph_context(question, course_id, chapter_id, concept_id, user_id=user_id)

        # 5. Construct RAG prompt
        system_prompt = TutorService._build_system_prompt(course_id, chapter_id)
        user_prompt = TutorService._build_rag_prompt(question, chunk_context, graph_context)

        # 6. Call LLM
        llm = LLMClient(
            base_url=cfg["LLM_BASE_URL"],
            api_key=cfg["LLM_API_KEY"],
            model=cfg["LLM_MODEL_NAME"],
            timeout=60,
        )
        answer_text = llm.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )

        return {
            "answer": answer_text,
            "citations": citations[:5],
            "insufficient_evidence": not chunk_docs and not graph_context,
            "course_mode": profile["mode"],
            "course_profile": {
                "label": profile["label"],
                "retrieval_focus": profile["retrieval_focus"],
            },
        }

    @staticmethod
    def _rag_answer_stream(question, course_id, chapter_id, concept_id, cfg, user_id=""):
        """Streaming RAG answer — yields SSE events."""
        from app.rag.embedding import EmbeddingClient
        from app.services.material_service import MaterialService
        from app.llm_client import LLMClient

        profile = TutorService.course_profile(course_id)

        # Steps 1-4: same as _rag_answer
        yield TutorService._sse("tool_call", {
            "name": "course_rag_profile",
            "arguments": {"course_id": course_id, "mode": profile["mode"]},
        })
        citations = []
        chunk_context = ""
        try:
            embedder = EmbeddingClient(
                base_url=cfg["EMBEDDING_BASE_URL"],
                api_key=cfg["EMBEDDING_API_KEY"],
                model=cfg["EMBEDDING_MODEL"],
                query_input_type=cfg.get("EMBEDDING_QUERY_INPUT_TYPE", ""),
                passage_input_type=cfg.get("EMBEDDING_PASSAGE_INPUT_TYPE", ""),
                truncate=cfg.get("EMBEDDING_TRUNCATE", ""),
            )
            query_embedding = embedder.embed_query(question)
            chunk_results = MaterialService.search_chunks(
                query_embedding,
                course_id=course_id,
                n_results=profile["search_results"],
                owner_id=user_id or "",
                include_personal=bool(user_id),
            )
            yield TutorService._sse("tool_result", {
                "name": "course_rag_profile",
                "result_preview": profile["retrieval_focus"],
            })
            chunk_docs = chunk_results.get("documents", [[]])[0] if chunk_results.get("documents") else []
            chunk_metas = chunk_results.get("metadatas", [[]])[0] if chunk_results.get("metadatas") else []
            chunk_context, citations = TutorService._chunk_context_and_citations(chunk_docs, chunk_metas)
        except Exception as exc:
            current_app.logger.exception("Embedding lookup failed, continuing with graph context")
            yield TutorService._sse("error", TutorService._runtime_error_message(exc))

        graph_context = TutorService._graph_context(question, course_id, chapter_id, concept_id, user_id=user_id)
        system_prompt = TutorService._build_system_prompt(course_id, chapter_id)
        user_prompt = TutorService._build_rag_prompt(question, chunk_context, graph_context)

        # Stream LLM response
        llm = LLMClient(
            base_url=cfg["LLM_BASE_URL"],
            api_key=cfg["LLM_API_KEY"],
            model=cfg["LLM_MODEL_NAME"],
            timeout=60,
        )
        for chunk in llm.chat_stream(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        ):
            yield TutorService._sse("token", chunk)

        # Send citations at the end
        yield TutorService._sse("metadata", {
            "course_mode": profile["mode"],
            "course_profile": {"label": profile["label"], "retrieval_focus": profile["retrieval_focus"]},
        })
        if citations:
            yield TutorService._sse("citations", citations[:5])
        yield "data: [DONE]\n\n"

    @staticmethod
    def _chunk_context_and_citations(chunk_docs, chunk_metas):
        context_parts = []
        citations = []
        for doc, meta in zip(chunk_docs, chunk_metas):
            heading = meta.get("heading", "")
            source = f"[来源: {meta.get('material_id', 'unknown')}, 页 {meta.get('page_number', '?')}]"
            if heading:
                context_parts.append(f"## {heading}\n{doc}\n{source}")
            else:
                context_parts.append(f"{doc}\n{source}")
            citations.append({
                "type": "chunk",
                "id": meta.get("material_id", ""),
                "title": heading or "课程材料",
                "snippet": doc[:200],
            })
        return "\n\n---\n\n".join(context_parts), citations

    @staticmethod
    def _build_system_prompt(course_id, chapter_id):
        """Build the system prompt for the tutor."""
        profile = TutorService.course_profile(course_id)
        course_info = ""
        if course_id:
            course = CourseService.get_course(course_id)
            if course:
                course_info = f"\n当前课程: {course.title}"

        chapter_info = ""
        if chapter_id:
            chapter = Chapter.query.get(chapter_id)
            if chapter:
                chapter_info = f"\n当前章节: {chapter.title}"

        rule_lines = "\n".join(
            f"- {rule}" for rule in profile["prompt_rules"]
        )

        return f"""你是一个专业的AI学习助手，当前工作模式是 {profile['mode']}。
课程处理模式: {profile['answer_style']}
检索关注点: {profile['retrieval_focus']}
课程专属规则:
{rule_lines}

你的回答应该：
1. 基于提供的课程材料和知识图谱进行回答
2. 准确、简洁、有教育意义
3. 如果材料中没有相关信息，诚实说明
4. 适当引用来源
5. 使用中文回答{course_info}{chapter_info}"""

    @staticmethod
    def _build_rag_prompt(question, chunk_context, graph_context):
        """Build the user prompt with retrieved context."""
        parts = [f"学生的问题: {question}\n"]

        if chunk_context:
            parts.append(f"相关课程材料:\n{chunk_context}\n")

        if graph_context:
            parts.append(f"知识图谱相关信息:\n{graph_context}\n")

        if not chunk_context and not graph_context:
            parts.append("（未找到相关课程材料）\n")

        parts.append("请基于以上材料回答学生的问题。如果材料不足以回答，请说明。")
        return "\n".join(parts)

    @staticmethod
    def _graph_context(question, course_id, chapter_id, concept_id, user_id=""):
        """Get relevant context from the knowledge graph (keyword match as supplement)."""
        import re

        _STOPWORDS = {"a", "an", "and", "are", "as", "for", "how", "in", "is", "of", "or", "the", "to", "what"}
        query_tokens = {t for t in re.findall(r"[a-z0-9]+", question.lower()) if len(t) > 2 and t not in _STOPWORDS}

        if not query_tokens:
            return ""

        graph = CourseService.get_graph(
            course_id=course_id,
            owner_id=user_id or "",
            include_personal=bool(user_id),
        )
        concepts_by_id = {node["id"]: node for node in graph["nodes"]}
        parts = []

        for edge in graph["edges"]:
            source = concepts_by_id.get(edge["source"], {})
            target = concepts_by_id.get(edge["target"], {})
            if concept_id and concept_id not in {edge["source"], edge["target"]}:
                continue
            text = f"{source.get('label', '')} {source.get('definition', '')} {target.get('label', '')} {target.get('definition', '')} {edge.get('relationship', '')} {edge.get('evidence', '')}"
            if len(query_tokens & {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}) >= min(2, len(query_tokens)):
                parts.append(f"{source.get('label', '?')} --[{edge.get('relationship', '')}]--> {target.get('label', '?')}: {edge.get('evidence', '')}")

        for concept in graph["nodes"]:
            if concept_id and concept["id"] != concept_id:
                continue
            text = f"{concept['label']} {concept['definition']}"
            if len(query_tokens & {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}) >= min(2, len(query_tokens)):
                parts.append(f"概念: {concept['label']} — {concept.get('definition', '')}")

        return "\n".join(parts[:5])

    @staticmethod
    def _keyword_answer(question, course_id=None, chapter_id=None, concept_id=None, user_id=""):
        """Fallback: keyword matching (original behavior)."""
        import re

        profile = TutorService.course_profile(course_id)
        _STOPWORDS = {"a", "an", "and", "are", "as", "for", "how", "in", "is", "of", "or", "the", "to", "what"}
        query_tokens = {t for t in re.findall(r"[a-z0-9]+", question.lower()) if len(t) > 2 and t not in _STOPWORDS}

        def _tokens(text):
            return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in _STOPWORDS}

        def _matches(text):
            if not query_tokens:
                return False
            return len(query_tokens & _tokens(text)) >= min(2, len(query_tokens))

        def _snippet(*parts):
            return " ".join(p for p in parts if p).strip()[:240]

        graph = CourseService.get_graph(
            course_id=course_id,
            owner_id=user_id or "",
            include_personal=bool(user_id),
        )
        concepts_by_id = {node["id"]: node for node in graph["nodes"]}
        citations = []

        for edge in graph["edges"]:
            source = concepts_by_id.get(edge["source"], {})
            target = concepts_by_id.get(edge["target"], {})
            if concept_id and concept_id not in {edge["source"], edge["target"]}:
                continue
            text = f"{source.get('label', '')} {source.get('definition', '')} {target.get('label', '')} {target.get('definition', '')} {edge.get('relationship', '')} {edge.get('evidence', '')}"
            if _matches(text):
                citations.append({
                    "type": "graph_edge",
                    "id": edge["id"],
                    "title": f"{source.get('label', edge['source'])} {edge['relationship']} {target.get('label', edge['target'])}",
                    "snippet": _snippet(edge.get("evidence", "")),
                })

        for concept in graph["nodes"]:
            if concept_id and concept["id"] != concept_id:
                continue
            if _matches(f"{concept['label']} {concept['definition']}"):
                citations.append({
                    "type": "concept",
                    "id": concept["id"],
                    "title": concept["label"],
                    "snippet": _snippet(concept.get("definition", "")),
                })

        if not concept_id or chapter_id:
            chapters_query = Chapter.query
            if course_id:
                chapters_query = chapters_query.filter_by(course_id=course_id)
            if chapter_id:
                chapters_query = chapters_query.filter_by(id=chapter_id)
            for chapter in chapters_query.order_by(Chapter.order.asc()).all():
                text = f"{chapter.title} {chapter.objectives} {chapter.body}"
                if _matches(text):
                    citations.append({
                        "type": "chapter",
                        "id": chapter.id,
                        "title": chapter.title,
                        "snippet": _snippet(chapter.objectives, chapter.body),
                    })

        if not citations:
            return {
                "answer": "我没有找到足够的已发布课程证据来回答这个问题。你可以换一种问法，或先上传/发布相关课程材料。",
                "citations": [],
                "insufficient_evidence": True,
                "course_mode": profile["mode"],
                "course_profile": {
                    "label": profile["label"],
                    "retrieval_focus": profile["retrieval_focus"],
                },
            }

        evidence = citations[0]
        answer = f"基于已发布课程证据，{evidence['title']}：{evidence['snippet']}"
        return {
            "answer": answer,
            "citations": citations[:5],
            "insufficient_evidence": False,
            "course_mode": profile["mode"],
            "course_profile": {
                "label": profile["label"],
                "retrieval_focus": profile["retrieval_focus"],
            },
        }

    @staticmethod
    def _sse(event_type, content):
        return f"data: {json.dumps({'type': event_type, 'content': content}, ensure_ascii=False)}\n\n"

    @staticmethod
    def _runtime_error_message(exc):
        text = str(exc)
        lowered = text.lower()
        if "401" in text or "invalid_key" in lowered or "invalid api key" in lowered:
            return "模型连接失败：API Key 无效，请在教师工作室的 MODEL CONFIG 中重新填写并点击 TEST PING。"
        if (
            "embedding" in lowered
            or "/embeddings" in lowered
            or "dimension" in lowered
            or "vector" in lowered
            or "chroma" in lowered
        ):
            return "RAG 向量检索暂时不可用，已切换到课程图谱和基础证据模式。"
        return "模型连接暂时不可用，已切换到课程证据 fallback。"
