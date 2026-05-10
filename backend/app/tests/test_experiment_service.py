from app.db import db
from app.models import ExperimentArtifact, ExperimentReport, ExperimentRun, ExperimentTemplate


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
