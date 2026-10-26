import math

import pytest

from app.db import db
from app.models import ExperimentArtifact, ExperimentReport, ExperimentRun
from app.services.experiment_adapters import get_adapter
from app.services.experiment_service import ExperimentService
from app.services.hodgkin_huxley import (
    DT_MS,
    E_K_MV,
    E_LEAK_MV,
    E_NA_MV,
    G_K_MSCM2,
    G_LEAK_MSCM2,
    G_NA_MSCM2,
    MAX_SAMPLES,
    PULSE_MARGIN_MS,
    RESTING_MV,
    TEMPERATURE_C,
    HodgkinHuxleyAdapter,
    alpha_h,
    alpha_m,
    alpha_n,
    beta_h,
    beta_m,
    beta_n,
    validate_params,
)


@pytest.fixture()
def adapter():
    return HodgkinHuxleyAdapter()


def test_adapter_registered_and_singleton():
    registered = get_adapter("hodgkin_huxley")
    assert isinstance(registered, HodgkinHuxleyAdapter)
    assert get_adapter("hodgkin_huxley") is registered


def test_validate_params_accepts_flat_and_normalized_forms():
    flat = validate_params(
        {
            "stimulus_current": 6,
            "duration_ms": 100,
            "g_na_scale": 0.5,
            "g_k_scale": 0.75,
        }
    )
    nested = validate_params(
        {
            "stimulus": {"stimulus_current": 6, "duration_ms": 100},
            "channels": {"g_na_scale": 0.5, "g_k_scale": 0.75},
        }
    )
    expected = {
        "stimulus": {"stimulus_current": 6.0, "duration_ms": 100},
        "channels": {"g_na_scale": 0.5, "g_k_scale": 0.75},
    }
    assert flat == expected
    assert nested == expected


def test_validate_params_defaults():
    assert validate_params({}) == {
        "stimulus": {"stimulus_current": 10.0, "duration_ms": 120},
        "channels": {"g_na_scale": 1.0, "g_k_scale": 1.0},
    }


def test_validate_params_accepts_inclusive_bounds():
    low = validate_params(
        {
            "stimulus_current": 0,
            "duration_ms": 50,
            "g_na_scale": 0,
            "g_k_scale": 0,
        }
    )
    high = validate_params(
        {
            "stimulus_current": 30,
            "duration_ms": 300,
            "g_na_scale": 1,
            "g_k_scale": 1,
        }
    )
    assert low["stimulus"] == {"stimulus_current": 0.0, "duration_ms": 50}
    assert high["stimulus"] == {"stimulus_current": 30.0, "duration_ms": 300}


@pytest.mark.parametrize(
    "params, match",
    [
        ({"stimulus_current": -0.1}, "stimulus_current"),
        ({"stimulus_current": 30.1}, "stimulus_current"),
        ({"duration_ms": 49}, "duration_ms"),
        ({"duration_ms": 301}, "duration_ms"),
        ({"g_na_scale": -0.01}, "g_na_scale"),
        ({"g_na_scale": 1.01}, "g_na_scale"),
        ({"g_k_scale": -0.01}, "g_k_scale"),
        ({"g_k_scale": 1.01}, "g_k_scale"),
        ({"duration_ms": 120.5}, "duration_ms"),
        ({"duration_ms": 120.05}, "whole number"),
    ],
)
def test_validate_params_rejects_out_of_range_and_fractional(params, match):
    with pytest.raises(ValueError, match=match):
        validate_params(params)


@pytest.mark.parametrize("value", [True, False])
def test_validate_params_rejects_bools(value):
    with pytest.raises(ValueError, match="finite number"):
        validate_params({"stimulus_current": value})
    with pytest.raises(ValueError, match="finite number"):
        validate_params({"duration_ms": value})
    with pytest.raises(ValueError, match="finite number"):
        validate_params({"g_na_scale": value})


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_validate_params_rejects_non_finite_values(value):
    with pytest.raises(ValueError, match="finite number"):
        validate_params({"stimulus_current": value})
    with pytest.raises(ValueError, match="finite number"):
        validate_params({"duration_ms": value})


@pytest.mark.parametrize(
    "params, match",
    [
        ({"stimulus": 5}, "stimulus must be an object"),
        ({"channels": []}, "channels must be an object"),
        ({"stimulus": {"stimulus_current": {"nested": 1}}}, "finite number"),
        ({"channels": {"g_k_scale": "1"}}, "finite number"),
    ],
)
def test_validate_params_rejects_invalid_nesting(params, match):
    with pytest.raises(ValueError, match=match):
        validate_params(params)


def test_alpha_rate_singularities_use_analytic_limits():
    assert alpha_m(RESTING_MV + 25.0) == pytest.approx(1.0)  # V = -40 mV
    assert alpha_n(RESTING_MV + 10.0) == pytest.approx(0.1)  # V = -55 mV

    for delta in (-1e-9, 1e-9):
        assert alpha_m(-40.0 + delta) == pytest.approx(1.0, abs=1e-6)
        assert alpha_n(-55.0 + delta) == pytest.approx(0.1, abs=1e-6)

    for v_mv in [-100.0, -70.0, -55.0, -40.0, -20.0, 0.0, 50.0]:
        for rate in (alpha_m, beta_m, alpha_h, beta_h, alpha_n, beta_n):
            value = rate(v_mv)
            assert math.isfinite(value)
            assert value >= 0.0


