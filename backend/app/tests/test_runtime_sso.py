"""Tests for the runtime SSO token endpoint and downstream wiring."""

import time

import jwt

from app.api.runtime_auth import RUNTIME_ROLE, RUNTIME_TOKEN_TTL_HOURS, RUNTIME_USER_ID
from app.jwt_utils import _configured_secret, decode_access_token


def test_mints_runtime_token(client):
    response = client.post("/api/v1/runtime/sessions/runtime-token")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["role"] == RUNTIME_ROLE
    assert data["ttl_hours"] == RUNTIME_TOKEN_TTL_HOURS
    assert data["expires_at"] > int(time.time())

    # Verify the token actually verifies with the backend's JWT secret.
    claims = decode_access_token(data["token"])
    assert claims["role"] == RUNTIME_ROLE
    assert claims["sub"] == RUNTIME_USER_ID
    # And the raw signature is HS256.
    header = jwt.get_unverified_header(data["token"])
    assert header["alg"] == "HS256"


def test_runtime_token_is_rejected_by_engine_key_when_configured(app, client):
    app.config["ENGINE_API_KEY"] = "test-engine-shared-secret"
    try:
        # No X-API-Key presented — must 401.
        response = client.post("/api/v1/runtime/sessions/runtime-token")
        assert response.status_code == 401
        assert response.get_json()["error"]["code"] == "UNAUTHORIZED"

        # Matching key presented — must succeed.
        ok = client.post(
            "/api/v1/runtime/sessions/runtime-token",
            headers={"X-API-Key": "test-engine-shared-secret"},
        )
        assert ok.status_code == 200
    finally:
        app.config.pop("ENGINE_API_KEY", None)


def test_minted_token_can_discover_capabilities(client):
    mint = client.post("/api/v1/runtime/sessions/runtime-token")
    token = mint.get_json()["data"]["token"]

    response = client.get(
        "/api/v1/runtime/capabilities",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Runtime-User-Id": "student-ada",
            "X-Runtime-User-Role": "student",
        },
    )
    assert response.status_code == 200
    capabilities = response.get_json()["capabilities"]
    assert any(cap["capability_id"] == "runtime.echo" for cap in capabilities)


def test_runtime_invocation_forwards_user_context(client):
    """A runtime-brokered call must surface the originating user via the
    ``user_context`` kwarg on the underlying tool handler."""
    mint = client.post("/api/v1/runtime/sessions/runtime-token")
    token = mint.get_json()["data"]["token"]

    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={"capability_id": "runtime.echo", "arguments": {"text": "ctx test"}},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Runtime-User-Id": "student-bob",
            "X-Runtime-User-Role": "student",
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    assert payload["result"]["text"] == "ctx test"
    assert payload["result"]["user_context"] == {
        "id": "student-bob",
        "role": "student",
    }


def test_runtime_invocation_requires_user_header(client):
    """A runtime call without an originating-user header must 403 — the
    backend can't attribute side effects without a known user."""
    mint = client.post("/api/v1/runtime/sessions/runtime-token")
    token = mint.get_json()["data"]["token"]

    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={"capability_id": "runtime.echo", "arguments": {"text": "no ctx"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "X-Runtime-User-Id" in response.get_json()["error"]["message"]


def test_user_invocation_does_not_require_user_header(client):
    """A direct user call (Bearer from a real student/teacher JWT) must
    succeed without any X-Runtime-User-* headers."""
    from app.jwt_utils import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(user_id='student-ada', role='student')}"}
    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={"capability_id": "runtime.echo", "arguments": {"text": "direct"}},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["result"]["text"] == "direct"
    # user_context is None for direct user calls (the gateway fills g.current_user).
    assert payload["result"]["user_context"] is None
