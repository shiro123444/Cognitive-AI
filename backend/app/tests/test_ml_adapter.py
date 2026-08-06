import pytest

from app.services.experiment_adapters import NeuralNetTrainerAdapter, get_adapter


@pytest.fixture()
def adapter():
    return NeuralNetTrainerAdapter()


def test_adapter_registered():
    assert isinstance(get_adapter("ml_train"), NeuralNetTrainerAdapter)


def test_validate_params_normalizes_and_defaults(adapter):
    flat = adapter.validate_params({"learning_rate": 0.1, "epochs": 30})
    nested = adapter.validate_params({"model": {"learning_rate": 0.1, "epochs": 30}})
    expected = {
        "dataset": {"dataset": "blobs"},
        "model": {"model": "perceptron", "learning_rate": 0.1, "epochs": 30},
    }
    assert flat == expected
    assert nested == expected


def test_validate_params_rejects_bad_choices(adapter):
    with pytest.raises(ValueError, match="dataset"):
        adapter.validate_params({"dataset": "mnist"})
    with pytest.raises(ValueError, match="model"):
        adapter.validate_params({"model": "svm"})
    with pytest.raises(ValueError, match="learning_rate"):
        adapter.validate_params({"learning_rate": 2.0})
    with pytest.raises(ValueError, match="epochs"):
        adapter.validate_params({"epochs": 999})


def test_perceptron_converges_on_blobs(adapter):
    result = adapter.run({"dataset": "blobs", "model": "perceptron", "epochs": 60})
    assert result["converged"] is True
    assert result["final_accuracy"] == 1.0
    assert result["loss_curve"][0]["epoch"] == 1
    assert len(result["loss_curve"]) == 60
    assert len(result["boundary_points"]) == 48
    assert len(result["weights"]) == 3
    assert len(result["data_points"]["y"]) == 120


def test_perceptron_cannot_separate_spiral(adapter):
    result = adapter.run({"dataset": "spiral", "model": "perceptron", "epochs": 60})
    assert result["converged"] is False
    assert result["final_accuracy"] < 1.0


def test_logistic_regression_converges_on_blobs(adapter):
    result = adapter.run({"dataset": "blobs", "model": "logistic", "epochs": 120})
    assert result["converged"] is True
    assert result["final_loss"] < result["loss_curve"][0]["loss"]


def test_run_is_deterministic(adapter):
    first = adapter.run({"dataset": "blobs", "learning_rate": 0.05, "epochs": 20})
    second = adapter.run({"dataset": "blobs", "learning_rate": 0.05, "epochs": 20})
    assert first["loss_curve"] == second["loss_curve"]
    assert first["weights"] == second["weights"]
    assert first["data_points"] == second["data_points"]


def test_summarize_artifacts_fields(adapter):
    result = adapter.run({"dataset": "blobs", "epochs": 30})
    summary = adapter.summarize_artifacts(result)
    assert summary["model"] == "perceptron"
    assert summary["dataset"] == "blobs"
    assert summary["epochs"] == 30
    assert summary["converged"] is True
    assert summary["final_accuracy"] == 1.0
