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

    res = client.get("/api/course-overlays?course_id=ai-intro")

    assert res.status_code == 200
    assert res.get_json()["data"] == [
        {
            "user_id": "student-1",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        },
        {
            "user_id": "student-2",
            "student_alias": "学生-02",
            "scope_type": "student_personal",
        },
    ]
