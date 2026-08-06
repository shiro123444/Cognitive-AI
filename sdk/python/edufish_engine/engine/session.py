"""Session — Conversation state management with compaction.

Inspired by pi's AgentSession: manages conversation history, handles
context window limits via compaction, and persists state.

For an educational platform, sessions also track:
- Which course/chapter the student is studying
- Learning progress signals (questions asked, concepts explored)
- Citations accumulated during the session
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..ai import AssistantMessage, Message, Model, UserMessage


@dataclass
class SessionMeta:
    """Metadata about a learning session."""

    id: str = ""
    course_id: str = ""
    chapter_id: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0
    title: str = ""  # Auto-generated from first question
    message_count: int = 0
    compaction_count: int = 0


@dataclass
class Session:
    """A conversation session with history and context management.

    The session is the bridge between the agent and persistence.
    It knows how to:
    1. Accumulate messages
    2. Detect when compaction is needed
    3. Serialize/deserialize to disk
    4. Track learning-specific metadata
    """

    meta: SessionMeta = field(default_factory=SessionMeta)
    messages: list[Message] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    # Compaction summary (replaces old messages when context is too long)
    compaction_summary: str = ""

    def add_user_message(self, content: str) -> None:
        """Add a user message to the session."""
        self.messages.append(UserMessage(content=content, timestamp=time.time()))
        self.meta.message_count += 1
        self.meta.updated_at = time.time()
        if not self.meta.title and len(content) > 0:
            self.meta.title = content[:50]

    def add_assistant_message(self, message: AssistantMessage) -> None:
        """Add an assistant response to the session."""
        self.messages.append(message)
        self.meta.message_count += 1
        self.meta.updated_at = time.time()

    def should_compact(self, model: Model, threshold: float = 0.75) -> bool:
        """Check if the session needs compaction.

        Heuristic: estimate token count and compare to context window.
        """
        estimated_tokens = self._estimate_tokens()
        return estimated_tokens > model.context_window * threshold

    def compact(self, summary: str) -> None:
        """Replace old messages with a compaction summary.

        Keeps the most recent messages and prepends the summary.
        """
        # Keep last 4 messages (2 turns)
        keep = self.messages[-4:] if len(self.messages) > 4 else self.messages[:]
        self.compaction_summary = summary
        self.messages = keep
        self.meta.compaction_count += 1

    def build_system_context(self) -> str:
        """Build additional system context from session state.

        This gets appended to the agent's system prompt.
        """
        parts = []
        if self.compaction_summary:
            parts.append(f"## 之前的对话摘要\n{self.compaction_summary}")
        if self.meta.course_id:
            parts.append(f"当前课程: {self.meta.course_id}")
        if self.meta.chapter_id:
            parts.append(f"当前章节: {self.meta.chapter_id}")
        return "\n\n".join(parts)

    def _estimate_tokens(self) -> int:
        """Rough token estimation (4 chars ≈ 1 token for mixed CJK/English)."""
        total_chars = len(self.compaction_summary)
        for msg in self.messages:
            if isinstance(msg, UserMessage):
                total_chars += len(msg.content)
            elif isinstance(msg, AssistantMessage):
                total_chars += len(msg.text)
        return total_chars // 3  # Conservative for CJK

    # ── Persistence ──────────────────────────────────────────────────────────

    def save(self, path: Path) -> None:
        """Save session to a JSON file."""
        data = {
            "meta": {
                "id": self.meta.id,
                "course_id": self.meta.course_id,
                "chapter_id": self.meta.chapter_id,
                "created_at": self.meta.created_at,
                "updated_at": self.meta.updated_at,
                "title": self.meta.title,
                "message_count": self.meta.message_count,
                "compaction_count": self.meta.compaction_count,
            },
            "compaction_summary": self.compaction_summary,
            "citations": self.citations,
            "messages": [self._serialize_message(m) for m in self.messages],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    @classmethod
    def load(cls, path: Path) -> Session:
        """Load session from a JSON file."""
        data = json.loads(path.read_text())
        session = cls()
        meta = data.get("meta", {})
        session.meta = SessionMeta(**meta)
        session.compaction_summary = data.get("compaction_summary", "")
        session.citations = data.get("citations", [])
        # Messages are stored simplified — we only need them for context
        for msg_data in data.get("messages", []):
            if msg_data["role"] == "user":
                session.messages.append(UserMessage(
                    content=msg_data["content"],
                    timestamp=msg_data.get("timestamp", 0),
                ))
            elif msg_data["role"] == "assistant":
                from ..ai import TextContent
                session.messages.append(AssistantMessage(
                    content=[TextContent(text=msg_data.get("text", ""))],
                    timestamp=msg_data.get("timestamp", 0),
                ))
        return session

    @staticmethod
    def _serialize_message(msg: Message) -> dict:
        if isinstance(msg, UserMessage):
            return {"role": "user", "content": msg.content, "timestamp": msg.timestamp}
        elif isinstance(msg, AssistantMessage):
            return {"role": "assistant", "text": msg.text, "timestamp": msg.timestamp}
        return {"role": msg.role, "timestamp": getattr(msg, "timestamp", 0)}
