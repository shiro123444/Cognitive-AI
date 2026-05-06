from app.rag.embedding import EmbeddingClient


def test_embedding_client_sends_query_and_passage_input_types(monkeypatch):
    requests = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"embedding": [0.1, 0.2]}]}

    def fake_post(url, headers, json, timeout):
        requests.append({
            "url": url,
            "headers": headers,
            "json": json,
            "timeout": timeout,
        })
        return FakeResponse()

    monkeypatch.setattr("app.rag.embedding.httpx.post", fake_post)

    client = EmbeddingClient(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-test",
        model="nvidia/nv-embed-v1",
        query_input_type="query",
        passage_input_type="passage",
        truncate="END",
    )

    assert client.embed_query("什么是人工智能？") == [0.1, 0.2]
    assert client.embed_texts(["课程材料"]) == [[0.1, 0.2]]

    assert requests[0]["json"]["input_type"] == "query"
    assert requests[0]["json"]["truncate"] == "END"
    assert requests[1]["json"]["input_type"] == "passage"
    assert requests[1]["json"]["truncate"] == "END"
