"""Unit tests for the EEG classification adapter and its built-in fixture."""

import numpy as np
import pytest

from app.services.eeg_datasets import available_datasets, load_fixture
from app.services.experiment_adapters import EegDatasetAdapter


def test_load_fixture_has_expected_shape_and_classes():
    sample = load_fixture()

    assert sample.X.ndim == 3
    assert sample.X.shape[1] == 4  # Fz, Cz, Pz, Oz
    assert sample.X.shape[2] == int(2.0 * sample.sample_rate)
    assert sample.y.shape == (sample.X.shape[0],)
    assert sample.classes == ["eyes_open", "eyes_closed"]
    assert set(sample.y.tolist()) == {0, 1}
    assert len(np.unique(sample.y, return_counts=True)[1]) == 2  # balanced


def test_load_fixture_occipital_alpha_dominates():
    """Eyes-closed trials should have larger alpha power over Oz than Fz."""
    sample = load_fixture()
    closed = sample.X[sample.y == 1]  # eyes-closed
    # alpha ≈ 10 Hz band power per channel: rough RMS in the alpha band
    from scipy.signal import butter, filtfilt, welch

    fs = sample.sample_rate
    b, a = butter(4, [8 / (fs / 2), 12 / (fs / 2)], btype="bandpass")
    alpha_powers = []
    for ch_idx in range(sample.X.shape[1]):
        filtered = filtfilt(b, a, closed[:, ch_idx].mean(axis=0))
        freqs, psd = welch(filtered, fs=fs, nperseg=fs)
        alpha_mask = (freqs >= 8) & (freqs <= 12)
        alpha_powers.append(psd[alpha_mask].sum())

    fz_alpha, oz_alpha = alpha_powers[0], alpha_powers[-1]
    assert oz_alpha > fz_alpha, (
        f"expected occipital alpha dominance, got Fz={fz_alpha:.3f} vs Oz={oz_alpha:.3f}"
    )


def test_available_datasets_lists_alpha_fixture():
    datasets = available_datasets()
    assert len(datasets) == 1
    assert datasets[0]["id"] == "alpha_open_vs_closed"
    assert datasets[0]["n_channels"] == 4
    assert datasets[0]["sample_rate"] == 128


def test_validate_params_defaults_to_lda_alpha_band():
    adapter = EegDatasetAdapter()
    validated = adapter.validate_params({})
    assert validated["dataset"]["dataset_id"] == "alpha_open_vs_closed"
    assert validated["filter"]["classifier"] == "lda"
    assert validated["filter"]["low_hz"] == 1.0
    assert validated["filter"]["high_hz"] == 30.0


def test_validate_params_rejects_unknown_dataset():
    adapter = EegDatasetAdapter()
    with pytest.raises(ValueError, match="dataset_id"):
        adapter.validate_params({"dataset": {"dataset_id": "deap"}})


def test_validate_params_rejects_inverted_band():
    adapter = EegDatasetAdapter()
    with pytest.raises(ValueError, match="low_hz"):
        adapter.validate_params({"filter": {"low_hz": 40, "high_hz": 5}})


def test_validate_params_rejects_unsupported_classifier():
    adapter = EegDatasetAdapter()
    with pytest.raises(ValueError, match="classifier"):
        adapter.validate_params({"filter": {"classifier": "svm"}})


def test_run_returns_required_artifacts():
    adapter = EegDatasetAdapter()
    result = adapter.run({"filter": {"classifier": "lda"}})

    assert result["classifier"] == "lda"
    assert len(result["confusion_matrix"]) == 2
    assert len(result["feature_importance"]) == 4
    assert 0.0 <= result["accuracy"] <= 1.0
    assert -1.0 <= result["kappa"] <= 1.0
    assert result["n_train"] + result["n_test"] == result["n_trials"]
    trace_ids = [item["node_id"] for item in result["pipeline_trace"]]
    assert trace_ids == ["dataset", "filter", "features", "classify", "evaluate", "ai-report"]


def test_run_is_deterministic_under_same_seed():
    adapter = EegDatasetAdapter()
    a = adapter.run({})
    b = adapter.run({})
    assert a["accuracy"] == b["accuracy"]
    assert a["kappa"] == b["kappa"]
    assert a["confusion_matrix"] == b["confusion_matrix"]


def test_summarize_artifacts_keys():
    adapter = EegDatasetAdapter()
    summary = adapter.summarize_artifacts(adapter.run({}))
    assert summary["classifier"]
    assert summary["dataset"]
    assert summary["n_classes"] == 2
    assert "accuracy" in summary and "kappa" in summary
