"""API tests for users, assignments, submissions, progress, jobs, agents."""

import io

from app.jwt_utils import create_access_token


def _bearer(role: str, user_id: str = "user-test") -> dict:
    token = create_access_token(user_id=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


TEACHER = _bearer("teacher", user_id="user-teacher-test")
STUDENT = _bearer("student", user_id="user-student-test")


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
    res = client.post("/api/v1/users", json={"name": "X", "role": "superuser"})
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

    teacher_auth = _bearer("teacher", user_id=teacher_id)
    student_auth = _bearer("student", user_id=student_id)

    # Create assignment (draft)
    create_res = client.post(
        "/api/v1/assignments",
        headers=teacher_auth,
        json={
            "course_id": "ai-intro",
            "title": "Read chapter 1",
            "assignment_type": "reading",
            "created_by": teacher_id,
        },
    )
    assert create_res.status_code == 200
    assignment_id = create_res.get_json()["data"]["id"]

    # Cannot submit to draft
    bad_submit = client.post(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers=student_auth,
        json={"content": {"answer": "done"}},
    )
    assert bad_submit.status_code == 400

    # Publish
    pub_res = client.post(f"/api/v1/assignments/{assignment_id}/publish", headers=teacher_auth)
    assert pub_res.status_code == 200
    assert pub_res.get_json()["data"]["status"] == "published"

    # Submit (student supplies no student_id — server resolves from bearer)
    submit_res = client.post(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers=student_auth,
        json={"content": {"answer": "done"}},
    )
    assert submit_res.status_code == 200
    submission = submit_res.get_json()["data"]
    submission_id = submission["id"]
    assert submission["student_id"] == student_id

    # List submissions — teacher only
    list_res = client.get(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers=teacher_auth,
    )
    assert list_res.status_code == 200
    assert len(list_res.get_json()["data"]) == 1

    # Grade
    grade_res = client.post(
        f"/api/v1/submissions/{submission_id}/grade",
        headers=teacher_auth,
        json={"score": 90.5, "feedback": "Well done"},
    )
    assert grade_res.status_code == 200
    graded = grade_res.get_json()["data"]
    assert graded["status"] == "graded"
    assert graded["score"] == 90.5


def test_assignment_endpoints_enforce_roles(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    student_res = client.post("/api/v1/users", json={"name": "Stu", "role": "student"})
    student_id = student_res.get_json()["data"]["id"]
    teacher_res = client.post("/api/v1/users", json={"name": "Prof", "role": "teacher"})
    teacher_id = teacher_res.get_json()["data"]["id"]
    teacher_auth = _bearer("teacher", user_id=teacher_id)
    student_auth = _bearer("student", user_id=student_id)

    # Anonymous cannot list
    assert client.get("/api/v1/assignments").status_code == 401

    # Student cannot create
    create_blocked = client.post(
        "/api/v1/assignments",
        headers=student_auth,
        json={"course_id": "ai-intro", "title": "T"},
    )
    assert create_blocked.status_code == 403

    # Teacher can create
    create_ok = client.post(
        "/api/v1/assignments",
        headers=teacher_auth,
        json={"course_id": "ai-intro", "title": "T", "created_by": teacher_id},
    )
    assert create_ok.status_code == 200
    assignment_id = create_ok.get_json()["data"]["id"]

    # Publish so student can see it
    client.post(f"/api/v1/assignments/{assignment_id}/publish", headers=teacher_auth)

    # Student cannot list submissions
    assert (
        client.get(
            f"/api/v1/assignments/{assignment_id}/submissions",
            headers=student_auth,
        ).status_code
        == 403
    )

    # Student can submit to published
    submit = client.post(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers=student_auth,
        json={"content": {"answer": "42"}},
    )
    assert submit.status_code == 200
    submission_id = submit.get_json()["data"]["id"]

    # Student cannot grade
    assert (
        client.post(
            f"/api/v1/submissions/{submission_id}/grade",
            headers=student_auth,
            json={"score": 80},
        ).status_code
        == 403
    )

    # Student can read their own submissions, not someone else's
    assert (
        client.get(
            f"/api/v1/students/{student_id}/submissions",
            headers=student_auth,
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/api/v1/students/other-user/submissions",
            headers=student_auth,
        ).status_code
        == 403
    )

    # /me/submissions returns the student's own list
    my = client.get("/api/v1/me/submissions", headers=student_auth)
    assert my.status_code == 200
    assert len(my.get_json()["data"]) == 1


def test_student_sees_only_published_assignments(client, app):
    from app.services.seed_data import seed_courses
    with app.app_context():
        seed_courses()

    teacher_res = client.post("/api/v1/users", json={"name": "Prof", "role": "teacher"})
    teacher_id = teacher_res.get_json()["data"]["id"]
    teacher_auth = _bearer("teacher", user_id=teacher_id)
    student_auth = _bearer("student", user_id="user-student-x")

    draft = client.post(
        "/api/v1/assignments",
        headers=teacher_auth,
        json={"course_id": "ai-intro", "title": "Draft"},
    ).get_json()["data"]["id"]
    pub = client.post(
        "/api/v1/assignments",
        headers=teacher_auth,
        json={"course_id": "ai-intro", "title": "Pub"},
    ).get_json()["data"]["id"]
    client.post(f"/api/v1/assignments/{pub}/publish", headers=teacher_auth)

    # Teacher sees both; student sees only published
    teacher_list = client.get("/api/v1/assignments", headers=teacher_auth).get_json()["data"]
    student_list = client.get("/api/v1/assignments", headers=student_auth).get_json()["data"]

    assert {a["id"] for a in teacher_list} == {draft, pub}
    assert {a["id"] for a in student_list} == {pub}

    # Student cannot fetch a draft directly
    assert (
        client.get(f"/api/v1/assignments/{draft}", headers=student_auth).status_code == 404
    )
    assert (
        client.get(f"/api/v1/assignments/{pub}", headers=student_auth).status_code == 200
    )


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
