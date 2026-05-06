import importlib
import os

from flask import Flask, jsonify
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

    CORS(app)
    db.init_app(app)
    app.register_blueprint(api_bp)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    try:
        importlib.import_module(".models", __name__)
    except ModuleNotFoundError as exc:
        if exc.name != f"{__name__}.models":
            raise

    with app.app_context():
        db.create_all()
        # Apply lightweight schema migrations for existing databases
        from .migrations import run_migrations
        run_migrations()

    return app
