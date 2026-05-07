from flask import jsonify

from app.api import api_bp
from app.db import db
from app.models import Chapter
from app.services.course_service import CourseService
from app.services.seed_data import seed_courses


@api_bp.get("/courses")
def list_courses():
    courses = CourseService.list_courses()
    if not courses:
        seed_courses()
        courses = CourseService.list_courses()
    return jsonify({
        "success": True,
        "data": [
            {
                "id": course.id,
                "title": course.title,
                "summary": course.summary,
                "status": course.status,
            }
            for course in courses
        ],
    })


@api_bp.get("/courses/<course_id>")
def get_course(course_id):
    if not CourseService.get_course(course_id):
        return jsonify({"success": False, "error": f"Course {course_id} not found"}), 404
    return jsonify({"success": True, "data": CourseService.get_course_detail(course_id)})


@api_bp.get("/chapters/<chapter_id>")
def get_chapter(chapter_id):
    if not db.session.get(Chapter, chapter_id):
        return jsonify({"success": False, "error": f"Chapter {chapter_id} not found"}), 404
    return jsonify({"success": True, "data": CourseService.get_chapter(chapter_id)})