def test_resting_equilibrium_stays_near_minus_65_mv(adapter):
    result = adapter.run({"stimulus_current": 0, "duration_ms": 120})
    potentials = result["membrane_potential"]["v_mv"]

    assert result["total_spikes"] == 0
    assert result["spike_times"] == []
    assert result["firing_rate"] == 0.0
    assert abs(potentials[0] - RESTING_MV) < 1e-9
    assert abs(potentials[-1] - RESTING_MV) < 0.1
    assert max(potentials) < -60.0

    # The chosen leak reversal makes the net resting ionic current essentially zero.
    net_rest = (
        result["currents"]["i_na"][0]
        + result["currents"]["i_k"][0]
        + result["currents"]["i_leak"][0]
    )
    assert abs(net_rest) < 0.05
    assert result["gating"]["m"][0] == pytest.approx(0.0529, abs=0.005)
    assert result["gating"]["h"][0] == pytest.approx(0.5961, abs=0.005)
    assert result["gating"]["n"][0] == pytest.approx(0.3177, abs=0.005)


def test_evoked_response_has_real_spikes_and_physiological_shape(adapter):
    result = adapter.run({"stimulus_current": 10, "duration_ms": 120})

    assert result["model"] == "hodgkin_huxley"
    assert result["total_spikes"] > 0
    assert result["firing_rate"] > 0
    assert result["threshold_mv"] == 0
    assert result["spike_times"] == sorted(result["spike_times"])
    for spike_time in result["spike_times"]:
        assert 10.0 <= spike_time <= 120.0

    potentials = result["membrane_potential"]["v_mv"]
    # Real Na+ upstroke overshoots 0 mV; there is no artificial reset clamp.
    assert max(potentials) > 20.0
    assert min(potentials) > -95.0
    assert all(math.isfinite(value) for value in potentials)

    # Each spike is a genuine upward 0 mV crossing of the voltage trace.
    crossings = sum(
        1
        for previous, current in zip(potentials, potentials[1:])
        if previous < 0.0 <= current
    )
    assert crossings == result["total_spikes"]


def test_sodium_channel_block_abolishes_action_potentials(adapter):
    control = adapter.run({"stimulus_current": 10, "duration_ms": 120})
    fully_blocked = adapter.run(
        {"stimulus_current": 10, "duration_ms": 120, "g_na_scale": 0}
    )
    partially_blocked = adapter.run(
        {"stimulus_current": 10, "duration_ms": 120, "g_na_scale": 0.1}
    )

    assert control["total_spikes"] > 0
    for blocked in (fully_blocked, partially_blocked):
        assert blocked["total_spikes"] == 0
        assert blocked["spike_times"] == []
        assert max(blocked["membrane_potential"]["v_mv"]) < 0.0
        assert max(blocked["membrane_potential"]["v_mv"]) < max(
            control["membrane_potential"]["v_mv"]
        )


def test_stronger_stimulus_increases_firing_rate(adapter):
    weak = adapter.run({"stimulus_current": 5, "duration_ms": 120})
    strong = adapter.run({"stimulus_current": 15, "duration_ms": 120})
    assert weak["total_spikes"] > 0
    assert strong["total_spikes"] > weak["total_spikes"]
    assert strong["firing_rate"] > weak["firing_rate"]


def test_output_arrays_are_equal_length_finite_and_bounded(adapter):
    result = adapter.run({"stimulus_current": 10, "duration_ms": 300})
    times = result["membrane_potential"]["t_ms"]
    potentials = result["membrane_potential"]["v_mv"]
    sample_count = len(times)

    assert sample_count == int(round(300 / DT_MS)) + 1
    assert sample_count <= MAX_SAMPLES
    assert all(len(series) == sample_count for series in result["currents"].values())
    assert all(len(series) == sample_count for series in result["gating"].values())
    assert all(b > a for a, b in zip(times, times[1:]))
    assert all(math.isfinite(value) for value in times)
    assert all(math.isfinite(value) for series in result["currents"].values() for value in series)
    for gate in ("m", "h", "n"):
        assert all(0.0 <= value <= 1.0 for value in result["gating"][gate])

    # The stimulus is an explicit square pulse, not a continuous drive.
    pulse = result["currents"]["i_stim"]
    assert pulse[0] == 0.0
    on_index = int(round(PULSE_MARGIN_MS / DT_MS))
    off_index = int(round((300 - PULSE_MARGIN_MS) / DT_MS))
    assert pulse[on_index] == 10.0
    assert pulse[off_index - 1] == 10.0
    assert pulse[off_index] == 0.0


