from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from scipy import signal as dsp

from app.services.eeg_datasets import available_datasets, load_fixture
from app.services.ml_datasets import DATASETS, get_dataset

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


class NeuronSimulatorAdapter:
    """Leaky integrate-and-fire (LIF) neuron simulation.

    Solves C dV/dt = -gL (V - EL) + I with explicit Euler integration.
    When the membrane potential crosses the threshold, a spike is emitted and
    the potential resets with a fixed refractory period. The simulation is
    fully deterministic (no noise), so identical params reproduce identical
    spike trains — which makes the lab suitable for threshold-exploration
    exercises: students lower the stimulus until firing stops and read the
    firing threshold off the curve.
    """

    DT_MS = 0.1
    MEMBRANE_CAPACITANCE = 1.0  # uF/cm^2
    LEAK_CONDUCTANCE = 0.1  # mS/cm^2
    LEAK_REVERSAL_MV = -70.0
    THRESHOLD_MV = -55.0
    RESET_MV = -70.0
    REFRACTORY_MS = 2.0
    CURRENT_GAIN = 5.0  # steady-state mV per unit stimulus current

    def validate_params(self, params: dict) -> dict:
        source = params.get("stimulus") if isinstance(params.get("stimulus"), dict) else params
        stimulus_current = float(source.get("stimulus_current", 8))
        duration_ms = int(source.get("duration_ms", 120))

        if stimulus_current < 0.5 or stimulus_current > 20:
            raise ValueError("stimulus.stimulus_current must be between 0.5 and 20.")
        if duration_ms < 50 or duration_ms > 500:
            raise ValueError("stimulus.duration_ms must be between 50 and 500.")

        return {
            "stimulus": {
                "stimulus_current": stimulus_current,
                "duration_ms": duration_ms,
            }
        }

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        current = validated["stimulus"]["stimulus_current"]
        duration_ms = validated["stimulus"]["duration_ms"]

        dt = self.DT_MS
        tau = self.MEMBRANE_CAPACITANCE / self.LEAK_CONDUCTANCE  # ms
        step_count = int(round(duration_ms / dt))

        t_ms: list[float] = []
        v_mv: list[float] = []
        spike_times: list[float] = []
        v = self.RESET_MV
        ref_until_ms = -1.0

        for i in range(step_count):
            t = round(i * dt, 2)
            if t >= ref_until_ms:
                dv = (-(v - self.LEAK_REVERSAL_MV) + self.CURRENT_GAIN * current) / tau * dt
                v += dv
            else:
                v = self.RESET_MV
            t_ms.append(t)
            v_mv.append(round(v, 3))
            if v >= self.THRESHOLD_MV:
                spike_times.append(t)
                v = self.RESET_MV
                ref_until_ms = t + self.REFRACTORY_MS

        firing_rate = round(len(spike_times) / (duration_ms / 1000.0), 2)
        return {
            "params": validated,
            "duration_ms": duration_ms,
            "dt_ms": dt,
            "membrane_potential": {"t_ms": t_ms, "v_mv": v_mv},
            "spike_times": spike_times,
            "total_spikes": len(spike_times),
            "firing_rate": firing_rate,
            "threshold_mv": self.THRESHOLD_MV,
            "reset_mv": self.RESET_MV,
            "raster": [{"t_ms": t, "neuron": 0} for t in spike_times],
            "events": [
                {"label": "Stimulus On", "start_ms": 0, "end_ms": duration_ms},
            ]
            + (
                [
                    {
                        "label": "First Spike",
                        "start_ms": spike_times[0],
                        "end_ms": duration_ms,
                    }
                ]
                if spike_times
                else []
            ),
            "pipeline_trace": [
                {"node_id": "stimulus", "status": "completed"},
                {"node_id": "integrate", "status": "completed"},
                {"node_id": "detect-spikes", "status": "completed"},
                {"node_id": "firing-rate", "status": "completed"},
                {"node_id": "ai-report", "status": "completed"},
            ],
        }

    def summarize_artifacts(self, result: dict) -> dict:
        potentials = result["membrane_potential"]["v_mv"]
        return {
            "total_spikes": result["total_spikes"],
            "firing_rate": result["firing_rate"],
            "mean_potential": round(sum(potentials) / max(1, len(potentials)), 3),
            "max_potential": round(max(potentials), 3),
            "threshold_reached": result["total_spikes"] > 0,
        }


