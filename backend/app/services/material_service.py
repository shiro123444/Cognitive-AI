"""Material upload, extraction, chunking, embedding, and ingestion.

Pipeline: save → extract → chunk → embed → store → suggest concepts for review.
"""

import json
import os
from uuid import uuid4

from flask import current_app
from werkzeug.utils import secure_filename

from app.db import db
from app.models import Chunk, Material
from app.rag.chunker import smart_chunk
from app.rag.embedding import EmbeddingClient
from app.rag.extractor import extract
from app.rag.vector_store import VectorStore
from app.services.review_service import ReviewService


def _get_embedding_client() -> EmbeddingClient:
    cfg = current_app.config
    return EmbeddingClient(
        base_url=cfg["EMBEDDING_BASE_URL"],
        api_key=cfg["EMBEDDING_API_KEY"],
        model=cfg["EMBEDDING_MODEL"],
        query_input_type=cfg.get("EMBEDDING_QUERY_INPUT_TYPE", ""),
        passage_input_type=cfg.get("EMBEDDING_PASSAGE_INPUT_TYPE", ""),
        truncate=cfg.get("EMBEDDING_TRUNCATE", ""),
    )


def _get_vector_store() -> VectorStore:
    cfg = current_app.config
    return VectorStore(persist_dir=cfg["CHROMADB_DIR"])


