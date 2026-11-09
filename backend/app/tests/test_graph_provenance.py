import hashlib
import json
from types import SimpleNamespace

import pytest
from sqlalchemy.exc import IntegrityError

from app.db import db
from app.models import Chunk, Concept, GraphEdge, GraphEvidence, Material, ReviewItem
from app.services.material_service import MaterialService
from app.services.review_service import ReviewService
from app.services.seed_data import seed_courses


@pytest.fixture()
def sources(app):
    seed_courses()
    material_specs = [
        ("public", "ai-intro", "course_global", ""),
        ("ada", "ai-intro", "student_personal", "ada"),
        ("bob", "ai-intro", "student_personal", "bob"),
        ("teacher", "ai-intro", "teacher_private", "ada"),
        ("other-course", "brain-cog-intro", "course_global", ""),
    ]
    chunks = {}
    for name, course_id, scope_type, owner_id in material_specs:
        material = Material(
            id=f"source-material-{name}",
            course_id=course_id,
            filename=f"{name}.txt",
            path=f"/unused/{name}.txt",
            scope_type=scope_type,
            owner_id=owner_id,
        )
        chunk = Chunk(
            id=f"source-chunk-{name}",
            material=material,
            text=f"Reviewed evidence from {name}: memory preserves context.",
            citation_locator=f"{name}.txt#page-1-chunk-0",
            page_number=1,
        )
        db.session.add_all([material, chunk])
        chunks[name] = chunk
    db.session.commit()
    return chunks


def _suggestion(concept_sources=(), edge_sources=(), scope_type="course_global", owner_id=""):
    concept = {
        "id": "concept-reviewed-memory",
        "label": "Reviewed Memory",
        "definition": "Memory preserves context.",
    }
    edge = {
        "id": "edge-reviewed-memory-search",
        "source": concept["id"],
        "target": "concept-search",
        "relationship": "RELATED_TO",
        "evidence": "Memory supports search.",
    }
    if concept_sources != ():
        concept["evidence_chunk_ids"] = concept_sources
    if edge_sources != ():
        edge["evidence_chunk_ids"] = edge_sources
    return ReviewService.create_graph_suggestion(
        "Reviewed graph sources",
        {
            "course_id": "ai-intro",
            "scope_type": scope_type,
            "owner_id": owner_id,
            "concepts": [concept],
            "edges": [edge],
        },
    )


def _publish(item):
    ReviewService.approve_item(item.id, reviewer="teacher")
    return ReviewService.publish_item(item.id)


def _set_sqlite_foreign_keys(enabled):
    db.session.commit()
    connection = db.session.connection()
    connection.exec_driver_sql(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}")
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == int(enabled)


@pytest.mark.parametrize("automatic", [False, True])
def test_publication_preserves_real_sources_and_content_hashes(app, sources, automatic):
    chunk = sources["public"]
    item = _suggestion([chunk.id], [chunk.id])
    if automatic:
        result = ReviewService.auto_publish_graph_suggestion(item.id)
        assert result["published"] is True
    else:
        _publish(item)

    links = GraphEvidence.query.order_by(GraphEvidence.concept_id).all()
    assert len(links) == 2
    expected_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()
    assert {(link.concept_id, link.edge_id) for link in links} == {
        ("concept-reviewed-memory", None),
        (None, "edge-reviewed-memory-search"),
    }
    assert all(link.chunk_id == chunk.id and link.content_sha256 == expected_hash for link in links)
    assert db.session.get(ReviewItem, item.id).status == "published"


@pytest.mark.parametrize("automatic", [False, True])
def test_legacy_graph_payload_can_publish_without_sources(app, sources, automatic):
    item = _suggestion()
    if automatic:
        assert ReviewService.auto_publish_graph_suggestion(item.id)["published"] is True
    else:
        _publish(item)
    assert db.session.get(Concept, "concept-reviewed-memory") is not None
    assert db.session.get(GraphEdge, "edge-reviewed-memory-search") is not None
    assert GraphEvidence.query.count() == 0


