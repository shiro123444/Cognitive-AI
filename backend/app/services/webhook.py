"""Webhook dispatch for async job completion notifications."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT = 10  # seconds
WEBHOOK_RETRY_DELAY = 5  # seconds
WEBHOOK_MAX_RETRIES = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def dispatch(
    webhook_url: str,
    event: str,
    data: dict,
    secret: str | None = None,
) -> bool:
    """POST an event to a webhook URL with optional HMAC-SHA256 signature.

    Returns True if the webhook was acknowledged (2xx), False otherwise.
    """
    payload = {
        "event": event,
        "timestamp": _now_iso(),
        "data": data,
    }
    body = json.dumps(payload, ensure_ascii=False)
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Edufish-Signature"] = _sign(secret, body)

    for attempt in range(WEBHOOK_MAX_RETRIES + 1):
        try:
            resp = httpx.post(webhook_url, content=body, headers=headers, timeout=WEBHOOK_TIMEOUT)
            if 200 <= resp.status_code < 300:
                logger.info("Webhook %s delivered to %s (status %d)", event, webhook_url, resp.status_code)
                return True
            logger.warning("Webhook %s to %s got %d (attempt %d)", event, webhook_url, resp.status_code, attempt + 1)
        except Exception:
            logger.exception("Webhook %s to %s failed (attempt %d)", event, webhook_url, attempt + 1)

        if attempt < WEBHOOK_MAX_RETRIES:
            time.sleep(WEBHOOK_RETRY_DELAY)

    logger.error("Webhook %s to %s exhausted retries", event, webhook_url)
    return False
