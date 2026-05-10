"""Assignment & Submission API.

Role conventions:
- ``teacher`` / ``admin`` create, publish, archive, and grade.
- ``student`` submits under their own identity — the server ignores any
  ``student_id`` body field and uses the authenticated user instead.
- Listing assignments is open to any authenticated user; listing submissions
  for an assignment is teacher-only. Students can always list their own.
"""

from flask import jsonify, request

from app.api import api_bp
from app.rbac import (
    current_role,
    current_user_id,
    require_authenticated,
    require_role,
)
from app.services.assignment_service import AssignmentService, SubmissionService


@api_bp.get("/assignments")
@require_authenticated
def list_assignments():
    course_id = request.args.get("course_id")
    status = request.args.get("status")

    if current_role() == "student" and status is None:
        status = "published"

    items = AssignmentService.list_assignments(course_id=course_id, status=status)
    return jsonify({"success": True, "data": [AssignmentService.serialize(a) for a in items]})


@api_bp.post("/assignments")
@require_role("teacher")
def create_assignment():
    body = request.get_json(silent=True) or {}
    try:
        assignment = AssignmentService.create_assignment(
            course_id=body.get("course_id"),
            title=body.get("title"),
            assignment_type=body.get("assignment_type", "reading"),
            description=body.get("description", ""),
            chapter_id=body.get("chapter_id"),
            activity_id=body.get("activity_id"),
            config=body.get("config") or {},
            created_by=body.get("created_by") or current_user_id(),
            due_at=body.get("due_at"),
            status=body.get("status", "draft"),
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": AssignmentService.serialize(assignment)})


@api_bp.get("/assignments/<assignment_id>")
@require_authenticated
def get_assignment(assignment_id):
    assignment = AssignmentService.get_assignment(assignment_id)
    if assignment is None:
        return jsonify({"success": False, "error": f"assignment not found: {assignment_id}"}), 404
    if current_role() == "student" and assignment.status != "published":
        return jsonify({"success": False, "error": f"assignment not found: {assignment_id}"}), 404
    return jsonify({"success": True, "data": AssignmentService.serialize(assignment)})


@api_bp.post("/assignments/<assignment_id>/publish")
@require_role("teacher")
def publish_assignment(assignment_id):
    try:
        assignment = AssignmentService.publish(assignment_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": AssignmentService.serialize(assignment)})


@api_bp.post("/assignments/<assignment_id>/archive")
@require_role("teacher")
def archive_assignment(assignment_id):
    try:
        assignment = AssignmentService.archive(assignment_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": AssignmentService.serialize(assignment)})


@api_bp.get("/assignments/<assignment_id>/submissions")
@require_role("teacher")
def list_submissions(assignment_id):
    submissions = SubmissionService.list_for_assignment(assignment_id)
    return jsonify({"success": True, "data": [SubmissionService.serialize(s) for s in submissions]})


@api_bp.post("/assignments/<assignment_id>/submissions")
@require_authenticated
def submit_assignment(assignment_id):
    body = request.get_json(silent=True) or {}
    # Students can only submit as themselves; ignore any body-supplied id.
    role = current_role()
    if role == "student":
        student_id = current_user_id()
    else:
        student_id = body.get("student_id")
    content = body.get("content") or {}
    try:
        submission = SubmissionService.submit(assignment_id, student_id, content)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": SubmissionService.serialize(submission)})


@api_bp.post("/submissions/<submission_id>/grade")
@require_role("teacher")
def grade_submission(submission_id):
    body = request.get_json(silent=True) or {}
    score = body.get("score")
    feedback = body.get("feedback", "")
    try:
        submission = SubmissionService.grade(submission_id, score=score, feedback=feedback)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "data": SubmissionService.serialize(submission)})


@api_bp.get("/students/<student_id>/submissions")
@require_authenticated
def list_student_submissions(student_id):
    # Students can only read their own list; teachers/admins can read anyone's.
    role = current_role()
    if role == "student" and current_user_id() != student_id:
        return (
            jsonify(
                {
                    "success": False,
                    "error": {"code": "FORBIDDEN", "message": "Can only read your own submissions"},
                }
            ),
            403,
        )
    submissions = SubmissionService.list_for_student(student_id)
    return jsonify({"success": True, "data": [SubmissionService.serialize(s) for s in submissions]})


@api_bp.get("/me/submissions")
@require_authenticated
def list_my_submissions():
    student_id = current_user_id()
    submissions = SubmissionService.list_for_student(student_id)
    return jsonify({"success": True, "data": [SubmissionService.serialize(s) for s in submissions]})
