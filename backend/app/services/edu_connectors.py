"""EduFish education data normalization helpers.

This is adapted from the standalone EDUFISH backend, trimmed to fit the
current Flask service boundary. It accepts raw registrar-style rows and turns
them into a stable teaching-quality dataset.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any


DOMAIN_KEYS = ("courses", "teachers", "students", "feedback", "grades", "attendance")


def _normalize_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", text)


def _alias_group(*values: str) -> list[str]:
    return [_normalize_header(value) for value in values]


FIELD_ALIASES = {
    "course_id": _alias_group("course_id", "courseid", "课程id", "课程编号", "课程代码", "课程编码"),
    "course_name": _alias_group("course_name", "coursename", "课程名称", "课程", "class_name"),
    "teacher_id": _alias_group("teacher_id", "teacherid", "教师id", "老师id", "工号"),
    "teacher_name": _alias_group("teacher_name", "teachername", "教师姓名", "老师姓名", "授课教师", "教师"),
    "student_id": _alias_group("student_id", "studentid", "学生id", "学号"),
    "student_name": _alias_group("student_name", "studentname", "学生姓名", "姓名"),
    "department": _alias_group("department", "院系", "学院", "部门", "departmentname"),
    "class_name": _alias_group("class_name", "classname", "班级", "行政班"),
    "grade_level": _alias_group("grade", "年级", "gradelevel"),
    "semester": _alias_group("semester", "term", "学期"),
    "credits": _alias_group("credits", "credit", "学分"),
    "title": _alias_group("title", "职称", "岗位"),
    "email": _alias_group("email", "邮箱", "mail"),
    "rating": _alias_group("rating", "score", "satisfaction", "评价分数", "满意度", "评分"),
    "comment": _alias_group("comment", "feedback", "content", "意见", "反馈", "建议", "评价内容"),
    "submitted_at": _alias_group("submitted_at", "created_at", "feedback_time", "提交时间", "评价时间"),
    "score": _alias_group("score", "grade", "成绩", "分数", "exam_score"),
    "passed": _alias_group("passed", "是否通过", "pass"),
    "attendance_rate": _alias_group("attendance_rate", "出勤率", "attendance", "attendancepercent"),
    "absences": _alias_group("absences", "absence", "缺勤次数", "缺勤"),
}


def _prepare_row(row: dict[str, Any]) -> dict[str, Any]:
    return {_normalize_header(key): value for key, value in row.items() if key is not None}


def _pick_value(row: dict[str, Any], field_name: str) -> Any:
    for alias in FIELD_ALIASES.get(field_name, []):
        if alias in row and row[alias] not in ("", None):
            return row[alias]
    return None


def _clean_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _to_float(value: Any) -> float | None:
    if value in ("", None):
        return None
    text = str(value).strip().replace("%", "")
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    numeric = _to_float(value)
    return int(numeric) if numeric is not None else None


def _to_bool(value: Any) -> bool | None:
    if value in ("", None):
        return None
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "通过", "是"}:
        return True
    if text in {"0", "false", "no", "n", "未通过", "否"}:
        return False
    return None


def _stable_id(prefix: str, parts) -> str:
    key = "|".join([_clean_text(part) for part in parts if _clean_text(part)]) or "unknown"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return f"{prefix}_{digest}"


def _dedupe(records: list[dict[str, Any]], id_field: str) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for record in records:
        record_id = _clean_text(record.get(id_field)) or _stable_id(id_field, record.values())
        record[id_field] = record_id
        if record_id not in by_id:
            by_id[record_id] = record
            continue
        merged = by_id[record_id]
        for key, value in record.items():
            if merged.get(key) in ("", None) and value not in ("", None):
                merged[key] = value
    return list(by_id.values())


class EducationDataIngestionService:
    """Normalize raw school-system data into EduFish domain rows."""

    def normalize_domains(self, raw_domains: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
        normalized = {
            "courses": self._normalize_courses(raw_domains.get("courses", [])),
            "teachers": self._normalize_teachers(raw_domains.get("teachers", [])),
            "students": self._normalize_students(raw_domains.get("students", [])),
            "feedback": self._normalize_feedback(raw_domains.get("feedback", [])),
            "grades": self._normalize_grades(raw_domains.get("grades", [])),
            "attendance": self._normalize_attendance(raw_domains.get("attendance", [])),
        }
        normalized = self._reconcile_relationships(normalized)
        return {
            "normalized_data": normalized,
            "source_summary": {"mode": "json_payload", "domains": {key: len(raw_domains.get(key, [])) for key in DOMAIN_KEYS}},
            "record_counts": {key: len(normalized[key]) for key in DOMAIN_KEYS},
            "sample_preview": {key: normalized[key][:3] for key in DOMAIN_KEYS if normalized[key]},
        }

    def _normalize_courses(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            course_name = _clean_text(_pick_value(row, "course_name"))
            if not course_name:
                continue
            result.append({
                "course_id": _clean_text(_pick_value(row, "course_id")) or _stable_id("course", [course_name, _pick_value(row, "semester")]),
                "course_name": course_name,
                "teacher_id": _clean_text(_pick_value(row, "teacher_id")),
                "teacher_name": _clean_text(_pick_value(row, "teacher_name")),
                "department": _clean_text(_pick_value(row, "department")),
                "semester": _clean_text(_pick_value(row, "semester")),
                "credits": _to_float(_pick_value(row, "credits")),
            })
        return _dedupe(result, "course_id")

    def _normalize_teachers(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            teacher_name = _clean_text(_pick_value(row, "teacher_name"))
            if not teacher_name:
                continue
            result.append({
                "teacher_id": _clean_text(_pick_value(row, "teacher_id")) or _stable_id("teacher", [teacher_name, _pick_value(row, "department")]),
                "teacher_name": teacher_name,
                "department": _clean_text(_pick_value(row, "department")),
                "title": _clean_text(_pick_value(row, "title")),
                "email": _clean_text(_pick_value(row, "email")),
            })
        return _dedupe(result, "teacher_id")

    def _normalize_students(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            student_name = _clean_text(_pick_value(row, "student_name"))
            student_id = _clean_text(_pick_value(row, "student_id"))
            if not student_name and not student_id:
                continue
            result.append({
                "student_id": student_id or _stable_id("student", [student_name, _pick_value(row, "class_name")]),
                "student_name": student_name or student_id,
                "department": _clean_text(_pick_value(row, "department")),
                "class_name": _clean_text(_pick_value(row, "class_name")),
                "grade_level": _clean_text(_pick_value(row, "grade_level")),
            })
        return _dedupe(result, "student_id")

    def _normalize_feedback(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            comment = _clean_text(_pick_value(row, "comment"))
            rating = _to_float(_pick_value(row, "rating"))
            course_name = _clean_text(_pick_value(row, "course_name"))
            teacher_name = _clean_text(_pick_value(row, "teacher_name"))
            student_name = _clean_text(_pick_value(row, "student_name"))
            if not comment and rating is None and not course_name:
                continue
            result.append({
                "feedback_id": _stable_id("feedback", [course_name, teacher_name, student_name, comment, rating]),
                "course_id": _clean_text(_pick_value(row, "course_id")),
                "course_name": course_name,
                "teacher_id": _clean_text(_pick_value(row, "teacher_id")),
                "teacher_name": teacher_name,
                "student_id": _clean_text(_pick_value(row, "student_id")),
                "student_name": student_name,
                "rating": rating,
                "comment": comment,
                "submitted_at": _clean_text(_pick_value(row, "submitted_at")),
            })
        return _dedupe(result, "feedback_id")

    def _normalize_grades(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            score = _to_float(_pick_value(row, "score"))
            course_name = _clean_text(_pick_value(row, "course_name"))
            student_name = _clean_text(_pick_value(row, "student_name"))
            if score is None and not course_name and not student_name:
                continue
            passed = _to_bool(_pick_value(row, "passed"))
            if passed is None and score is not None:
                passed = score >= 60
            result.append({
                "grade_id": _stable_id("grade", [course_name, student_name, score]),
                "course_id": _clean_text(_pick_value(row, "course_id")),
                "course_name": course_name,
                "teacher_id": _clean_text(_pick_value(row, "teacher_id")),
                "teacher_name": _clean_text(_pick_value(row, "teacher_name")),
                "student_id": _clean_text(_pick_value(row, "student_id")),
                "student_name": student_name,
                "score": score,
                "passed": passed,
            })
        return _dedupe(result, "grade_id")

    def _normalize_attendance(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for raw_row in rows:
            row = _prepare_row(raw_row)
            rate = _to_float(_pick_value(row, "attendance_rate"))
            absences = _to_int(_pick_value(row, "absences"))
            course_name = _clean_text(_pick_value(row, "course_name"))
            student_name = _clean_text(_pick_value(row, "student_name"))
            if rate is None and absences is None and not course_name and not student_name:
                continue
            if rate is not None and rate <= 1:
                rate *= 100
            result.append({
                "attendance_id": _stable_id("attendance", [course_name, student_name, rate, absences]),
                "course_id": _clean_text(_pick_value(row, "course_id")),
                "course_name": course_name,
                "teacher_id": _clean_text(_pick_value(row, "teacher_id")),
                "teacher_name": _clean_text(_pick_value(row, "teacher_name")),
                "student_id": _clean_text(_pick_value(row, "student_id")),
                "student_name": student_name,
                "attendance_rate": rate,
                "absences": absences,
            })
        return _dedupe(result, "attendance_id")

    def _reconcile_relationships(self, data: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
        course_by_id = {item["course_id"]: item for item in data["courses"] if item.get("course_id")}
        course_by_name = {item["course_name"]: item for item in data["courses"] if item.get("course_name")}
        teacher_by_id = {item["teacher_id"]: item for item in data["teachers"] if item.get("teacher_id")}
        teacher_by_name = {item["teacher_name"]: item for item in data["teachers"] if item.get("teacher_name")}
        student_by_id = {item["student_id"]: item for item in data["students"] if item.get("student_id")}
        student_by_name = {item["student_name"]: item for item in data["students"] if item.get("student_name")}

        for course in data["courses"]:
            teacher_name = course.get("teacher_name")
            if teacher_name and not course.get("teacher_id"):
                teacher = teacher_by_name.get(teacher_name)
                if teacher:
                    course["teacher_id"] = teacher["teacher_id"]
                else:
                    teacher_id = _stable_id("teacher", [teacher_name, course.get("department")])
                    teacher = {"teacher_id": teacher_id, "teacher_name": teacher_name, "department": course.get("department", ""), "title": "", "email": ""}
                    data["teachers"].append(teacher)
                    teacher_by_id[teacher_id] = teacher
                    teacher_by_name[teacher_name] = teacher
                    course["teacher_id"] = teacher_id

        for record_key in ("feedback", "grades", "attendance"):
            for record in data[record_key]:
                course = course_by_id.get(record.get("course_id", "")) if record.get("course_id") else None
                if not course and record.get("course_name"):
                    course = course_by_name.get(record["course_name"])
                    if course:
                        record["course_id"] = course["course_id"]
                if course:
                    record["course_name"] = record.get("course_name") or course.get("course_name", "")
                    record["teacher_id"] = record.get("teacher_id") or course.get("teacher_id", "")
                    record["teacher_name"] = record.get("teacher_name") or course.get("teacher_name", "")

                teacher = teacher_by_id.get(record.get("teacher_id", "")) if record.get("teacher_id") else None
                if not teacher and record.get("teacher_name"):
                    teacher = teacher_by_name.get(record["teacher_name"])
                    if teacher:
                        record["teacher_id"] = teacher["teacher_id"]
                if teacher:
                    record["teacher_name"] = record.get("teacher_name") or teacher.get("teacher_name", "")

                student = student_by_id.get(record.get("student_id", "")) if record.get("student_id") else None
                if not student and record.get("student_name"):
                    student = student_by_name.get(record["student_name"])
                    if student:
                        record["student_id"] = student["student_id"]
                if student:
                    record["student_name"] = record.get("student_name") or student.get("student_name", "")

        data["courses"] = _dedupe(data["courses"], "course_id")
        data["teachers"] = _dedupe(data["teachers"], "teacher_id")
        data["students"] = _dedupe(data["students"], "student_id")
        return data
