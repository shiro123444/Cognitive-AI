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


def test_explore_scores_published_templates_by_keyword(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/experiments/explore", query_string={"q": "spike neuron"})
    payload = res.get_json()

    assert res.status_code == 200
    assert payload["success"] is True
    assert payload["data"], "expected at least one scored template"
    top = payload["data"][0]
    assert top["id"] == "exp-neuron-spike"
    assert top["score"] >= 3


def test_explore_reports_matched_concept_labels(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/experiments/explore", query_string={"q": "neural networks"})
    payload = res.get_json()

    assert payload["success"] is True
    for item in payload["data"]:
        assert "Neural Networks" in item["matched_concepts"]


def test_explore_matches_chinese_query_terms(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/experiments/explore", query_string={"q": "神经元"})
    payload = res.get_json()

    assert payload["success"] is True
    assert any(item["id"] == "exp-neuron-spike" for item in payload["data"])


def test_explore_empty_or_unmatched_query_returns_empty(client, app):
    with app.app_context():
        seed_courses()

    empty = client.get("/api/v1/experiments/explore", query_string={"q": "   "})
    assert empty.get_json()["data"] == []

    unmatched = client.get("/api/v1/experiments/explore", query_string={"q": "zzz-no-such-term"})
    assert unmatched.get_json()["data"] == []


def test_list_experiments_filters_by_linked_concept(client, app):
    with app.app_context():
        seed_courses()

    res = client.get("/api/v1/experiments", query_string={"concept": "concept-neural-networks"})
    payload = res.get_json()
    ids = {item["id"] for item in payload["data"]}
    assert {"exp-eeg-replay", "exp-neuron-spike"} <= ids

    none_res = client.get("/api/v1/experiments", query_string={"concept": "concept-transformer-attention"})
    assert none_res.get_json()["data"] == []


def test_perceptron_trainer_is_published_and_runs(client, app):
    with app.app_context():
        seed_users()

    res = client.get("/api/v1/experiments")
    payload = res.get_json()
    trainer = next(item for item in payload["data"] if item["id"] == "exp-perceptron-train")

    assert trainer["status"] == "published"
    assert trainer["adapter"] == "ml_train"
    assert trainer["default_params"]["pipeline"]["nodes"][0]["id"] == "dataset"

    run_res = client.post("/api/v1/experiments/exp-perceptron-train/runs", json={
        "params": {"dataset": {"dataset": "blobs"}, "model": {"model": "perceptron", "learning_rate": 0.05, "epochs": 30}},
    }, headers=bearer())
    run_payload = run_res.get_json()

    assert run_res.status_code == 201
    assert run_payload["success"] is True
    run = run_payload["data"]
    assert run["status"] == "completed"
    assert run["summary"]["converged"] is True
    artifact = run["artifacts"][0]["data"]
    assert len(artifact["loss_curve"]) == 30
    assert artifact["data_points"]["y"]
    assert artifact["boundary_points"]
    assert run["report"]["content"]["node_explanations"][0]["node_id"] == "dataset"


def test_perceptron_trainer_rejects_invalid_dataset(client, app):
    with app.app_context():
        seed_users()

    res = client.post("/api/v1/experiments/exp-perceptron-train/runs", json={
        "params": {"dataset": {"dataset": "mnist"}},
    }, headers=bearer())
    payload = res.get_json()

    assert res.status_code == 400
    assert payload["success"] is False
    assert "dataset" in payload["error"]
