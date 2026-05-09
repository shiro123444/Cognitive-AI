import io
import os

from app.db import db
from app.models import Chunk, Material, ReviewItem
from app.services.material_service import MaterialService
from app.services.review_service import ReviewService
from app.services.seed_data import seed_courses


def test_upload_text_material_creates_chunks_and_review_payload(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"Attention selects signals.\n\nMemory keeps context."), "lecture.txt"),
        },
        content_type="multipart/form-data",
    )
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    material_data = payload["data"]["material"]
    assert material_data["course_id"] == "brain-cog-intro"
    assert material_data["filename"] == "lecture.txt"
    assert material_data["parser_status"] == "chunked"
    assert payload["data"]["review_item_id"]

    with app.app_context():
        material = db.session.get(Material, material_data["id"])
        chunks = Chunk.query.filter_by(material_id=material.id).order_by(Chunk.id).all()
        review_item = db.session.get(ReviewItem, payload["data"]["review_item_id"])
        review_payload = ReviewService.get_payload(review_item)

        assert material.parser_status == "chunked"
        # New smart chunker merges short paragraphs into a single chunk for embedding density.
        # Both paragraphs should appear in the joined chunk text.
        all_chunk_text = "\n\n".join(c.text for c in chunks)
        assert "Attention selects signals." in all_chunk_text
        assert "Memory keeps context." in all_chunk_text
        assert chunks[0].citation_locator.startswith("lecture.txt#")
        assert review_payload["course_id"] == "brain-cog-intro"
        assert review_payload["concepts"][0]["course_id"] == "brain-cog-intro"


def test_list_materials_filters_by_course_id(client, app):
    with app.app_context():
        db.session.add_all([
            Material(id="mat-brain", course_id="brain-cog-intro", filename="brain.txt", path="/tmp/brain.txt"),
            Material(id="mat-ai", course_id="ai-intro", filename="ai.txt", path="/tmp/ai.txt"),
        ])
        db.session.commit()

    res = client.get("/api/v1/materials?course_id=brain-cog-intro")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert [item["id"] for item in payload["data"]] == ["mat-brain"]


def test_upload_requires_course_id_and_file(client):
    missing_course = client.post(
        "/api/v1/materials/upload",
        data={"file": (io.BytesIO(b"text"), "lecture.txt")},
        content_type="multipart/form-data",
    )
    missing_file = client.post(
        "/api/v1/materials/upload",
        data={"course_id": "brain-cog-intro"},
        content_type="multipart/form-data",
    )

    assert missing_course.status_code == 400
    assert missing_course.get_json() == {"success": False, "error": "course_id and file are required"}
    assert missing_file.status_code == 400
    assert missing_file.get_json() == {"success": False, "error": "course_id and file are required"}


def test_upload_uses_app_config_upload_dir(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"Configured upload path."), "config-path.txt"),
        },
        content_type="multipart/form-data",
    )
    payload = res.get_json()

    assert res.status_code == 200
    with app.app_context():
        material = db.session.get(Material, payload["data"]["material"]["id"])
        assert material.path.startswith(os.path.join(app.config["UPLOAD_DIR"], material.id))
        assert os.path.exists(material.path)


def test_upload_same_filename_keeps_distinct_paths(client, app):
    with app.app_context():
        seed_courses()

    first = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"First lecture."), "lecture.txt"),
        },
        content_type="multipart/form-data",
    )
    second = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"Second lecture."), "lecture.txt"),
        },
        content_type="multipart/form-data",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    with app.app_context():
        first_material = db.session.get(Material, first.get_json()["data"]["material"]["id"])
        second_material = db.session.get(Material, second.get_json()["data"]["material"]["id"])

        assert first_material.path != second_material.path
        assert os.path.exists(first_material.path)
        assert os.path.exists(second_material.path)


def test_upload_rejects_filename_that_sanitizes_to_empty(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"text"), "../../"),
        },
        content_type="multipart/form-data",
    )

    assert res.status_code == 400
    assert res.get_json() == {"success": False, "error": "file filename is invalid"}


def test_upload_rolls_back_database_and_file_when_review_creation_fails(client, app, monkeypatch):
    with app.app_context():
        seed_courses()

    saved_paths = []

    def fail_review_creation(material, chunks, commit=True):
        saved_paths.append(material.path)
        raise RuntimeError("review failure")

    monkeypatch.setattr(
        MaterialService,
        "create_review_suggestion_from_chunks",
        staticmethod(fail_review_creation),
    )
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.post(
        "/api/v1/materials/upload",
        data={
            "course_id": "brain-cog-intro",
            "file": (io.BytesIO(b"Partial state should not persist."), "partial.txt"),
        },
        content_type="multipart/form-data",
    )

    assert res.status_code == 500
    assert res.get_json() == {"success": False, "error": "material upload failed"}
    with app.app_context():
        assert Material.query.count() == 0
        assert Chunk.query.count() == 0
        assert ReviewItem.query.count() == 0
    assert saved_paths
    assert not os.path.exists(saved_paths[0])