@pytest.mark.parametrize("source_name", ["other-course", "ada", "teacher"])
def test_global_graph_rejects_cross_course_or_private_sources_without_partial_writes(app, sources, source_name):
    item = _suggestion([sources["public"].id], [sources[source_name].id])
    ReviewService.approve_item(item.id, reviewer="teacher")
    with pytest.raises(ValueError, match="course|knowledge scope"):
        ReviewService.publish_item(item.id)
    db.session.commit()
    assert db.session.get(Concept, "concept-reviewed-memory") is None
    assert db.session.get(GraphEdge, "edge-reviewed-memory-search") is None
    assert GraphEvidence.query.count() == 0
    assert db.session.get(ReviewItem, item.id).status == "reviewed"


@pytest.mark.parametrize(
    "scope_type,owner_id,source_name,allowed",
    [
        ("student_personal", "ada", "public", True),
        ("student_personal", "ada", "ada", True),
        ("student_personal", "ada", "bob", False),
        ("student_personal", "ada", "teacher", False),
        ("student_personal", "", "ada", False),
        ("teacher_private", "ada", "public", True),
        ("teacher_private", "ada", "teacher", True),
        ("teacher_private", "bob", "teacher", False),
        ("teacher_private", "ada", "ada", False),
    ],
)
def test_source_visibility_matches_published_subject_scope(app, sources, scope_type, owner_id, source_name, allowed):
    item = _suggestion([sources[source_name].id], scope_type=scope_type, owner_id=owner_id)
    if allowed:
        _publish(item)
        link = GraphEvidence.query.one()
        assert link.chunk_id == sources[source_name].id
    else:
        ReviewService.approve_item(item.id, reviewer="teacher")
        with pytest.raises(ValueError, match="knowledge scope"):
            ReviewService.publish_item(item.id)
        assert GraphEvidence.query.count() == 0


def test_auto_publication_validates_the_overridden_scope(app, sources):
    item = _suggestion([sources["ada"].id], scope_type="student_personal", owner_id="ada")
    result = ReviewService.auto_publish_graph_suggestion(item.id, scope_type="course_global")
    assert result == {"published": False, "needs_review": True, "reason": "invalid_graph"}
    assert db.session.get(ReviewItem, item.id).status == "needs_review"
    assert db.session.get(Concept, "concept-reviewed-memory") is None
    assert GraphEvidence.query.count() == 0


def test_auto_publication_keeps_matching_personal_sources(app, sources):
    item = _suggestion([sources["ada"].id], scope_type="student_personal", owner_id="ada")
    result = ReviewService.auto_publish_graph_suggestion(item.id, scope_type="student_personal", owner_id="ada")
    assert result["published"] is True
    assert GraphEvidence.query.one().chunk_id == sources["ada"].id
    assert db.session.get(Concept, "concept-reviewed-memory").owner_id == "ada"


@pytest.mark.parametrize(
    "invalid_ids",
    [None, "source-chunk-public", {}, [None], [1], [""], ["source-chunk-public"] * 2, ["missing-chunk"], [f"chunk-{i}" for i in range(11)]],
)
def test_publication_rejects_malformed_or_missing_sources(app, sources, invalid_ids):
    item = _suggestion(invalid_ids)
    ReviewService.approve_item(item.id, reviewer="teacher")
    with pytest.raises(ValueError, match="Evidence chunk"):
        ReviewService.publish_item(item.id)
    assert GraphEvidence.query.count() == 0
    assert db.session.get(Concept, "concept-reviewed-memory") is None


def test_republication_replaces_sources_and_legacy_replacement_clears_them(app, sources):
    first = _suggestion([sources["public"].id], [sources["public"].id])
    _publish(first)
    old_link_ids = {link.id for link in GraphEvidence.query.all()}

    replacement = Chunk(
        id="replacement-chunk",
        material_id=sources["public"].material_id,
        text="Replacement source text.",
        citation_locator="public.txt#page-2-chunk-1",
        page_number=2,
    )
    db.session.add(replacement)
    db.session.commit()
    second = _suggestion([replacement.id], [replacement.id])
    _publish(second)
    links = GraphEvidence.query.all()
    assert len(links) == 2
    assert all(link.chunk_id == replacement.id for link in links)
    assert not old_link_ids.intersection(link.id for link in links)

    third = _suggestion()
    _publish(third)
    assert GraphEvidence.query.count() == 0


