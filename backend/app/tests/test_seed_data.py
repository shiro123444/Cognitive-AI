from app.db import db
from app.models import Concept, Course, GraphEdge, LearningActivity
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses


def test_seed_courses_create_two_courses(app):
    seed_courses()

    courses = CourseService.list_courses()

    assert len(courses) == 2
    titles = {course.title for course in courses}
    assert "人工智能导论" in titles
    assert "脑与认知科学导论" in titles


def test_seed_courses_are_idempotent(app):
    seed_courses()
    seed_courses()

    graph = CourseService.get_graph()

    assert Course.query.count() == 2
    assert len(graph["nodes"]) == 6
    assert len({node["id"] for node in graph["nodes"]}) == 6
    assert len(graph["edges"]) == 3
    assert len({edge["id"] for edge in graph["edges"]}) == 3
    assert Concept.query.count() == len(graph["nodes"])
    assert GraphEdge.query.count() == len(graph["edges"])


def test_seed_courses_preserve_user_authored_content(app):
    seed_courses()
    db.session.add(Course(id="custom-course", title="教师自建课程", summary=""))
    db.session.add(
        Concept(
            id="concept-custom",
            course_id="custom-course",
            label="Custom Concept",
            definition="Teacher authored content.",
        )
    )
    db.session.commit()

    seed_courses()

    assert db.session.get(Course, "custom-course") is not None
    assert db.session.get(Concept, "concept-custom") is not None


def test_seed_courses_include_cross_course_concepts(app):
    seed_courses()

    graph = CourseService.get_graph()
    labels = {node["label"] for node in graph["nodes"]}
    relationships = {edge["relationship"] for edge in graph["edges"]}

    assert any("Transformer Attention" in label for label in labels)
    assert any("Human Attention" in label for label in labels)
    assert any("RELATED_TO" in rel for rel in relationships)


def test_ai_intro_graph_includes_connected_cross_course_concepts(app):
    seed_courses()

    graph = CourseService.get_graph("ai-intro")
    labels = {node["label"] for node in graph["nodes"]}

    assert any("Transformer Attention" in label for label in labels)
    assert any("Human Attention" in label for label in labels)
    assert any("Reward System" in label for label in labels)


def test_brain_cog_intro_graph_includes_human_attention(app):
    seed_courses()

    graph = CourseService.get_graph("brain-cog-intro")
    labels = {node["label"] for node in graph["nodes"]}

    assert any("Human Attention" in label for label in labels)
    assert not any("Heuristic Search" in label for label in labels)
    assert not any("Transformer Attention" in label for label in labels)


def test_course_graph_skips_edges_with_missing_endpoints(app):
    seed_courses()
    db.session.add(
        GraphEdge(
            id="edge-dangling",
            course_id="ai-intro",
            source_id="concept-search",
            target_id="concept-missing",
            relationship="RELATED_TO",
            evidence="Invalid graph draft.",
        )
    )
    db.session.commit()

    graph = CourseService.get_graph("ai-intro")
    edge_ids = {edge["id"] for edge in graph["edges"]}

    assert "edge-dangling" not in edge_ids


def test_course_graph_skips_edges_with_unpublished_endpoints(app):
    seed_courses()
    human_attention = db.session.get(Concept, "concept-human-attention")
    human_attention.status = "draft"
    db.session.commit()

    graph = CourseService.get_graph("ai-intro")
    edge_ids = {edge["id"] for edge in graph["edges"]}
    node_ids = {node["id"] for node in graph["nodes"]}

    assert "edge-attention-related" not in edge_ids
    assert "concept-human-attention" not in node_ids


def test_seed_courses_include_phase_one_learning_activities(app):
    seed_courses()

    activities = LearningActivity.query.all()
    activity_types = {activity.activity_type for activity in activities}

    assert len(activities) >= 4
    assert activity_types >= {"lecture_deck", "code_lab", "cognitive_experiment", "bci_dataset_lab"}
