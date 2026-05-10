from app.db import db
from app.models import ExperimentArtifact, ExperimentReport, ExperimentRun, ExperimentTemplate, ProgressEvent, User
from app.services.experiment_service import ExperimentService
from app.services.seed_data import seed_courses


def seed_users():
    db.session.merge(User(id="student-ada", name="Ada", email="ada@edufish.local", role="student"))
    db.session.commit()


def test_experiment_models_store_json_fields(app):
    with app.app_context():
        template = ExperimentTemplate(
            id="exp-eeg-replay",
            title="EEG Replay Lab",
            experiment_type="eeg_replay",
            adapter="synthetic_eeg",
            summary="Explore alpha and beta band activity.",
            status="published",
            default_params_json='{"duration_seconds": 2, "sample_rate": 128}',
            linked_concept_ids_json='["concept-neural-networks"]',
            estimated_minutes=25,
        )
        db.session.add(template)
        run = ExperimentRun(
            id="run-test",
            template_id="exp-eeg-replay",
            student_id="student-ada",
            course_id="ai-intro",
            status="completed",
            params_json='{"duration_seconds": 2}',
            adapter="synthetic_eeg",
            summary_json='{"dominant_band": "alpha"}',
        )
        db.session.add(run)
        artifact = ExperimentArtifact(
            id="artifact-test",
            run_id="run-test",
            artifact_type="signal_summary",
            title="Synthetic EEG Summary",
            data_json='{"channels": 4}',
        )
        db.session.add(artifact)
        report = ExperimentReport(
            id="report-test",
            run_id="run-test",
            status="ready",
            content_json='{"sections": [{"title": "Observation", "body": "Alpha activity is visible."}]}',
        )
        db.session.add(report)
        db.session.commit()

        stored = db.session.get(ExperimentTemplate, "exp-eeg-replay")

    assert stored.title == "EEG Replay Lab"
    assert stored.adapter == "synthetic_eeg"


def test_experiment_service_seeds_templates(app):
    with app.app_context():
        templates = ExperimentService.ensure_default_templates()

    assert {template["id"] for template in templates} >= {"exp-eeg-replay"}
    eeg = next(template for template in templates if template["id"] == "exp-eeg-replay")
    assert eeg["adapter"] == "synthetic_eeg"
    assert eeg["data_source"] == "synthetic"


def test_experiment_service_runs_synthetic_eeg_and_records_progress(app):
    with app.app_context():
        seed_courses()
        seed_users()
        ExperimentService.ensure_default_templates()

        run = ExperimentService.create_and_execute_run(
            "exp-eeg-replay",
            {
                "student_id": "student-ada",
                "course_id": "ai-intro",
                "params": {"duration_seconds": 2, "sample_rate": 64, "channels": 2},
            },
        )

        stored_events = ProgressEvent.query.filter_by(event_type="ran_lab").all()

    assert run["status"] == "completed"
    assert run["summary"]["sample_count"] == 128
    assert run["summary"]["dominant_band"] in {"alpha", "beta"}
    assert run["artifacts"][0]["artifact_type"] == "signal_summary"
    assert run["report"]["status"] == "ready"
    assert "synthetic/sample" in run["report"]["content"]["limitations"]
    assert len(stored_events) == 1