@pytest.mark.parametrize("concept_id,edge_id", [(None, None), ("concept-reviewed-memory", "edge-reviewed-memory-search")])
def test_evidence_table_requires_exactly_one_subject(app, sources, concept_id, edge_id):
    _publish(_suggestion())
    db.session.add(GraphEvidence(
        id="invalid-evidence-subject",
        concept_id=concept_id,
        edge_id=edge_id,
        chunk_id=sources["public"].id,
        content_sha256="0" * 64,
    ))
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()


def test_evidence_table_rejects_duplicate_subject_chunk_associations(app, sources):
    _publish(_suggestion([sources["public"].id]))
    db.session.add(GraphEvidence(
        id="duplicate-evidence",
        concept_id="concept-reviewed-memory",
        chunk_id=sources["public"].id,
        content_sha256="0" * 64,
    ))
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()


def test_fallback_material_suggestion_cites_the_chunk_used_for_its_definition(app, sources):
    chunk = sources["public"]
    item = MaterialService._simple_suggestion(chunk.material, [chunk])
    payload = ReviewService.get_payload(item)
    assert payload["concepts"][0]["evidence_chunk_ids"] == [chunk.id]
    _publish(item)
    assert GraphEvidence.query.one().chunk_id == chunk.id


@pytest.mark.parametrize("subject", ["concept", "edge", "chunk"])
def test_deleting_graph_subjects_or_chunks_cascades_evidence_with_foreign_keys_enabled(app, sources, subject):
    _set_sqlite_foreign_keys(True)
    chunk_id = sources["public"].id
    _publish(_suggestion([chunk_id], [chunk_id]))

    if subject == "chunk":
        db.session.delete(db.session.get(Chunk, chunk_id))
    else:
        db.session.delete(db.session.get(GraphEdge, "edge-reviewed-memory-search"))
        db.session.flush()
        if subject == "concept":
            db.session.delete(db.session.get(Concept, "concept-reviewed-memory"))
    db.session.commit()

    remaining = GraphEvidence.query.all()
    assert len(remaining) == (1 if subject == "edge" else 0)
    if subject == "edge":
        assert remaining[0].concept_id == "concept-reviewed-memory"
    if subject == "chunk":
        assert db.session.get(Concept, "concept-reviewed-memory") is not None
        assert db.session.get(GraphEdge, "edge-reviewed-memory-search") is not None


@pytest.mark.parametrize("foreign_keys_enabled", [False, True])
@pytest.mark.parametrize("empty_replacement", [False, True])
def test_rechunking_removes_only_replaced_chunk_evidence(app, sources, tmp_path, foreign_keys_enabled, empty_replacement):
    _set_sqlite_foreign_keys(foreign_keys_enabled)
    material = sources["public"].material
    source_path = tmp_path / "rechunk.txt"
    source_path.write_text("Original memory source text.", encoding="utf-8")
    material.path = str(source_path)
    db.session.commit()
    original_chunks = MaterialService.extract_and_chunk(material)
    original_id = original_chunks[0].id
    _publish(_suggestion([original_id], [original_id]))

    unrelated = ReviewService.create_graph_suggestion("Unrelated course source", {
        "course_id": "brain-cog-intro",
        "concepts": [{
            "id": "concept-unrelated-source",
            "label": "Unrelated Source",
            "evidence_chunk_ids": [sources["other-course"].id],
        }],
        "edges": [],
    })
    _publish(unrelated)
    unrelated_link = GraphEvidence.query.filter_by(concept_id="concept-unrelated-source").one()
    unrelated_id = unrelated_link.id

    source_path.write_text("" if empty_replacement else "Updated source text with new evidence.", encoding="utf-8")
    replacement_chunks = MaterialService.extract_and_chunk(material)

    assert GraphEvidence.query.count() == 1
    assert db.session.get(GraphEvidence, unrelated_id) is not None
    assert db.session.get(Concept, "concept-reviewed-memory") is not None
    assert db.session.get(GraphEdge, "edge-reviewed-memory-search") is not None
    assert material.chunk_count == len(replacement_chunks)
    if empty_replacement:
        assert replacement_chunks == []
        assert material.parser_status == "empty"
        assert db.session.get(Chunk, original_id) is None
    else:
        assert replacement_chunks[0].id == original_id
        assert "Updated source text" in replacement_chunks[0].text
        assert material.parser_status == "chunked"
        assert GraphEvidence.query.filter_by(chunk_id=original_id).count() == 0


