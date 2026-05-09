"""API tests for users, assignments, submissions, progress, jobs, agents."""

import io


def test_create_and_list_users_via_api(client):
    res = client.post("/api/v1/users", json={"name": "Alice", "role": "student"})
    assert res.status_code == 200
    student_id = res.get_json()["data"]["id"]

    res = client.post("/api/v1/users", json={"name": "Bob", "role": "teacher"})
    assert res.status_code == 200

    res = client.get("/api/v1/users?role=student")
    payload = res.get_json()
    assert payload["success"] is True
    assert any(u["id"] == student_id for u in payload["data"])


def test_create_user_rejects_invalid_role(client):
    res = client.post("/api/v1/users", json={"name": "X", "role": "admin"})
    assert res.status_code == 400


def test_assignment_full_flow_via_api(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    # Create teacher
    teacher_res = client.post("/api/v1/users", json={"name": "Prof", "role": "teacher"})
    teacher_id = teacher_res.get_json()["data"]["id"]

    # Create student
    student_res = client.post("/api/v1/users", json={"name": "Stu", "role": "student"})
    student_id = student_res.get_json()["data"]["id"]

    # Create assignment (draft)
    create_res = client.post("/api/v1/assignments", json={
        "course_id": "ai-intro",
        "title": "Read chapter 1",
        "assignment_type": "reading",
        "created_by": teacher_id,
    })
    assert create_res.status_code == 200
    assignment_id = create_res.get_json()["data"]["id"]

    # Cannot submit to draft
    bad_submit = client.post(f"/api/v1/assignments/{assignment_id}/submissions", json={
        "student_id": student_id,
        "content": {"answer": "done"},
    })
    assert bad_submit.status_code == 400

    # Publish
    pub_res = client.post(f"/api/v1/assignments/{assignment_id}/publish")
    assert pub_res.status_code == 200
    assert pub_res.get_json()["data"]["status"] == "published"

    # Submit
    submit_res = client.post(f"/api/v1/assignments/{assignment_id}/submissions", json={
        "student_id": student_id,
        "content": {"answer": "done"},
    })
    assert submit_res.status_code == 200
    submission_id = submit_res.get_json()["data"]["id"]

    # List submissions
    list_res = client.get(f"/api/v1/assignments/{assignment_id}/submissions")
    assert list_res.status_code == 200
    assert len(list_res.get_json()["data"]) == 1

    # Grade
    grade_res = client.post(f"/api/v1/submissions/{submission_id}/grade", json={
        "score": 90.5,
        "feedback": "Well done",
    })
    assert grade_res.status_code == 200
    graded = grade_res.get_json()["data"]
    assert graded["status"] == "graded"
    assert graded["score"] == 90.5


def test_progress_event_via_api(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    student_res = client.post("/api/v1/users", json={"name": "Stu", "role": "student"})
    student_id = student_res.get_json()["data"]["id"]

    record_res = client.post("/api/v1/progress/events", json={
        "student_id": student_id,
        "event_type": "viewed",
        "course_id": "ai-intro",
        "chapter_id": "ai-search",
    })
    assert record_res.status_code == 200

    summary_res = client.get(f"/api/v1/progress/students/{student_id}")
    assert summary_res.status_code == 200
    data = summary_res.get_json()["data"]
    assert data["total_events"] == 1
    assert data["event_counts"]["viewed"] == 1


def test_cohort_summary_via_api(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    s1 = client.post("/api/v1/users", json={"name": "S1", "role": "student"}).get_json()["data"]["id"]
    s2 = client.post("/api/v1/users", json={"name": "S2", "role": "student"}).get_json()["data"]["id"]

    for sid in [s1, s2]:
        client.post("/api/v1/progress/events", json={
            "student_id": sid,
            "event_type": "viewed",
            "course_id": "ai-intro",
            "chapter_id": "ai-search",
        })

    res = client.get("/api/v1/progress/courses/ai-intro")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["active_students"] == 2


def test_list_agents_endpoint(client):
    res = client.get("/api/v1/agents")
    assert res.status_code == 200
    data = res.get_json()["data"]
    names = {a["name"] for a in data}
    assert "tutor" in names
    assert "document-analyst" in names


def test_run_agent_without_api_key_returns_error(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()
    # No LLM_API_KEY in test config
    res = client.post("/api/v1/agents/tutor/run", json={"input": "test"})
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["error"] is not None
    assert "LLM_API_KEY" in data["error"]


def test_run_unknown_agent_returns_404(client):
    res = client.post("/api/v1/agents/unknown/run", json={"input": "test"})
    assert res.status_code == 404


def test_get_unknown_job_returns_404(client):
    res = client.get("/api/v1/jobs/job-unknown")
    assert res.status_code == 404


def test_async_upload_returns_job_id(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    res = client.post(
        "/api/v1/materials/upload?async=1",
        data={
            "course_id": "ai-intro",
            "file": (io.BytesIO(b"Async test content."), "async-test.txt"),
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data.get("async") is True
    assert data["job_id"].startswith("job-")
    assert data["material"]["filename"] == "async-test.txt"
