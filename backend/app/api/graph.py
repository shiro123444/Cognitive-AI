from flask import jsonify, request

from app.api import api_bp
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses


@api_bp.get("/graph")
def get_graph():
    if not CourseService.list_courses():
        seed_courses()
    course_id = request.args.get("course_id")
    user_id = request.args.get("user_id", "")
    return jsonify({
        "success": True,
        "data": CourseService.get_graph(
            course_id=course_id,
            owner_id=user_id,
            include_personal=bool(user_id),
        ),
    })


@api_bp.get("/course-overlays")
def get_course_overlays():
    if not CourseService.list_courses():
        seed_courses()
    course_id = request.args.get("course_id")
    return jsonify({"success": True, "data": CourseService.list_course_overlays(course_id)})
