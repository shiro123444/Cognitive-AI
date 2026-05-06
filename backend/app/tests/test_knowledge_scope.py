from app.db import db
from app.models import Concept, GraphEdge, Material
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses
from app.services.tutor_service import TutorService


def test_public_graph_excludes_student_personal_overlay(app):
    with app.app_context():
        seed_courses()
        db.session.add(
            Concept(
                id="concept-personal-note",
                course_id="ai-intro",
                label="Personal Note",
                definition="A private student-only note.",
                scope_type="student_personal",
                owner_id="student-1",
            )
        )
        db.session.commit()

        public_graph = CourseService.get_graph("ai-intro")
        personal_graph = CourseService.get_graph(
            "ai-intro",
            owner_id="student-1",
            include_personal=True,
        )

        assert "concept-personal-note" not in {node["id"] for node in public_graph["nodes"]}
        assert "concept-personal-note" in {node["id"] for node in personal_graph["nodes"]}


def test_student_personal_materials_are_filtered_by_owner(client, app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Material(
                id="material-public",
                course_id="ai-intro",
                filename="public.txt",
                path="/tmp/public.txt",
                scope_type="course_global",
                owner_id="",
            ),
            Material(
                id="material-s1",
                course_id="ai-intro",
                filename="s1.txt",
                path="/tmp/s1.txt",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            Material(
                id="material-s2",
                course_id="ai-intro",
                filename="s2.txt",
                path="/tmp/s2.txt",
                scope_type="student_personal",
                owner_id="student-2",
            ),
        ])
        db.session.commit()

    res = client.get("/api/materials?course_id=ai-intro&scope_type=student_personal&owner_id=student-1")
    ids = {item["id"] for item in res.get_json()["data"]}

    assert ids == {"material-s1"}


def test_tutor_with_user_id_can_use_personal_graph_overlay(app):
    with app.app_context():
        seed_courses()
        db.session.add_all([
            Concept(
                id="concept-personal-weakness",
                course_id="ai-intro",
                label="Spaced Retrieval Weakness",
                definition="The student repeatedly misses spaced retrieval questions.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            Concept(
                id="concept-personal-plan",
                course_id="ai-intro",
                label="Personal Review Plan",
                definition="A student-specific review plan for spaced retrieval.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
            GraphEdge(
                id="edge-personal-plan",
                course_id="ai-intro",
                source_id="concept-personal-weakness",
                target_id="concept-personal-plan",
                relationship="recommends",
                evidence="Private learning history shows repeated misses.",
                scope_type="student_personal",
                owner_id="student-1",
            ),
        ])
        db.session.commit()

        without_user = TutorService.answer("spaced retrieval weakness", course_id="ai-intro")
        with_user = TutorService.answer(
            "spaced retrieval weakness",
            course_id="ai-intro",
            user_id="student-1",
        )

    assert without_user["insufficient_evidence"] is True
    assert with_user["insufficient_evidence"] is False
    assert any(citation["id"] == "edge-personal-plan" for citation in with_user["citations"])


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
            GraphEdge(
                id="edge-student-2-note",
                course_id="ai-intro",
                source_id="concept-student-2-note",
                target_id="concept-transformer-attention",
                relationship="RELATES_TO",
                evidence="A private edge for student 2.",
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

    res = client.get("/api/course-overlays?course_id=ai-intro")

    assert res.status_code == 200
    assert res.get_json()["data"] == [
        {
            "user_id": "student-2",
            "student_alias": "学生-01",
            "scope_type": "student_personal",
        }
    ]
