from app.db import db
from app.models import Concept, GraphEdge, Material
from app.services.seed_data import seed_courses


def test_course_overlay_endpoint_lists_stable_student_aliases(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-student-2-note",
                course_id="ai-intro",
                label="Student 2 Note",
                definition="A private note for student 2.",
                scope_type="student_personal",
                owner_id="student-2",
            ),
            Material(
                id="material-student-2-note",
                course_id="ai-intro",
                filename="student-2.txt",
                path="/tmp/student-2.txt",
                scope_type="student_personal",
                owner_id="student-2",
            ),
        ])
        db.session.commit()

    first_res = client.get("/api/v1/course-overlays?course_id=ai-intro")

    assert first_res.status_code == 200
    assert first_res.get_json()["data"] == [
        {
            "user_id": "student-2",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        }
    ]


def test_course_overlay_aliases_do_not_drift_when_new_owner_appears(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-student-2-note",
                course_id="ai-intro",
                label="Student 2 Note",
                definition="A private note for student 2.",
                scope_type="student_personal",
                owner_id="student-2",
            ),
            Material(
                id="material-student-2-note",
                course_id="ai-intro",
                filename="student-2.txt",
                path="/tmp/student-2.txt",
                scope_type="student_personal",
                owner_id="student-2",
            ),
        ])
        db.session.commit()

    first_res = client.get("/api/v1/course-overlays?course_id=ai-intro")
    assert first_res.status_code == 200
    assert first_res.get_json()["data"] == [
        {
            "user_id": "student-2",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        }
    ]

    with app.app_context():
        db.session.add_all([
            Concept(
                id="concept-student-1-note",
                course_id="ai-intro",
                label="Student 1 Note",
                definition="A private note for student 1.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            GraphEdge(
                id="edge-student-1-note",
                course_id="ai-intro",
                source_id="concept-student-1-note",
                target_id="concept-transformer-attention",
                relationship="RELATES_TO",
                evidence="A private edge for student 1.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

    second_res = client.get("/api/v1/course-overlays?course_id=ai-intro")

    assert second_res.status_code == 200
    assert second_res.get_json()["data"] == [
        {
            "user_id": "student-2",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        },
        {
            "user_id": "student-1",
            "student_alias": "学生-02",
            "scope_type": "student_personal",
        },
    ]


def test_course_overlay_endpoint_requires_course_id(client):
    res = client.get("/api/v1/course-overlays")

    assert res.status_code == 400
    assert res.get_json() == {
        "success": False,
        "error": "course_id is required",
    }


def test_personal_graph_hides_edges_to_invisible_private_nodes(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-student-1-private",
                course_id="ai-intro",
                label="Student 1 Private Concept",
                definition="Private concept for student 1.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            Concept(
                id="concept-student-2-private",
                course_id="ai-intro",
                label="Student 2 Private Concept",
                definition="Private concept for student 2.",
                scope_type="student_personal",
                owner_id="student-2",
            ),
            GraphEdge(
                id="edge-private-cross-owner",
                course_id="ai-intro",
                source_id="concept-student-2-private",
                target_id="concept-student-1-private",
                relationship="RELATES_TO",
                evidence="This edge should stay hidden from student 1's overlay graph.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

    res = client.get("/api/v1/graph?course_id=ai-intro&user_id=student-1")
    payload = res.get_json()["data"]

    assert "concept-student-1-private" in {node["id"] for node in payload["nodes"]}
    assert "concept-student-2-private" not in {node["id"] for node in payload["nodes"]}
    assert "edge-private-cross-owner" not in {edge["id"] for edge in payload["edges"]}
