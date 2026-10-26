"""pytest setup for the plugin-host fixture tests.

Run from the repository root with the backend virtualenv::

    backend/.venv/Scripts/python.exe -m pytest examples/plugin-host/tests -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

EXAMPLE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"

for candidate in (str(EXAMPLE_DIR), str(BACKEND_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from fixture_plugin import create_fixture_app  # noqa: E402
from app.db import db  # noqa: E402


@pytest.fixture()
def fixture_app(tmp_path):
    app = create_fixture_app(
        tmp_path,
        handshake_secret="test-handshake",
        use_default_grants=True,
        jwt_secret="test-jwt-secret-that-is-long-enough-for-hs256",
    )
    yield app
    with app.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture()
def client(fixture_app):
    return fixture_app.test_client()
