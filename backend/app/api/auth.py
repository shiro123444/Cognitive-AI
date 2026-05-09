"""Auth API: login / logout / current-user endpoints."""

from __future__ import annotations

from flask import g, jsonify, request

from app.api import api_bp
from app.jwt_utils import create_access_token, verify_password
from app.rbac import require_authenticated
from app.services.user_service import UserService


def _bad_request(message: str):
    return (
        jsonify({"success": False, "error": {"code": "BAD_REQUEST", "message": message}}),
        400,
    )


def _unauthorized(message: str):
    return (
        jsonify({"success": False, "error": {"code": "UNAUTHORIZED", "message": message}}),
        401,
    )


@api_bp.post("/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return _bad_request("request body must be an object")
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not isinstance(password, str) or not password:
        return _bad_request("username and password are required")

    user = UserService.find_by_username(username)
    if user is None or not verify_password(password, user.password_hash):
        return _unauthorized("invalid username or password")

    token = create_access_token(user_id=user.id, role=user.role)
    return jsonify(
        {
            "success": True,
            "data": {
                "token": token,
                "user": UserService.serialize(user),
            },
        }
    )


@api_bp.get("/auth/me")
@require_authenticated
def me():
    current = g.current_user
    user = UserService.get_user(current["id"])
    if user is None:
        return _unauthorized("user no longer exists")
    return jsonify({"success": True, "data": UserService.serialize(user)})


@api_bp.post("/auth/logout")
@require_authenticated
def logout():
    # JWTs are stateless; the frontend discards the token. This endpoint is a
    # placeholder for future revocation lists.
    return jsonify({"success": True, "data": {"logged_out": True}})
