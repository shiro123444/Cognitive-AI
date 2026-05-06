def sample_education_payload():
    return {
        "dataset_meta": {
            "name": "2026 Spring Teaching Quality",
            "school_name": "示范大学",
            "department_name": "智能科学学院",
        },
        "dataset": {
            "courses": [
                {"课程编号": "AI101", "课程名称": "人工智能导论", "授课教师": "李老师", "院系": "智能科学学院", "学期": "2026春"},
                {"课程编号": "BC201", "课程名称": "脑与认知科学导论", "授课教师": "王老师", "院系": "智能科学学院", "学期": "2026春"},
            ],
            "teachers": [
                {"工号": "T001", "教师姓名": "李老师", "院系": "智能科学学院", "职称": "教授"},
                {"工号": "T002", "教师姓名": "王老师", "院系": "智能科学学院", "职称": "副教授"},
            ],
            "students": [
                {"学号": "S001", "学生姓名": "小周", "班级": "AI一班"},
                {"学号": "S002", "学生姓名": "小林", "班级": "AI一班"},
            ],
            "feedback": [
                {"课程编号": "AI101", "学号": "S001", "评分": "4.7", "反馈": "案例清晰，课堂互动充分"},
                {"课程编号": "BC201", "学号": "S002", "评分": "3.2", "反馈": "实验讲解偏快，希望增加复盘"},
            ],
            "grades": [
                {"课程编号": "AI101", "学号": "S001", "成绩": "91"},
                {"课程编号": "BC201", "学号": "S002", "成绩": "64"},
            ],
            "attendance": [
                {"课程编号": "AI101", "学号": "S001", "出勤率": "96"},
                {"课程编号": "BC201", "学号": "S002", "出勤率": "78"},
            ],
        },
    }


def test_edufish_templates_endpoint(client):
    response = client.get("/api/edu/templates")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    template_ids = {item["id"] for item in payload["data"]["templates"]}
    assert "course-quality" in template_ids
    assert "teacher-evaluation" in template_ids


def test_edufish_normalize_endpoint_reconciles_chinese_headers(client):
    response = client.post("/api/edu/datasets/normalize", json=sample_education_payload())

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["record_counts"]["courses"] == 2
    assert data["record_counts"]["feedback"] == 2
    assert data["normalized_data"]["courses"][0]["course_id"] == "AI101"
    assert data["normalized_data"]["feedback"][0]["student_id"] == "S001"


def test_edufish_analysis_preview_builds_report_and_graph(client):
    response = client.post("/api/edu/analysis/preview", json={
        **sample_education_payload(),
        "template_id": "course-quality",
        "audience_role": "school_admin",
    })

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["analysis"]["status"] == "completed"
    assert data["analysis"]["summary"]["quality_overview"]["avg_feedback_rating"] == 3.95
    assert data["report"]["title"].startswith("Course Quality Review")
    assert "Student Feedback Themes" in data["report"]["markdown_content"]
    assert data["graph_summary"]["node_count"] > 0
