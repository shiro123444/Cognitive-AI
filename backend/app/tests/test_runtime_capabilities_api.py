from app.jwt_utils import create_access_token


def _runtime_bearer():
    """Mint a runtime service JWT so the existing capability tests can hit
    the now-protected endpoints. Mirrors the flow RuntimeTokenProvider uses
    in production."""
    return {
        "Authorization": f"Bearer {create_access_token(user_id='runtime', role='runtime')}",
        "X-Runtime-User-Id": "student-ada",
        "X-Runtime-User-Role": "student",
    }


def test_lists_runtime_capabilities(client):
    response = client.get("/api/v1/runtime/capabilities", headers=_runtime_bearer())
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
        headers=_runtime_bearer(),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    assert payload["result"]["text"] == "hello runtime"


def test_lists_real_capabilities(client):
    """list_capabilities exposes real registered tools, not just the echo stub."""
    response = client.get("/api/v1/runtime/capabilities", headers=_runtime_bearer())
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
        headers=_runtime_bearer(),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    # search_materials returns {"results": [...]} (empty when embedding is
    # unconfigured, but the shape proves the real handler ran, not echo).
    assert isinstance(payload["result"], dict)
    assert "text" not in payload["result"]


def test_capabilities_require_authentication(client):
    unauth = client.get("/api/v1/runtime/capabilities")
    assert unauth.status_code == 401
    unauth_post = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={"capability_id": "runtime.echo", "arguments": {"text": "x"}},
    )
    assert unauth_post.status_code == 401


def test_capabilities_accept_user_jwt(client, app):
    """A regular user JWT also satisfies the runtime capability gate — this
    keeps the browser-driven debug surface working without forcing every
    UI call to mint a runtime token first."""
    from app.jwt_utils import create_access_token as _cat

    headers = {"Authorization": f"Bearer {_cat(user_id='student-ada', role='student')}"}
    response = client.get("/api/v1/runtime/capabilities", headers=headers)
    assert response.status_code == 200
