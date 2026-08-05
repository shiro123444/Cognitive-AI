import json

from app.db import db
from app.jwt_utils import create_access_token
from app.models import ExperimentTemplate, ProgressEvent, User
from app.services.seed_data import seed_courses


def seed_users():
    db.session.merge(User(id="student-ada", name="Ada", email="ada@edufish.local", role="student"))
    db.session.merge(User(id="student-bob", name="Bob", email="bob@edufish.local", role="student"))
    db.session.commit()


def bearer(user_id="student-ada", role="student"):
    return {"Authorization": f"Bearer {create_access_token(user_id=user_id, role=role)}"}


def test_list_experiments_returns_seeded_templates(client):
    res = client.get("/api/v1/experiments")
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert {item["id"] for item in payload["data"]} >= {"exp-eeg-replay"}


def test_create_experiment_run_returns_completed_run(client, app):
    with app.app_context():
        seed_courses()
        seed_users()

    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "course_id": "ai-intro",
        "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
    }, headers=bearer("student-ada"))
    payload = res.get_json()

    assert res.status_code == 201
    assert payload["success"] is True
    assert payload["data"]["status"] == "completed"
    assert payload["data"]["student_id"] == "student-ada"
    assert payload["data"]["summary"]["sample_count"] == 128
    assert payload["data"]["artifacts"]
    assert payload["data"]["report"]["status"] == "ready"
    with app.app_context():
        events = ProgressEvent.query.filter_by(student_id="student-ada", event_type="ran_lab").all()
    assert len(events) == 1


def test_create_experiment_run_requires_authentication(client):
    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
    })
    payload = res.get_json()

    assert res.status_code == 401
    assert payload["success"] is False
    assert payload["error"]["code"] == "UNAUTHORIZED"


def test_create_experiment_run_ignores_spoofed_student_id_for_students(client, app):
    with app.app_context():
        seed_courses()
        seed_users()

    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "student_id": "student-bob",
        "course_id": "ai-intro",
        "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
    }, headers=bearer("student-ada"))
    payload = res.get_json()

    assert res.status_code == 201
    assert payload["success"] is True
    assert payload["data"]["student_id"] == "student-ada"
    with app.app_context():
        ada_events = ProgressEvent.query.filter_by(student_id="student-ada", event_type="ran_lab").all()
        bob_events = ProgressEvent.query.filter_by(student_id="student-bob", event_type="ran_lab").all()
    assert len(ada_events) == 1
    assert bob_events == []


def test_create_experiment_run_returns_404_for_missing_template(client):
    res = client.post("/api/v1/experiments/missing-experiment/runs", json={}, headers=bearer())
    payload = res.get_json()

    assert res.status_code == 404
    assert payload["success"] is False
    assert (
        "experiment template not found" in payload["error"]
        or "missing-experiment" in payload["error"]
    )


def test_create_experiment_run_rejects_invalid_params(client, app):
    with app.app_context():
        seed_users()

    res = client.post("/api/v1/experiments/exp-eeg-replay/runs", json={
        "params": {"duration_seconds": 99, "sample_rate": 64, "channels": 2},
    }, headers=bearer())
    payload = res.get_json()

    assert res.status_code == 400
    assert payload["success"] is False
    assert "duration_seconds" in payload["error"]


def test_list_experiments_backfills_pipeline_metadata_for_existing_templates(client, app):
    with app.app_context():
        db.session.merge(
            ExperimentTemplate(
                id="exp-eeg-replay",
                title="EEG Replay Lab",
                experiment_type="eeg_replay",
                adapter="synthetic_eeg",
                summary="Legacy seeded template without pipeline metadata.",
                status="published",
                default_params_json=json.dumps(
                    {"duration_seconds": 4, "sample_rate": 128, "channels": 4},
                    ensure_ascii=False,
                ),
                linked_concept_ids_json="[]",
                estimated_minutes=30,
            )
        )
        db.session.commit()

    res = client.get("/api/v1/experiments")
    payload = res.get_json()
    eeg = next(item for item in payload["data"] if item["id"] == "exp-eeg-replay")

    assert eeg["default_params"]["pipeline"]["nodes"][0]["id"] == "source"
    assert eeg["default_params"]["node_params"]["filter"]["high_hz"] == 40


def test_neuron_spike_lab_is_published_and_runnable(client, app):
    with app.app_context():
        seed_users()

    res = client.get("/api/v1/experiments")
    payload = res.get_json()
    neuron = next(item for item in payload["data"] if item["id"] == "exp-neuron-spike")

    assert neuron["status"] == "published"
    assert neuron["adapter"] == "neuron_simulator"
    assert neuron["default_params"]["pipeline"]["nodes"][0]["id"] == "stimulus"

    run_res = client.post("/api/v1/experiments/exp-neuron-spike/runs", json={
        "params": {"stimulus": {"stimulus_current": 8, "duration_ms": 120}},
    }, headers=bearer())
    run_payload = run_res.get_json()

    assert run_res.status_code == 201
    assert run_payload["success"] is True
    run = run_payload["data"]
    assert run["status"] == "completed"
    assert run["summary"]["total_spikes"] > 0
    artifact = run["artifacts"][0]["data"]
    assert artifact["membrane_potential"]["v_mv"]
    assert artifact["spike_times"]
    assert artifact["firing_rate"] > 0
    assert run["report"]["content"]["node_explanations"][0]["node_id"] == "stimulus"


def test_neuron_spike_lab_rejects_out_of_range_stimulus(client, app):
    with app.app_context():
        seed_users()

    res = client.post("/api/v1/experiments/exp-neuron-spike/runs", json={
        "params": {"stimulus": {"stimulus_current": 99, "duration_ms": 120}},
    }, headers=bearer())
    payload = res.get_json()

    assert res.status_code == 400
    assert payload["success"] is False
    assert "stimulus_current" in payload["error"]
