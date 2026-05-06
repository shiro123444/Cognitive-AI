"""Semantic-aware chunking based on document structure.

Adapted from PathMind-AI's smart_chunker.py for this project's simpler needs.
Input is PageText list (from pypdf or text extraction), not StructuredElement.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.rag.extractor import PageText


@dataclass
class SmartChunk:
    """A semantically meaningful chunk ready for embedding."""

    content: str
    chunk_index: int
    page_number: int
    chunk_type: str  # "section" | "text" | "table"
    heading: str | None = None


# Patterns that likely indicate section headers
_HEADER_RE = re.compile(
    r"^(?:"
    r"第[一二三四五六七八九十\d]+[章节篇]"  # Chinese: 第X章/节/篇
    r"|Chapter\s+\d+"                       # English: Chapter N
    r"|Section\s+\d+"                       # Section N
    r"|\d+(?:\.\d+)*\s+\S"                 # Numbered: 1.2.3 Title
    r"|[一二三四五六七八九十]+[、.]\s*\S"      # Chinese numbered: 一、Title
    r"|#{1,3}\s+\S"                         # Markdown headers
    r")",
    re.IGNORECASE,
)

# Short standalone lines that look like headers (heuristic)
_SHORT_LINE_THRESHOLD = 40


# Patterns that are PDF extraction artifacts, not real headers
_ARTIFACT_RE = re.compile(
    r"^[0-9\-_./\s]+$"           # pure digits/dashes/slashes/dots: "01-C-", "1/23", "3-1"
    r"|^[A-Za-z]?\d+[A-Za-z]?$"  # "1", "12a", "C3" — short alphanumeric codes
    r"|^[^一-鿿a-zA-Z0-9]+$"      # pure symbols/punctuation
    r"|^.{1,2}$"                  # single or double character (too short to be meaningful)
)

# Valid CJK characters (CJK Unified, Extension A, basic punctuation)
_CJK_RE = re.compile(r"[一-鿿㐀-䶿]")


def _has_meaningful_chars(line: str) -> bool:
    """True if line has enough meaningful characters to be a real header."""
    stripped = line.strip()
    # Count meaningful characters (letters + CJK)
    meaningful = sum(1 for c in stripped if c.isalpha() or _CJK_RE.match(c))
    total = len(stripped) if stripped else 1
    return meaningful >= 2 and (meaningful / total) >= 0.3


def _is_likely_header(line: str) -> bool:
    """Heuristic: is this line likely a section header?"""
    stripped = line.strip()
    if not stripped:
        return False
    # Markdown header
    if stripped.startswith("#"):
        return True
    # Matches numbered header pattern
    if _HEADER_RE.match(stripped):
        return True
    # Reject known PDF artifacts
    if _ARTIFACT_RE.match(stripped):
        return False
    # Must have at least some meaningful characters
    if not _has_meaningful_chars(stripped):
        return False
    # Short line that's not a sentence (no period at end, not too many words)
    if len(stripped) < _SHORT_LINE_THRESHOLD and not stripped.endswith(("。", ".", "？", "?", "！", "!")):
        word_count = len(stripped.split())
        if word_count <= 6:
            return True
    return False


def _split_into_sections(text: str) -> list[tuple[str | None, str]]:
    """Split text into (heading, body) sections."""
    lines = text.split("\n")
    sections: list[tuple[str | None, list[str]]] = []
    current_heading: str | None = None
    current_lines: list[str] = []

    for line in lines:
        if _is_likely_header(line):
            # Flush previous section
            if current_lines:
                sections.append((current_heading, current_lines))
            current_heading = line.strip().lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    # Flush last section
    if current_lines:
        sections.append((current_heading, current_lines))

    # Convert to (heading, body_text) pairs
    result = []
    for heading, lines in sections:
        body = "\n".join(lines).strip()
        if body:
            result.append((heading, body))
    return result


def smart_chunk(pages: list[PageText], max_chars: int = 800) -> list[SmartChunk]:
    """Split pages into semantic chunks.

    Strategy:
    1. Merge all page text, preserving page boundaries
    2. Detect section headers via heuristics
    3. Each section header starts a new chunk
    4. Within sections, merge paragraphs until max_chars
    5. Each chunk is prefixed with its parent heading for retrieval context
    """
    chunks: list[SmartChunk] = []
    idx = 0

    for page in pages:
        sections = _split_into_sections(page.text)

        for heading, body in sections:
            # Split body into paragraphs
            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]

            # Accumulator for merging paragraphs
            buf: list[str] = []
            buf_chars = 0

            def flush_buf() -> None:
                nonlocal idx, buf, buf_chars
                if not buf:
                    return
                content = "\n\n".join(buf)
                if heading:
                    content = f"## {heading}\n\n{content}"
                chunks.append(
                    SmartChunk(
                        content=content,
                        chunk_index=idx,
                        page_number=page.page_number,
                        chunk_type="section" if heading else "text",
                        heading=heading,
                    )
                )
                idx += 1
                buf.clear()
                buf_chars = 0

            for para in paragraphs:
                para_len = len(para)
                # Would exceed max_chars? Flush first.
                if buf_chars > 0 and buf_chars + para_len + 2 > max_chars:
                    flush_buf()
                buf.append(para)
                buf_chars += para_len + 2  # +2 for "\n\n" join

            flush_buf()

    # Ensure at least one chunk if there's any text
    if not chunks and pages:
        all_text = "\n\n".join(p.text for p in pages).strip()
        if all_text:
            chunks.append(
                SmartChunk(
                    content=all_text[:max_chars],
                    chunk_index=0,
                    page_number=1,
                    chunk_type="text",
                    heading=None,
                )
            )

    return chunks