def _fake_llm(monkeypatch, payload, captured):
    def chat_json(**kwargs):
        captured.update(kwargs)
        return json.dumps(payload)

    monkeypatch.setattr("app.llm_client.LLMClient", lambda **kwargs: SimpleNamespace(chat_json=chat_json))


def test_llm_extraction_receives_actual_chunk_ids_and_preserves_valid_sources(app, sources, monkeypatch):
    chunk = sources["public"]
    captured = {}
    _fake_llm(monkeypatch, {"concepts": [{"label": "Memory", "definition": "Keeps context.", "evidence_chunk_ids": [chunk.id]}], "edges": []}, captured)
    item = MaterialService._llm_suggestion(chunk.material, [chunk], app.config)
    prompt = captured["messages"][0]["content"]
    assert f"[chunk_id: {chunk.id}]\n{chunk.text}" in prompt
    assert ReviewService.get_payload(item)["concepts"][0]["evidence_chunk_ids"] == [chunk.id]


def test_agent_extraction_receives_actual_chunk_ids_and_preserves_valid_sources(app, sources, monkeypatch):
    chunk = sources["public"]
    captured = {}

    def run(prompt, context):
        captured["prompt"] = prompt
        return SimpleNamespace(
            finish_reason="stop",
            iterations=1,
            tool_calls=[],
            answer=json.dumps({"concepts": [{"label": "Memory", "evidence_chunk_ids": [chunk.id]}], "edges": []}),
        )

    monkeypatch.setattr("app.agents.definitions.get_agent", lambda name: SimpleNamespace(run=run))
    item = MaterialService._agent_suggestion(chunk.material, [chunk], app.config)
    assert f"[chunk_id: {chunk.id}]\n{chunk.text}" in captured["prompt"]
    assert ReviewService.get_payload(item)["concepts"][0]["evidence_chunk_ids"] == [chunk.id]


def test_extraction_rejects_real_chunks_excluded_from_the_supplied_context(app, sources, monkeypatch):
    chunk = sources["public"]
    excluded = Chunk(id="excluded-chunk", material_id=chunk.material_id, text="x" * 7000)
    db.session.add(excluded)
    db.session.commit()
    captured = {}
    _fake_llm(monkeypatch, {"concepts": [{"label": "Memory", "evidence_chunk_ids": [excluded.id]}], "edges": []}, captured)
    with pytest.raises(ValueError, match="supplied in the extraction context"):
        MaterialService._llm_suggestion(chunk.material, [chunk, excluded], app.config)
    assert f"[chunk_id: {excluded.id}]" not in captured["messages"][0]["content"]
    assert ReviewItem.query.count() == 0


def test_invented_extraction_sources_use_the_existing_safe_fallback(app, sources, monkeypatch):
    chunk = sources["public"]
    app.config["LLM_API_KEY"] = "fixture-only"

    def agent_unavailable(*args, **kwargs):
        raise RuntimeError("Fixture agent unavailable")

    monkeypatch.setattr(MaterialService, "_agent_suggestion", staticmethod(agent_unavailable))
    _fake_llm(monkeypatch, {"concepts": [{"label": "Memory", "evidence_chunk_ids": ["invented-source"]}], "edges": []}, {})
    item = MaterialService.create_review_suggestion_from_chunks(chunk.material, [chunk])
    payload = ReviewService.get_payload(item)
    assert payload["concepts"][0]["id"] == f"concept-upload-{chunk.material_id}"
    assert payload["concepts"][0]["evidence_chunk_ids"] == [chunk.id]
    assert ReviewItem.query.count() == 1
