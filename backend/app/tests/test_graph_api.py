from app.db import db
from app.models import Concept, GraphEdge
from app.services.seed_data import seed_courses


def test_graph_endpoint_returns_nodes_and_edges(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/graph")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert any("Transformer Attention" in node["label"] for node in payload["data"]["nodes"])
    assert any("RELATED_TO" in edge["relationship"] for edge in payload["data"]["edges"])


def test_graph_endpoint_auto_seeds_when_empty(client):
    res = client.get("/api/v1/graph")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert any("Transformer Attention" in node["label"] for node in payload["data"]["nodes"])
    assert any("RELATED_TO" in edge["relationship"] for edge in payload["data"]["edges"])


def test_graph_endpoint_scopes_nodes_by_course(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/graph?course_id=brain-cog-intro")
    payload = res.get_json()
    labels = {node["label"] for node in payload["data"]["nodes"]}

    assert res.status_code == 200
    assert any("Human Attention" in label for label in labels)
    assert not any("Heuristic Search" in label for label in labels)


def test_graph_endpoint_merges_student_personal_overlay_for_user(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-personal-focus-gap",
                course_id="ai-intro",
                label="Attention Focus Gap",
                definition="A private note about the student's attention gap.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            Concept(
                id="concept-personal-plan",
                course_id="ai-intro",
                label="Attention Repair Plan",
                definition="A private recovery plan for the student's attention gap.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            GraphEdge(
                id="edge-personal-focus-gap",
                course_id="ai-intro",
                source_id="concept-personal-focus-gap",
                target_id="concept-personal-plan",
                relationship="ADDRESSES",
                evidence="Derived from the student's recent review history.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

    res = client.get("/api/v1/graph?course_id=ai-intro&user_id=student-1")
    payload = res.get_json()
    node_ids = {node["id"] for node in payload["data"]["nodes"]}
    edge_ids = {edge["id"] for edge in payload["data"]["edges"]}
    personal_node = next(node for node in payload["data"]["nodes"] if node["id"] == "concept-personal-focus-gap")
    personal_edge = next(edge for edge in payload["data"]["edges"] if edge["id"] == "edge-personal-focus-gap")

    assert res.status_code == 200
    assert "concept-personal-focus-gap" in node_ids
    assert "concept-personal-plan" in node_ids
    assert "edge-personal-focus-gap" in edge_ids
    assert set(personal_node) == {"id", "label", "type", "definition"}
    assert set(personal_edge) == {"id", "source", "target", "relationship", "evidence"}
