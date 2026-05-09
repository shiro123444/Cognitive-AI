"""Tests for User, Assignment, Submission, Progress."""

from app.db import db
from app.models import Course
from app.services.assignment_service import AssignmentService, SubmissionService
from app.services.progress_service import ProgressService
from app.services.seed_data import seed_courses
from app.services.user_service import UserService


def test_create_and_list_users(app):
    with app.app_context():
        student = UserService.create_user(name="Alice", role="student")
        teacher = UserService.create_user(name="Bob", role="teacher")

        assert student.role == "student"
        assert teacher.role == "teacher"

        students = UserService.list_users(role="student")
        teachers = UserService.list_users(role="teacher")
        assert {u.id for u in students} == {student.id}
        assert {u.id for u in teachers} == {teacher.id}


def test_create_user_rejects_invalid_role(app):
    with app.app_context():
        try:
            UserService.create_user(name="X", role="superuser")
        except ValueError as exc:
            assert "role must be one of" in str(exc)
        else:
            raise AssertionError("expected ValueError")


def test_assignment_lifecycle(app):
    with app.app_context():
        seed_courses()
        teacher = UserService.create_user(name="Prof", role="teacher")

        assignment = AssignmentService.create_assignment(
            course_id="ai-intro",
            title="Reading 1",
            assignment_type="reading",
            description="Read chapter 1",
            created_by=teacher.id,
        )
        assert assignment.status == "draft"

        published = AssignmentService.publish(assignment.id)
        assert published.status == "published"

        listed = AssignmentService.list_assignments(course_id="ai-intro", status="published")
        assert assignment.id in {a.id for a in listed}

        archived = AssignmentService.archive(assignment.id)
        assert archived.status == "archived"


def test_assignment_rejects_wrong_course(app):
    with app.app_context():
        seed_courses()
        try:
            AssignmentService.create_assignment(
                course_id="nonexistent",
                title="X",
            )
        except ValueError as exc:
            assert "course not found" in str(exc)
        else:
            raise AssertionError("expected ValueError")


def test_submission_requires_published_assignment(app):
    with app.app_context():
        seed_courses()
        student = UserService.create_user(name="Stu", role="student")
        assignment = AssignmentService.create_assignment(
            course_id="ai-intro",
            title="Quiz",
            assignment_type="quiz",
        )
        # Cannot submit to draft
        try:
            SubmissionService.submit(assignment.id, student.id, content={"answer": "42"})
        except ValueError as exc:
            assert "published" in str(exc)
        else:
            raise AssertionError("expected ValueError")

        AssignmentService.publish(assignment.id)
        submission = SubmissionService.submit(assignment.id, student.id, content={"answer": "42"})
        assert submission.status == "submitted"


def test_grade_submission(app):
    with app.app_context():
        seed_courses()
        student = UserService.create_user(name="Stu", role="student")
        assignment = AssignmentService.create_assignment(
            course_id="ai-intro",
            title="Quiz",
            assignment_type="quiz",
        )
        AssignmentService.publish(assignment.id)
        submission = SubmissionService.submit(assignment.id, student.id, content={"answer": "42"})

        graded = SubmissionService.grade(submission.id, score=85.5, feedback="Good")
        assert graded.status == "graded"
        assert graded.score == 85.5
        assert graded.feedback == "Good"
        assert graded.graded_at is not None


def test_progress_event_recording(app):
    with app.app_context():
        seed_courses()
        student = UserService.create_user(name="Stu", role="student")

        ProgressService.record(
            student_id=student.id,
            event_type="viewed",
            course_id="ai-intro",
        )
        ProgressService.record(
            student_id=student.id,
            event_type="completed",
            course_id="ai-intro",
            chapter_id="ai-search",
        )

        summary = ProgressService.summary_for_student(student.id)
        assert summary["total_events"] == 2
        assert summary["event_counts"]["viewed"] == 1
        assert summary["event_counts"]["completed"] == 1
        assert "ai-search" in summary["completed_chapters"]


def test_cohort_summary(app):
    with app.app_context():
        seed_courses()
        s1 = UserService.create_user(name="S1", role="student")
        s2 = UserService.create_user(name="S2", role="student")

        ProgressService.record(student_id=s1.id, event_type="viewed", course_id="ai-intro", chapter_id="ai-search")
        ProgressService.record(student_id=s2.id, event_type="viewed", course_id="ai-intro", chapter_id="ai-search")
        ProgressService.record(student_id=s1.id, event_type="completed", course_id="ai-intro", chapter_id="ai-search")

        cohort = ProgressService.cohort_summary("ai-intro")
        assert cohort["active_students"] == 2
        assert cohort["chapter_views"]["ai-search"] == 2
        assert cohort["chapter_completions"]["ai-search"] == 1


def test_progress_rejects_unknown_event_type(app):
    with app.app_context():
        seed_courses()
        student = UserService.create_user(name="Stu", role="student")
        try:
            ProgressService.record(student_id=student.id, event_type="invented_event")
        except ValueError as exc:
            assert "event_type must be one of" in str(exc)
        else:
            raise AssertionError("expected ValueError")
