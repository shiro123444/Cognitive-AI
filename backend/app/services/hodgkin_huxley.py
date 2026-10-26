"""Deterministic Hodgkin-Huxley squid-axon simulation.

This module implements the classic 1952 Hodgkin-Huxley model for a single
isopotential membrane patch.  It solves the coupled membrane-potential and
gating ODEs with fixed-step RK4; there is no spike reset and no synthetic
action-potential template.  A square current pulse is applied between 10 ms
and ``duration_ms - 10 ms``.

The model is a teaching simulation of the original squid giant-axon
experiments.  It is not a NEURON simulation, not a multi-compartment neuron,
and not measured human data.
"""

from __future__ import annotations

import math
import numbers

# ── Physical constants (classic Hodgkin-Huxley, 6.3 °C) ─────────────────────
TEMPERATURE_C = 6.3
MEMBRANE_CAPACITANCE_UF_CM2 = 1.0  # C, uF/cm^2
G_NA_MSCM2 = 120.0  # maximum sodium conductance, mS/cm^2
G_K_MSCM2 = 36.0  # maximum potassium conductance, mS/cm^2
G_LEAK_MSCM2 = 0.3  # leak conductance, mS/cm^2
E_NA_MV = 50.0  # sodium reversal potential, mV
E_K_MV = -77.0  # potassium reversal potential, mV
E_LEAK_MV = -54.387  # leak reversal potential, mV
RESTING_MV = -65.0  # voltage reference used by the standard rate equations
DT_MS = 0.025  # RK4 integration step, ms
PULSE_MARGIN_MS = 10.0  # square pulse starts/ends this far from the edges
SPIKE_CROSSING_MV = 0.0  # upward crossing used only to count spikes

DEFAULT_STIMULUS_CURRENT = 10.0  # uA/cm^2
DEFAULT_DURATION_MS = 120
DEFAULT_G_NA_SCALE = 1.0
DEFAULT_G_K_SCALE = 1.0

MIN_STIMULUS_CURRENT = 0.0
MAX_STIMULUS_CURRENT = 30.0
MIN_DURATION_MS = 50
MAX_DURATION_MS = 300
MIN_CHANNEL_SCALE = 0.0
MAX_CHANNEL_SCALE = 1.0
MAX_SAMPLES = 16001


# ── Voltage-dependent rate functions ────────────────────────────────────────
# The classic -65 mV convention.  ``expm1`` keeps the removable singularities
# at V = -40 mV (alpha_m) and V = -55 mV (alpha_n) accurate and finite.
def alpha_m(v_mv: float) -> float:
    x = v_mv + 40.0
    if abs(x) < 1e-12:
        return 1.0
    return 0.1 * x / -math.expm1(-x / 10.0)


def beta_m(v_mv: float) -> float:
    return 4.0 * math.exp(-(v_mv + 65.0) / 18.0)


def alpha_h(v_mv: float) -> float:
    return 0.07 * math.exp(-(v_mv + 65.0) / 20.0)


def beta_h(v_mv: float) -> float:
    return 1.0 / (1.0 + math.exp(-(v_mv + 35.0) / 10.0))


def alpha_n(v_mv: float) -> float:
    x = v_mv + 55.0
    if abs(x) < 1e-12:
        return 0.1
    return 0.01 * x / -math.expm1(-x / 10.0)


def beta_n(v_mv: float) -> float:
    return 0.125 * math.exp(-(v_mv + 65.0) / 80.0)


def _steady_state_gates(v_mv: float) -> tuple[float, float, float]:
    a_m, b_m = alpha_m(v_mv), beta_m(v_mv)
    a_h, b_h = alpha_h(v_mv), beta_h(v_mv)
    a_n, b_n = alpha_n(v_mv), beta_n(v_mv)
    return (
        a_m / (a_m + b_m),
        a_h / (a_h + b_h),
        a_n / (a_n + b_n),
    )


def _ionic_currents(
    v_mv: float,
    m: float,
    h: float,
    n: float,
    g_na: float,
    g_k: float,
) -> tuple[float, float, float]:
    """Instantaneous ionic currents in uA/cm^2 (outward positive)."""
    i_na = g_na * m**3 * h * (v_mv - E_NA_MV)
    i_k = g_k * n**4 * (v_mv - E_K_MV)
    i_leak = G_LEAK_MSCM2 * (v_mv - E_LEAK_MV)
    return i_na, i_k, i_leak


def _derivatives(
    v_mv: float,
    m: float,
    h: float,
    n: float,
    i_stim: float,
    g_na: float,
    g_k: float,
) -> tuple[float, float, float, float]:
    i_na, i_k, i_leak = _ionic_currents(v_mv, m, h, n, g_na, g_k)
    dv = (i_stim - i_na - i_k - i_leak) / MEMBRANE_CAPACITANCE_UF_CM2
    dm = alpha_m(v_mv) * (1.0 - m) - beta_m(v_mv) * m
    dh = alpha_h(v_mv) * (1.0 - h) - beta_h(v_mv) * h
    dn = alpha_n(v_mv) * (1.0 - n) - beta_n(v_mv) * n
    return dv, dm, dh, dn


