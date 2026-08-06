"""EduFish education-quality report builder."""

from __future__ import annotations

from typing import Any


class EduReportService:
    def build_report(
        self,
        dataset_meta: dict[str, Any],
        analysis_meta: dict[str, Any],
        analysis_result: dict[str, Any],
        template: dict[str, Any],
    ) -> dict[str, Any]:
        title = f"{template['name']} - {dataset_meta.get('name', 'EduFish Dataset')}"
        sections = [
            {
                "title": section["title"],
                "focus": section.get("focus", "executive_summary"),
                "content": self._render_section(section, analysis_result),
            }
            for section in template.get("sections", [])
        ]
        return {
            "title": title,
            "sections": sections,
            "markdown_content": self._assemble_markdown(title, dataset_meta, analysis_meta, sections),
        }

    def _render_section(self, section: dict[str, Any], analysis_result: dict[str, Any]) -> str:
        focus = section.get("focus", "executive_summary")
        summary = analysis_result["summary"]
        metrics = analysis_result["metrics"]
        insights = analysis_result["insights"]
        content_parts: list[str] = []

        if focus == "executive_summary":
            quality = summary["quality_overview"]
            content_parts.extend([
                "EduFish completed a scoped teaching-quality review using integrated academic data and structured evidence.",
                "",
                "**Scope at a glance**",
                "",
            ])
            for item in summary["headline_metrics"]:
                content_parts.append(f"- {item['label']}: {item['value']}")
            content_parts.extend([
                "",
                "**Quality signals**",
                "",
                f"- Average feedback rating: {self._fmt(quality.get('avg_feedback_rating'), '/5')}",
                f"- Average grade: {self._fmt(quality.get('avg_grade'))}",
                f"- Average attendance rate: {self._fmt(quality.get('avg_attendance_rate'), '%')}",
                f"- Pass rate: {self._fmt(quality.get('pass_rate'), '%')}",
            ])
        elif focus == "course_quality":
            watchlist = [item for item in metrics["courses"] if item["health"] == "warning"][:5]
            positive = [item for item in metrics["courses"] if item["health"] == "positive"][:5]
            content_parts.extend(["Course-level signals combine student voice, learning outcomes, and attendance quality.", "", "**Priority watchlist**", ""])
            if watchlist:
                for item in watchlist:
                    content_parts.append(
                        f"- {item['course_name']}: rating {self._fmt(item.get('avg_feedback_rating'))}, "
                        f"grade {self._fmt(item.get('avg_grade'))}, attendance {self._fmt(item.get('avg_attendance_rate'), '%')}"
                    )
            else:
                content_parts.append("- No course is currently in the highest-risk band.")
            content_parts.extend(["", "**Strong delivery examples**", ""])
            if positive:
                for item in positive:
                    content_parts.append(f"- {item['course_name']} led by {item.get('teacher_name') or 'unassigned'} shows stable quality signals.")
            else:
                content_parts.append("- No course reached the strongest band in the current scope.")
        elif focus == "teacher_performance":
            content_parts.extend(["Teacher performance is summarized through course outcomes, attendance, and student feedback.", "", "**Faculty overview**", ""])
            for item in metrics["teachers"][:8]:
                content_parts.append(
                    f"- {item['teacher_name']}: {item['course_count']} courses, "
                    f"rating {self._fmt(item.get('avg_feedback_rating'))}, grade {self._fmt(item.get('avg_grade'))}, "
                    f"attendance {self._fmt(item.get('avg_attendance_rate'), '%')}"
                )
            flagged = [item for item in metrics["teachers"] if item["watch_courses"]][:5]
            if flagged:
                content_parts.extend(["", "**Support candidates**", ""])
                for item in flagged:
                    content_parts.append(f"- {item['teacher_name']} should review: {', '.join(item['watch_courses'])}.")
        elif focus == "student_feedback":
            content_parts.extend(["Student feedback was clustered into recurring topics and representative concerns.", "", "**Recurring themes**", ""])
            top_keywords = metrics["feedback"]["top_keywords"]
            if top_keywords:
                for item in top_keywords:
                    content_parts.append(f"- {item['keyword']}: {item['count']} mentions")
            else:
                content_parts.append("- Feedback comments are not available in the current scope.")
            comments = metrics["feedback"]["sample_comments"][:3]
            if comments:
                content_parts.extend(["", "**Representative comments**", ""])
                for comment in comments:
                    content_parts.append(f"> {comment}")
        elif focus == "risk_governance":
            warnings = [item for item in insights if item["severity"] == "warning"]
            bands = metrics["distribution"]["quality_bands"]
            content_parts.extend(["Governance risk focuses on cross-course operational exposure rather than isolated feedback items.", "", "**Risk register**", ""])
            if warnings:
                for item in warnings[:6]:
                    content_parts.append(f"- {item['title']}: {item['detail']}")
            else:
                content_parts.append("- No major governance risk was surfaced in the current scope.")
            content_parts.extend(["", "**Quality band distribution**", "", f"- Positive courses: {bands.get('positive', 0)}", f"- Watch courses: {bands.get('watch', 0)}", f"- Warning courses: {bands.get('warning', 0)}"])
        else:
            content_parts.extend(["The next-step plan converts detected signals into accountable teaching-quality actions.", "", "**Recommended actions**", ""])
            if insights:
                for item in insights[:5]:
                    content_parts.append(f"- {self._insight_to_action(item)}")
            else:
                content_parts.append("- Build a deeper data baseline before issuing course-level interventions.")

        instructions = (section.get("instructions") or "").strip()
        if instructions:
            content_parts.extend(["", f"_Template note: {instructions}_"])
        return "\n".join(content_parts).strip()

    def _assemble_markdown(self, title: str, dataset_meta: dict[str, Any], analysis_meta: dict[str, Any], sections: list[dict[str, Any]]) -> str:
        header = [
            f"# {title}",
            "",
            f"> Dataset: {dataset_meta.get('name', 'Unnamed Dataset')} | "
            f"School: {dataset_meta.get('school_name') or 'Unspecified'} | "
            f"Audience: {analysis_meta.get('audience_role', 'school_admin')}",
            "",
        ]
        body = []
        for section in sections:
            body.extend([f"## {section['title']}", "", section["content"], ""])
        return "\n".join(header + body).strip()

    def _fmt(self, value: Any, suffix: str = "") -> str:
        if value is None:
            return "N/A"
        if isinstance(value, float):
            return f"{value:.2f}{suffix}"
        return f"{value}{suffix}"

    def _insight_to_action(self, insight: dict[str, Any]) -> str:
        severity = insight.get("severity")
        if severity == "warning":
            return f"Launch a targeted intervention on '{insight['title']}' and assign an accountable owner within the next teaching cycle."
        if severity == "positive":
            return f"Capture and replicate the practice behind '{insight['title']}' across similar courses or teaching teams."
        return f"Track '{insight['title']}' in the next review cycle and validate whether the signal persists."
