"""Authentication, course visibility, and knowledge-scope rules for the plugin.

The plugin deliberately reuses the platform's existing bearer-JWT middleware
(``app.auth``) instead of introducing another token issuer.  It then resolves
the user from the database, rejects runtime service identities, and applies the
course/visibility rules from the implementation contract.

Honest limits (mirrored in the package docs): the data model has no course
membership table, so "visible" means a published course (teachers/admins also
see drafts), optionally narrowed by ``PLUGIN_ALLOWED_COURSE_IDS``.  This is not
full institutional membership or tenant isolation.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from flask import current_app, g, request
from sqlalchemy import and_, or_

from app.db import db
from app.models import Course, Material, User

from .errors import forbidden, not_found, unavailable, unauthorized

_ALLOWED_ROLES = frozenset({"student", "teacher", "admin"})
_STAFF_ROLES = frozenset({"teacher", "admin"})
_RUNTIME_ROLE = "runtime"
_RUNTIME_USER_ID = "runtime"

# Headers that would imply an identity or role other than the bearer token.
# None of these are consumed by this plugin; their presence is rejected so the
# host cannot accidentally build an impersonation path around it.
_OVERRIDE_HEADERS = (
    "X-User-Id",
    "X-User-Role",
    "X-Role",
    "X-Runtime-User-Id",
    "X-Runtime-User-Role",
    "X-Actor-Id",
    "X-Actor-Role",
    "X-Identity",
    "X-Original-User",
    "X-Act-As",
    "X-On-Behalf-Of",
    "X-Forwarded-User",
    "X-Impersonate-User",
)


@dataclass(frozen=True)
class PluginUser:
    id: str
    role: str
    allowed_course_ids: frozenset[str] | None  # None means "allowlist not configured"


def _raw_allowlist_config():
    """Read the allowlist from app config, falling back to the environment."""
    configured = current_app.config.get("PLUGIN_ALLOWED_COURSE_IDS")
    if configured is None:
        configured = os.getenv("PLUGIN_ALLOWED_COURSE_IDS")
    return configured


def _parse_allowlist() -> dict[str, frozenset[str]] | None:
    """Return ``{user_id: frozenset(course_ids)}`` or ``None`` when unset.

    Invalid configuration fails closed (an empty mapping): the plugin may not
    silently grant broad access because an operator made a typo.
    """
    raw = _raw_allowlist_config()
    if raw is None or raw == "":
        return None

    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            current_app.logger.warning(
                "PLUGIN_ALLOWED_COURSE_IDS is not valid JSON; failing closed"
            )
            return {}
    else:
        parsed = raw

    if not isinstance(parsed, dict):
        current_app.logger.warning(
            "PLUGIN_ALLOWED_COURSE_IDS must map user IDs to course ID lists; failing closed"
        )
        return {}

    allowlist: dict[str, frozenset[str]] = {}
    for user_id, course_ids in parsed.items():
        if not isinstance(user_id, str) or not user_id:
            continue
        if not isinstance(course_ids, (list, tuple, set, frozenset)):
            continue
        cleaned = frozenset(
            course_id
            for course_id in course_ids
            if isinstance(course_id, str) and course_id
        )
        allowlist[user_id] = cleaned
    return allowlist


def _multi_tenant_enabled() -> bool:
    value = current_app.config.get("MULTI_TENANT_ENABLED")
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def resolve_plugin_user() -> PluginUser:
    """Authenticate the current request and return its plugin user context."""
    current = getattr(g, "current_user", None)
    if not current:
        raise unauthorized()

    token_user_id = current.get("id")
    token_role = current.get("role")
    if token_role == _RUNTIME_ROLE or token_user_id == _RUNTIME_USER_ID:
        raise forbidden("runtime service tokens cannot use the EduFish plugin")

    if any(request.headers.get(header) is not None for header in _OVERRIDE_HEADERS):
        raise forbidden("identity or role override headers are not accepted")

    if _multi_tenant_enabled():
        raise unavailable(
            "plugin access is unavailable while multi-tenancy is enabled"
        )

    if not isinstance(token_user_id, str) or not token_user_id:
        raise unauthorized()

    user = db.session.get(User, token_user_id)
    if user is None:
        raise unauthorized("authenticated user was not found")
    if user.role not in _ALLOWED_ROLES:
        raise forbidden("user role cannot use the EduFish plugin")
    if token_role != user.role:
        # The database is the source of truth.  A stale or forged role claim
        # must not silently promote the caller's visibility.
        raise forbidden("token role does not match the current user")

    allowlist = _parse_allowlist()
    if allowlist is not None and user.id not in allowlist:
        raise forbidden("plugin access is not enabled for this user")

    return PluginUser(
        id=user.id,
        role=user.role,
        allowed_course_ids=None if allowlist is None else allowlist[user.id],
    )


def get_visible_course(user: PluginUser, course_id: str) -> Course:
    """Return a course the user may access, or raise a non-leaking NOT_FOUND."""
    if user.allowed_course_ids is not None and course_id not in user.allowed_course_ids:
        raise not_found("course not found")

    course = db.session.get(Course, course_id)
    if course is None:
        raise not_found("course not found")
    if course.status != "published" and user.role not in _STAFF_ROLES:
        # Drafts are invisible to students; do not disclose that they exist.
        raise not_found("course not found")
    return course


def knowledge_scope_filter(model, user_id: str):
    """Visible knowledge scopes: course-global plus this user's personal rows."""
    return or_(
        model.scope_type == "course_global",
        and_(model.scope_type == "student_personal", model.owner_id == user_id),
    )


def published_knowledge_filter(model, user_id: str):
    """Published, visible knowledge (concepts and graph edges)."""
    return and_(model.status == "published", knowledge_scope_filter(model, user_id))


def material_scope_filter(user_id: str):
    """Visible material scopes: course-global plus this user's personal uploads."""
    return or_(
        Material.scope_type == "course_global",
        and_(Material.scope_type == "student_personal", Material.owner_id == user_id),
    )


def material_is_visible(material: Material, user_id: str) -> bool:
    if material.scope_type == "course_global":
        return True
    return material.scope_type == "student_personal" and material.owner_id == user_id
