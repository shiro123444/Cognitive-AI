"""Graph context stays compatible, read-only and within each authorized course."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.db import db
from app.jwt_utils import create_access_token
from app.models import (
    Chapter,
    Chunk,
    Concept,
    Course,
    ExperimentRun,
    ExperimentTemplate,
    GraphEdge,
    GraphEvidence,
    LearningActivity,
    Material,
    ProgressEvent,
    User,
)


@pytest.fixture()
def graph_seed(app):
    with app.app_context():
        app.config.update(PLUGIN_ALLOWED_COURSE_IDS="", MULTI_TENANT_ENABLED=False)
        db.session.add_all([
            User(id="graph-ada", name="Ada", role="student"),
            User(id="graph-bob", name="Bob", role="student"),
            Course(id="graph-course", title="Neuroscience", status="published"),
            Course(id="other-course", title="Other course", status="published"),
        ])
        db.session.flush()
        db.session.add_all([
            Chapter(id="graph-chapter", course_id="graph-course", title="Neurons"),
            Chapter(id="other-chapter", course_id="other-course", title="Other"),
            Concept(id="concept-a", course_id="graph-course", label="Neuron"),
            Concept(id="concept-b", course_id="graph-course", label="Spike"),
            Concept(id="concept-other", course_id="other-course", label="Other concept"),
            Concept(id="concept-ada", course_id="graph-course", label="Ada notes", scope_type="student_personal", owner_id="graph-ada"),
            Concept(id="concept-bob", course_id="graph-course", label="Bob notes", scope_type="student_personal", owner_id="graph-bob"),
        ])
        db.session.flush()
        db.session.add_all([
            GraphEdge(id="edge-ab", course_id="graph-course", source_id="concept-a", target_id="concept-b", relationship="produces", evidence="Reviewed text"),
            GraphEdge(id="edge-ada", course_id="graph-course", source_id="concept-a", target_id="concept-ada", relationship="notes", scope_type="student_personal", owner_id="graph-ada"),
            GraphEdge(id="edge-bob", course_id="graph-course", source_id="concept-a", target_id="concept-bob", relationship="notes", scope_type="student_personal", owner_id="graph-bob"),
            GraphEdge(id="edge-cross", course_id="graph-course", source_id="concept-a", target_id="concept-other", relationship="related"),
        ])
        materials = [
            ("global", "graph-course", "course_global", ""),
            ("ada", "graph-course", "student_personal", "graph-ada"),
            ("bob", "graph-course", "student_personal", "graph-bob"),
            ("teacher", "graph-course", "teacher_private", "teacher"),
            ("foreign", "other-course", "course_global", ""),
        ]
        for suffix, course_id, scope_type, owner_id in materials:
            db.session.add(Material(id=f"material-{suffix}", course_id=course_id, filename=f"{suffix}.pdf", path=f"/private/uploads/{suffix}.pdf", scope_type=scope_type, owner_id=owner_id))
        db.session.flush()
        for suffix, *_ in materials:
            text = f"Stored {suffix} source."
            db.session.add(Chunk(id=f"chunk-{suffix}", material_id=f"material-{suffix}", text=text, page_number=3, citation_locator="p.3"))
        db.session.flush()
        for suffix, concept_id in [
            ("global", "concept-a"), ("ada", "concept-ada"), ("bob", "concept-bob"),
            # Deliberately invalid legacy associations exercise read-side defense.
            ("bob", "concept-a"), ("teacher", "concept-a"), ("foreign", "concept-a"),
        ]:
            db.session.add(GraphEvidence(id=f"source-{concept_id}-{suffix}", concept_id=concept_id, chunk_id=f"chunk-{suffix}", content_sha256=hashlib.sha256(f"Stored {suffix} source.".encode()).hexdigest()))
        db.session.add(GraphEvidence(id="source-edge", edge_id="edge-ab", chunk_id="chunk-global", content_sha256=hashlib.sha256(b"Stored global source.").hexdigest()))
        activity_base = {"course_id": "graph-course", "chapter_id": "graph-chapter", "activity_type": "reading", "linked_concept_ids_json": '["concept-a"]'}
        for activity_id, overrides in [
            ("activity-ready", {"status": "published"}),
            ("activity-draft", {"status": "draft"}),
            ("activity-future", {"status": "published", "release_at": datetime.now(timezone.utc) + timedelta(days=1)}),
            ("activity-cross", {"status": "published", "course_id": "other-course", "chapter_id": "other-chapter"}),
            ("activity-wrong-chapter", {"status": "published", "chapter_id": "other-chapter"}),
            ("activity-unrelated", {"status": "published", "linked_concept_ids_json": '["concept-other"]'}),
            ("activity-malformed", {"status": "published", "linked_concept_ids_json": '{"concept-a": true}'}),
        ]:
            db.session.add(LearningActivity(id=activity_id, title=activity_id, launch_url="https://example.invalid/launch", config_json='{"answer":"HIDDEN-CONFIG"}', **{**activity_base, **overrides}))
        for template_id, status, linked in [
            ("template-ready", "published", '["concept-a"]'),
            ("template-draft", "draft", '["concept-a"]'),
            ("template-unrelated", "published", '[]'),
        ]:
            db.session.add(ExperimentTemplate(id=template_id, title=template_id, experiment_type="neuron", adapter="lumen", status=status, linked_concept_ids_json=linked, default_params_json='{"secret":"HIDDEN-PARAMS"}'))
        db.session.commit()


def _invoke(client, app, *, context=True, user_id="graph-ada", **arguments):
    with app.app_context():
        token = create_access_token(user_id, "student")
    args = {"course_id": "graph-course"}
    if context:
        args["include_context"] = True
    args.update(arguments)
    return client.post("/api/v1/plugin/invoke", json={"operation": "edufish.graph.neighborhood", "arguments": args}, headers={"Authorization": f"Bearer {token}"})


def _data(response):
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def _concept(data, concept_id):
    return next(entry for entry in data["context"]["concepts"] if entry["concept_id"] == concept_id)


def test_context_is_opt_in_and_advertised(client, app, graph_seed):
    legacy = _data(_invoke(client, app, context=False))
    explicitly_disabled = _data(_invoke(client, app, include_context=False))
    enriched = _data(_invoke(client, app))
    assert set(legacy) == {"nodes", "edges"}
    assert explicitly_disabled == legacy
    assert {key: enriched[key] for key in ("nodes", "edges")} == legacy
    assert enriched["context"]["course_id"] == "graph-course"
    assert enriched["context"]["version"] == 1
    with app.app_context():
        token = create_access_token("graph-ada", "student")
    manifest = client.get("/api/v1/plugin/manifest", headers={"Authorization": f"Bearer {token}"}).get_json()["data"]
    operation = next(entry for entry in manifest["operations"] if entry["name"] == "edufish.graph.neighborhood")
    assert operation["input_schema"]["properties"]["include_context"] == {"type": "boolean", "default": False}


@pytest.mark.parametrize("value", [None, 0, 1, "true", {}, []])
def test_context_flag_rejects_coercion(client, app, graph_seed, value):
    response = _invoke(client, app, include_context=value)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_ARGUMENT"


def test_context_sources_are_authorized_and_content_addressed(client, app, graph_seed):
    data = _data(_invoke(client, app))
    source = _concept(data, "concept-a")["sources"]
    assert source == [{
        "course_id": "graph-course", "material_id": "material-global", "chunk_id": "chunk-global",
        "filename": "global.pdf", "page_number": 3, "citation_locator": "p.3",
        "content_sha256": hashlib.sha256(b"Stored global source.").hexdigest(),
    }]
    assert [entry["chunk_id"] for entry in _concept(data, "concept-ada")["sources"]] == ["chunk-ada"]
    assert "concept-bob" not in {entry["concept_id"] for entry in data["context"]["concepts"]}
    edge = next(entry for entry in data["context"]["edges"] if entry["edge_id"] == "edge-ab")
    assert edge["sources"] == source
    serialized = json.dumps(data)
    for hidden in ("material-bob", "material-teacher", "material-foreign", "/private/uploads", "HIDDEN-CONFIG", "HIDDEN-PARAMS", "launch_url"):
        assert hidden not in serialized


def test_stale_or_removed_sources_are_omitted(client, app, graph_seed):
    before = _data(_invoke(client, app))
    with app.app_context():
        db.session.get(Chunk, "chunk-global").text = "A different revision."
        db.session.commit()
    after = _data(_invoke(client, app))
    assert _concept(after, "concept-a")["sources"] == []
    assert next(entry for entry in after["context"]["edges"] if entry["edge_id"] == "edge-ab")["sources"] == []
    assert before["context"]["snapshot_id"] != after["context"]["snapshot_id"]
    with app.app_context():
        db.session.delete(db.session.get(Chunk, "chunk-ada"))
        db.session.commit()
    removed = _data(_invoke(client, app))
    assert _concept(removed, "concept-ada")["sources"] == []


def test_links_include_only_released_published_course_activities_and_templates(client, app, graph_seed):
    data = _data(_invoke(client, app))
    context = _concept(data, "concept-a")
    assert context["activities"] == [{"activity_id": "activity-ready", "chapter_id": "graph-chapter", "title": "activity-ready", "activity_type": "reading"}]
    assert context["experiments"] == [{"template_id": "template-ready", "title": "template-ready", "adapter": "lumen"}]
    assert _concept(data, "concept-b")["activities"] == []
    assert _concept(data, "concept-b")["experiments"] == []


def test_context_matches_returned_bounds_and_never_follows_cross_course_edges(client, app, graph_seed):
    limited = _data(_invoke(client, app, concept_id="concept-a", limit=1, depth=2))
    assert [entry["concept_id"] for entry in limited["context"]["concepts"]] == ["concept-a"]
    assert limited["edges"] == limited["context"]["edges"] == []
    data = _data(_invoke(client, app, concept_id="concept-a", depth=2))
    assert {entry["concept_id"] for entry in data["context"]["concepts"]} == {entry["id"] for entry in data["nodes"]}
    assert {entry["edge_id"] for entry in data["context"]["edges"]} == {entry["id"] for entry in data["edges"]}
    assert "concept-other" not in json.dumps(data)
    assert _invoke(client, app, concept_id="concept-bob").status_code == 404
    app.config["PLUGIN_ALLOWED_COURSE_IDS"] = {"graph-ada": ["other-course"]}
    assert _invoke(client, app).status_code == 404


def test_snapshot_is_stable_and_reading_does_not_write_or_seed_templates(client, app, graph_seed):
    with app.app_context():
        before_counts = [model.query.count() for model in (GraphEvidence, ExperimentTemplate, ExperimentRun, ProgressEvent)]
    first = _data(_invoke(client, app))
    second = _data(_invoke(client, app))
    assert first == second
    assert len(first["context"]["snapshot_id"]) == 64
    with app.app_context():
        assert [model.query.count() for model in (GraphEvidence, ExperimentTemplate, ExperimentRun, ProgressEvent)] == before_counts
        db.session.get(Concept, "concept-a").definition = "An updated definition."
        db.session.commit()
    updated = _data(_invoke(client, app))
    assert updated["context"]["snapshot_id"] != first["context"]["snapshot_id"]


def test_related_links_are_bounded_per_concept(client, app, graph_seed):
    with app.app_context():
        for index in range(25):
            db.session.add(LearningActivity(id=f"activity-bound-{index:02}", course_id="graph-course", title="Reading", status="published", linked_concept_ids_json='["concept-a"]'))
            db.session.add(ExperimentTemplate(id=f"template-bound-{index:02}", title="Lab", experiment_type="neuron", adapter="lumen", status="published", linked_concept_ids_json='["concept-a"]'))
        db.session.commit()
    entry = _concept(_data(_invoke(client, app)), "concept-a")
    assert len(entry["activities"]) == len(entry["experiments"]) == 20
    assert entry["activities"][0]["activity_id"] == "activity-bound-00"
    assert entry["experiments"][0]["template_id"] == "template-bound-00"
