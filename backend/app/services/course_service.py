from sqlalchemy import and_, or_
from sqlalchemy.orm import aliased

from app.db import db
from app.models import Chapter, Concept, Course, GraphEdge, LearningActivity, Material, QuizItem


class CourseService:
    _overlay_alias_cache = {}

    @staticmethod
    def list_courses():
        return Course.query.order_by(Course.title.asc()).all()

    @staticmethod
    def get_course(course_id):
        return db.session.get(Course, course_id)

    @staticmethod
    def get_course_detail(course_id):
        course = db.get_or_404(Course, course_id)
        chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order.asc()).all()
        activities = LearningActivity.query.filter_by(course_id=course_id).all()
        activity_types = {}
        for activity in activities:
            activity_types[activity.activity_type] = activity_types.get(activity.activity_type, 0) + 1
        return {
            "id": course.id,
            "title": course.title,
            "summary": course.summary,
            "activity_summary": {
                "total": len(activities),
                "published": len([a for a in activities if a.status == "published"]),
                "drafts": len([a for a in activities if a.status in {"draft", "scheduled"}]),
                "types": activity_types,
            },
            "chapters": [
                {
                    "id": chapter.id,
                    "title": chapter.title,
                    "order": chapter.order,
                    "objectives": chapter.objectives,
                    "body": chapter.body,
                }
                for chapter in chapters
            ],
        }

    @staticmethod
    def get_chapter(chapter_id):
        chapter = db.get_or_404(Chapter, chapter_id)
        quiz_items = QuizItem.query.filter_by(chapter_id=chapter_id).all()
        return {
            "id": chapter.id,
            "course_id": chapter.course_id,
            "title": chapter.title,
            "objectives": chapter.objectives,
            "body": chapter.body,
            "quiz_items": [
                {
                    "id": item.id,
                    "prompt": item.prompt,
                    "answer": item.answer,
                    "explanation": item.explanation,
                }
                for item in quiz_items
            ],
        }

    @staticmethod
    def get_graph(course_id=None, owner_id="", include_personal=False):
        SourceConcept = aliased(Concept)
        TargetConcept = aliased(Concept)

        def _scope_visible(model):
            if include_personal and owner_id:
                return or_(
                    model.scope_type == "course_global",
                    and_(
                        model.scope_type == "student_personal",
                        model.owner_id == owner_id,
                    ),
                )
            return model.scope_type == "course_global"

        edges_query = (
            db.session.query(GraphEdge)
            .join(SourceConcept, GraphEdge.source_id == SourceConcept.id)
            .join(TargetConcept, GraphEdge.target_id == TargetConcept.id)
            .filter(
                GraphEdge.status == "published",
                SourceConcept.status == "published",
                TargetConcept.status == "published",
                _scope_visible(GraphEdge),
            )
        )
        concepts_query = Concept.query.filter(
            Concept.status == "published",
            _scope_visible(Concept),
        )

        if course_id:
            edges = edges_query.filter(GraphEdge.course_id == course_id).all()
            connected_concept_ids = {
                concept_id
                for edge in edges
                for concept_id in (edge.source_id, edge.target_id)
            }
            concepts_query = concepts_query.filter(
                or_(
                    Concept.course_id == course_id,
                    Concept.id.in_(connected_concept_ids),
                )
            )
        else:
            edges = edges_query.all()

        concepts = concepts_query.all()
        nodes = [
            {
                "id": concept.id,
                "label": concept.label,
                "type": "Concept",
                "definition": concept.definition,
            }
            for concept in concepts
        ]
        return {
            "nodes": nodes,
            "edges": [
                {
                    "id": edge.id,
                    "source": edge.source_id,
                    "target": edge.target_id,
                    "relationship": edge.relationship,
                    "evidence": edge.evidence,
                }
                for edge in edges
            ],
        }

    @staticmethod
    def list_overlay_owner_ids(course_id, scope_type="student_personal"):
        if not course_id:
            return []
        owner_ids = set()
        for model in (Concept, GraphEdge, Material):
            rows = (
                db.session.query(model.owner_id)
                .filter(
                    model.course_id == course_id,
                    model.scope_type == scope_type,
                    model.owner_id != "",
                )
                .distinct()
                .all()
            )
            owner_ids.update(owner_id for owner_id, in rows)
        return sorted(owner_ids)

    @staticmethod
    def list_course_overlays(course_id):
        owner_ids = CourseService.list_overlay_owner_ids(course_id)
        alias_cache = CourseService._overlay_alias_cache.setdefault(course_id, {})

        next_index = max(
            (
                int(alias.rsplit("-", 1)[-1])
                for alias in alias_cache.values()
                if alias.startswith("学生-")
            ),
            default=0,
        ) + 1

        for owner_id in owner_ids:
            if owner_id in alias_cache:
                continue
            alias_cache[owner_id] = f"学生-{next_index:02d}"
            next_index += 1

        return [
            {
                "user_id": owner_id,
                "student_alias": alias_cache[owner_id],
                "scope_type": "student_personal",
            }
            for owner_id in sorted(
                owner_ids,
                key=lambda current_owner_id: alias_cache[current_owner_id],
            )
        ]
