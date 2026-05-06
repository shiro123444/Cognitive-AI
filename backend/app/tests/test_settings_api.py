from app import create_app


def _payload(response):
    return response.get_json()["data"]


def test_llm_settings_defaults_to_mimo_endpoint(client):
    response = client.get("/api/settings/llm")

    assert response.status_code == 200
    data = _payload(response)
    assert data["base_url"] == "https://api.xiaomimimo.com/v1"
    assert data["model"] == "mimo-v2.5-pro"
    assert data["api_key_configured"] is False
    assert "api_key" not in data


def test_updates_and_persists_runtime_llm_settings_without_returning_secret(tmp_path):
    config_path = tmp_path / "runtime_config.json"
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "RUNTIME_CONFIG_PATH": str(config_path),
        "LLM_API_KEY": "",
    })
    client = app.test_client()

    response = client.put("/api/settings/llm", json={
        "base_url": "https://api.xiaomimimo.com/v1",
        "model": "mimo-v2.5-pro",
        "api_key": "tp-secret-last1234",
    })

    assert response.status_code == 200
    data = _payload(response)
    assert data["base_url"] == "https://api.xiaomimimo.com/v1"
    assert data["model"] == "mimo-v2.5-pro"
    assert data["api_key_configured"] is True
    assert data["api_key_hint"] == "****1234"
    assert "api_key" not in data
    assert app.config["LLM_API_KEY"] == "tp-secret-last1234"

    restarted_app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "UPLOAD_DIR": str(tmp_path / "uploads-restarted"),
        "RUNTIME_CONFIG_PATH": str(config_path),
        "LLM_API_KEY": "",
    })

    assert restarted_app.config["LLM_BASE_URL"] == "https://api.xiaomimimo.com/v1"
    assert restarted_app.config["LLM_MODEL_NAME"] == "mimo-v2.5-pro"
    assert restarted_app.config["LLM_API_KEY"] == "tp-secret-last1234"


def test_rejects_invalid_llm_settings(client):
    response = client.put("/api/settings/llm", json={
        "base_url": "not-a-url",
        "model": "mimo-v2.5-pro",
    })

    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_tests_llm_connection_with_request_payload_without_persisting_key(app, client, monkeypatch):
    calls = []

    class FakeLLMClient:
        def __init__(self, base_url, api_key, model, timeout=None):
            calls.append({
                "base_url": base_url,
                "api_key": api_key,
                "model": model,
                "timeout": timeout,
            })

        def chat(self, messages, temperature=0.7, max_tokens=2048):
            calls.append({
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            })
            return "ok"

    monkeypatch.setattr("app.api.settings.LLMClient", FakeLLMClient)

    response = client.post("/api/settings/llm/test", json={
        "base_url": "https://api.xiaomimimo.com/v1",
        "model": "mimo-v2.5-pro",
        "api_key": "tp-request-only",
    })

    assert response.status_code == 200
    data = _payload(response)
    assert data["ok"] is True
    assert data["message"] == "ok"
    assert calls[0] == {
        "base_url": "https://api.xiaomimimo.com/v1",
        "api_key": "tp-request-only",
        "model": "mimo-v2.5-pro",
        "timeout": 20,
    }
    assert app.config["LLM_API_KEY"] == ""


def test_updates_and_persists_embedding_settings_independently(tmp_path):
    config_path = tmp_path / "runtime_config.json"
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "RUNTIME_CONFIG_PATH": str(config_path),
        "EMBEDDING_API_KEY": "",
    })
    client = app.test_client()

    response = client.put("/api/settings/embedding", json={
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "nvidia/nv-embed-v1",
        "api_key": "nvapi-secret-last5678",
        "query_input_type": "query",
        "passage_input_type": "passage",
        "truncate": "END",
    })

    assert response.status_code == 200
    data = _payload(response)
    assert data["base_url"] == "https://integrate.api.nvidia.com/v1"
    assert data["model"] == "nvidia/nv-embed-v1"
    assert data["api_key_configured"] is True
    assert data["api_key_hint"] == "****5678"
    assert data["query_input_type"] == "query"
    assert data["passage_input_type"] == "passage"
    assert data["truncate"] == "END"
    assert "api_key" not in data

    restarted_app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "UPLOAD_DIR": str(tmp_path / "uploads-restarted"),
        "RUNTIME_CONFIG_PATH": str(config_path),
        "EMBEDDING_API_KEY": "",
    })

    assert restarted_app.config["EMBEDDING_BASE_URL"] == "https://integrate.api.nvidia.com/v1"
    assert restarted_app.config["EMBEDDING_MODEL"] == "nvidia/nv-embed-v1"
    assert restarted_app.config["EMBEDDING_API_KEY"] == "nvapi-secret-last5678"
    assert restarted_app.config["EMBEDDING_QUERY_INPUT_TYPE"] == "query"
    assert restarted_app.config["EMBEDDING_PASSAGE_INPUT_TYPE"] == "passage"
    assert restarted_app.config["EMBEDDING_TRUNCATE"] == "END"


def test_tests_embedding_connection_with_query_input_type(client, monkeypatch):
    calls = []

    class FakeEmbeddingClient:
        def __init__(self, base_url, api_key, model, query_input_type="", passage_input_type="", truncate="", **kwargs):
            calls.append({
                "base_url": base_url,
                "api_key": api_key,
                "model": model,
                "query_input_type": query_input_type,
                "passage_input_type": passage_input_type,
                "truncate": truncate,
            })

        def embed_query(self, text):
            calls.append({"query": text})
            return [0.1, 0.2, 0.3]

    monkeypatch.setattr("app.api.settings.EmbeddingClient", FakeEmbeddingClient)

    response = client.post("/api/settings/embedding/test", json={
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "nvidia/nv-embed-v1",
        "api_key": "nvapi-request-only",
        "query_input_type": "query",
        "passage_input_type": "passage",
        "truncate": "END",
    })

    assert response.status_code == 200
    data = _payload(response)
    assert data["ok"] is True
    assert data["dimensions"] == 3
    assert calls[0]["query_input_type"] == "query"
    assert calls[0]["passage_input_type"] == "passage"
