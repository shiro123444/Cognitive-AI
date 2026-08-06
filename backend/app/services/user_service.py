"""User service: CRUD plus password-backed login for the JWT auth flow.

For pre-auth callers (legacy tests, FK fixtures), users created without a
password remain valid — they just can't log in until ``set_password`` is
called.
"""

from __future__ import annotations

from uuid import uuid4

from app.db import db
from app.jwt_utils import hash_password
from app.models import User


_ALLOWED_ROLES = {"student", "teacher", "admin"}


class UserService:
    @staticmethod
    def create_user(
        name: str,
        email: str = "",
        role: str = "student",
        username: str | None = None,
        password: str | None = None,
        commit: bool = True,
    ) -> User:
        if not name or not isinstance(name, str):
            raise ValueError("name is required")
        if role not in _ALLOWED_ROLES:
            raise ValueError(f"role must be one of {_ALLOWED_ROLES}")
        if username is not None and (not isinstance(username, str) or not username.strip()):
            raise ValueError("username, when provided, must be a non-empty string")
        if username and User.query.filter_by(username=username).first() is not None:
            raise ValueError(f"username already exists: {username}")

        user = User(
            id=f"user-{uuid4().hex}",
            name=name,
            email=email or "",
            role=role,
            username=username,
            password_hash=hash_password(password) if password else None,
        )
        db.session.add(user)
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        db.session.refresh(user)
        return user

    @staticmethod
    def set_password(user: User, password: str, commit: bool = True) -> User:
        user.password_hash = hash_password(password)
        if commit:
            db.session.commit()
        return user

    @staticmethod
    def get_user(user_id: str) -> User | None:
        return db.session.get(User, user_id)

    @staticmethod
    def find_by_username(username: str) -> User | None:
        if not username:
            return None
        return User.query.filter_by(username=username).first()

    @staticmethod
    def list_users(role: str | None = None) -> list[User]:
        query = User.query
        if role:
            query = query.filter_by(role=role)
        return query.order_by(User.created_at.desc()).all()

    @staticmethod
    def serialize(user: User) -> dict:
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "username": user.username,
        }

    @staticmethod
    def get_or_create_default_teacher() -> User:
        """Return a single default teacher user, creating it if missing.

        Useful in dev/MVP where we want assignments to attribute to *someone*
        without forcing real auth.
        """
        default = User.query.filter_by(role="teacher").first()
        if default:
            return default
        return UserService.create_user(name="Default Teacher", role="teacher")
