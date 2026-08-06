import pytest

from app.services.experiment_adapters import NeuronSimulatorAdapter, get_adapter

SUBTHRESHOLD_CURRENT = 2.0  # steady-state V = -70 + 5 * I stays below -55 mV
SUPRATHRESHOLD_CURRENT = 8.0


@pytest.fixture()
def adapter():
    return NeuronSimulatorAdapter()


def test_adapter_registered_and_singleton():
    adapter = get_adapter("neuron_simulator")
    assert isinstance(adapter, NeuronSimulatorAdapter)
    assert get_adapter("neuron_simulator") is adapter


def test_validate_params_normalizes_flat_and_nested(adapter):
    flat = adapter.validate_params({"stimulus_current": 6, "duration_ms": 100})
    nested = adapter.validate_params({"stimulus": {"stimulus_current": 6, "duration_ms": 100}})
    expected = {"stimulus": {"stimulus_current": 6.0, "duration_ms": 100}}
    assert flat == expected
    assert nested == expected


def test_validate_params_rejects_out_of_range(adapter):
    with pytest.raises(ValueError, match="stimulus_current"):
        adapter.validate_params({"stimulus_current": 0.1, "duration_ms": 100})
    with pytest.raises(ValueError, match="stimulus_current"):
        adapter.validate_params({"stimulus_current": 25, "duration_ms": 100})
    with pytest.raises(ValueError, match="duration_ms"):
        adapter.validate_params({"stimulus_current": 6, "duration_ms": 10})


def test_subthreshold_current_never_fires(adapter):
    result = adapter.run({"stimulus_current": SUBTHRESHOLD_CURRENT, "duration_ms": 120})
    assert result["total_spikes"] == 0
    assert result["spike_times"] == []
    assert result["firing_rate"] == 0.0
    assert result["membrane_potential"]["v_mv"][-1] < adapter.THRESHOLD_MV


def test_suprathreshold_current_fires(adapter):
    result = adapter.run({"stimulus_current": SUPRATHRESHOLD_CURRENT, "duration_ms": 120})
    assert result["total_spikes"] > 0
    assert result["spike_times"][0] > 0
    assert result["firing_rate"] > 0
    assert result["raster"][0]["t_ms"] == result["spike_times"][0]


def test_firing_rate_increases_with_current(adapter):
    low = adapter.run({"stimulus_current": 5, "duration_ms": 200})
    high = adapter.run({"stimulus_current": 12, "duration_ms": 200})
    assert high["total_spikes"] > low["total_spikes"]
    assert high["firing_rate"] > low["firing_rate"]


def test_run_is_deterministic(adapter):
    first = adapter.run({"stimulus_current": 8, "duration_ms": 120})
    second = adapter.run({"stimulus_current": 8, "duration_ms": 120})
    assert first["spike_times"] == second["spike_times"]
    assert first["membrane_potential"] == second["membrane_potential"]


def test_summarize_artifacts_fields(adapter):
    result = adapter.run({"stimulus_current": 8, "duration_ms": 120})
    summary = adapter.summarize_artifacts(result)
    assert summary["total_spikes"] == result["total_spikes"]
    assert summary["firing_rate"] == result["firing_rate"]
    assert summary["threshold_reached"] is True
    assert summary["max_potential"] >= adapter.THRESHOLD_MV - 0.1


def test_summarize_reports_no_threshold_for_quiet_run(adapter):
    result = adapter.run({"stimulus_current": SUBTHRESHOLD_CURRENT, "duration_ms": 120})
    summary = adapter.summarize_artifacts(result)
    assert summary["total_spikes"] == 0
    assert summary["threshold_reached"] is False
