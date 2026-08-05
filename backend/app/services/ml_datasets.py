"""Deterministic toy datasets for the ML training lab.

All datasets are generated with a fixed RNG seed so identical params always
produce identical data — suitable for classroom reproducibility. No external
downloads: the two built-in datasets contrast a linearly-separable case
(blobs) with a linearly-inseparable case (spiral) to show the limits of
linear models.
"""

from __future__ import annotations

from typing import Callable

import numpy as np

DatasetLoader = Callable[[], tuple[np.ndarray, np.ndarray]]


def _blobs(samples: int = 120, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    per_class = samples // 2
    class0 = rng.normal(-1.2, 0.45, (per_class, 2))
    class1 = rng.normal(1.2, 0.45, (per_class, 2))
    X = np.vstack([class0, class1])
    y = np.array([0] * per_class + [1] * per_class)
    return X, y


def _spiral(samples: int = 120, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    per_class = samples // 2
    points: list[np.ndarray] = []
    labels: list[int] = []
    for cls in range(2):
        radius = np.linspace(0.4, 2.0, per_class) + rng.normal(0, 0.04, per_class)
        theta = np.linspace(cls * np.pi, (cls + 2) * np.pi, per_class) + rng.normal(0, 0.12, per_class)
        points.append(np.column_stack([radius * np.sin(theta), radius * np.cos(theta)]))
        labels.extend([cls] * per_class)
    return np.vstack(points), np.array(labels)


DATASETS: dict[str, dict] = {
    "blobs": {
        "name": "Two Blobs",
        "description": "两组高斯簇，线性可分。A pair of Gaussian blobs that a linear model can separate.",
        "load": _blobs,
    },
    "spiral": {
        "name": "Double Spiral",
        "description": "双螺旋，线性不可分——感知机无法收敛到 100%。Two intertwined spirals no line can separate.",
        "load": _spiral,
    },
}


def get_dataset(name: str) -> tuple[np.ndarray, np.ndarray]:
    spec = DATASETS.get(name)
    if spec is None:
        raise ValueError(f"unsupported ml dataset: {name}")
    return spec["load"]()
