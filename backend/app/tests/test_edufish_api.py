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


def test_edufish_dataset_analysis_report_closed_loop(client):
    dataset_response = client.post("/api/edu/datasets", json={
        **sample_education_payload(),
        "dataset_name": "评审演示数据集",
    })

    assert dataset_response.status_code == 201
    dataset = dataset_response.get_json()["data"]
    assert dataset["dataset_id"].startswith("edu_ds_")
    assert dataset["record_counts"]["courses"] == 2

    list_response = client.get("/api/edu/datasets")
    assert list_response.status_code == 200
    assert list_response.get_json()["data"]["count"] == 1

    run_response = client.post("/api/edu/analysis/run", json={
        "dataset_id": dataset["dataset_id"],
        "template_id": "course-quality",
        "audience_role": "school_admin",
    })
    assert run_response.status_code == 202
    run_payload = run_response.get_json()["data"]
    assert run_payload["job_id"].startswith("job-")
    assert run_payload["analysis_id"].startswith("edu_an_")
    assert run_payload["report_id"].startswith("edu_rp_")

    status_response = client.get(f"/api/edu/analysis/status/{run_payload['job_id']}")
    assert status_response.status_code == 200
    status = status_response.get_json()["data"]
    assert status["status"] == "completed"
    assert status["progress"] == 100
    assert status["result"]["analysis_id"] == run_payload["analysis_id"]

    analysis_response = client.get(f"/api/edu/analysis/{run_payload['analysis_id']}")
    assert analysis_response.status_code == 200
    analysis = analysis_response.get_json()["data"]
    assert analysis["status"] == "completed"
    assert analysis["summary"]["quality_overview"]["avg_feedback_rating"] == 3.95

    graph_response = client.get(f"/api/edu/analysis/{run_payload['analysis_id']}/graph")
    assert graph_response.status_code == 200
    graph = graph_response.get_json()["data"]
    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0

    report_response = client.get(f"/api/edu/reports/{run_payload['report_id']}")
    assert report_response.status_code == 200
    report = report_response.get_json()["data"]
    assert report["status"] == "completed"
    assert "Course Quality Signals" in report["markdown_content"]

    preview_response = client.get(f"/api/edu/reports/{run_payload['report_id']}/preview")
    assert preview_response.status_code == 200
    assert preview_response.content_type.startswith("text/html")
    assert "EDUFISH QUALITY REPORT" in preview_response.get_data(as_text=True)
    assert "Course Quality Signals" in preview_response.get_data(as_text=True)

    pdf_response = client.get(f"/api/edu/reports/{run_payload['report_id']}/pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.content_type.startswith("application/pdf")
    assert pdf_response.data.startswith(b"%PDF-")


def test_edufish_course_scope_analysis_and_prediction_closed_loop(client):
    dataset_response = client.post("/api/edu/datasets", json=sample_education_payload())
    dataset = dataset_response.get_json()["data"]

    run_response = client.post("/api/edu/analysis/run", json={
        "dataset_id": dataset["dataset_id"],
        "template_id": "course-quality",
        "audience_role": "school_admin",
        "scope": {
            "course_id": "BC201",
            "course_name": "脑与认知科学导论",
        },
    })
    assert run_response.status_code == 202
    run_payload = run_response.get_json()["data"]

    analysis_response = client.get(f"/api/edu/analysis/{run_payload['analysis_id']}")
    assert analysis_response.status_code == 200
    analysis = analysis_response.get_json()["data"]
    assert analysis["status"] == "completed"
    assert analysis["scope"]["course_id"] == "BC201"
    assert analysis["metrics"]["counts"]["courses"] == 1
    assert analysis["metrics"]["counts"]["feedback"] == 1
    assert analysis["summary"]["quality_overview"]["avg_feedback_rating"] == 3.2

    graph_response = client.get(f"/api/edu/analysis/{run_payload['analysis_id']}/graph")
    graph = graph_response.get_json()["data"]
    course_labels = {node["label"] for node in graph["nodes"] if node["type"] == "Course"}
    assert course_labels == {"脑与认知科学导论"}

    prediction_response = client.get(f"/api/edu/analysis/{run_payload['analysis_id']}/prediction")
    assert prediction_response.status_code == 200
    prediction = prediction_response.get_json()["data"]
    assert prediction["analysis_id"] == run_payload["analysis_id"]
    assert prediction["baseline_score"] < 80
    assert len(prediction["scenarios"]) >= 3
    scenario_ids = {scenario["scenario_id"] for scenario in prediction["scenarios"]}
    assert {"lab-review", "peer-review", "material-restructure"}.issubset(scenario_ids)
