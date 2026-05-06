"""EduFish teaching-quality analysis engine."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from statistics import mean
from typing import Any


STOPWORDS = {
    "course", "teacher", "class", "student", "lesson", "the", "and", "with",
    "this", "that", "from", "have", "has", "were", "been", "feedback",
    "teaching", "课程", "老师", "教学", "学生", "课堂", "评价", "问题", "比较",
}


def _avg(values) -> float | None:
    valid = [float(value) for value in values if value is not None]
    return round(mean(valid), 2) if valid else None


def _keyword_counts(comments: list[str], limit: int = 8) -> list[dict[str, Any]]:
    tokens: Counter[str] = Counter()
    for comment in comments:
        for token in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{4,}", comment or ""):
            lowered = token.lower()
            if lowered in STOPWORDS:
                continue
            tokens[lowered] += 1
    return [{"keyword": token, "count": count} for token, count in tokens.most_common(limit)]


class EduAnalysisService:
    def apply_scope(self, dataset: dict[str, list[dict[str, Any]]], audience_role: str, scope: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        role = (audience_role or "school_admin").strip().lower()
        if role == "school_admin":
            return {key: [dict(item) for item in dataset.get(key, [])] for key in ("courses", "teachers", "students", "feedback", "grades", "attendance")}

        department_name = (scope.get("department_name") or "").strip().lower()
        teacher_id = (scope.get("teacher_id") or "").strip()
        teacher_name = (scope.get("teacher_name") or "").strip().lower()

        courses = [dict(item) for item in dataset.get("courses", [])]
        teachers = [dict(item) for item in dataset.get("teachers", [])]
        students = [dict(item) for item in dataset.get("students", [])]
        feedback = [dict(item) for item in dataset.get("feedback", [])]
        grades = [dict(item) for item in dataset.get("grades", [])]
        attendance = [dict(item) for item in dataset.get("attendance", [])]

        if role == "department_admin" and department_name:
            teachers = [item for item in teachers if (item.get("department") or "").strip().lower() == department_name]
            teacher_ids = {item["teacher_id"] for item in teachers}
            courses = [
                item for item in courses
                if (item.get("department") or "").strip().lower() == department_name
                or item.get("teacher_id") in teacher_ids
            ]
        elif role == "teacher":
            teachers = [
                item for item in teachers
                if item.get("teacher_id") == teacher_id
                or (item.get("teacher_name") or "").strip().lower() == teacher_name
            ]
            teacher_ids = {item["teacher_id"] for item in teachers}
            courses = [item for item in courses if item.get("teacher_id") in teacher_ids]

        course_ids = {item["course_id"] for item in courses}
        teacher_ids = {item["teacher_id"] for item in teachers}
        feedback = [item for item in feedback if item.get("course_id") in course_ids or item.get("teacher_id") in teacher_ids]
        grades = [item for item in grades if item.get("course_id") in course_ids or item.get("teacher_id") in teacher_ids]
        attendance = [item for item in attendance if item.get("course_id") in course_ids or item.get("teacher_id") in teacher_ids]
        student_ids = {item.get("student_id") for item in feedback + grades + attendance if item.get("student_id")}
        students = [item for item in students if item.get("student_id") in student_ids]

        return {"courses": courses, "teachers": teachers, "students": students, "feedback": feedback, "grades": grades, "attendance": attendance}

    def analyze(self, dataset_meta: dict[str, Any], dataset: dict[str, list[dict[str, Any]]], audience_role: str, scope: dict[str, Any]) -> dict[str, Any]:
        scoped = self.apply_scope(dataset, audience_role, scope)
        course_summaries = self._build_course_summaries(scoped)
        teacher_summaries = self._build_teacher_summaries(scoped, course_summaries)
        feedback_comments = [item.get("comment", "") for item in scoped["feedback"] if item.get("comment")]
        avg_rating = _avg(item.get("rating") for item in scoped["feedback"])
        avg_grade = _avg(item.get("score") for item in scoped["grades"])
        avg_attendance = _avg(item.get("attendance_rate") for item in scoped["attendance"])
        pass_rate = self._pass_rate(scoped["grades"])
        keyword_counts = _keyword_counts(feedback_comments)
        insights = self._build_insights(course_summaries, teacher_summaries, avg_rating, avg_grade, avg_attendance, pass_rate, keyword_counts)
        graph = self._build_graph(dataset_meta, scoped, course_summaries, teacher_summaries)

        summary = {
            "headline_metrics": [
                {"label": "Courses", "value": len(scoped["courses"])},
                {"label": "Teachers", "value": len(scoped["teachers"])},
                {"label": "Students", "value": len(scoped["students"])},
                {"label": "Feedback Items", "value": len(scoped["feedback"])},
            ],
            "quality_overview": {
                "avg_feedback_rating": avg_rating,
                "avg_grade": avg_grade,
                "avg_attendance_rate": avg_attendance,
                "pass_rate": pass_rate,
            },
            "scope_notes": self._scope_notes(dataset_meta, audience_role, scope, scoped),
        }
        metrics = {
            "counts": {key: len(scoped[key]) for key in ("courses", "teachers", "students", "feedback", "grades", "attendance")},
            "courses": course_summaries,
            "teachers": teacher_summaries,
            "feedback": {"top_keywords": keyword_counts, "sample_comments": feedback_comments[:5]},
            "distribution": {"quality_bands": self._quality_bands(course_summaries)},
        }
        return {
            "summary": summary,
            "metrics": metrics,
            "insights": insights,
            "graph": graph,
            "graph_summary": {
                "node_count": len(graph["nodes"]),
                "edge_count": len(graph["edges"]),
                "node_types": dict(Counter(node["type"] for node in graph["nodes"])),
            },
        }

    def _build_course_summaries(self, scoped: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
        feedback_by_course: dict[str, list[dict[str, Any]]] = defaultdict(list)
        grades_by_course: dict[str, list[dict[str, Any]]] = defaultdict(list)
        attendance_by_course: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in scoped["feedback"]:
            feedback_by_course[item.get("course_id", "")].append(item)
        for item in scoped["grades"]:
            grades_by_course[item.get("course_id", "")].append(item)
        for item in scoped["attendance"]:
            attendance_by_course[item.get("course_id", "")].append(item)

        results = []
        for course in scoped["courses"]:
            course_id = course.get("course_id", "")
            feedback = feedback_by_course.get(course_id, [])
            grades = grades_by_course.get(course_id, [])
            attendance = attendance_by_course.get(course_id, [])
            avg_rating = _avg(item.get("rating") for item in feedback)
            avg_score = _avg(item.get("score") for item in grades)
            avg_attendance = _avg(item.get("attendance_rate") for item in attendance)
            results.append({
                "course_id": course_id,
                "course_name": course.get("course_name", ""),
                "teacher_id": course.get("teacher_id", ""),
                "teacher_name": course.get("teacher_name", ""),
                "department": course.get("department", ""),
                "semester": course.get("semester", ""),
                "feedback_count": len(feedback),
                "grade_count": len(grades),
                "attendance_count": len(attendance),
                "avg_feedback_rating": avg_rating,
                "avg_grade": avg_score,
                "avg_attendance_rate": avg_attendance,
                "health": self._course_health(avg_rating, avg_score, avg_attendance),
            })
        results.sort(key=lambda item: ({"warning": 0, "watch": 1, "positive": 2}.get(item["health"], 3), item["course_name"]))
        return results

    def _build_teacher_summaries(self, scoped: dict[str, list[dict[str, Any]]], course_summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        courses_by_teacher: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for course in course_summaries:
            courses_by_teacher[course.get("teacher_id", "")].append(course)

        results = []
        for teacher in scoped["teachers"]:
            teacher_courses = courses_by_teacher.get(teacher.get("teacher_id", ""), [])
            results.append({
                "teacher_id": teacher.get("teacher_id", ""),
                "teacher_name": teacher.get("teacher_name", ""),
                "department": teacher.get("department", ""),
                "title": teacher.get("title", ""),
                "course_count": len(teacher_courses),
                "avg_feedback_rating": _avg(item.get("avg_feedback_rating") for item in teacher_courses),
                "avg_grade": _avg(item.get("avg_grade") for item in teacher_courses),
                "avg_attendance_rate": _avg(item.get("avg_attendance_rate") for item in teacher_courses),
                "watch_courses": [item["course_name"] for item in teacher_courses if item.get("health") == "warning"][:3],
            })
        results.sort(key=lambda item: item["teacher_name"])
        return results

    def _pass_rate(self, grade_records: list[dict[str, Any]]) -> float | None:
        if not grade_records:
            return None
        passed = [item for item in grade_records if item.get("passed") is True]
        return round(len(passed) / len(grade_records) * 100, 2)

    def _course_health(self, avg_rating: float | None, avg_grade: float | None, avg_attendance: float | None) -> str:
        warning_signals = 0
        positive_signals = 0
        for value, warning, positive in [(avg_rating, 3.6, 4.4), (avg_grade, 70, 85), (avg_attendance, 80, 92)]:
            if value is None:
                continue
            if value < warning:
                warning_signals += 1
            elif value >= positive:
                positive_signals += 1
        if warning_signals >= 2:
            return "warning"
        if positive_signals >= 2:
            return "positive"
        return "watch"

    def _quality_bands(self, course_summaries: list[dict[str, Any]]) -> dict[str, int]:
        counter = Counter(item["health"] for item in course_summaries)
        return {"positive": counter.get("positive", 0), "watch": counter.get("watch", 0), "warning": counter.get("warning", 0)}

    def _scope_notes(self, dataset_meta: dict[str, Any], audience_role: str, scope: dict[str, Any], scoped: dict[str, list[dict[str, Any]]]) -> list[str]:
        notes = [
            f"School: {dataset_meta.get('school_name') or 'Unspecified'}",
            f"Department: {dataset_meta.get('department_name') or 'Cross-department dataset'}",
            f"Audience role: {audience_role}",
        ]
        if scope.get("department_name"):
            notes.append(f"Scoped department view: {scope['department_name']}")
        if scope.get("teacher_id") or scope.get("teacher_name"):
            notes.append(f"Scoped teacher view: {scope.get('teacher_name') or scope.get('teacher_id')}")
        if not scoped["feedback"]:
            notes.append("Feedback coverage is empty in the current scope.")
        return notes

    def _build_insights(self, course_summaries, teacher_summaries, avg_rating, avg_grade, avg_attendance, pass_rate, keyword_counts):
        insights: list[dict[str, Any]] = []
        warning_courses = [item for item in course_summaries if item["health"] == "warning"]
        positive_courses = [item for item in course_summaries if item["health"] == "positive"]
        if avg_rating is not None:
            insights.append({"severity": "warning" if avg_rating < 3.8 else "positive" if avg_rating >= 4.4 else "info", "title": "Student satisfaction signal", "detail": f"Average feedback rating is {avg_rating:.2f}/5 across the current scope."})
        if avg_grade is not None:
            insights.append({"severity": "warning" if avg_grade < 72 else "positive" if avg_grade >= 85 else "info", "title": "Achievement trend", "detail": f"Average grade is {avg_grade:.2f}."})
        if avg_attendance is not None:
            insights.append({"severity": "warning" if avg_attendance < 80 else "positive" if avg_attendance >= 92 else "info", "title": "Attendance signal", "detail": f"Average attendance rate is {avg_attendance:.2f}%."})
        if pass_rate is not None:
            insights.append({"severity": "warning" if pass_rate < 85 else "positive" if pass_rate >= 95 else "info", "title": "Pass-rate signal", "detail": f"Pass rate is {pass_rate:.2f}%."})
        if warning_courses:
            insights.append({"severity": "warning", "title": "Priority intervention courses", "detail": f"Courses needing immediate attention: {', '.join(item['course_name'] for item in warning_courses[:3])}."})
        if positive_courses:
            insights.append({"severity": "positive", "title": "Strong delivery examples", "detail": f"Top performing courses: {', '.join(item['course_name'] for item in positive_courses[:3])}."})
        watch_teachers = [item for item in teacher_summaries if item["watch_courses"]]
        if watch_teachers:
            insights.append({"severity": "info", "title": "Faculty support candidates", "detail": f"Teachers with courses on the watchlist: {', '.join(item['teacher_name'] for item in watch_teachers[:3])}."})
        if keyword_counts:
            insights.append({"severity": "info", "title": "Recurring feedback topics", "detail": f"Students most frequently mention: {', '.join(item['keyword'] for item in keyword_counts[:5])}."})
        return insights[:8]

    def _build_graph(self, dataset_meta, scoped, course_summaries, teacher_summaries):
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        node_ids = set()

        def add_node(node_id: str, label: str, node_type: str, subtitle: str = "") -> None:
            if not node_id or node_id in node_ids:
                return
            node_ids.add(node_id)
            nodes.append({"id": node_id, "label": label, "type": node_type, "subtitle": subtitle})

        def add_edge(source: str, target: str, relationship: str) -> None:
            if source and target:
                edges.append({"id": f"edge_{len(edges) + 1}", "source": source, "target": target, "relationship": relationship})

        school_id = f"school:{dataset_meta.get('school_name') or 'default'}"
        add_node(school_id, dataset_meta.get("school_name") or "Campus", "School", "EduFish scope root")
        department_name = dataset_meta.get("department_name") or "All Departments"
        department_id = f"department:{department_name}"
        add_node(department_id, department_name, "Department", "Teaching governance scope")
        add_edge(school_id, department_id, "CONTAINS")

        for teacher in teacher_summaries[:20]:
            teacher_id = f"teacher:{teacher['teacher_id']}"
            add_node(teacher_id, teacher["teacher_name"], "Teacher", teacher.get("title") or teacher.get("department") or "Faculty")
            add_edge(department_id, teacher_id, "SUPERVISES")
        for course in course_summaries[:20]:
            course_id = f"course:{course['course_id']}"
            add_node(course_id, course["course_name"], "Course", course.get("semester") or course.get("health", "").title())
            add_edge(department_id, course_id, "OFFERS")
            if course.get("teacher_id"):
                add_edge(f"teacher:{course['teacher_id']}", course_id, "TEACHES")

        activity_counter: Counter[str] = Counter()
        for record in scoped["feedback"] + scoped["grades"] + scoped["attendance"]:
            if record.get("student_id"):
                activity_counter[record["student_id"]] += 1
        students_by_id = {item["student_id"]: item for item in scoped["students"]}
        for student_id, _ in activity_counter.most_common(24):
            student = students_by_id.get(student_id)
            if not student:
                continue
            graph_student_id = f"student:{student_id}"
            add_node(graph_student_id, student.get("student_name") or student_id, "Student", student.get("class_name") or student.get("grade_level") or "Learner")
            add_edge(department_id, graph_student_id, "HAS_STUDENT")
        for record in scoped["grades"][:80]:
            if record.get("student_id") and record.get("course_id"):
                add_edge(f"student:{record['student_id']}", f"course:{record['course_id']}", "ENROLLED_IN")
        for record in scoped["feedback"][:80]:
            if record.get("student_id") and record.get("course_id"):
                add_edge(f"student:{record['student_id']}", f"course:{record['course_id']}", "FEEDBACK_FOR")
        return {"nodes": nodes, "edges": edges}
