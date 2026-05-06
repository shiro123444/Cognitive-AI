from flask import current_app, jsonify, request

from app.api import api_bp
from app.models import Material
from app.services.material_service import MaterialService


ALLOWED_SCOPE_TYPES = {"course_global", "student_personal", "teacher_private"}


def _serialize(material):
    return {
        "id": material.id,
        "course_id": material.course_id,
        "filename": material.filename,
        "parser_status": material.parser_status,
        "chunk_count": material.chunk_count,
        "extraction_method": material.extraction_method,
        "scope_type": material.scope_type,
        "owner_id": material.owner_id,
    }


def _upload_scope():
    scope_type = request.form.get("scope_type") or "course_global"
    owner_id = request.form.get("owner_id") or ""
    if scope_type not in ALLOWED_SCOPE_TYPES:
        raise ValueError("scope_type must be course_global, student_personal, or teacher_private")
    if scope_type == "student_personal" and not owner_id:
        raise ValueError("owner_id is required for student_personal materials")
    return scope_type, owner_id


@api_bp.post("/materials/upload")
def upload_material():
    course_id = request.form.get("course_id")
    file_storage = request.files.get("file")
    if not course_id or file_storage is None:
        return jsonify({"success": False, "error": "course_id and file are required"}), 400

    use_async = request.args.get("async") in ("1", "true", "yes")

    try:
        scope_type, owner_id = _upload_scope()
        if use_async:
            material, job, run = MaterialService.ingest_upload_async(
                course_id,
                file_storage,
                scope_type=scope_type,
                owner_id=owner_id,
                auto_publish=True,
            )
            return jsonify({
                "success": True,
                "data": {
                    "material": _serialize(material),
                    "job_id": job.id,
                    "run_id": run.id,
                    "async": True,
                },
            })
        material, review_item = MaterialService.ingest_upload(
            course_id,
            file_storage,
            scope_type=scope_type,
            owner_id=owner_id,
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception:
        current_app.logger.exception("Material upload failed")
        return jsonify({"success": False, "error": "material upload failed"}), 500

    return jsonify({
        "success": True,
        "data": {
            "material": _serialize(material),
            "review_item_id": review_item.id,
        },
    })


@api_bp.get("/materials")
def list_materials():
    query = Material.query
    course_id = request.args.get("course_id")
    if course_id:
        query = query.filter_by(course_id=course_id)
    scope_type = request.args.get("scope_type")
    owner_id = request.args.get("owner_id")
    if scope_type:
        query = query.filter_by(scope_type=scope_type)
    if owner_id is not None:
        query = query.filter_by(owner_id=owner_id)
    materials = query.order_by(Material.created_at.desc()).all()
    return jsonify({"success": True, "data": [_serialize(material) for material in materials]})
