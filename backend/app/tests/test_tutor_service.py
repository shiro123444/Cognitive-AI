from app.services.seed_data import seed_courses
from app.services.tutor_service import TutorService


def test_tutor_answer_cites_attention_evidence_for_known_question(app):
    with app.app_context():
        seed_courses()

        result = TutorService.answer(
            "How are transformer attention and human attention related?",
            course_id="ai-intro",
        )

    assert result["insufficient_evidence"] is False
    assert "attention" in result["answer"].lower()
    assert result["citations"]
    assert any(citation["type"] == "graph_edge" for citation in result["citations"])


def test_tutor_answer_reports_insufficient_evidence_for_unknown_policy_question(app):
    with app.app_context():
        seed_courses()

        result = TutorService.answer(
            "What is the tuition refund policy?",
            course_id="ai-intro",
        )

    assert result["insufficient_evidence"] is True
    assert result["citations"] == []
    assert "课程证据" in result["answer"]


def test_tutor_api_returns_answer_for_valid_question(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/tutor/ask",
        json={
            "question": "How are transformer attention and human attention related?",
            "course_id": "ai-intro",
        },
    )
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["insufficient_evidence"] is False
    assert payload["data"]["citations"]


def test_tutor_api_rejects_empty_question(client):
    res = client.post("/api/tutor/ask", json={"question": "   ", "course_id": "ai-intro"})
    payload = res.get_json()

    assert res.status_code == 400
    assert payload == {"success": False, "error": "question is required"}


def test_tutor_answers_single_known_concept_token(app):
    with app.app_context():
        seed_courses()

        result = TutorService.answer("What is attention?", course_id="brain-cog-intro")

    assert result["insufficient_evidence"] is False
    assert result["citations"]
    assert "attention" in result["answer"].lower()


def test_tutor_concept_scope_does_not_cite_unrelated_chapters(app):
    with app.app_context():
        seed_courses()

        result = TutorService.answer(
            "reward learning",
            course_id="brain-cog-intro",
            concept_id="concept-human-attention",
        )

    assert result["insufficient_evidence"] is True
    assert result["citations"] == []


def test_tutor_api_rejects_non_string_context_fields(client):
    res = client.post(
        "/api/tutor/ask",
        json={
            "question": "What is attention?",
            "course_id": ["ai-intro"],
        },
    )
    payload = res.get_json()

    assert res.status_code == 400
    assert payload == {"success": False, "error": "course_id must be a string"}


def test_tutor_api_rejects_unknown_course_id(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/tutor/ask",
        json={
            "question": "What is attention?",
            "course_id": "missing-course",
        },
    )
    payload = res.get_json()

    assert res.status_code == 400
    assert payload == {"success": False, "error": "course_id not found"}


def test_tutor_answer_reports_course_specific_mode(app):
    with app.app_context():
        seed_courses()

        ai_result = TutorService.answer("What is heuristic search?", course_id="ai-intro")
        brain_result = TutorService.answer("What is human attention?", course_id="brain-cog-intro")

    assert ai_result["course_mode"] == "ai_engineering"
    assert brain_result["course_mode"] == "cognitive_neuroscience"


def test_tutor_system_prompt_changes_with_course_profile(app):
    with app.app_context():
        seed_courses()

        ai_prompt = TutorService._build_system_prompt("ai-intro", None)
        brain_prompt = TutorService._build_system_prompt("brain-cog-intro", None)

    assert "算法机制" in ai_prompt
    assert "模型边界" in ai_prompt
    assert "神经机制" in brain_prompt
    assert "实验范式" in brain_prompt


def test_tutor_stream_surfaces_rag_failure_before_chinese_fallback(app, monkeypatch):
    def fail_rag_stream(*args, **kwargs):
        raise RuntimeError("Error code: 401 - invalid_key")
        yield

    monkeypatch.setattr(TutorService, "_rag_answer_stream", fail_rag_stream)

    with app.app_context():
        seed_courses()
        app.config["LLM_API_KEY"] = "configured-but-invalid"
        events = list(TutorService.answer_stream("人工智能是什么？", course_id="ai-intro"))

    joined = "".join(events)
    assert '"type": "error"' in joined
    assert "模型连接失败" in joined
    assert '"type": "answer"' in joined
    assert "课程证据" in joined


def test_tutor_stream_continues_to_llm_when_embedding_lookup_fails(app, monkeypatch):
    class FailingEmbeddingClient:
        def __init__(self, *args, **kwargs):
            pass

        def embed_query(self, text):
            raise RuntimeError("/embeddings unavailable")

    class FakeLLMClient:
        def __init__(self, *args, **kwargs):
            pass

        def chat_stream(self, *args, **kwargs):
            yield "这是图谱上下文回答。"

    monkeypatch.setattr("app.rag.embedding.EmbeddingClient", FailingEmbeddingClient)
    monkeypatch.setattr("app.llm_client.LLMClient", FakeLLMClient)

    with app.app_context():
        seed_courses()
        app.config["LLM_API_KEY"] = "valid-chat-key"
        app.config["EMBEDDING_API_KEY"] = "embedding-key"
        events = list(TutorService.answer_stream("人工智能是什么？", course_id="ai-intro"))

    joined = "".join(events)
    assert "RAG 向量检索暂时不可用" in joined
    assert '"type": "error"' not in joined
    assert '"type": "token"' in joined
    assert "这是图谱上下文回答。" in joined
    assert joined.rstrip().endswith("data: [DONE]")


def test_tutor_non_stream_uses_llm_when_embedding_key_is_missing(app, monkeypatch):
    class UnexpectedEmbeddingClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("embedding should be skipped when EMBEDDING_API_KEY is empty")

    class FakeLLMClient:
        def __init__(self, *args, **kwargs):
            pass

        def chat(self, *args, **kwargs):
            return "这是非流式模型回答。"

    monkeypatch.setattr("app.rag.embedding.EmbeddingClient", UnexpectedEmbeddingClient)
    monkeypatch.setattr("app.llm_client.LLMClient", FakeLLMClient)

    with app.app_context():
        seed_courses()
        app.config["LLM_API_KEY"] = "valid-chat-key"
        app.config["EMBEDDING_API_KEY"] = ""
        result = TutorService.answer("What is heuristic search?", course_id="ai-intro")

    assert result["answer"] == "这是非流式模型回答。"
    assert result["course_mode"] == "ai_engineering"
    assert result["insufficient_evidence"] is False


def test_tutor_stream_retries_non_streaming_llm_when_stream_breaks(app, monkeypatch):
    class FakeLLMClient:
        def __init__(self, *args, **kwargs):
            pass

        def chat_stream(self, *args, **kwargs):
            raise RuntimeError("peer closed connection without sending complete message body")
            yield

        def chat(self, *args, **kwargs):
            return "这是流式断开后的非流式模型回答。"

    monkeypatch.setattr("app.llm_client.LLMClient", FakeLLMClient)

    with app.app_context():
        seed_courses()
        app.config["LLM_API_KEY"] = "valid-chat-key"
        app.config["EMBEDDING_API_KEY"] = ""
        events = list(TutorService.answer_stream("什么是启发式搜索？", course_id="ai-intro"))

    joined = "".join(events)
    assert '"type": "answer"' in joined
    assert "这是流式断开后的非流式模型回答。" in joined
    assert "模型连接暂时不可用" not in joined
    assert joined.rstrip().endswith("data: [DONE]")
