"""Platform API Client — Communicates with the web backend.

This is the sync layer's HTTP client. It talks to the same Flask API
that the web frontend uses, but from the CLI context.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx


class PlatformClient:
    """HTTP client for the EduFish web platform API.

    Used by the CLI to:
    - Pull course materials and knowledge graph
    - Push learning progress events
    - Authenticate the local user
    """

    def __init__(self, base_url: str, api_key: str = "", timeout: float = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
        )

    # ── Courses ──────────────────────────────────────────────────────────────

    def list_courses(self) -> list[dict[str, Any]]:
        """List available courses."""
        resp = self._client.get("/api/v1/courses")
        resp.raise_for_status()
        return resp.json().get("data", {}).get("courses", [])

    def get_course(self, course_id: str) -> dict[str, Any]:
        """Get course details."""
        resp = self._client.get(f"/api/v1/courses/{course_id}")
        resp.raise_for_status()
        return resp.json().get("data", {})

    # ── Materials ────────────────────────────────────────────────────────────

    def list_materials(self, course_id: str) -> list[dict[str, Any]]:
        """List materials for a course."""
        resp = self._client.get(f"/api/v1/materials", params={"course_id": course_id})
        resp.raise_for_status()
        return resp.json().get("data", {}).get("materials", [])

    def download_material(self, material_id: str) -> bytes:
        """Download a material file."""
        resp = self._client.get(f"/api/v1/materials/{material_id}/download")
        resp.raise_for_status()
        return resp.content

    # ── Knowledge Graph ──────────────────────────────────────────────────────

    def get_graph(self, course_id: str) -> dict[str, Any]:
        """Get the knowledge graph for a course."""
        resp = self._client.get(f"/api/v1/graph", params={"course_id": course_id})
        resp.raise_for_status()
        return resp.json().get("data", {})

    # ── Chapters ─────────────────────────────────────────────────────────────

    def list_chapters(self, course_id: str) -> list[dict[str, Any]]:
        """List chapters for a course."""
        resp = self._client.get(f"/api/v1/courses/{course_id}/chapters")
        resp.raise_for_status()
        return resp.json().get("data", {}).get("chapters", [])

    # ── Progress ─────────────────────────────────────────────────────────────

    def push_progress_events(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        """Push learning progress events to the platform."""
        resp = self._client.post("/api/v1/progress/batch", json={"events": events})
        resp.raise_for_status()
        return resp.json().get("data", {})

    # ── Tutor (remote fallback) ──────────────────────────────────────────────

    def ask_tutor(self, question: str, course_id: str = "", chapter_id: str = ""):
        """Ask the remote tutor (fallback when local LLM is unavailable).

        Returns an iterator of SSE events for streaming.
        """
        with self._client.stream(
            "POST",
            "/api/v1/tutor/ask",
            json={
                "question": question,
                "course_id": course_id,
                "chapter_id": chapter_id,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    yield line[6:]
