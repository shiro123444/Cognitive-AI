"""Regression checks for plugin authorization at cross-course graph edges."""
import pytest

from app.db import db
from app.jwt_utils import create_access_token
from app.models import Concept, Course, GraphEdge, User


@pytest.mark.parametrize("foreign_status", ["published", "draft"])
def test_graph_does_not_cross_the_requested_course_boundary(client, app, foreign_status):
    with app.app_context():
        db.session.add_all([
            User(id="graph-reader", name="Reader", role="student"),
            Course(id="graph-allowed", title="Allowed", status="published"),
            Course(id="graph-denied", title="Denied", status=foreign_status),
        ])
        db.session.flush()
        db.session.add_all([
            Concept(id="graph-visible", course_id="graph-allowed", label="Visible", status="published"),
            Concept(id="graph-foreign", course_id="graph-denied", label="Private course concept", status="published"),
        ])
        db.session.flush()
        db.session.add(GraphEdge(
            id="graph-cross-course", course_id="graph-allowed", source_id="graph-visible",
            target_id="graph-foreign", relationship="RELATED_TO", status="published",
            evidence="Evidence referring to a course outside the requested scope",
        ))
        db.session.commit()
        token = create_access_token("graph-reader", "student")
    app.config["PLUGIN_ALLOWED_COURSE_IDS"] = {"graph-reader": ["graph-allowed"]}
    response = client.post("/api/v1/plugin/invoke", headers={"Authorization": f"Bearer {token}"}, json={
        "operation": "edufish.graph.neighborhood",
        "arguments": {"course_id": "graph-allowed", "concept_id": "graph-visible"},
    })
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert {node["id"] for node in data["nodes"]} == {"graph-visible"}
    assert data["edges"] == []


def test_artifact_scrubber_preserves_urls_and_scrubs_adjacent_local_paths():
    from app.plugin.scrub import scrub_value

    result = scrub_value({
        "message": "Source https://example.com/page stored at /var/lib/private/data.csv",
        "windows": r"See https://example.com/page and C:\private\data.csv",
    })
    assert result["message"] == "Source https://example.com/page stored at [redacted]"
    assert result["windows"] == "See https://example.com/page and [redacted]"
