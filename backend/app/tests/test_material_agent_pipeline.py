import io
import json

from app.db import db
from app.models import AgentEvent, AgentRun, Concept, Material, ReviewItem
from app.services.agent_run_service import AgentRunService
from app.services.review_service import ReviewService
from app.services.seed_data import seed_courses


def test_agent_run_service_records_material_events(app):
    with app.app_context():
        seed_courses()
        material = Material(
            id="material-agent-test",
            course_id="ai-intro",
            filename="agent.txt",
            path="/tmp/agent.txt",
            scope_type="course_global",
            owner_id="",
        )
        db.session.add(material)
        db.session.commit()

        run = AgentRunService.create_for_material(
            material,
            job_id="",
            scope_type="course_global",
            owner_id="",
        )
        event = AgentRunService.emit_event(
            run_id=run.id,
            job_id="job-1",
            material_id=material.id,
            course_id=material.course_id,
            scope_type="course_global",
            owner_id="",
            event_type="embedding",
            status="running",
            message="Embedding 1 chunk",
            progress=40,
            payload={"chunk_count": 1},
        )
        AgentRunService.complete_run(run.id, summary={"published_concepts": 1})

        stored_run = db.session.get(AgentRun, run.id)
        stored_event = db.session.get(AgentEvent, event.id)

        assert stored_run.status == "completed"
        assert stored_run.job_id == "job-1"
        assert json.loads(stored_run.summary_json)["published_concepts"] == 1
        assert stored_event.event_type == "embedding"
        assert json.loads(stored_event.payload_json)["chunk_count"] == 1
        assert AgentRunService.serialize_run(stored_run)["summary"]["published_concepts"] == 1
        assert AgentRunService.serialize_event(stored_event)["payload"]["chunk_count"] == 1


def test_async_upload_returns_run_id_and_scope(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "course_global",
            "file": (io.BytesIO(b"Automated public material."), "public.txt"),
        },
        content_type="multipart/form-data",
    )
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    data = payload["data"]
    assert data["run_id"].startswith("run-")
    assert data["job_id"].startswith("job-")
    assert data["material"]["scope_type"] == "course_global"
    assert data["material"]["owner_id"] == ""


def test_student_personal_upload_requires_owner_id(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "student_personal",
            "file": (io.BytesIO(b"Private note."), "private.txt"),
        },
        content_type="multipart/form-data",
    )

    assert res.status_code == 400
    assert res.get_json()["error"] == "owner_id is required for student_personal materials"


def test_agent_run_events_endpoint_returns_ordered_events(client, app):
    with app.app_context():
        seed_courses()
        material = Material(
            id="material-events-api",
            course_id="ai-intro",
            filename="events.txt",
            path="/tmp/events.txt",
            scope_type="course_global",
            owner_id="",
        )
        db.session.add(material)
        db.session.commit()
        run = AgentRunService.create_for_material(material)
        run_id = run.id
        AgentRunService.emit_event(run.id, "job-1", material.id, material.course_id, "course_global", "", "received", "running", "Received", 5)
        AgentRunService.emit_event(run.id, "job-1", material.id, material.course_id, "course_global", "", "completed", "completed", "Completed", 100)

    run_res = client.get(f"/api/agent-runs/{run_id}")
    events_res = client.get(f"/api/agent-runs/{run_id}/events")

    assert run_res.status_code == 200
    assert run_res.get_json()["data"]["id"] == run_id
    assert events_res.status_code == 200
    assert [event["event_type"] for event in events_res.get_json()["data"]] == ["received", "completed"]


def test_async_material_job_auto_publishes_valid_fallback_graph(client, app):
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "scope_type": "course_global",
            "file": (io.BytesIO(b"Attention selects useful signals for learning."), "attention-upload.txt"),
        },
        content_type="multipart/form-data",
    )
    data = res.get_json()["data"]

    with app.app_context():
        run = db.session.get(AgentRun, data["run_id"])
        material = db.session.get(Material, data["material"]["id"])
        review_items = ReviewItem.query.order_by(ReviewItem.created_at.desc()).all()
        uploaded_concept = Concept.query.filter_by(id=f"concept-upload-{material.id}").first()
        events = AgentRunService.list_events(run.id)

        assert run.status == "completed"
        assert material.parser_status in {"chunked", "embedded"}
        assert uploaded_concept is not None
        assert uploaded_concept.status == "published"
        assert uploaded_concept.scope_type == "course_global"
        assert review_items[0].status == "published"
        assert [event.event_type for event in events] == [
            "received",
            "extracting",
            "chunking",
            "embedding",
            "extracting_graph",
            "publishing",
            "completed",
        ]


def test_low_confidence_graph_stays_in_review_queue(app):
    with app.app_context():
        seed_courses()
        item = ReviewService.create_graph_suggestion(
            "Low confidence",
            {
                "course_id": "ai-intro",
                "concepts": [
                    {
                        "id": "concept-low-confidence",
                        "course_id": "ai-intro",
                        "label": "Low Confidence",
                        "definition": "Not enough evidence.",
                        "confidence": 0.2,
                    }
                ],
                "edges": [],
            },
        )

        result = ReviewService.auto_publish_graph_suggestion(
            item.id,
            scope_type="course_global",
            owner_id="",
        )

        assert result["published"] is False
        assert result["needs_review"] is True
        assert db.session.get(ReviewItem, item.id).status == "needs_review"
        assert db.session.get(Concept, "concept-low-confidence") is None