class MaterialService:
    @staticmethod
    def _secure_upload_filename(file_storage):
        filename = secure_filename(file_storage.filename or "")
        if not filename:
            raise ValueError("file filename is invalid")
        return filename

    @staticmethod
    def save_upload(course_id, file_storage, commit=True, scope_type="course_global", owner_id=""):
        upload_dir = current_app.config["UPLOAD_DIR"]
        os.makedirs(upload_dir, exist_ok=True)
        filename = MaterialService._secure_upload_filename(file_storage)
        material_id = f"material-{uuid4().hex}"
        path = os.path.join(upload_dir, f"{material_id}_{filename}")
        file_storage.save(path)

        material = Material(
            id=material_id,
            course_id=course_id,
            filename=filename,
            path=path,
            scope_type=scope_type,
            owner_id=owner_id or "",
        )
        db.session.add(material)
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        db.session.refresh(material)
        return material

    @staticmethod
    def extract_and_chunk(material, commit=True):
        """Extract text from the file and split into smart chunks."""
        pages = extract(material.path)
        if not pages:
            material.parser_status = "empty"
            material.extraction_method = "none"
            if commit:
                db.session.commit()
            return []

        # Determine extraction method from file extension
        ext = material.filename.rsplit(".", 1)[-1].lower() if "." in material.filename else ""
        material.extraction_method = "pypdf" if ext == "pdf" else "text"

        # Smart semantic chunking
        smart_chunks = smart_chunk(pages, max_chars=800)

        # Save chunks to DB
        db_chunks = []
        for sc in smart_chunks:
            chunk = Chunk(
                id=f"chunk-{material.id}-{sc.chunk_index}",
                material_id=material.id,
                text=sc.content,
                citation_locator=f"{material.filename}#page-{sc.page_number}-chunk-{sc.chunk_index}",
                page_number=sc.page_number,
                chunk_type=sc.chunk_type,
                heading=sc.heading,
            )
            db.session.add(chunk)
            db_chunks.append(chunk)

        material.chunk_count = len(db_chunks)
        material.parser_status = "chunked"

        if commit:
            db.session.commit()
        else:
            db.session.flush()

        for chunk in db_chunks:
            db.session.refresh(chunk)
        return db_chunks

    @staticmethod
    def embed_and_store(material, chunks):
        """Embed chunks and store in vector database.

        Silently skips if EMBEDDING_API_KEY is not configured.
        """
        if not chunks:
            return

        cfg = current_app.config
        if not cfg.get("EMBEDDING_API_KEY"):
            current_app.logger.info("EMBEDDING_API_KEY not set; skipping vector embedding.")
            return

        embedding_client = _get_embedding_client()
        vector_store = _get_vector_store()

        texts = [c.text for c in chunks]
        embeddings = embedding_client.embed_texts(texts)

        ids = [c.id for c in chunks]
        metadatas = [
            {
                "material_id": material.id,
                "course_id": material.course_id,
                "page_number": c.page_number,
                "chunk_type": c.chunk_type,
                "heading": c.heading or "",
                "scope_type": material.scope_type,
                "owner_id": material.owner_id or "",
            }
            for c in chunks
        ]

        vector_store.add(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        material.parser_status = "embedded"

    @staticmethod
    def create_review_suggestion_from_chunks(material, chunks, commit=True):
        """Use LLM to extract concepts and relationships from chunks.

        Falls back to simple extraction if LLM is not configured.
        """
        from app.llm_client import LLMClient

        cfg = current_app.config
        api_key = cfg.get("LLM_API_KEY", "")

        if not api_key:
            # Fallback: simple extraction (old behavior, but using first chunk properly)
            return MaterialService._simple_suggestion(material, chunks, commit)

        try:
            return MaterialService._llm_suggestion(material, chunks, cfg, commit)
        except Exception:
            current_app.logger.exception("LLM concept extraction failed, falling back to simple")
            return MaterialService._simple_suggestion(material, chunks, commit)

    # Backward-compat alias (tests and external code may reference the old name)
    @staticmethod
    def create_review_suggestion_from_material(material, commit=True):
        """Compatibility wrapper: chunk the material then create a review suggestion."""
        chunks = MaterialService.chunk_material(material, commit=False)
        return MaterialService.create_review_suggestion_from_chunks(material, chunks, commit=commit)

    @staticmethod
    def chunk_material(material, commit=True):
        """Compatibility wrapper for the old chunk_material API."""
        return MaterialService.extract_and_chunk(material, commit=commit)

    @staticmethod
    def _simple_suggestion(material, chunks, commit=True):
        """Fallback: create a basic review suggestion without LLM."""
        first_chunk_text = chunks[0].text[:240] if chunks else "Uploaded course material."
        # Clean heading prefix if present
        if first_chunk_text.startswith("## "):
            first_chunk_text = first_chunk_text.split("\n\n", 1)[-1][:240] if "\n\n" in first_chunk_text else first_chunk_text[3:240]

        payload = {
            "course_id": material.course_id,
            "scope_type": material.scope_type,
            "owner_id": material.owner_id or "",
            "concepts": [{
                "id": f"concept-upload-{material.id}",
                "course_id": material.course_id,
                "scope_type": material.scope_type,
                "owner_id": material.owner_id or "",
                "label": material.filename.rsplit(".", 1)[0],
                "definition": first_chunk_text,
                "confidence": 1.0,
            }],
            "edges": [],
        }
        return ReviewService.create_graph_suggestion(
            title=f"Uploaded material: {material.filename}",
            payload=payload,
            commit=commit,
        )

    @staticmethod
    def _llm_suggestion(material, chunks, cfg, commit=True):
        """Use LLM to intelligently extract concepts and relationships."""
        llm = LLMClient(
            base_url=cfg["LLM_BASE_URL"],
            api_key=cfg["LLM_API_KEY"],
            model=cfg["LLM_MODEL_NAME"],
        )

        # Build context from chunks (limit to avoid token overflow)
        chunk_texts = []
        total_chars = 0
        for c in chunks:
            if total_chars + len(c.text) > 6000:
                break
            chunk_texts.append(c.text)
            total_chars += len(c.text)

        context = "\n\n---\n\n".join(chunk_texts)

        prompt = f"""你是一个课程内容分析专家。请从以下课程材料中提取核心概念和它们之间的关系。

课程材料（文件名：{material.filename}）：

{context}

请以JSON格式返回，严格遵循以下结构：
{{
  "concepts": [
    {{"label": "概念名称", "definition": "1-2句话的简洁定义"}}
  ],
  "edges": [
    {{"source": "源概念名称", "target": "目标概念名称", "relationship": "prerequisite_of|related_to|evidenced_by", "evidence": "关系依据"}}
  ]
}}

要求：
- 提取5-15个核心概念，不要太细碎也不要太笼统
- 定义应该简洁准确，用中文
- 关系应该有明确的依据
- 只返回JSON，不要有其他文字"""

        response = llm.chat_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        data = json.loads(response)
        concepts = data.get("concepts", [])
        edges = data.get("edges", [])

        # Build payload with generated IDs
        concept_map = {}  # label -> id
        payload_concepts = []
        for i, c in enumerate(concepts):
            cid = f"concept-{material.id}-{i}"
            concept_map[c["label"]] = cid
            payload_concepts.append({
                "id": cid,
                "course_id": material.course_id,
                "scope_type": material.scope_type,
                "owner_id": material.owner_id or "",
                "label": c["label"],
                "definition": c.get("definition", ""),
                "confidence": float(c.get("confidence", 0.8) or 0.8),
                "tags": c.get("tags", []),
                "difficulty": c.get("difficulty", ""),
                "evidence_chunk_ids": c.get("evidence_chunk_ids", []),
            })

        payload_edges = []
        for i, e in enumerate(edges):
            source_id = concept_map.get(e["source"], e["source"])
            target_id = concept_map.get(e["target"], e["target"])
            payload_edges.append({
                "id": f"edge-{material.id}-{i}",
                "course_id": material.course_id,
                "scope_type": material.scope_type,
                "owner_id": material.owner_id or "",
                "source": source_id,
                "target": target_id,
                "relationship": e.get("relationship", "related_to"),
                "evidence": e.get("evidence", ""),
                "confidence": float(e.get("confidence", 0.8) or 0.8),
                "evidence_chunk_ids": e.get("evidence_chunk_ids", []),
            })

        payload = {
            "course_id": material.course_id,
            "scope_type": material.scope_type,
            "owner_id": material.owner_id or "",
            "concepts": payload_concepts,
            "edges": payload_edges,
        }

        return ReviewService.create_graph_suggestion(
            title=f"AI extracted from: {material.filename}",
            payload=payload,
            commit=commit,
        )

    @staticmethod
    def ingest_upload(course_id, file_storage, scope_type="course_global", owner_id=""):
        """Full ingestion pipeline: save → extract → chunk → embed → store → suggest."""
        saved_path = None
        try:
            # 1. Save file
            material = MaterialService.save_upload(
                course_id,
                file_storage,
                commit=False,
                scope_type=scope_type,
                owner_id=owner_id,
            )
            saved_path = material.path

            # 2. Extract text and chunk
            chunks = MaterialService.extract_and_chunk(material, commit=False)

            # 3. Embed and store in vector DB (best effort — don't fail upload if embedding fails)
            try:
                MaterialService.embed_and_store(material, chunks)
            except Exception:
                current_app.logger.exception("Embedding failed, continuing without vector store")
                material.parser_status = "chunked"  # At least we have chunks

            # 4. Create review suggestion (with LLM if available)
            review_item = MaterialService.create_review_suggestion_from_chunks(
                material, chunks, commit=False
            )

            db.session.commit()
            db.session.refresh(material)
            db.session.refresh(review_item)
            return material, review_item

        except Exception:
            db.session.rollback()
            if saved_path and os.path.exists(saved_path):
                os.remove(saved_path)
            raise

    @staticmethod
    def ingest_upload_async(course_id, file_storage, scope_type="course_global", owner_id="", auto_publish=True):
        """Async ingestion: save the file synchronously, queue heavy work in background.

        Returns (material, job, run). The caller can poll job status and run events.
        """
        from app.services.agent_run_service import AgentRunService
        from app.services.job_queue import get_queue

        saved_path = None
        try:
            material = MaterialService.save_upload(
                course_id,
                file_storage,
                commit=True,
                scope_type=scope_type,
                owner_id=owner_id,
            )
            saved_path = material.path
            run = AgentRunService.create_for_material(
                material,
                job_id="",
                scope_type=scope_type,
                owner_id=owner_id,
            )
        except Exception:
            db.session.rollback()
            if saved_path and os.path.exists(saved_path):
                os.remove(saved_path)
            raise

        queue = get_queue()
        job = queue.enqueue(
            current_app._get_current_object(),
            job_type="ingest_material",
            target_id=material.id,
            payload={
                "material_id": material.id,
                "run_id": run.id,
                "scope_type": scope_type,
                "owner_id": owner_id or "",
                "auto_publish": bool(auto_publish),
            },
        )
        return material, job, run

    @staticmethod
    def _vector_scope_where(course_id=None, owner_id="", include_personal=False):
        filters = []
        if course_id:
            filters.append({"course_id": course_id})
        if include_personal and owner_id:
            filters.append({
                "$or": [
                    {"scope_type": "course_global"},
                    {"$and": [
                        {"scope_type": "student_personal"},
                        {"owner_id": owner_id},
                    ]},
                ],
            })
        else:
            filters.append({"scope_type": "course_global"})
        if not filters:
            return None
        if len(filters) == 1:
            return filters[0]
        return {"$and": filters}

    @staticmethod
    def search_chunks(query_embedding, course_id=None, n_results=5, owner_id="", include_personal=False):
        """Search vector store for relevant chunks."""
        vector_store = _get_vector_store()
        where = MaterialService._vector_scope_where(course_id, owner_id, include_personal)
        return vector_store.query(query_embedding, n_results=n_results, where=where)