class NeuralNetTrainerAdapter:
    """Numpy linear-model training (perceptron / logistic regression).

    Runs a fully deterministic training loop on the built-in toy datasets so
    students can watch how learning rate, epochs and model choice change the
    loss curve, accuracy and decision boundary. The spiral dataset is
    deliberately not linearly separable — perceptron accuracy plateaus below
    100%, which teaches the expressive limits of linear models.
    """

    MAX_GRAD_CLIP = 30.0

    def validate_params(self, params: dict) -> dict:
        dataset_params = params.get("dataset") if isinstance(params.get("dataset"), dict) else params
        model_params = params.get("model") if isinstance(params.get("model"), dict) else params

        dataset = dataset_params.get("dataset", "blobs")
        model = model_params.get("model", "perceptron")
        learning_rate = float(model_params.get("learning_rate", 0.05))
        epochs = int(model_params.get("epochs", 50))

        if dataset not in DATASETS:
            raise ValueError(f"dataset.dataset must be one of {', '.join(sorted(DATASETS))}.")
        if model not in ("perceptron", "logistic"):
            raise ValueError("model.model must be one of perceptron, logistic.")
        if learning_rate < 0.001 or learning_rate > 1:
            raise ValueError("model.learning_rate must be between 0.001 and 1.")
        if epochs < 1 or epochs > 200:
            raise ValueError("model.epochs must be between 1 and 200.")

        return {
            "dataset": {"dataset": dataset},
            "model": {"model": model, "learning_rate": learning_rate, "epochs": epochs},
        }

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        dataset_name = validated["dataset"]["dataset"]
        model_name = validated["model"]["model"]
        learning_rate = validated["model"]["learning_rate"]
        epochs = validated["model"]["epochs"]

        X, y = get_dataset(dataset_name)
        Xf = X.astype(float)
        yf = y.astype(float)
        Xb = np.column_stack([np.ones(len(Xf)), Xf])

        rng = np.random.default_rng(7)
        weights = rng.normal(0, 0.1, 3)

        loss_curve: list[dict] = []
        accuracy_curve: list[dict] = []
        final_accuracy = 0.0
        final_loss = 0.0

        for epoch in range(1, epochs + 1):
            if model_name == "perceptron":
                predictions = (Xb @ weights >= 0).astype(float)
                errors = predictions - yf
                weights = weights - (learning_rate / len(yf)) * (errors @ Xb)
                loss = float(np.mean(errors != 0))
            else:
                z = np.clip(Xb @ weights, -self.MAX_GRAD_CLIP, self.MAX_GRAD_CLIP)
                prob = 1.0 / (1.0 + np.exp(-z))
                prob = np.clip(prob, 1e-12, 1 - 1e-12)
                loss = float(np.mean(-(yf * np.log(prob) + (1 - yf) * np.log(1 - prob))))
                gradient = (prob - yf) @ Xb / len(yf)
                weights = weights - learning_rate * gradient
                predictions = (prob >= 0.5).astype(float)

            accuracy = float(np.mean(predictions == y))
            loss_curve.append({"epoch": epoch, "loss": round(loss, 5)})
            accuracy_curve.append({"epoch": epoch, "accuracy": round(accuracy, 4)})
            final_accuracy = accuracy
            final_loss = loss

        bias, w1, w2 = (float(item) for item in weights)
        x0_lo, x0_hi = float(Xf[:, 0].min()) - 0.6, float(Xf[:, 0].max()) + 0.6
        grid = np.linspace(x0_lo, x0_hi, 48)
        boundary_points = (
            [{"x0": round(float(x), 4), "x1": round(-(bias + w1 * x) / w2, 4)} for x in grid]
            if abs(w2) > 1e-9
            else []
        )

        return {
            "params": validated,
            "dataset": dataset_name,
            "model": model_name,
            "loss_curve": loss_curve,
            "accuracy_curve": accuracy_curve,
            "final_accuracy": round(final_accuracy, 4),
            "final_loss": round(final_loss, 5),
            "weights": [round(bias, 5), round(w1, 5), round(w2, 5)],
            "data_points": {
                "x0": [round(float(v), 4) for v in Xf[:, 0]],
                "x1": [round(float(v), 4) for v in Xf[:, 1]],
                "y": [int(v) for v in y],
            },
            "boundary_points": boundary_points,
            "converged": final_accuracy == 1.0,
            "dataset_name": DATASETS[dataset_name]["name"],
            "events": [
                {"label": "Training", "start_ms": 0, "end_ms": epochs},
                {"label": "Evaluate", "start_ms": epochs, "end_ms": epochs + 1},
            ],
            "pipeline_trace": [
                {"node_id": "dataset", "status": "completed"},
                {"node_id": "model", "status": "completed"},
                {"node_id": "train", "status": "completed"},
                {"node_id": "evaluate", "status": "completed"},
                {"node_id": "ai-report", "status": "completed"},
            ],
        }

    def summarize_artifacts(self, result: dict) -> dict:
        return {
            "model": result["model"],
            "dataset": result["dataset"],
            "epochs": len(result["loss_curve"]),
            "final_accuracy": result["final_accuracy"],
            "final_loss": result["final_loss"],
            "converged": result["converged"],
        }


