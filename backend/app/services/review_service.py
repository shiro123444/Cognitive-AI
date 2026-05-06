import json
from uuid import uuid4

from app.db import db
from app.models import Concept, GraphEdge, ReviewItem


class ReviewService:
    @staticmethod
    def list_items():
        return ReviewItem.query.order_by(ReviewItem.created_at.desc()).all()

    @staticmethod
    def create_graph_suggestion(title, payload, commit=True):
        item = ReviewItem(
            id=f"review-{uuid4().hex}",
            title=title,
            item_type="graph_suggestion",
            status="draft",
            payload_json=json.dumps(payload, ensure_ascii=False),
        )
        db.session.add(item)
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        db.session.refresh(item)
        return item

    @staticmethod
    def get_payload(item):
        try:
            return json.loads(item.payload_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError("Review payload must be valid JSON.") from exc

    @staticmethod
    def _ensure_draft(item, action):
        if item.status != "draft":
            raise ValueError(f"Only draft items can be {action}.")

    @staticmethod
    def _required_string(data, key, label):
        value = data.get(key)
        if not value:
            raise ValueError(f"{label} is required.")
        if not isinstance(value, str):
            raise ValueError(f"{label} must be a string.")
        return value

    @staticmethod
    def _optional_string(data, key, label):
        value = data.get(key, "")
        if value is None:
            return ""
        if not isinstance(value, str):
            raise ValueError(f"{label} must be a string.")
        return value

    @staticmethod
    def _validate_graph_payload(item):
        payload = ReviewService.get_payload(item)
        if not isinstance(payload, dict):
            raise ValueError("Review payload must be an object.")

        payload_course_id = payload.get("course_id")
        if payload_course_id is not None and not isinstance(payload_course_id, str):
            raise ValueError("Payload course_id must be a string.")
        payload_scope_type = payload.get("scope_type") or "course_global"
        payload_owner_id = payload.get("owner_id") or ""
        if not isinstance(payload_scope_type, str):
            raise ValueError("Payload scope_type must be a string.")
        if not isinstance(payload_owner_id, str):
            raise ValueError("Payload owner_id must be a string.")
        concepts = payload.get("concepts", [])
        edges = payload.get("edges", [])
        if not isinstance(concepts, list):
            raise ValueError("Review payload concepts must be a list.")
        if not isinstance(edges, list):
            raise ValueError("Review payload edges must be a list.")

        normalized_concepts = []
        payload_concept_ids = set()
        for concept in concepts:
            if not isinstance(concept, dict):
                raise ValueError("Each concept must be an object.")
            course_id = concept.get("course_id") or payload_course_id
            if course_id is not None and not isinstance(course_id, str):
                raise ValueError("Concept course_id must be a string.")
            concept_id = ReviewService._required_string(concept, "id", "Concept id")
            label = ReviewService._required_string(concept, "label", "Concept label")
            definition = ReviewService._optional_string(concept, "definition", "Concept definition")
            scope_type = concept.get("scope_type") or payload_scope_type
            owner_id = concept.get("owner_id") or payload_owner_id
            if not isinstance(scope_type, str):
                raise ValueError("Concept scope_type must be a string.")
            if not isinstance(owner_id, str):
                raise ValueError("Concept owner_id must be a string.")
            if not course_id:
                raise ValueError("Concept course_id is required.")
            normalized_concepts.append({
                "id": concept_id,
                "course_id": course_id,
                "label": label,
                "definition": definition,
                "scope_type": scope_type,
                "owner_id": owner_id,
            })
            payload_concept_ids.add(concept_id)

        normalized_edges = []
        for edge in edges:
            if not isinstance(edge, dict):
                raise ValueError("Each edge must be an object.")
            course_id = edge.get("course_id") or payload_course_id
            if course_id is not None and not isinstance(course_id, str):
                raise ValueError("Edge course_id must be a string.")
            edge_id = ReviewService._required_string(edge, "id", "Edge id")
            source_id = ReviewService._required_string(edge, "source", "Edge source")
            target_id = ReviewService._required_string(edge, "target", "Edge target")
            relationship = ReviewService._required_string(edge, "relationship", "Edge relationship")
            evidence = ReviewService._optional_string(edge, "evidence", "Edge evidence")
            scope_type = edge.get("scope_type") or payload_scope_type
            owner_id = edge.get("owner_id") or payload_owner_id
            if not isinstance(scope_type, str):
                raise ValueError("Edge scope_type must be a string.")
            if not isinstance(owner_id, str):
                raise ValueError("Edge owner_id must be a string.")
            if not course_id:
                raise ValueError("Edge course_id is required.")

            for endpoint_name, concept_id in (("source", source_id), ("target", target_id)):
                if concept_id in payload_concept_ids:
                    continue
                concept = db.session.get(Concept, concept_id)
                if concept is None:
                    raise ValueError(f"Edge {endpoint_name} concept does not exist: {concept_id}")
                if concept.status != "published":
                    raise ValueError(f"Edge {endpoint_name} concept is not published: {concept_id}")

            normalized_edges.append({
                "id": edge_id,
                "course_id": course_id,
                "source_id": source_id,
                "target_id": target_id,
                "relationship": relationship,
                "evidence": evidence,
                "scope_type": scope_type,
                "owner_id": owner_id,
            })

        return normalized_concepts, normalized_edges

    @staticmethod
    def _payload_confidence_ok(payload, threshold=0.65):
        for concept in payload.get("concepts", []):
            confidence = concept.get("confidence")
            if confidence is not None and float(confidence) < threshold:
                return False
        for edge in payload.get("edges", []):
            confidence = edge.get("confidence")
            if confidence is not None and float(confidence) < threshold:
                return False
        return True

    @staticmethod
    def auto_publish_graph_suggestion(item_id, scope_type="course_global", owner_id="", reviewer="material-agent"):
        item = db.get_or_404(ReviewItem, item_id)
        payload = ReviewService.get_payload(item)
        if not ReviewService._payload_confidence_ok(payload):
            item.status = "needs_review"
            item.reviewer = reviewer
            item.decision_notes = "Automatic publish skipped because confidence was below threshold."
            db.session.commit()
            return {"published": False, "needs_review": True, "reason": "low_confidence"}

        concepts, edges = ReviewService._validate_graph_payload(item)
        try:
            for concept in concepts:
                db.session.merge(
                    Concept(
                        id=concept["id"],
                        course_id=concept["course_id"],
                        label=concept["label"],
                        definition=concept["definition"],
                        status="published",
                        scope_type=scope_type or concept["scope_type"],
                        owner_id=owner_id or concept["owner_id"],
                    )
                )
            for edge in edges:
                db.session.merge(
                    GraphEdge(
                        id=edge["id"],
                        course_id=edge["course_id"],
                        source_id=edge["source_id"],
                        target_id=edge["target_id"],
                        relationship=edge["relationship"],
                        status="published",
                        evidence=edge["evidence"],
                        scope_type=scope_type or edge["scope_type"],
                        owner_id=owner_id or edge["owner_id"],
                    )
                )
            item.status = "published"
            item.reviewer = reviewer
            item.decision_notes = "Automatically published by material analysis agent."
            db.session.commit()
        except Exception:
            db.session.rollback()
            item.status = "needs_review"
            item.reviewer = reviewer
            item.decision_notes = "Automatic publish failed during graph write."
            db.session.commit()
            return {"published": False, "needs_review": True, "reason": "publish_failed"}

        return {
            "published": True,
            "needs_review": False,
            "concepts": len(concepts),
            "edges": len(edges),
        }

    @staticmethod
    def approve_item(item_id, reviewer="", notes=""):
        item = db.get_or_404(ReviewItem, item_id)
        ReviewService._ensure_draft(item, "approved")
        reviewer = ReviewService._optional_string({"reviewer": reviewer}, "reviewer", "Reviewer")
        notes = ReviewService._optional_string({"notes": notes}, "notes", "Decision notes")
        item.status = "reviewed"
        item.reviewer = reviewer
        item.decision_notes = notes
        db.session.commit()
        return item

    @staticmethod
    def reject_item(item_id, reviewer="", notes=""):
        item = db.get_or_404(ReviewItem, item_id)
        ReviewService._ensure_draft(item, "rejected")
        reviewer = ReviewService._optional_string({"reviewer": reviewer}, "reviewer", "Reviewer")
        notes = ReviewService._optional_string({"notes": notes}, "notes", "Decision notes")
        item.status = "rejected"
        item.reviewer = reviewer
        item.decision_notes = notes
        db.session.commit()
        return item

    @staticmethod
    def publish_item(item_id):
        item = db.get_or_404(ReviewItem, item_id)
        if item.status != "reviewed":
            raise ValueError("Only reviewed items can be published.")

        concepts, edges = ReviewService._validate_graph_payload(item)
        try:
            for concept in concepts:
                db.session.merge(
                    Concept(
                        id=concept["id"],
                        course_id=concept["course_id"],
                        label=concept["label"],
                        definition=concept["definition"],
                        status="published",
                        scope_type=concept["scope_type"],
                        owner_id=concept["owner_id"],
                    )
                )
            for edge in edges:
                db.session.merge(
                    GraphEdge(
                        id=edge["id"],
                        course_id=edge["course_id"],
                        source_id=edge["source_id"],
                        target_id=edge["target_id"],
                        relationship=edge["relationship"],
                        status="published",
                        evidence=edge["evidence"],
                        scope_type=edge["scope_type"],
                        owner_id=edge["owner_id"],
                    )
                )
            item.status = "published"
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
        return item