def test_metadata_documents_method_constants_and_units(adapter):
    result = adapter.run({})
    metadata = result["metadata"]

    assert metadata["temperature_c"] == TEMPERATURE_C == 6.3
    assert metadata["dt_ms"] == DT_MS
    assert "RK4" in metadata["method"]
    assert metadata["stimulus"] == {
        "shape": "square pulse",
        "start_ms": 10.0,
        "end_ms": 110.0,
    }
    assert metadata["units"]["current"] == "uA/cm^2"
    assert metadata["units"]["conductance"] == "mS/cm^2"
    assert metadata["constants"]["g_na_ms_cm2"] == G_NA_MSCM2 == 120.0
    assert metadata["constants"]["g_k_ms_cm2"] == G_K_MSCM2 == 36.0
    assert metadata["constants"]["g_leak_ms_cm2"] == G_LEAK_MSCM2 == 0.3
    assert metadata["constants"]["e_na_mv"] == E_NA_MV == 50.0
    assert metadata["constants"]["e_k_mv"] == E_K_MV == -77.0
    assert metadata["constants"]["e_leak_mv"] == E_LEAK_MV == pytest.approx(-54.387)
    assert result["events"][0] == {
        "label": "Stimulus Window",
        "start_ms": 10.0,
        "end_ms": 110.0,
    }
    assert [item["node_id"] for item in result["pipeline_trace"]] == [
        "stimulus",
        "integrate",
        "gating",
        "currents",
        "detect-spikes",
        "ai-report",
    ]


def test_run_is_deterministic(adapter):
    first = adapter.run({"stimulus_current": 10, "duration_ms": 120})
    second = adapter.run({"stimulus_current": 10, "duration_ms": 120})

    assert first["spike_times"] == second["spike_times"]
    assert first["membrane_potential"] == second["membrane_potential"]
    assert first["gating"] == second["gating"]
    assert first["currents"] == second["currents"]


def test_summarize_artifacts_fields(adapter):
    result = adapter.run({"stimulus_current": 10, "duration_ms": 120})
    summary = adapter.summarize_artifacts(result)
    potentials = result["membrane_potential"]["v_mv"]

    assert summary["total_spikes"] == result["total_spikes"]
    assert summary["firing_rate"] == result["firing_rate"]
    assert summary["mean_potential"] == pytest.approx(
        sum(potentials) / len(potentials), abs=1e-3
    )
    assert summary["max_potential"] == pytest.approx(max(potentials), abs=1e-3)
    assert summary["threshold_reached"] is True
    assert summary["model"] == "hodgkin_huxley"


def test_default_template_is_persisted_and_runs_through_real_artifact_flow(app):
    with app.app_context():
        templates = ExperimentService.ensure_default_templates()
        template = next(
            item for item in templates if item["id"] == "exp-hodgkin-huxley"
        )
        assert template["adapter"] == "hodgkin_huxley"
        assert template["status"] == "published"
        assert template["data_source"] == "simulation"
        assert template["default_params"]["node_params"]["stimulus"] == {
            "stimulus_current": 10,
            "duration_ms": 120,
        }
        assert [node["id"] for node in template["default_params"]["pipeline"]["nodes"]] == [
            "stimulus",
            "integrate",
            "gating",
            "currents",
            "detect-spikes",
            "ai-report",
        ]

        run = ExperimentService.create_and_execute_run(
            "exp-hodgkin-huxley",
            {
                "params": {
                    "stimulus": {"stimulus_current": 10, "duration_ms": 120},
                    "channels": {"g_na_scale": 1, "g_k_scale": 1},
                }
            },
        )

        stored_run = db.session.get(ExperimentRun, run["id"])
        stored_artifact = ExperimentArtifact.query.filter_by(run_id=run["id"]).one()
        stored_report = ExperimentReport.query.filter_by(run_id=run["id"]).one()

    assert run["status"] == "completed"
    assert run["adapter"] == "hodgkin_huxley"
    assert run["params"] == {
        "stimulus": {"stimulus_current": 10.0, "duration_ms": 120},
        "channels": {"g_na_scale": 1.0, "g_k_scale": 1.0},
    }
    assert run["summary"]["model"] == "hodgkin_huxley"
    assert run["summary"]["total_spikes"] > 0
    assert run["summary"]["threshold_reached"] is True

    artifact_data = run["artifacts"][0]["data"]
    assert stored_artifact.artifact_type == "signal_summary"
    assert artifact_data["model"] == "hodgkin_huxley"
    assert artifact_data["metadata"]["temperature_c"] == 6.3
    assert len(artifact_data["membrane_potential"]["t_ms"]) == len(
        artifact_data["membrane_potential"]["v_mv"]
    )
    assert len(artifact_data["spike_times"]) == artifact_data["total_spikes"]

    report = run["report"]["content"]
    assert stored_report.status == "ready"
    assert "Hodgkin-Huxley" in report["purpose"]
    assert "NEURON" in report["limitations"]
    assert "synthetic/sample" not in report["limitations"]
    assert {item["node_id"] for item in report["node_explanations"]} == {
        "stimulus",
        "integrate",
        "gating",
        "currents",
        "detect-spikes",
        "ai-report",
    }
    assert stored_run.status == "completed"
