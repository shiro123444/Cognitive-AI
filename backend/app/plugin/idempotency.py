"""Durable request-id handling for mutating plugin operations."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from .errors import idempotency_conflict, unavailable
from .models import PluginIdempotencyRecord


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def request_hash(arguments: dict) -> str:
    """Hash the canonical argument object (never the envelope/request id)."""
    canonical = json.dumps(
        arguments,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def find_record(user_id: str, operation: str, request_id: str):
    return PluginIdempotencyRecord.query.filter_by(
        user_id=user_id,
        operation=operation,
        request_id=request_id,
    ).first()


def new_reservation(user_id: str, operation: str, request_id: str, digest: str):
    return PluginIdempotencyRecord(
        id=f"plugin-idem-{uuid4().hex}",
        user_id=user_id,
        operation=operation,
        request_id=request_id,
        request_hash=digest,
        state="reserved",
        response_json="{}",
        created_at=_utc_now(),
        updated_at=_utc_now(),
    )


def replay_or_conflict(record: PluginIdempotencyRecord, digest: str) -> dict:
    """Replay a stored response or raise the appropriate stable error."""
    if record.request_hash != digest:
        raise idempotency_conflict()
    if record.state != "completed":
        raise unavailable("request is still being processed")
    try:
        payload = json.loads(record.response_json or "{}")
    except (TypeError, ValueError):
        raise unavailable("stored idempotent response is unavailable") from None
    if not isinstance(payload, dict):
        raise unavailable("stored idempotent response is unavailable")
    return payload


def mark_completed(record: PluginIdempotencyRecord, response: dict) -> None:
    record.state = "completed"
    record.response_json = json.dumps(response, ensure_ascii=False)
    record.updated_at = _utc_now()
