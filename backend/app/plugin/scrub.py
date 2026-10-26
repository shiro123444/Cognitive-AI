"""Redact local filesystem paths from lab payloads before returning them.

Experiment adapters are trusted domain code, but their serialized artifacts may
carry dataset or upload locations.  The plugin contract explicitly forbids
exposing local file paths, so this scrubber removes path-shaped keys and
path-shaped string values recursively while leaving ordinary data intact.
"""

from __future__ import annotations

import re
from typing import Any

_REDACTED = "[redacted]"

_PATH_KEYS = frozenset(
    {
        "path",
        "filepath",
        "file_path",
        "local_path",
        "storage_path",
        "artifact_path",
        "source_path",
        "upload_path",
        "dataset_path",
        "model_path",
        "output_path",
        "input_path",
        "absolute_path",
    }
)

_WINDOWS_ABSOLUTE = re.compile(r"[A-Za-z]:[\\/][^\s\"'<>]*")
_UNC_ABSOLUTE = re.compile(r"\\\\[^\s\"'<>]+")
_FILE_URI = re.compile(r"file://[^\s\"'<>]+")
# Require at least two segments so ordinary route-like strings ("/health")
# are not redacted, while "/home/user/data.bin" and "/var/lib/app/x" are.
_POSIX_ABSOLUTE = re.compile(r"/(?:[^/\s\"'<>]+/)+[^/\s\"'<>]*")
_HTTP_URL = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
_TRACEBACK_FRAME = re.compile(r'File "[^"]+", line \d+')


def _is_path_key(key: Any) -> bool:
    if not isinstance(key, str):
        return False
    lowered = key.strip().lower()
    return lowered in _PATH_KEYS or lowered.endswith("_path") or lowered.endswith("path")


def _scrub_local_paths(value: str) -> str:
    scrubbed = _WINDOWS_ABSOLUTE.sub(_REDACTED, value)
    scrubbed = _UNC_ABSOLUTE.sub(_REDACTED, scrubbed)
    scrubbed = _FILE_URI.sub(_REDACTED, scrubbed)
    return _POSIX_ABSOLUTE.sub(_REDACTED, scrubbed)


def _scrub_string(value: str) -> str:
    # Stack traces are never part of a safe read result.
    if "Traceback (most recent call last)" in value or _TRACEBACK_FRAME.search(value):
        return _REDACTED
    # Preserve web URLs without exempting local paths elsewhere in the same
    # message. In particular the trailing "s:/" of "https://" is not a
    # Windows drive path.
    parts = []
    cursor = 0
    for match in _HTTP_URL.finditer(value):
        parts.append(_scrub_local_paths(value[cursor:match.start()]))
        parts.append(match.group())
        cursor = match.end()
    parts.append(_scrub_local_paths(value[cursor:]))
    return "".join(parts)


def scrub_value(value: Any) -> Any:
    """Return a recursively scrubbed copy of a JSON-like value."""
    if isinstance(value, dict):
        cleaned: dict = {}
        for key, item in value.items():
            if _is_path_key(key):
                continue
            if isinstance(key, str):
                cleaned_key = _scrub_string(key)
            else:
                cleaned_key = key
            cleaned[cleaned_key] = scrub_value(item)
        return cleaned
    if isinstance(value, (list, tuple)):
        return [scrub_value(item) for item in value]
    if isinstance(value, str):
        return _scrub_string(value)
    return value
