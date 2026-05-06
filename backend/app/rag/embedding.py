"""OpenAI-compatible embedding client.

Works with any OpenAI-compatible /embeddings endpoint:
- OpenAI (text-embedding-3-small, text-embedding-3-large)
- NVIDIA NIM (nv-embedqa-e5-v5, nv-embedcode-7b-v1)
- Local servers (Ollama, vLLM, etc.)
"""

from __future__ import annotations

import httpx

from ..url_rewrite import rewrite_base_url

MAX_CHARS_PER_CHUNK = 450


def _truncate(text: str, max_chars: int = MAX_CHARS_PER_CHUNK) -> str:
    """Truncate text to fit within the model's token limit."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Try to break at a natural boundary
    for sep in ("\n\n", "\n", "。", ".", " "):
        idx = truncated.rfind(sep)
        if idx > max_chars // 2:
            return truncated[: idx + len(sep)]
    return truncated


class EmbeddingClient:
    """Calls OpenAI-compatible /embeddings endpoint for text vectorization."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        max_chars: int = MAX_CHARS_PER_CHUNK,
        query_input_type: str = "",
        passage_input_type: str = "",
        truncate: str = "",
    ) -> None:
        self.base_url = rewrite_base_url(base_url).rstrip("/")
        self.api_key = api_key
        self.model = model
        self.max_chars = max(64, int(max_chars))
        self.query_input_type = query_input_type
        self.passage_input_type = passage_input_type
        self.truncate = truncate

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Batch embed texts. Splits into batches of 96 for large inputs."""
        truncated = [_truncate(t, self.max_chars) for t in texts]
        all_embeddings: list[list[float]] = []

        batch_size = 96
        for offset in range(0, len(truncated), batch_size):
            batch = truncated[offset : offset + batch_size]
            resp = httpx.post(
                f"{self.base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=self._payload(batch, purpose="passage"),
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            batch_embeddings = [item["embedding"] for item in data["data"]]
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query text."""
        truncated = _truncate(text, self.max_chars)
        resp = httpx.post(
            f"{self.base_url}/embeddings",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=self._payload([truncated], purpose="query"),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]

    def _payload(self, inputs: list[str], purpose: str) -> dict:
        payload = {
            "model": self.model,
            "input": inputs,
            "encoding_format": "float",
        }
        input_type = self.query_input_type if purpose == "query" else self.passage_input_type
        if input_type:
            payload["input_type"] = input_type
        if self.truncate:
            payload["truncate"] = self.truncate
        return payload
