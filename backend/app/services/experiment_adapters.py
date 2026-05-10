from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

FREQUENCY_BINS = [4, 8, 12, 20, 30, 40]


class ExperimentAdapter(Protocol):
    def validate_params(self, params: dict) -> dict:
        ...

    def run(self, params: dict) -> dict:
        ...

    def summarize_artifacts(self, result: dict) -> dict:
        ...


def _normalize_pipeline_params(params: dict) -> dict:
    source = params.get("source") if isinstance(params.get("source"), dict) else params
    filter_params = params.get("filter") if isinstance(params.get("filter"), dict) else {}

    duration_seconds = int(source.get("duration_seconds", 4))
    sample_rate = int(source.get("sample_rate", 128))
    channels = int(source.get("channels", 4))
    low_hz = float(filter_params.get("low_hz", 1))
    high_hz = float(filter_params.get("high_hz", 40))

    if duration_seconds < 1 or duration_seconds > 30:
        raise ValueError("source.duration_seconds must be between 1 and 30.")
    if sample_rate not in {64, 128, 256}:
        raise ValueError("source.sample_rate must be one of 64, 128, 256.")
    if channels < 1 or channels > 8:
        raise ValueError("source.channels must be between 1 and 8.")
    if low_hz < 0 or low_hz >= high_hz:
        raise ValueError("filter.low_hz must be less than filter.high_hz.")

    return {
        "source": {
            "duration_seconds": duration_seconds,
            "sample_rate": sample_rate,
            "channels": channels,
        },
        "filter": {
            "low_hz": low_hz,
            "high_hz": high_hz,
        },
    }


@dataclass
class SyntheticEegAdapter:
    """Deterministic EEG-like signal generator for hardware-free MVP runs."""

    def validate_params(self, params: dict) -> dict:
        return _normalize_pipeline_params(params)

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        source = validated["source"]
        sample_count = source["duration_seconds"] * source["sample_rate"]
        sample_rate = source["sample_rate"]
        channels = source["channels"]
        preview = []
        channel_power = []
        psd = []
        for channel_index in range(channels):
            alpha_amp = 12 - channel_index
            beta_amp = 4 + channel_index
            values = []
            for index in range(sample_count):
                t = index / sample_rate
                alpha = alpha_amp * math.sin(2 * math.pi * 10 * t)
                beta = beta_amp * math.sin(2 * math.pi * 20 * t)
                drift = 0.8 * math.sin(2 * math.pi * 1.5 * t)
                values.append(round(alpha + beta + drift, 4))
            preview.append(values[:96])
            alpha_power = round(alpha_amp * alpha_amp / 2, 3)
            beta_power = round(beta_amp * beta_amp / 2, 3)
            channel_power.append({
                "channel": f"CH{channel_index + 1}",
                "alpha": alpha_power,
                "beta": beta_power,
            })
            psd.append({
                "channel": f"CH{channel_index + 1}",
                "frequencies": FREQUENCY_BINS,
                "values": [
                    round(alpha_power * 0.18, 3),
                    round(alpha_power * 0.62, 3),
                    round(alpha_power, 3),
                    round(beta_power, 3),
                    round(beta_power * 0.48, 3),
                    round(beta_power * 0.22, 3),
                ],
            })
        return {
            "params": validated,
            "sample_count": sample_count,
            "signal_preview": preview,
            "channel_power": channel_power,
            "psd": psd,
            "events": [
                {"label": "Baseline", "start_ms": 0, "end_ms": 500},
                {"label": "Stimulus", "start_ms": 500, "end_ms": 1500},
                {"label": "Analysis", "start_ms": 1500, "end_ms": source["duration_seconds"] * 1000},
            ],
            "pipeline_trace": [
                {"node_id": "source", "status": "completed"},
                {"node_id": "filter", "status": "completed"},
                {"node_id": "psd", "status": "completed"},
                {"node_id": "band-power", "status": "completed"},
                {"node_id": "ai-report", "status": "completed"},
            ],
        }

    def summarize_artifacts(self, result: dict) -> dict:
        alpha_total = sum(item["alpha"] for item in result["channel_power"])
        beta_total = sum(item["beta"] for item in result["channel_power"])
        dominant_band = "alpha" if alpha_total >= beta_total else "beta"
        return {
            "sample_count": result["sample_count"],
            "channels": len(result["channel_power"]),
            "dominant_band": dominant_band,
            "alpha_power": round(alpha_total, 3),
            "beta_power": round(beta_total, 3),
        }


ADAPTERS = {
    "synthetic_eeg": SyntheticEegAdapter(),
}


def get_adapter(adapter_name: str) -> ExperimentAdapter:
    adapter = ADAPTERS.get(adapter_name)
    if adapter is None:
        raise ValueError(f"unsupported experiment adapter: {adapter_name}")
    return adapter
