#!/usr/bin/env python3
"""Loopback-only EduFish plugin fixture server for the independent example.

Usage (from the repository root)::

    export EDUFISH_FIXTURE_HANDSHAKE="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
    backend/.venv/Scripts/python.exe examples/plugin-host/fixture_server.py --port 8765

The process prints one JSON readiness line on stdout, for example::

    {"fixture":"edufish-plugin","status":"ready","base_url":"http://127.0.0.1:8765",...}

It never prints tokens.  A dev token is available only through the explicit
handshake endpoint::

    GET /__fixture__/token?user_id=fixture-student
    X-Fixture-Handshake: <EDUFISH_FIXTURE_HANDSHAKE>

The database, uploads and instance paths all live in a temporary directory that
is deleted on shutdown.  Nothing is written to ``backend/instance`` or the
normal runtime configuration.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import signal
import sys
import tempfile
import threading
from pathlib import Path

_EXAMPLE_DIR = Path(__file__).resolve().parent
if str(_EXAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(_EXAMPLE_DIR))

from fixture_plugin import create_fixture_app, db  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run an isolated, loopback-only EduFish plugin fixture server."
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind address (must be loopback)")
    parser.add_argument("--port", type=int, default=8765, help="0 picks a free port")
    parser.add_argument(
        "--handshake-secret",
        default=os.environ.get("EDUFISH_FIXTURE_HANDSHAKE", ""),
        help="dev-only handshake secret (defaults to EDUFISH_FIXTURE_HANDSHAKE)",
    )
    parser.add_argument(
        "--no-grants",
        action="store_true",
        help="disable PLUGIN_ALLOWED_COURSE_IDS and use published-course visibility",
    )
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="keep the temporary database directory for debugging",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="show fixture request warnings (never logs tokens or bodies)",
    )
    return parser.parse_args(argv)


def _assert_loopback(host: str) -> None:
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit(
            "Refusing to bind a non-loopback address. The fixture is dev-only and "
            "must never be exposed on a network interface."
        )


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    _assert_loopback(args.host)
    if not args.handshake_secret:
        raise SystemExit(
            "EDUFISH_FIXTURE_HANDSHAKE (or --handshake-secret) is required. "
            "It gates the dev-only token handshake; the fixture will not mint tokens without it."
        )

    logging.getLogger("werkzeug").setLevel(logging.WARNING if args.verbose else logging.ERROR)

    temp_dir = Path(tempfile.mkdtemp(prefix="edufish-plugin-fixture-"))
    app = create_fixture_app(
        temp_dir,
        handshake_secret=args.handshake_secret,
        use_default_grants=not args.no_grants,
    )
    if not args.verbose:
        app.logger.setLevel(logging.ERROR)

    stop_event = threading.Event()

    def _request_stop(*_ignored) -> None:
        stop_event.set()

    def _shutdown_callback() -> None:
        stop_event.set()

    app.config["FIXTURE_SHUTDOWN_CALLBACK"] = _shutdown_callback

    server = make_server(args.host, args.port, app, threaded=True)
    port = server.server_port

    for signal_name in ("SIGINT", "SIGTERM"):
        signal_value = getattr(signal, signal_name, None)
        if signal_value is not None:
            try:
                signal.signal(signal_value, _request_stop)
            except (OSError, ValueError):
                pass

    worker = threading.Thread(target=server.serve_forever, name="fixture-http", daemon=True)
    worker.start()

    print(
        json.dumps(
            {
                "fixture": "edufish-plugin",
                "status": "ready",
                "base_url": f"http://{args.host}:{port}",
                "pid": os.getpid(),
                "database": "temporary (deleted on shutdown)",
                "tokens": "only via GET /__fixture__/token with X-Fixture-Handshake",
                "grants": "disabled" if args.no_grants else "PLUGIN_ALLOWED_COURSE_IDS enabled",
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    try:
        while not stop_event.wait(0.5):
            if not worker.is_alive():
                break
    finally:
        stop_event.set()
        server.shutdown()
        worker.join(timeout=10)

        with app.app_context():
            db.session.remove()
            db.engine.dispose()

        if args.keep_temp:
            print(json.dumps({"fixture": "edufish-plugin", "status": "stopped", "temp_dir": str(temp_dir)}))
        else:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(json.dumps({"fixture": "edufish-plugin", "status": "stopped"}))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
