from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from scipy import signal as dsp

FREQUENCY_BINS = [4, 8, 12, 20, 30, 40]  # kept for backward-compatible references
ALPHA_BAND = (8.0, 12.0)
BETA_BAND = (18.0, 30.0)
WINDOW_SECONDS = 0.256  # band-power timeseries window length


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


def _band_power(freqs: np.ndarray, power: np.ndarray, lo: float, hi: float) -> float:
    """Integrate PSD over a frequency band via the trapezoid rule."""
    mask = (freqs >= lo) & (freqs <= hi)
    if not mask.any():
        return 0.0
    return float(np.trapezoid(power[mask], freqs[mask]))


def _fold_band_timeseries(per_channel: list[dict]) -> list[dict]:
    """Fold per-channel band-power series into [{t_ms, channels: {CHn: {alpha, beta}}}]."""
    times = sorted({pt["t_ms"] for ch in per_channel for pt in ch["series"]})
    by_channel = {ch["channel"]: {pt["t_ms"]: pt for pt in ch["series"]} for ch in per_channel}
    folded: list[dict] = []
    for t_ms in times:
        entry: dict = {"t_ms": t_ms, "channels": {}}
        for ch_name, lookup in by_channel.items():
            pt = lookup.get(t_ms)
            if pt:
                entry["channels"][ch_name] = {"alpha": pt["alpha"], "beta": pt["beta"]}
        folded.append(entry)
    return folded


@dataclass
class SyntheticEegAdapter:
    """Synthetic EEG with real DSP.

    The signal is synthetic (deterministic α/β/drift/noise) so the lab runs
    without hardware, but the pipeline nodes do real signal processing:
    - filter: Butterworth bandpass (low_hz/high_hz actually filter the signal)
    - psd: Welch's method
    - band-power: integrates the Welch spectrum over α (8–12 Hz) / β (18–30 Hz)
    - spectrogram: STFT time-frequency heatmap
    - band_power_timeseries: per-window band-power for the scrubber
    """

    def validate_params(self, params: dict) -> dict:
        return _normalize_pipeline_params(params)

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        source = validated["source"]
        flt = validated["filter"]
        sample_rate = source["sample_rate"]
        channels = source["channels"]
        sample_count = source["duration_seconds"] * sample_rate
        low_hz = flt["low_hz"]
        high_hz = flt["high_hz"]
        nyq = sample_rate / 2.0

        # Butterworth bandpass — the filter node now actually filters.
        # Clamp into (0, nyq) since butter requires 0 < Wn < 1 (e.g. high_hz may
        # exceed Nyquist for sample_rate=64).
        eff_low = max(low_hz, 0.1)
        eff_high = min(high_hz, nyq * 0.95)
        if eff_low >= eff_high:
            eff_high = min(nyq * 0.95, eff_low + 1.0)
        b, a = dsp.butter(4, [eff_low / nyq, eff_high / nyq], btype="bandpass")

        rng = np.random.default_rng(42)
        win_samples = max(32, int(WINDOW_SECONDS * sample_rate))

        preview: list[list[float]] = []
        channel_power: list[dict] = []
        psd: list[dict] = []
        spectrogram: list[dict] = []
        band_series: list[dict] = []

        for ch_idx in range(channels):
            alpha_amp = 12 - ch_idx
            beta_amp = 4 + ch_idx
            t = np.arange(sample_count) / sample_rate
            raw = (
                alpha_amp * np.sin(2 * np.pi * 10 * t)
                + beta_amp * np.sin(2 * np.pi * 20 * t)
                + 0.8 * np.sin(2 * np.pi * 1.5 * t)
                + rng.normal(0, 0.5, sample_count)
            )
            filtered = dsp.filtfilt(b, a, raw)

            preview.append([round(float(v), 4) for v in filtered[:96]])

            # Welch PSD over the whole run
            nperseg = min(win_samples * 2, sample_count)
            freqs_w, psd_w = dsp.welch(filtered, fs=sample_rate, nperseg=nperseg)
            psd.append({
                "channel": f"CH{ch_idx + 1}",
                "frequencies": [round(float(f), 2) for f in freqs_w],
                "values": [round(float(p), 5) for p in psd_w],
            })
            channel_power.append({
                "channel": f"CH{ch_idx + 1}",
                "alpha": round(_band_power(freqs_w, psd_w, *ALPHA_BAND), 4),
                "beta": round(_band_power(freqs_w, psd_w, *BETA_BAND), 4),
            })

            # STFT spectrogram (time-frequency heatmap)
            f_s, t_s, sxx = dsp.spectrogram(
                filtered, fs=sample_rate, nperseg=win_samples, noverlap=win_samples // 2
            )
            spectrogram.append({
                "channel": f"CH{ch_idx + 1}",
                "freqs": [round(float(f), 2) for f in f_s],
                "times": [round(float(ts), 3) for ts in t_s],
                "values": [[round(float(v), 5) for v in row] for row in sxx],
            })

            # Per-window band-power timeseries (drives the scrubber)
            series: list[dict] = []
            for start in range(0, max(1, sample_count - win_samples + 1), win_samples):
                seg = filtered[start:start + win_samples]
                if len(seg) < 8:
                    break
                fw, pw = dsp.welch(seg, fs=sample_rate, nperseg=len(seg))
                series.append({
                    "t_ms": round(start * 1000 / sample_rate),
                    "alpha": round(_band_power(fw, pw, *ALPHA_BAND), 4),
                    "beta": round(_band_power(fw, pw, *BETA_BAND), 4),
                })
            band_series.append({"channel": f"CH{ch_idx + 1}", "series": series})

        return {
            "params": validated,
            "sample_count": sample_count,
            "signal_preview": preview,
            "channel_power": channel_power,
            "psd": psd,
            "spectrogram": spectrogram,
            "band_power_timeseries": _fold_band_timeseries(band_series),
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