class EegDatasetAdapter:
    """EEG classification lab: real EEG fixtures → band-power features → classifier.

    The adapter loads a built-in mini EEG fixture (see :mod:`eeg_datasets`),
    bandpass-filters each trial with the student-tunable cutoff, extracts
    alpha/beta band-power per channel, and trains a small linear classifier.
    It emits a confusion matrix, per-channel feature importances and the
    classification accuracy — the artifacts needed to drive the
    ``exp-eeg-classify`` learning outcome.
    """

    SUPPORTED_DATASETS = {"alpha_open_vs_closed"}
    SUPPORTED_CLASSIFIERS = {"lda", "logistic"}

    def validate_params(self, params: dict) -> dict:
        source = params.get("dataset") if isinstance(params.get("dataset"), dict) else params
        filter_params = params.get("filter") if isinstance(params.get("filter"), dict) else {}

        dataset_id = source.get("dataset_id", "alpha_open_vs_closed")
        if dataset_id not in self.SUPPORTED_DATASETS:
            raise ValueError(
                f"dataset.dataset_id must be one of {', '.join(sorted(self.SUPPORTED_DATASETS))}."
            )

        classifier = filter_params.get("classifier", "lda")
        if classifier not in self.SUPPORTED_CLASSIFIERS:
            raise ValueError(
                f"filter.classifier must be one of {', '.join(sorted(self.SUPPORTED_CLASSIFIERS))}."
            )
        low_hz = float(filter_params.get("low_hz", 1.0))
        high_hz = float(filter_params.get("high_hz", 30.0))
        if low_hz < 0 or low_hz >= high_hz:
            raise ValueError("filter.low_hz must be less than filter.high_hz.")
        if high_hz > 60:
            raise ValueError("filter.high_hz must be at most 60 Hz for the built-in fixture.")

        return {
            "dataset": {"dataset_id": dataset_id},
            "filter": {
                "low_hz": low_hz,
                "high_hz": high_hz,
                "classifier": classifier,
            },
        }

    def run(self, params: dict) -> dict:
        validated = self.validate_params(params)
        sample = load_fixture()
        X = sample.X
        y = sample.y
        sample_rate = sample.sample_rate
        nyq = sample_rate / 2.0
        low_hz = validated["filter"]["low_hz"]
        high_hz = validated["filter"]["high_hz"]
        eff_low = max(low_hz, 0.1)
        eff_high = min(high_hz, nyq * 0.95)
        if eff_low >= eff_high:
            eff_high = min(nyq * 0.95, eff_low + 1.0)
        b, a = dsp.butter(4, [eff_low / nyq, eff_high / nyq], btype="bandpass")

        n_trials, n_channels, n_samples = X.shape
        # Filter each (trial, channel) trace.
        filtered = np.empty_like(X)
        for i in range(n_trials):
            for ch in range(n_channels):
                filtered[i, ch] = dsp.filtfilt(b, a, X[i, ch])

        # Feature extraction: Welch PSD per channel → alpha (8-12) / beta (18-30)
        # band-power. The classifier only sees this 2*n_channels-dimensional
        # feature vector per trial.
        nperseg = min(128, n_samples)
        features = np.zeros((n_trials, n_channels * 2))
        for i in range(n_trials):
            for ch in range(n_channels):
                freqs, psd = dsp.welch(filtered[i, ch], fs=sample_rate, nperseg=nperseg)
                features[i, ch * 2] = _band_power(freqs, psd, *ALPHA_BAND)
                features[i, ch * 2 + 1] = _band_power(freqs, psd, *BETA_BAND)

        # Deterministic train/test split (fixed seed for reproducible demos).
        rng = np.random.default_rng(7)
        perm = rng.permutation(n_trials)
        half = n_trials // 2
        train_idx = perm[:half]
        test_idx = perm[half:]

        # Standardize features using training-set statistics.
        mu = features[train_idx].mean(axis=0)
        sigma = features[train_idx].std(axis=0)
        sigma = np.where(sigma < 1e-9, 1.0, sigma)
        norm = (features - mu) / sigma

        Xb_train = np.column_stack([np.ones(len(train_idx)), norm[train_idx]])
        Xb_test = np.column_stack([np.ones(len(test_idx)), norm[test_idx]])
        y_train = y[train_idx].astype(float)
        y_test = y[test_idx].astype(int)

        classifier = validated["filter"]["classifier"]
        n_classes = len(sample.classes)
        if classifier == "lda":
            weights = _fit_lda(Xb_train, y_train, n_classes)
        else:
            weights = _fit_logistic(Xb_train, y_train, epochs=400, learning_rate=0.5, n_classes=n_classes)

        train_logits = Xb_train @ weights
        test_logits = Xb_test @ weights
        train_pred = np.argmax(train_logits, axis=1)
        test_pred = np.argmax(test_logits, axis=1)

        confusion = np.zeros((n_classes, n_classes), dtype=int)
        for true_label, pred_label in zip(y_test, test_pred):
            confusion[int(true_label), int(pred_label)] += 1

        accuracy = float(np.mean(test_pred == y_test))
        # Cohen's kappa — nullifies class-imbalance agreement.
        po = accuracy
        row_totals = confusion.sum(axis=1)
        col_totals = confusion.sum(axis=0)
        pe = float(np.sum(row_totals * col_totals) / (y_test.size ** 2)) if y_test.size else 0.0
        kappa = (po - pe) / (1.0 - pe) if pe < 1.0 else 0.0

        # Per-channel "importance" = absolute weight magnitude (bias stripped).
        feature_importance = np.abs(weights[1:]).sum(axis=1)

        # Sample PSD for the headline visualisation (test_idx[0]).
        if len(test_idx):
            sample_idx = test_idx[0]
            sample_freqs, sample_psd = dsp.welch(
                filtered[sample_idx, 0], fs=sample_rate, nperseg=nperseg
            )
            sample_psd_per_channel = []
            for ch in range(n_channels):
                f, p = dsp.welch(filtered[sample_idx, ch], fs=sample_rate, nperseg=nperseg)
                sample_psd_per_channel.append({
                    "channel": sample.channel_names[ch],
                    "frequencies": [round(float(freq), 2) for freq in f],
                    "values": [round(float(v), 5) for v in p],
                })
        else:
            sample_freqs = np.array([])
            sample_psd = np.array([])
            sample_psd_per_channel = []

        return {
            "params": validated,
            "dataset": sample.source,
            "dataset_id": sample.source,
            "channel_names": sample.channel_names,
            "sample_rate": sample_rate,
            "classes": sample.classes,
            "classifier": classifier,
            "filter": {"low_hz": low_hz, "high_hz": high_hz},
            "accuracy": round(accuracy, 4),
            "kappa": round(kappa, 4),
            "n_trials": int(n_trials),
            "n_train": int(len(train_idx)),
            "n_test": int(len(test_idx)),
            "confusion_matrix": confusion.tolist(),
            "feature_importance": [
                {
                    "channel": sample.channel_names[ch],
                    "alpha_weight": round(float(feature_importance[ch * 2]), 4),
                    "beta_weight": round(float(feature_importance[ch * 2 + 1]), 4),
                }
                for ch in range(n_channels)
            ],
            "sample_psd": {
                "frequencies": [round(float(f), 2) for f in sample_freqs],
                "values": [round(float(v), 5) for v in sample_psd],
                "channels": sample_psd_per_channel,
            },
            "pipeline_trace": [
                {"node_id": "dataset", "status": "completed"},
                {"node_id": "filter", "status": "completed"},
                {"node_id": "features", "status": "completed"},
                {"node_id": "classify", "status": "completed"},
                {"node_id": "evaluate", "status": "completed"},
                {"node_id": "ai-report", "status": "completed"},
            ],
        }

    def summarize_artifacts(self, result: dict) -> dict:
        return {
            "dataset": result["dataset_id"],
            "classifier": result["classifier"],
            "accuracy": result["accuracy"],
            "kappa": result["kappa"],
            "n_test": result["n_test"],
            "n_classes": len(result["classes"]),
        }


