import importlib
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from .config import Config
from .db import db
from .api import api_bp


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    os.makedirs(app.instance_path, exist_ok=True)

    from .services.runtime_config import apply_runtime_config
    apply_runtime_config(app)

    cors_origins = app.config.get("CORS_ORIGINS") or ""
    cors_kwargs = {}
    if cors_origins:
        cors_kwargs["origins"] = [o.strip() for o in cors_origins.split(",") if o.strip()]
    else:
        cors_kwargs["origins"] = ["http://localhost:3025"]
    CORS(app, **cors_kwargs)

    from .auth import register_auth
    register_auth(api_bp)

    from .api.errors import register_error_handlers
    register_error_handlers(app)

    from .rate_limit import init_rate_limiter
    init_rate_limiter(app)

    from .tenant import register_tenant_middleware
    register_tenant_middleware(app)

    db.init_app(app)
    app.register_blueprint(api_bp)

    @app.after_request
    def _add_engine_headers(response):
        response.headers["X-Engine-Version"] = "1.0"
        response.headers["X-Engine-Name"] = app.config.get("ENGINE_NAME", "EDUFISH")
        return response

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    # Legacy /api/* deprecation notice
    @app.before_request
    def _legacy_api_notice():
        if request.path.startswith("/api/") and not request.path.startswith("/api/v1/"):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": {
                            "code": "DEPRECATED",
                            "message": "The /api/ prefix is deprecated. Use /api/v1/ instead.",
                        },
                    }
                ),
                410,
            )

    try:
        importlib.import_module(".models", __name__)
    except ModuleNotFoundError as exc:
        if exc.name != f"{__name__}.models":
            raise

    with app.app_context():
        db.create_all()
        from .migrations import run_migrations
        run_migrations()

    return app
