"""Plugin-owned SQL models.

The shared ``app.models`` module is intentionally left untouched.  This model
stores durable idempotency records for mutating plugin operations.  It is
imported by the plugin route/service package so SQLAlchemy registers it before
``db.create_all()`` runs at application startup.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint

from app.db import db


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PluginIdempotencyRecord(db.Model):
    """Durable request-id reservation/result for a plugin mutation.

    Scope is ``(user_id, operation, request_id)``.  ``state`` is ``reserved``
    while work is in flight and ``completed`` once ``response_json`` is safe to
    replay.  The unique constraint lets concurrent requests race safely: the
    loser catches the integrity error, rolls back, and replays the winner.
    """

    __tablename__ = "plugin_idempotency"

    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, nullable=False, index=True)
    operation = db.Column(db.String, nullable=False)
    request_id = db.Column(db.String, nullable=False)
    request_hash = db.Column(db.String(64), nullable=False)
    state = db.Column(db.String, nullable=False, default="reserved")
    response_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=_utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "operation",
            "request_id",
            name="uq_plugin_idempotency_scope",
        ),
    )
