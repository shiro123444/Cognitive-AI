"""Prediction scenario builder for completed EduFish analyses."""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any


def _clamp(value: float, lower: int = 0, upper: int = 100) -> int:
    return max(lower, min(upper, round(value)))


class EduPredictionService:
    """Build deterministic intervention scenarios from analysis metrics.

    The service does not pretend to be a causal simulator. It turns completed
    EduFish evidence into auditable, teacher-facing "what to try next" options.
    """

    def build(self, analysis: dict[str, Any]) -> dict[str, Any]:
        quality = (analysis.get("summary") or {}).get("quality_overview") or {}
        insights = analysis.get("insights") or []
        baseline_score = self._baseline_score(quality)

        scenarios = [
            self._scenario(
                "lab-review",
                "增加实验复盘",
                baseline_score,
                9 if (quality.get("avg_grade") or 0) < 75 else 6,
                "将实验讲解拆成演示、错误复盘、迁移练习三段，优先修复成绩与反馈中的节奏问题。",
                ["Course", "Feedback", "Student"],
                ["补充一次实验复盘课", "发布错题回看任务", "追踪低分学生作业订正"],
            ),
            self._scenario(
                "peer-review",
                "引入同伴互评",
                baseline_score,
                7 if self._has_warning(insights, "Attendance") else 5,
                "用小组互评提高课堂参与度，并让教师看到概念误解集中在哪些小组。",
                ["Student", "Course", "Teacher"],
                ["建立 3 人互评小组", "设置课堂即时反馈", "对低参与小组单独提醒"],
            ),
            self._scenario(
                "material-restructure",
                "重排课程材料",
                baseline_score,
                10 if (quality.get("avg_feedback_rating") or 5) < 3.8 else 6,
                "把抽象章节改为先案例、后概念、再练习的结构，降低材料跳跃造成的理解成本。",
                ["Course", "Feedback", "Assessment"],
                ["重排课件目录", "增加章节导学问题", "把考核点映射回课程目标"],
            ),
        ]

        return {
            "analysis_id": analysis.get("analysis_id"),
            "baseline_score": baseline_score,
            "risk_band": self._risk_band(baseline_score),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scenarios": scenarios,
        }

    def _baseline_score(self, quality: dict[str, Any]) -> int:
        values: list[float] = []
        rating = quality.get("avg_feedback_rating")
        if rating is not None:
            values.append(float(rating) / 5 * 100)
        for key in ("avg_grade", "avg_attendance_rate", "pass_rate"):
            value = quality.get(key)
            if value is not None:
                values.append(float(value))
        if not values:
            return 0
        return _clamp(mean(values))

    def _scenario(
        self,
        scenario_id: str,
        name: str,
        baseline_score: int,
        lift: int,
        rationale: str,
        target_nodes: list[str],
        actions: list[str],
    ) -> dict[str, Any]:
        score = _clamp(baseline_score + lift)
        return {
            "scenario_id": scenario_id,
            "name": name,
            "score": score,
            "delta": score - baseline_score,
            "delta_label": f"+{score - baseline_score}%",
            "rationale": rationale,
            "target_nodes": target_nodes,
            "actions": actions,
            "confidence": "medium" if baseline_score < 82 else "high",
        }

    def _risk_band(self, baseline_score: int) -> str:
        if baseline_score < 72:
            return "intervention"
        if baseline_score < 85:
            return "watch"
        return "stable"

    def _has_warning(self, insights: list[dict[str, Any]], keyword: str) -> bool:
        lowered = keyword.lower()
        return any(
            item.get("severity") == "warning" and lowered in f"{item.get('title', '')} {item.get('detail', '')}".lower()
            for item in insights
        )