# ── Parameter validation ────────────────────────────────────────────────────
def _finite_number(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        raise ValueError(f"{name} must be a finite number.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number.")
    return number


def _pick(
    nested: dict,
    flat: dict,
    key: str,
    default,
    name: str,
):
    if key in nested:
        return _finite_number(nested[key], name)
    if key in flat:
        return _finite_number(flat[key], name)
    return float(default)


def validate_params(params: dict) -> dict:
    """Validate flat or normalized params and return the normalized shape."""
    if not isinstance(params, dict):
        raise ValueError("params must be an object.")
    if "stimulus" in params and not isinstance(params["stimulus"], dict):
        raise ValueError("stimulus must be an object when provided.")
    if "channels" in params and not isinstance(params["channels"], dict):
        raise ValueError("channels must be an object when provided.")

    stimulus = params.get("stimulus") or {}
    channels = params.get("channels") or {}

    stimulus_current = _pick(
        stimulus,
        params,
        "stimulus_current",
        DEFAULT_STIMULUS_CURRENT,
        "stimulus_current",
    )
    duration_value = _pick(
        stimulus,
        params,
        "duration_ms",
        DEFAULT_DURATION_MS,
        "duration_ms",
    )
    g_na_scale = _pick(
        channels,
        params,
        "g_na_scale",
        DEFAULT_G_NA_SCALE,
        "g_na_scale",
    )
    g_k_scale = _pick(
        channels,
        params,
        "g_k_scale",
        DEFAULT_G_K_SCALE,
        "g_k_scale",
    )

    if duration_value != int(duration_value):
        raise ValueError("duration_ms must be a whole number of milliseconds.")
    duration_ms = int(duration_value)

    if not MIN_STIMULUS_CURRENT <= stimulus_current <= MAX_STIMULUS_CURRENT:
        raise ValueError(
            "stimulus_current must be between "
            f"{MIN_STIMULUS_CURRENT:g} and {MAX_STIMULUS_CURRENT:g}."
        )
    if not MIN_DURATION_MS <= duration_ms <= MAX_DURATION_MS:
        raise ValueError(
            f"duration_ms must be between {MIN_DURATION_MS} and {MAX_DURATION_MS}."
        )
    if not MIN_CHANNEL_SCALE <= g_na_scale <= MAX_CHANNEL_SCALE:
        raise ValueError("g_na_scale must be between 0 and 1.")
    if not MIN_CHANNEL_SCALE <= g_k_scale <= MAX_CHANNEL_SCALE:
        raise ValueError("g_k_scale must be between 0 and 1.")

    if int(round(duration_ms / DT_MS)) + 1 > MAX_SAMPLES:
        raise ValueError("duration_ms produces too many samples.")

    return {
        "stimulus": {
            "stimulus_current": stimulus_current,
            "duration_ms": duration_ms,
        },
        "channels": {
            "g_na_scale": g_na_scale,
            "g_k_scale": g_k_scale,
        },
    }


# ── Simulation ──────────────────────────────────────────────────────────────
def simulate(params: dict) -> dict:
    """Run the deterministic RK4 Hodgkin-Huxley integration."""
    validated = validate_params(params)
    stimulus = validated["stimulus"]
    channels = validated["channels"]

    stimulus_current = stimulus["stimulus_current"]
    duration_ms = stimulus["duration_ms"]
    g_na = G_NA_MSCM2 * channels["g_na_scale"]
    g_k = G_K_MSCM2 * channels["g_k_scale"]

    pulse_start = PULSE_MARGIN_MS
    pulse_end = duration_ms - PULSE_MARGIN_MS

    def current_at(t_ms: float) -> float:
        if pulse_start <= t_ms < pulse_end:
            return stimulus_current
        return 0.0

    v, m, h, n = RESTING_MV, *_steady_state_gates(RESTING_MV)
    steps = int(round(duration_ms / DT_MS))

    t_ms: list[float] = []
    v_mv: list[float] = []
    i_na_values: list[float] = []
    i_k_values: list[float] = []
    i_leak_values: list[float] = []
    i_stim_values: list[float] = []
    m_values: list[float] = []
    h_values: list[float] = []
    n_values: list[float] = []
    spike_times: list[float] = []

    dt = DT_MS
    half_dt = dt / 2.0
    sixth_dt = dt / 6.0

    t = 0.0
    for step in range(steps + 1):
        i_stim = current_at(t)
        i_na, i_k, i_leak = _ionic_currents(v, m, h, n, g_na, g_k)

        t_ms.append(round(t, 4))
        v_mv.append(round(v, 4))
        i_na_values.append(round(i_na, 6))
        i_k_values.append(round(i_k, 6))
        i_leak_values.append(round(i_leak, 6))
        i_stim_values.append(round(i_stim, 6))
        m_values.append(round(m, 6))
        h_values.append(round(h, 6))
        n_values.append(round(n, 6))

        if step == steps:
            break

        # RK4: the stimulus is sampled at each stage's own time.
        k1 = _derivatives(v, m, h, n, current_at(t), g_na, g_k)
        k2 = _derivatives(
            v + half_dt * k1[0],
            m + half_dt * k1[1],
            h + half_dt * k1[2],
            n + half_dt * k1[3],
            current_at(t + half_dt),
            g_na,
            g_k,
        )
        k3 = _derivatives(
            v + half_dt * k2[0],
            m + half_dt * k2[1],
            h + half_dt * k2[2],
            n + half_dt * k2[3],
            current_at(t + half_dt),
            g_na,
            g_k,
        )
        k4 = _derivatives(
            v + dt * k3[0],
            m + dt * k3[1],
            h + dt * k3[2],
            n + dt * k3[3],
            current_at(t + dt),
            g_na,
            g_k,
        )

        previous_v = v
        v += sixth_dt * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0])
        m += sixth_dt * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1])
        h += sixth_dt * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2])
        n += sixth_dt * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3])

        # Count upward 0 mV crossings (the only "spike" definition here).
        if previous_v < SPIKE_CROSSING_MV <= v:
            fraction = (SPIKE_CROSSING_MV - previous_v) / (v - previous_v)
            spike_times.append(round(t + fraction * dt, 4))

        t = (step + 1) * dt

    events = [
        {
            "label": "Stimulus Window",
            "start_ms": pulse_start,
            "end_ms": pulse_end,
        }
    ]
    if spike_times:
        events.append(
            {
                "label": "First Spike",
                "start_ms": spike_times[0],
                "end_ms": spike_times[0],
            }
        )

    firing_rate = len(spike_times) / (duration_ms / 1000.0)

    return {
        "model": "hodgkin_huxley",
        "duration_ms": duration_ms,
        "dt_ms": dt,
        "params": validated,
        "membrane_potential": {"t_ms": t_ms, "v_mv": v_mv},
        "spike_times": spike_times,
        "total_spikes": len(spike_times),
        "firing_rate": round(firing_rate, 4),
        "threshold_mv": 0,
        "currents": {
            "i_na": i_na_values,
            "i_k": i_k_values,
            "i_leak": i_leak_values,
            "i_stim": i_stim_values,
        },
        "gating": {"m": m_values, "h": h_values, "n": n_values},
        "events": events,
        "pipeline_trace": [
            {"node_id": "stimulus", "status": "completed"},
            {"node_id": "integrate", "status": "completed"},
            {"node_id": "gating", "status": "completed"},
            {"node_id": "currents", "status": "completed"},
            {"node_id": "detect-spikes", "status": "completed"},
            {"node_id": "ai-report", "status": "completed"},
        ],
        "metadata": {
            "model": "Hodgkin-Huxley (1952) squid giant axon, single isopotential patch",
            "method": "fixed-step classical RK4 integration of coupled V/m/h/n ODEs",
            "temperature_c": TEMPERATURE_C,
            "dt_ms": dt,
            "sample_count": len(t_ms),
            "voltage_convention_mv": RESTING_MV,
            "spike_definition": "upward crossing of 0 mV",
            "stimulus": {
                "shape": "square pulse",
                "start_ms": pulse_start,
                "end_ms": pulse_end,
            },
            "units": {
                "time": "ms",
                "voltage": "mV",
                "current": "uA/cm^2",
                "conductance": "mS/cm^2",
                "capacitance": "uF/cm^2",
            },
            "constants": {
                "capacitance_uf_cm2": MEMBRANE_CAPACITANCE_UF_CM2,
                "g_na_ms_cm2": G_NA_MSCM2,
                "g_k_ms_cm2": G_K_MSCM2,
                "g_leak_ms_cm2": G_LEAK_MSCM2,
                "e_na_mv": E_NA_MV,
                "e_k_mv": E_K_MV,
                "e_leak_mv": E_LEAK_MV,
                "g_na_scaled_ms_cm2": g_na,
                "g_k_scaled_ms_cm2": g_k,
            },
            "initial_conditions": {
                "v_mv": RESTING_MV,
                "m": m_values[0],
                "h": h_values[0],
                "n": n_values[0],
            },
            "limitations": (
                "Single-compartment squid-axon teaching model at 6.3 °C; "
                "not NEURON, not a full neuron, not clinical or human data."
            ),
        },
    }


class HodgkinHuxleyAdapter:
    """Experiment adapter for the deterministic Hodgkin-Huxley model."""

    def validate_params(self, params: dict) -> dict:
        return validate_params(params)

    def run(self, params: dict) -> dict:
        return simulate(params)

    def summarize_artifacts(self, result: dict) -> dict:
        potentials = result["membrane_potential"]["v_mv"]
        sample_count = max(1, len(potentials))
        return {
            "total_spikes": result["total_spikes"],
            "firing_rate": result["firing_rate"],
            "mean_potential": round(sum(potentials) / sample_count, 3),
            "max_potential": round(max(potentials), 3),
            "threshold_reached": result["total_spikes"] > 0,
            "model": result["model"],
        }
