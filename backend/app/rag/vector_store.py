"""Vector storage using ChromaDB.

ChromaDB is zero-config, SQLite-based, and needs no external service.
Persists to disk so embeddings survive restarts.
"""

from __future__ import annotations

import chromadb


class VectorStore:
    """Manages a ChromaDB collection for course material chunks."""

    def __init__(self, persist_dir: str, collection_name: str = "course_chunks") -> None:
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add(
        self,
        ids: list[str],
        documents: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict] | None = None,
    ) -> None:
        """Add chunks to the vector store."""
        self.collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def query(
        self,
        embedding: list[float],
        n_results: int = 5,
        where: dict | None = None,
    ) -> dict:
        """Query for similar chunks.

        Returns dict with keys: ids, documents, metadatas, distances
        """
        count = self.collection.count()
        if count <= 0:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

        kwargs: dict = {
            "query_embeddings": [embedding],
            "n_results": min(n_results, count),
        }
        if where:
            kwargs["where"] = where
        return self.collection.query(**kwargs)

    def delete_by_material(self, material_id: str) -> None:
        """Delete all chunks belonging to a material."""
        self.collection.delete(where={"material_id": material_id})

    def count(self) -> int:
        """Total number of chunks in the store."""
        return self.collection.count()
