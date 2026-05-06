"""EduFish global-awareness data collection tools.

Queries real student data from the platform DB (Submission, ProgressEvent,
LearningActivity) and converts it into the EduFish dataset format for the
existing analysis engine.

Architecture inspired by hermes-agent's tool registry pattern, integrated
natively into the platform's own agent framework.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any

from flask import current_app

from app.agents.registry import register_tool
from app.db import db
from app.models import (
    Assignment,
    Course,
    EduAnalysis,
    EduDataset,
    LearningActivity,
    ProgressEvent,
    Submission,
    User,
)

logger = logging.getLogger(__name__)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _collect_courses(course_ids: list[str] | None = None) -> list[dict]:
    """Collect course records from the Course model."""
    query = Course.query
    if course_ids:
        query = query.filter(Course.id.in_(course_ids))
    courses = query.all()
    result = []
    for c in courses:
        result.append({
            "course_id": c.id,
            "course_name": c.title,
            "department": "智能科学学院",
            "semester": "2026春",
        })
    return result


def _collect_users() -> tuple[list[dict], list[dict]]:
    """Collect teacher and student records from the User model."""
    teachers = []
    students = []
    for user in User.query.all():
        record = {
            "teacher_id" if user.role == "teacher" else "student_id": user.id,
            "teacher_name" if user.role == "teacher" else "student_name": user.name,
            "department": "智能科学学院",
        }
        if user.role == "teacher":
            record["title"] = "教授"
            teachers.append(record)
        else:
            record["class_name"] = ""
            students.append(record)
    return teachers, students


def _collect_grades(course_ids: list[str] | None, since: datetime | None) -> list[dict]:
    """Derive grade records from Submission scores."""
    query = Submission.query.join(Assignment)
    if course_ids:
        query = query.filter(Assignment.course_id.in_(course_ids))
    if since:
        query = query.filter(Submission.submitted_at >= since)
    submissions = query.all()

    grades = []
    for sub in submissions:
        score = _safe_float(sub.score)
        if score is None:
            continue
        assignment = sub.assignment
        grades.append({
            "course_id": assignment.course_id if assignment else "",
            "student_id": sub.student_id,
            "score": score,
            "passed": score >= 60,
        })
    return grades


def _collect_feedback(course_ids: list[str] | None, since: datetime | None) -> list[dict]:
    """Derive feedback records from Submission feedback text and ProgressEvent tutor interactions."""
    feedback = []

    # 1. From graded submissions with feedback text
    query = Submission.query.join(Assignment).filter(Submission.feedback != "")
    if course_ids:
        query = query.filter(Assignment.course_id.in_(course_ids))
    if since:
        query = query.filter(Submission.submitted_at >= since)

    for sub in query.all():
        assignment = sub.assignment
        score = _safe_float(sub.score)
        # Convert assignment score to a 5-point satisfaction rating
        rating = round(score / 20, 1) if score is not None else None
        feedback.append({
            "course_id": assignment.course_id if assignment else "",
            "student_id": sub.student_id,
            "rating": min(5.0, rating) if rating else None,
            "comment": sub.feedback[:200],
        })

    # 2. From tutor interaction events (asked_tutor) — count as engagement signals
    tutor_query = ProgressEvent.query.filter(ProgressEvent.event_type == "asked_tutor")
    if course_ids:
        tutor_query = tutor_query.filter(ProgressEvent.course_id.in_(course_ids))
    if since:
        tutor_query = tutor_query.filter(ProgressEvent.created_at >= since)

    # Group tutor interactions by student+course to generate aggregate feedback
    tutor_by_student: dict[tuple[str, str], int] = defaultdict(int)
    for event in tutor_query.all():
        tutor_by_student[(event.student_id, event.course_id or "")] += 1

    for (student_id, course_id), count in tutor_by_student.items():
        # High tutor usage can indicate either engagement or difficulty
        feedback.append({
            "course_id": course_id,
            "student_id": student_id,
            "rating": None,
            "comment": f"该学生共向 AI 助手提问 {count} 次，表现出{'较强' if count >= 3 else '一般'}的主动学习意愿。",
        })

    return feedback


def _collect_attendance(course_ids: list[str] | None, since: datetime | None, window_days: int = 30) -> list[dict]:
    """Derive attendance rates from ProgressEvent daily activity counts.

    'Attendance' is computed as: distinct active days / total calendar days × 100.
    """
    query = ProgressEvent.query
    if course_ids:
        query = query.filter(ProgressEvent.course_id.in_(course_ids))
    if since:
        query = query.filter(ProgressEvent.created_at >= since)

    events = query.all()

    # Group by (student, course) → set of active dates
    activity_dates: dict[tuple[str, str], set[str]] = defaultdict(set)
    for event in events:
        key = (event.student_id, event.course_id or "")
        date_str = event.created_at.strftime("%Y-%m-%d") if event.created_at else ""
        if date_str:
            activity_dates[key].add(date_str)

    attendance = []
    for (student_id, course_id), dates in activity_dates.items():
        active_days = len(dates)
        rate = min(100, round(active_days / max(1, window_days) * 100, 1))
        attendance.append({
            "course_id": course_id,
            "student_id": student_id,
            "attendance_rate": rate,
        })

    return attendance


def _build_dataset_payload(
    course_ids: list[str] | None = None,
    time_range_days: int = 30,
) -> dict[str, Any]:
    """Build a complete EduFish dataset payload from real platform data."""
    since = datetime.now(timezone.utc) - timedelta(days=time_range_days)

    courses = _collect_courses(course_ids)
    teachers, students = _collect_users()
    grades = _collect_grades(course_ids, since)
    feedback = _collect_feedback(course_ids, since)
    attendance = _collect_attendance(course_ids, since, window_days=time_range_days)

    # Link teachers to courses via assignment creators
    teacher_ids = {t.get("teacher_id") for t in teachers}
    assignments = Assignment.query
    if course_ids:
        assignments = assignments.filter(Assignment.course_id.in_(course_ids))
    for assignment in assignments.all():
        if assignment.created_by and assignment.created_by in teacher_ids:
            for course in courses:
                if course["course_id"] == assignment.course_id:
                    course["teacher_id"] = assignment.created_by

    return {
        "dataset_meta": {
            "name": f"Auto-collected {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
            "school_name": "示范大学",
            "department_name": "智能科学学院",
        },
        "dataset": {
            "courses": courses,
            "teachers": teachers,
            "students": students,
            "feedback": feedback,
            "grades": grades,
            "attendance": attendance,
        },
    }


# ── Tool Registrations ──────────────────────────────────────────────────────


@register_tool(
    name="collect_edu_data",
    description=(
        "全局感知 Agent 的核心工具。从平台数据库中采集真实的学生学习数据"
        "（作业提交、学习进度、实验参与、AI辅导互动），"
        "并转化为 EduFish 分析引擎所需的标准化数据集格式。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "course_id": {
                "type": "string",
                "description": "限定采集某门课程的数据（如 'ai-intro'）。留空则采集全部课程。",
            },
            "time_range_days": {
                "type": "integer",
                "description": "采集最近多少天的数据，默认 30 天",
                "default": 30,
            },
        },
        "required": [],
    },
)
def collect_edu_data(course_id: str | None = None, time_range_days: int = 30) -> dict:
    """Collect real student data from platform DB → EduFish dataset format."""
    course_ids = [course_id] if course_id else None
    payload = _build_dataset_payload(course_ids, time_range_days)
    dataset = payload["dataset"]
    summary = {
        "courses": len(dataset["courses"]),
        "teachers": len(dataset["teachers"]),
        "students": len(dataset["students"]),
        "feedback_items": len(dataset["feedback"]),
        "grade_records": len(dataset["grades"]),
        "attendance_records": len(dataset["attendance"]),
        "time_range_days": time_range_days,
    }
    logger.info("EduFish data collection complete: %s", summary)
    return {
        "status": "collected",
        "summary": summary,
        "payload": payload,
    }


@register_tool(
    name="trigger_edu_analysis",
    description=(
        "将采集到的数据提交给 EduFish 分析引擎，创建数据集并触发异步分析任务。"
        "分析完成后会自动生成证据图谱、预测推演和质量报告。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "collected_payload": {
                "type": "object",
                "description": "collect_edu_data 返回的 payload 对象",
            },
            "audience_role": {
                "type": "string",
                "description": "分析受众角色：school_admin / department_admin / teacher",
                "default": "school_admin",
            },
        },
        "required": ["collected_payload"],
    },
)
def trigger_edu_analysis(collected_payload: dict, audience_role: str = "school_admin") -> dict:
    """Create dataset + trigger analysis using the existing EduFish pipeline."""
    from app.services.edu_connectors import EducationDataIngestionService
    from app.services.edu_storage import EduStorageService
    from app.services.job_queue import get_queue

    dataset_meta = collected_payload.get("dataset_meta", {})
    raw_dataset = collected_payload.get("dataset", {})

    # Normalize through the existing connector layer
    normalized = EducationDataIngestionService().normalize_domains(raw_dataset)

    # Create persisted dataset
    dataset = EduStorageService.create_dataset(
        dataset_meta=dataset_meta,
        normalized_payload=normalized,
        name=dataset_meta.get("name", "Auto-collected dataset"),
    )

    # Determine scope from courses
    courses = raw_dataset.get("courses", [])
    scope = {}
    if courses:
        scope["course_id"] = courses[0].get("course_id", "")
        scope["course_name"] = courses[0].get("course_name", "")
        scope["department_name"] = dataset_meta.get("department_name", "")

    # Create analysis + report rows
    analysis = EduStorageService.create_analysis(
        dataset_id=dataset.id,
        template_id="course-quality",
        audience_role=audience_role,
        scope=scope,
    )
    report = EduStorageService.create_report(
        analysis_id=analysis.id,
        dataset_id=dataset.id,
        template_id="course-quality",
    )

    # Enqueue background job
    queue = get_queue()
    job = queue.enqueue(
        current_app._get_current_object(),
        "edu_analysis",
        target_id=analysis.id,
        payload={
            "dataset_id": dataset.id,
            "analysis_id": analysis.id,
            "report_id": report.id,
        },
    )

    logger.info("EduFish analysis triggered: job=%s analysis=%s", job.id, analysis.id)
    return {
        "status": "queued",
        "job_id": job.id,
        "dataset_id": dataset.id,
        "analysis_id": analysis.id,
        "report_id": report.id,
    }


@register_tool(
    name="check_edu_analysis_status",
    description="检查 EduFish 分析任务的执行状态和进度。",
    parameters={
        "type": "object",
        "properties": {
            "job_id": {
                "type": "string",
                "description": "分析任务的 job_id",
            },
        },
        "required": ["job_id"],
    },
)
def check_edu_analysis_status(job_id: str) -> dict:
    """Check the status of a queued EduFish analysis job."""
    from app.services.job_queue import get_queue

    queue = get_queue()
    job = queue.get(job_id)
    if job is None:
        return {"status": "not_found", "error": f"job not found: {job_id}"}
    return queue.serialize(job)
