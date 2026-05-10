from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol


class ExperimentAdapter(Protocol):
    def validate_params(self, params: dict) -> dict:
        ...

    def run(self, params: dict) -> dict:
        ...

    def summarize_artifacts(self, result: dict) -> dict:
        ...


@dataclass
class SyntheticEegAdapter:
    """Deterministic EEG-like signal generator for hardware-free MVP runs."""

    def validate_params(self, params: dict) -> dict:
        duration_seconds = int(params.get("duration_seconds", 4))
        sample_rate = int(params.get("sample_rate", 128))
        channels = int(params.get("channels", 4))
        if duration_seconds < 1 or duration_seconds > 30:
            raise ValueError("duration_seconds must be between 1 and 30.")
        if sample_rate not in {64, 128, 256}:
            raise ValueError("sample_rate must be one of 64, 128, 256.")
        if channels < 1 or channels > 8:
            raise ValueError("channels must be between 1 and 8.")
        return {
            "duration_seconds": duration_seconds,
            "sample_rate": sample_rate,
            "channels": channels,
        }

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        sample_count = validated["duration_seconds"] * validated["sample_rate"]
        sample_rate = validated["sample_rate"]
        channels = validated["channels"]
        preview = []
        channel_power = []
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
            channel_power.append({
                "channel": f"CH{channel_index + 1}",
                "alpha": round(alpha_amp * alpha_amp / 2, 3),
                "beta": round(beta_amp * beta_amp / 2, 3),
            })
        return {
            "params": validated,
            "sample_count": sample_count,
            "signal_preview": preview,
            "channel_power": channel_power,
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
