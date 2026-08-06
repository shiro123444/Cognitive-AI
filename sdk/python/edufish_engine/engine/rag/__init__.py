"""RAG Pipeline — Local vector retrieval for the engine.

Migrated from backend/app/rag/ to work both locally (CLI) and on the server.
The RAG pipeline is exposed as agent tools, not as a hardcoded step.
This follows pi's principle: the agent decides when to search.

Components:
- Embedder: calls embedding API (OpenAI-compatible)
- Chunker: splits documents into semantic chunks
- Store: ChromaDB-based vector store
- Tools: search_materials, search_concept_graph (registered as agent tools)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


# ── Chunking ─────────────────────────────────────────────────────────────────


@dataclass
class Chunk:
    """A semantically meaningful text chunk ready for embedding."""

    content: str
    index: int
    page_number: int
    heading: str | None = None
    source_id: str = ""


_HEADER_RE = re.compile(
    r"^(?:"
    r"第[一二三四五六七八九十\d]+[章节篇]"
    r"|Chapter\s+\d+"
    r"|Section\s+\d+"
    r"|\d+(?:\.\d+)*\s+\S"
    r"|[一二三四五六七八九十]+[、.]\s*\S"
    r"|#{1,3}\s+\S"
    r")",
    re.IGNORECASE,
)


def chunk_text(text: str, source_id: str = "", max_chars: int = 800) -> list[Chunk]:
    """Split text into semantic chunks based on headings and paragraph boundaries."""
    lines = text.split("\n")
    chunks: list[Chunk] = []
    idx = 0
    current_heading: str | None = None
    buf: list[str] = []
    buf_chars = 0

    def flush():
        nonlocal idx, buf, buf_chars
        if not buf:
            return
        content = "\n\n".join(buf)
        if current_heading:
            content = f"## {current_heading}\n\n{content}"
        chunks.append(Chunk(
            content=content,
            index=idx,
            page_number=1,
            heading=current_heading,
            source_id=source_id,
        ))
        idx += 1
        buf.clear()
        buf_chars = 0

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect headers
        is_header = bool(_HEADER_RE.match(stripped)) or stripped.startswith("#")
        if is_header:
            flush()
            current_heading = stripped.lstrip("#").strip()
            continue

        # Accumulate paragraphs
        if buf_chars > 0 and buf_chars + len(stripped) + 2 > max_chars:
            flush()
        buf.append(stripped)
        buf_chars += len(stripped) + 2

    flush()
    return chunks


# ── Embedding ────────────────────────────────────────────────────────────────


class Embedder:
    """Calls OpenAI-compatible /embeddings endpoint.

    Works with: OpenAI, Ollama (nomic-embed-text), NVIDIA NIM, etc.
    """

    def __init__(self, base_url: str, api_key: str = "", model: str = "nomic-embed-text") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Batch embed texts."""
        import httpx

        all_embeddings: list[list[float]] = []
        batch_size = 96

        for offset in range(0, len(texts), batch_size):
            batch = texts[offset:offset + batch_size]
            resp = httpx.post(
                f"{self.base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "input": batch, "encoding_format": "float"},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            all_embeddings.extend(item["embedding"] for item in data["data"])

        return all_embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query."""
        results = self.embed_texts([text])
        return results[0]


# ── Vector Store ─────────────────────────────────────────────────────────────


class VectorStore:
    """ChromaDB-based vector store for course material chunks.

    Persists to disk so embeddings survive restarts.
    Works identically on server and in CLI (~/.edufish/cache/).
    """

    def __init__(self, persist_dir: str, collection_name: str = "course_chunks") -> None:
        import chromadb

        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, chunks: list[Chunk], embeddings: list[list[float]], course_id: str = "") -> None:
        """Add chunks with their embeddings to the store."""
        ids = [f"{course_id}:{c.source_id}:{c.index}" for c in chunks]
        documents = [c.content for c in chunks]
        metadatas = [
            {
                "course_id": course_id,
                "source_id": c.source_id,
                "heading": c.heading or "",
                "page_number": c.page_number,
                "chunk_index": c.index,
            }
            for c in chunks
        ]
        self.collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def search(
        self,
        query_embedding: list[float],
        n_results: int = 5,
        course_id: str | None = None,
    ) -> list[dict]:
        """Search for similar chunks. Returns list of {content, metadata, similarity}."""
        count = self.collection.count()
        if count <= 0:
            return []

        kwargs: dict = {
            "query_embeddings": [query_embedding],
            "n_results": min(n_results, count),
        }
        if course_id:
            kwargs["where"] = {"course_id": course_id}

        results = self.collection.query(**kwargs)

        docs = results.get("documents", [[]])[0] or []
        metas = results.get("metadatas", [[]])[0] or []
        distances = results.get("distances", [[]])[0] or []

        return [
            {
                "content": doc,
                "metadata": meta,
                "similarity": round(1.0 - float(dist), 4),
            }
            for doc, meta, dist in zip(docs, metas, distances)
        ]

    def delete_source(self, source_id: str) -> None:
        """Delete all chunks from a specific source."""
        self.collection.delete(where={"source_id": source_id})

    def count(self) -> int:
        return self.collection.count()


# ── RAG Pipeline (combines all components) ───────────────────────────────────


class RAGPipeline:
    """Complete RAG pipeline: embed query → search → format context.

    Used by both the CLI (local store) and the web backend.
    """

    def __init__(self, embedder: Embedder, store: VectorStore) -> None:
        self.embedder = embedder
        self.store = store

    def ingest(self, text: str, source_id: str, course_id: str = "") -> int:
        """Ingest a document: chunk → embed → store. Returns chunk count."""
        chunks = chunk_text(text, source_id=source_id)
        if not chunks:
            return 0

        texts = [c.content for c in chunks]
        embeddings = self.embedder.embed_texts(texts)
        self.store.add_chunks(chunks, embeddings, course_id=course_id)
        return len(chunks)

    def search(self, query: str, course_id: str | None = None, n_results: int = 5) -> list[dict]:
        """Search for relevant chunks given a natural language query."""
        query_embedding = self.embedder.embed_query(query)
        return self.store.search(query_embedding, n_results=n_results, course_id=course_id)

    def build_context(self, query: str, course_id: str | None = None, n_results: int = 5) -> str:
        """Search and format results as context string for the LLM."""
        results = self.search(query, course_id=course_id, n_results=n_results)
        if not results:
            return ""

        parts = []
        for r in results:
            heading = r["metadata"].get("heading", "")
            source = r["metadata"].get("source_id", "unknown")
            if heading:
                parts.append(f"## {heading}\n{r['content']}\n[来源: {source}]")
            else:
                parts.append(f"{r['content']}\n[来源: {source}]")

        return "\n\n---\n\n".join(parts)
