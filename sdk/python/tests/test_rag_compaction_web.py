"""Tests for RAG pipeline, compaction, and web adapter."""

import asyncio
import json
import time
import tempfile
from pathlib import Path

import pytest

from edufish_engine.ai import AssistantMessage, Model, TextContent, UserMessage
from edufish_engine.engine.rag import Embedder, VectorStore, RAGPipeline, chunk_text, Chunk
from edufish_engine.engine.session import Session, SessionMeta
from edufish_engine.engine.compaction import (
    estimate_tokens,
    estimate_session_tokens,
    should_compact,
    serialize_messages,
)
from edufish_engine.engine.tools import ToolRegistry
from edufish_engine.engine.tools.rag_tools import setup_rag_tools


class TestChunking:
    """Test the text chunking logic."""

    def test_basic_chunking(self):
        text = """# 第一章 神经网络基础

神经网络是一种模拟人脑结构的计算模型。它由多层神经元组成。

## 1.1 感知机

感知机是最简单的神经网络，只有一层。

## 1.2 多层感知机

多层感知机有多个隐藏层，可以学习非线性函数。"""

        chunks = chunk_text(text, source_id="ch01")
        assert len(chunks) >= 2
        assert all(isinstance(c, Chunk) for c in chunks)
        # Should detect headings
        headings = [c.heading for c in chunks if c.heading]
        assert any("感知机" in h for h in headings)

    def test_long_text_splitting(self):
        # Generate text with paragraph breaks (realistic document)
        paragraphs = ["这是第{}段内容，包含一些课程材料。" .format(i) * 5 for i in range(20)]
        long_text = "\n\n".join(paragraphs)
        chunks = chunk_text(long_text, max_chars=200)
        assert len(chunks) > 1
        # Each chunk content should be reasonable size
        for c in chunks:
            assert len(c.content) <= 600  # Some overhead from merging

    def test_empty_text(self):
        chunks = chunk_text("")
        assert chunks == []


class TestVectorStore:
    """Test ChromaDB vector store."""

    def test_add_and_search(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            store = VectorStore(persist_dir=tmpdir, collection_name="test")

            # Add some chunks with fake embeddings
            chunks = [
                Chunk(content="反向传播算法", index=0, page_number=1, heading="BP", source_id="s1"),
                Chunk(content="梯度下降优化", index=1, page_number=1, heading="GD", source_id="s1"),
            ]
            # Fake 3-dim embeddings
            embeddings = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
            store.add_chunks(chunks, embeddings, course_id="ai-intro")

            assert store.count() == 2

            # Search with a query embedding close to first chunk
            results = store.search([0.9, 0.1, 0.0], n_results=1, course_id="ai-intro")
            assert len(results) == 1
            assert "反向传播" in results[0]["content"]

    def test_empty_store_search(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            store = VectorStore(persist_dir=tmpdir, collection_name="empty")
            results = store.search([1.0, 0.0, 0.0])
            assert results == []


class TestRAGTools:
    """Test RAG tools registration and execution."""

    def test_search_materials_no_pipeline(self):
        reg = ToolRegistry()
        setup_rag_tools(reg, rag_pipeline=None, graph_data=None)

        result = reg.execute("search_materials", {"query": "test"})
        assert result["results"] == []
        assert "未配置" in result.get("message", "")

    def test_search_concept_graph(self):
        reg = ToolRegistry()
        graph = {
            "nodes": [
                {"id": "c1", "label": "反向传播", "definition": "通过链式法则计算梯度的算法"},
                {"id": "c2", "label": "梯度下降", "definition": "沿梯度方向更新参数"},
            ],
            "edges": [
                {"source": "c1", "target": "c2", "relationship": "uses", "evidence": "BP uses GD"},
            ],
        }
        setup_rag_tools(reg, graph_data=graph)

        result = reg.execute("search_concept_graph", {"query": "反向传播"})
        assert result["concept_count"] >= 1
        assert result["concepts"][0]["label"] == "反向传播"
        assert result["edge_count"] >= 1


class TestCompaction:
    """Test session compaction logic."""

    def test_estimate_tokens(self):
        # CJK: ~3 chars per token
        assert estimate_tokens("你好世界") > 0
        # English: ~4 chars per token
        assert estimate_tokens("hello world") > 0

    def test_should_compact(self):
        model = Model(id="test", provider="test", context_window=1000)

        # Short session — no compaction needed
        session = Session()
        session.messages = [UserMessage(content="短问题")]
        assert not should_compact(session, model)

        # Long session — needs compaction
        session.messages = [
            UserMessage(content="很长的问题" * 200),
            AssistantMessage(content=[TextContent(text="很长的回答" * 200)]),
        ] * 5
        assert should_compact(session, model)

    def test_serialize_messages(self):
        session = Session()
        session.messages = [
            UserMessage(content="什么是CNN？", timestamp=1.0),
            AssistantMessage(content=[TextContent(text="CNN是卷积神经网络。")], timestamp=2.0),
        ]

        text = serialize_messages(session)
        assert "学生: 什么是CNN？" in text
        assert "助手: CNN是卷积神经网络。" in text


class TestSession:
    """Test session persistence."""

    def test_save_and_load(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test_session.json"

            session = Session(meta=SessionMeta(
                id="test-123",
                course_id="ai-intro",
                created_at=time.time(),
            ))
            session.add_user_message("什么是注意力机制？")
            session.add_assistant_message(AssistantMessage(
                content=[TextContent(text="注意力机制是...")],
                timestamp=time.time(),
            ))

            session.save(path)
            assert path.exists()

            loaded = Session.load(path)
            assert loaded.meta.id == "test-123"
            assert loaded.meta.course_id == "ai-intro"
            assert len(loaded.messages) == 2

    def test_compaction_state(self):
        session = Session()
        session.messages = [UserMessage(content=f"问题{i}") for i in range(10)]
        session.compact("这是之前对话的摘要")

        assert session.compaction_summary == "这是之前对话的摘要"
        assert len(session.messages) == 4  # Keeps last 4
        assert session.meta.compaction_count == 1


class TestWebAdapter:
    """Test the web adapter event conversion."""

    def test_event_to_sse(self):
        from edufish_engine.web import event_to_sse
        from edufish_engine.ai import TextDeltaEvent
        from edufish_engine.engine.agent import AgentDoneEvent, ToolExecutingEvent

        # Text delta
        sse = event_to_sse(TextDeltaEvent(delta="hello"))
        assert "token" in sse
        assert "hello" in sse

        # Tool executing
        sse = event_to_sse(ToolExecutingEvent(name="search", arguments={"q": "test"}))
        assert "tool_call" in sse
        assert "search" in sse

        # Agent done
        sse = event_to_sse(AgentDoneEvent(answer="最终答案"))
        assert "answer" in sse
        assert "最终答案" in sse
