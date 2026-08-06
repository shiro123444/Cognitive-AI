def test_lists_runtime_capabilities(client):
    response = client.get("/api/v1/runtime/capabilities")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["capabilities"][0]["kind"] in {"tool", "resource"}


def test_invokes_runtime_capability(client):
    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={
            "capability_id": "runtime.echo",
            "arguments": {"text": "hello runtime"}
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    assert payload["result"]["text"] == "hello runtime"


def test_lists_real_capabilities(client):
    """list_capabilities exposes real registered tools, not just the echo stub."""
    response = client.get("/api/v1/runtime/capabilities")
    assert response.status_code == 200
    payload = response.get_json()
    capability_ids = {cap["capability_id"] for cap in payload["capabilities"]}
    assert "search_materials" in capability_ids
    assert "search_concept_graph" in capability_ids
    assert "runtime.echo" in capability_ids


def test_invokes_real_capability(client):
    """invoke_capability dispatches to the real tool registry handler."""
    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={
            "capability_id": "search_materials",
            "arguments": {"query": "卷积神经网络", "n_results": 2},
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    # search_materials returns {"results": [...]} (empty when embedding is
    # unconfigured, but the shape proves the real handler ran, not echo).
    assert isinstance(payload["result"], dict)
    assert "text" not in payload["result"]