def _fit_lda(Xb: np.ndarray, y: np.ndarray, n_classes: int) -> np.ndarray:
    """One-vs-rest LDA — closed-form weight per class.

    Returns ``weights`` shaped ``(n_features, n_classes)`` so class scores
    come from a single matrix multiply.
    """
    n_features = Xb.shape[1]
    weights = np.zeros((n_features, n_classes))
    overall_mean = Xb.mean(axis=0)
    # Pooled within-class covariance.
    pooled = np.zeros((n_features, n_features))
    for cls in range(n_classes):
        mask = y == cls
        if not mask.any():
            continue
        class_X = Xb[mask]
        class_mean = class_X.mean(axis=0)
        diff = class_X - class_mean
        pooled += diff.T @ diff
    pooled += np.eye(n_features) * 1e-4
    inv_pooled = np.linalg.pinv(pooled)
    for cls in range(n_classes):
        mask = y == cls
        if not mask.any():
            continue
        class_mean = Xb[mask].mean(axis=0)
        weights[:, cls] = inv_pooled @ (class_mean - overall_mean)
    return weights


def _fit_logistic(
    Xb: np.ndarray,
    y: np.ndarray,
    epochs: int,
    learning_rate: float,
    n_classes: int,
) -> np.ndarray:
    """One-vs-rest logistic regression with full-batch gradient descent."""
    n_features = Xb.shape[1]
    weights = np.zeros((n_features, n_classes))
    for cls in range(n_classes):
        target = (y == cls).astype(float)
        w = np.zeros(n_features)
        for _ in range(epochs):
            z = np.clip(Xb @ w, -NeuralNetTrainerAdapter.MAX_GRAD_CLIP, NeuralNetTrainerAdapter.MAX_GRAD_CLIP)
            prob = 1.0 / (1.0 + np.exp(-z))
            grad = Xb.T @ (prob - target) / len(y)
            w = w - learning_rate * grad
        weights[:, cls] = w
    return weights


ADAPTERS = {
    "synthetic_eeg": SyntheticEegAdapter(),
    "neuron_simulator": NeuronSimulatorAdapter(),
    "ml_train": NeuralNetTrainerAdapter(),
    "eeg_dataset": EegDatasetAdapter(),
}


def get_adapter(adapter_name: str) -> ExperimentAdapter:
    adapter = ADAPTERS.get(adapter_name)
    if adapter is None:
        raise ValueError(f"unsupported experiment adapter: {adapter_name}")
    return adapter
