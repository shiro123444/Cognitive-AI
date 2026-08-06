"""Session Compaction — LLM-powered conversation summarization.

Inspired by pi's compaction/compaction.ts:
- Detects when context window is approaching limits
- Uses the LLM itself to generate a structured summary
- Keeps recent messages, replaces old ones with the summary
- Tracks learning-specific metadata (concepts explored, questions asked)

Pi's compaction uses a structured format with sections:
  Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context

For education, we adapt this to:
  Topic / Concepts Explored / Questions Asked / Key Insights / Next Steps
"""

from __future__ import annotations

import time
from typing import Any

from ..ai import (
    AssistantMessage,
    Context,
    Model,
    TextContent,
    UserMessage,
)
from ..ai.registry import complete
from .session import Session


# ── Compaction Prompt (adapted from pi) ──────────────────────────────────────

COMPACTION_SYSTEM_PROMPT = """你是一个学习会话摘要生成器。你的任务是将一段学习对话压缩成结构化摘要，
以便另一个 AI 助手可以继续这段对话而不丢失关键上下文。"""

COMPACTION_USER_PROMPT = """以下是一段学习对话，请生成结构化摘要。

<conversation>
{conversation}
</conversation>

请使用以下格式生成摘要：

## 学习主题
[学生在学习什么？涉及哪些课程/章节？]

## 已探索的概念
- [列出对话中讨论过的核心概念]

## 关键问答
- **问**: [学生的关键问题]
  **答**: [核心要点，1-2句]

## 学生理解程度
- [学生对哪些概念理解较好？哪些还有困惑？]

## 下一步建议
- [基于对话，学生接下来应该学什么？]

保持简洁，重点保留对继续对话有用的信息。"""

UPDATE_COMPACTION_PROMPT = """以下是新的对话消息，请将其整合到已有的摘要中。

<previous-summary>
{previous_summary}
</previous-summary>

<new-messages>
{conversation}
</new-messages>

规则：
- 保留已有摘要中的所有重要信息
- 添加新对话中的新概念、新问题、新理解
- 更新"学生理解程度"和"下一步建议"
- 使用与之前相同的格式

请输出更新后的完整摘要："""


# ── Token Estimation ─────────────────────────────────────────────────────────


def estimate_tokens(text: str) -> int:
    """Estimate token count. Conservative for CJK (3 chars ≈ 1 token)."""
    return len(text) // 3


def estimate_session_tokens(session: Session) -> int:
    """Estimate total tokens in a session's context."""
    total = estimate_tokens(session.compaction_summary)
    for msg in session.messages:
        if isinstance(msg, UserMessage):
            total += estimate_tokens(msg.content)
        elif isinstance(msg, AssistantMessage):
            total += estimate_tokens(msg.text)
    return total


# ── Compaction Logic ─────────────────────────────────────────────────────────


def should_compact(session: Session, model: Model, threshold: float = 0.7) -> bool:
    """Check if session needs compaction (pi's shouldCompact equivalent)."""
    tokens = estimate_session_tokens(session)
    return tokens > model.context_window * threshold


def serialize_messages(session: Session, max_messages: int | None = None) -> str:
    """Serialize session messages to text for the compaction prompt."""
    messages = session.messages
    if max_messages:
        messages = messages[:max_messages]

    parts = []
    for msg in messages:
        if isinstance(msg, UserMessage):
            parts.append(f"学生: {msg.content}")
        elif isinstance(msg, AssistantMessage):
            parts.append(f"助手: {msg.text}")

    return "\n\n".join(parts)


async def generate_compaction_summary(
    session: Session,
    model: Model,
    keep_recent: int = 4,
) -> str:
    """Generate a compaction summary using the LLM.

    Inspired by pi's generateSummary():
    - Serializes old messages into text
    - Asks the LLM to produce a structured summary
    - If there's a previous summary, uses the update prompt to merge

    Args:
        session: The session to compact
        model: The model to use for summarization
        keep_recent: Number of recent messages to keep (not summarized)
    """
    # Determine which messages to summarize
    if len(session.messages) <= keep_recent:
        return session.compaction_summary  # Nothing to compact

    messages_to_summarize = session.messages[:-keep_recent]
    conversation_text = serialize_messages(
        Session(messages=messages_to_summarize),
    )

    # Build the prompt
    if session.compaction_summary:
        # Update existing summary
        user_content = UPDATE_COMPACTION_PROMPT.format(
            previous_summary=session.compaction_summary,
            conversation=conversation_text,
        )
    else:
        # Fresh summary
        user_content = COMPACTION_USER_PROMPT.format(
            conversation=conversation_text,
        )

    ctx = Context(
        system_prompt=COMPACTION_SYSTEM_PROMPT,
        messages=[UserMessage(content=user_content, timestamp=time.time())],
    )

    result = await complete(model, ctx, temperature=0.3, max_tokens=2048)
    return result.text


async def compact_session(
    session: Session,
    model: Model,
    keep_recent: int = 4,
) -> bool:
    """Perform compaction on a session.

    Returns True if compaction was performed, False if not needed.

    This is the high-level function that:
    1. Checks if compaction is needed
    2. Generates the summary
    3. Updates the session state
    """
    if not should_compact(session, model):
        return False

    summary = await generate_compaction_summary(session, model, keep_recent=keep_recent)

    if summary:
        session.compact(summary)
        return True

    return False
