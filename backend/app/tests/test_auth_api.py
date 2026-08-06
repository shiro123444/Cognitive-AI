"""Tests for the JWT-based auth flow and RBAC decorators."""

from __future__ import annotations

from flask import jsonify

from app.api import api_bp
from app.jwt_utils import create_access_token
from app.rbac import require_authenticated, require_role
from app.services.seed_data import seed_default_users
from app.services.user_service import UserService


def _login(client, username: str, password: str):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_returns_token_and_user_for_valid_credentials(client, app):
    with app.app_context():
        seed_default_users()

    res = _login(client, "teacher1", "teacher123")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert isinstance(payload["data"]["token"], str) and payload["data"]["token"]
    assert payload["data"]["user"]["role"] == "teacher"
    assert payload["data"]["user"]["username"] == "teacher1"


def test_login_rejects_unknown_username(client, app):
    with app.app_context():
        seed_default_users()

    res = _login(client, "nobody", "anything")

    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_login_rejects_wrong_password(client, app):
    with app.app_context():
        seed_default_users()

    res = _login(client, "student1", "wrong-password")

    assert res.status_code == 401


def test_login_validates_request_body(client):
    res = client.post("/api/v1/auth/login", json={"username": ""})
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "BAD_REQUEST"


def test_me_returns_current_user_with_valid_bearer(client, app):
    with app.app_context():
        seed_default_users()

    login_res = _login(client, "admin", "admin123")
    token = login_res.get_json()["data"]["token"]

    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    payload = me_res.get_json()

    assert me_res.status_code == 200
    assert payload["data"]["role"] == "admin"
    assert payload["data"]["username"] == "admin"


def test_me_rejects_missing_bearer(client):
    res = client.get("/api/v1/auth/me")

    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_me_rejects_invalid_bearer(client):
    res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})

    assert res.status_code == 401


def test_logout_succeeds_with_valid_bearer(client, app):
    with app.app_context():
        seed_default_users()

    token_res = _login(client, "student1", "student123")
    token = token_res.get_json()["data"]["token"]

    res = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200
    assert res.get_json()["data"]["logged_out"] is True


def test_seed_default_users_is_idempotent(app):
    with app.app_context():
        first = seed_default_users()
        second = seed_default_users()

        assert {u.id for u in first} == {u.id for u in second}
        assert UserService.find_by_username("admin").role == "admin"
        assert UserService.find_by_username("teacher1").role == "teacher"
        assert UserService.find_by_username("student1").role == "student"


def _register_rbac_routes_once():
    """Register a few RBAC-protected scratch routes onto the api blueprint.

    Idempotent because Flask raises if a view function name is reused.
    """
    if "rbac_scratch_admin" in api_bp.view_functions:
        return

    @api_bp.get("/_test/admin-only")
    @require_role("admin")
    def rbac_scratch_admin():
        return jsonify({"ok": "admin"})

    api_bp.view_functions["rbac_scratch_admin"] = api_bp.view_functions.pop(
        "rbac_scratch_admin", rbac_scratch_admin
    )

    @api_bp.get("/_test/teacher-or-admin")
    @require_role("teacher")
    def rbac_scratch_teacher():
        return jsonify({"ok": "teacher"})

    @api_bp.get("/_test/any-authenticated")
    @require_authenticated
    def rbac_scratch_any():
        return jsonify({"ok": "any"})


_register_rbac_routes_once()


def _bearer(role: str, user_id: str = "user-test") -> dict:
    token = create_access_token(user_id=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


def test_require_role_allows_matching_role(client):
    res = client.get("/api/v1/_test/teacher-or-admin", headers=_bearer("teacher"))
    assert res.status_code == 200


def test_require_role_admin_passes_through_other_role_gates(client):
    res = client.get("/api/v1/_test/teacher-or-admin", headers=_bearer("admin"))
    assert res.status_code == 200


def test_require_role_blocks_wrong_role(client):
    res = client.get("/api/v1/_test/admin-only", headers=_bearer("student"))
    assert res.status_code == 403
    assert res.get_json()["error"]["code"] == "FORBIDDEN"


def test_require_role_blocks_anonymous(client):
    res = client.get("/api/v1/_test/admin-only")
    assert res.status_code == 401


def test_require_authenticated_allows_any_role(client):
    for role in ("student", "teacher", "admin"):
        res = client.get("/api/v1/_test/any-authenticated", headers=_bearer(role))
        assert res.status_code == 200, role
