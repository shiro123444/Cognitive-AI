import pytest

from app import create_app
from app.db import db


@pytest.fixture()
def app(tmp_path):
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "UPLOAD_DIR": "/tmp/cognitive-ai-learning-platform-test-uploads",
        "RUNTIME_CONFIG_PATH": str(tmp_path / "runtime_config.json"),
    })
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app


@pytest.fixture()
def client(app):
    return app.test_client()
