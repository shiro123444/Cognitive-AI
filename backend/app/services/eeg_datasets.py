"""Built-in mini EEG fixtures for the classification lab.

The project ships with a small, deterministic synthetic EEG slice that mimics
the alpha-rhythm modulation seen in eyes-open vs eyes-closed paradigms —
strong occipital alpha when eyes are closed, attenuated alpha when eyes are
open. This lets the ``dataset_eeg`` adapter and its classification pipeline
run end-to-end without external downloads.

To swap in a real public dataset (e.g. PhysioNet eegmmidb or DEAP) replace
``load_fixture`` with a thin loader that pulls the trial into the same
``EegSample`` shape:

    EegSample(X=np.ndarray, y=np.ndarray, channel_names=list[str],
              sample_rate=int, classes=list[str], source=str)

Every loader must return ``X`` as ``(n_trials, n_channels, n_samples)`` and
``y`` as ``(n_trials,)`` integer labels. No new dataset loader needs to touch
the classifier — it only consumes ``EegSample``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class EegSample:
    X: np.ndarray               # (n_trials, n_channels, n_samples)
    y: np.ndarray               # (n_trials,) integer labels
    channel_names: list[str]
    sample_rate: int
    classes: list[str]
    source: str                 # provenance label shown in the report


def load_fixture() -> EegSample:
    """Return a deterministic 4-channel eyes-open/eyes-closed mini EEG set.

    The signal is purely synthetic but parametrizes realistic spatial alpha
    topography (occipital > parietal > frontal) and the alpha-suppression
    response to eyes-open that real EEG exhibits in this paradigm.
    """
    rng = np.random.default_rng(20260806)
    trials_per_class = 24
    sample_rate = 128
    duration_s = 2.0
    n_samples = int(duration_s * sample_rate)
    n_channels = 4

    # Channel positions roughly follow the 10-20 system; alpha gain reflects
    # the canonical occipital-dominant pattern observed in real recordings.
    channel_names = ["Fz", "Cz", "Pz", "Oz"]
    alpha_gain = np.array([0.6, 0.9, 1.4, 2.2])  # Fz < Cz < Pz < Oz

    t = np.arange(n_samples) / sample_rate

    def synthesize_trial(class_label: int, trial_idx: int) -> np.ndarray:
        # 10 Hz alpha with the spatial gain; amplitude scales with class
        # (eyes-closed amplifies alpha ~2x, eyes-open suppresses ~0.5x).
        alpha_amp = (2.0 if class_label == 1 else 0.5) * alpha_gain
        alpha = alpha_amp[:, None] * np.sin(2 * np.pi * 10.0 * t + rng.normal(0, 0.1))[None, :]

        # Pink-ish background via summed 1/f components — keeps the spectrum
        # realistic without requiring an actual EEG file.
        background = np.zeros((n_channels, n_samples))
        for ch in range(n_channels):
            for f in (2.0, 5.0, 15.0, 22.0):
                background[ch] += rng.normal(0, 0.18) * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
        # Sensor noise
        noise = rng.normal(0, 0.35, (n_channels, n_samples))

        return alpha + background + noise

    X = np.zeros((trials_per_class * 2, n_channels, n_samples))
    y = np.zeros(trials_per_class * 2, dtype=int)
    for cls in (0, 1):
        for trial_idx in range(trials_per_class):
            X[cls * trials_per_class + trial_idx] = synthesize_trial(cls, trial_idx)
            y[cls * trials_per_class + trial_idx] = cls

    return EegSample(
        X=X,
        y=y,
        channel_names=channel_names,
        sample_rate=sample_rate,
        classes=["eyes_open", "eyes_closed"],
        source="built-in fixture (synthetic alpha topography)",
    )


def available_datasets() -> list[dict]:
    """List datasets the ``EegDatasetAdapter`` can run against."""
    return [
        {
            "id": "alpha_open_vs_closed",
            "label": "Eyes-open vs Eyes-closed (alpha modulation)",
            "n_channels": 4,
            "n_trials": 48,
            "duration_s": 2.0,
            "sample_rate": 128,
            "source": load_fixture().source,
        }
    ]