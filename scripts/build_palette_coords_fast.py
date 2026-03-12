#!/usr/bin/env python3
"""Build fast, perceptual palette-space coordinates using OKLab histograms."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_PALETTES = ROOT_DIR / "data/palettes.json"
DEFAULT_COORDS_JSON = ROOT_DIR / "data/palette_coords.json"
DEFAULT_COORDS_JS = ROOT_DIR / "data/palette_coords.js"
MAX_COLORS_PER_PALETTE = 48


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--palettes", type=Path, default=DEFAULT_PALETTES, help="Input palettes JSON path.")
    parser.add_argument("--coords-json", type=Path, default=DEFAULT_COORDS_JSON, help="Output coordinates JSON path.")
    parser.add_argument("--coords-js", type=Path, default=DEFAULT_COORDS_JS, help="Output coordinates JS path.")
    parser.add_argument("--neighbors", type=int, default=24, help="UMAP n_neighbors value.")
    parser.add_argument("--min-dist", type=float, default=0.08, help="UMAP min_dist value.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible embedding.")
    return parser.parse_args()


def _normalize_hex(value: object) -> str | None:
    raw = str(value or "").strip().lstrip("#")
    if len(raw) not in (6, 8):
        return None
    if any(ch not in "0123456789abcdefABCDEF" for ch in raw):
        return None
    return f"#{raw[:6].upper()}"


def _sample_colors(hex_colors: list[str], max_colors: int = MAX_COLORS_PER_PALETTE) -> list[str]:
    if len(hex_colors) <= max_colors:
        return hex_colors
    idx = np.linspace(0, len(hex_colors) - 1, max_colors).round().astype(int)
    return [hex_colors[i] for i in idx]


def _hex_to_srgb01(hex_color: str) -> tuple[float, float, float]:
    h = hex_color[1:]
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return r, g, b


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _srgb_to_oklab(r: float, g: float, b: float) -> tuple[float, float, float]:
    rl = _srgb_to_linear(r)
    gl = _srgb_to_linear(g)
    bl = _srgb_to_linear(b)

    l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
    m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
    s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl

    l_ = np.cbrt(max(l, 0.0))
    m_ = np.cbrt(max(m, 0.0))
    s_ = np.cbrt(max(s, 0.0))

    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return float(L), float(a), float(b2)


def _palette_to_oklab(colors: list[str]) -> np.ndarray:
    pts: list[tuple[float, float, float]] = []
    for color in colors:
        hex_color = _normalize_hex(color)
        if not hex_color:
            continue
        srgb = _hex_to_srgb01(hex_color)
        pts.append(_srgb_to_oklab(*srgb))
    return np.array(pts, dtype=np.float32) if pts else np.zeros((1, 3), dtype=np.float32)


def _palette_descriptor(colors: list[str]) -> np.ndarray:
    sampled = _sample_colors(colors)
    arr = _palette_to_oklab(sampled)

    # 3D perceptual color distribution (fast + robust to palette order).
    hist, _ = np.histogramdd(
        arr,
        bins=(8, 8, 8),
        range=((0.0, 1.0), (-0.45, 0.45), (-0.45, 0.45)),
    )
    hist = hist.astype(np.float32).reshape(-1)
    hist_sum = float(hist.sum())
    if hist_sum > 0:
        hist /= hist_sum
    hist = np.sqrt(hist)  # Hellinger transform

    # Compact moments to stabilize proximity among similarly distributed palettes.
    means = arr.mean(axis=0)
    stds = arr.std(axis=0)
    size = np.array([math.log1p(len(sampled))], dtype=np.float32)
    moments = np.concatenate([means, stds, size], dtype=np.float32)

    return np.concatenate([hist, moments], dtype=np.float32)


def _minmax_to_unit(arr: np.ndarray) -> np.ndarray:
    lo = float(arr.min())
    hi = float(arr.max())
    span = hi - lo
    if span <= 1e-12:
        return np.zeros_like(arr)
    return 2 * (arr - lo) / span - 1


def main() -> int:
    args = _parse_args()
    palettes_path = args.palettes.resolve()
    coords_json_path = args.coords_json.resolve()
    coords_js_path = args.coords_js.resolve()

    palettes = json.loads(palettes_path.read_text(encoding="utf-8"))
    if not isinstance(palettes, list):
        raise RuntimeError(f"Invalid palettes payload in {palettes_path}")

    records: list[dict] = []
    features: list[np.ndarray] = []
    for item in palettes:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        colors = item.get("palette") or item.get("colors") or []
        if not name or not isinstance(colors, list) or not colors:
            continue
        records.append(
            {
                "name": name,
                "kind": str(item.get("kind", "")).strip(),
                "source": str(item.get("source", "")).strip(),
                "colors": colors,
            }
        )
        features.append(_palette_descriptor(colors))

    if not features:
        raise RuntimeError("No valid palettes found to build coordinates.")

    X = np.vstack(features)
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    # PCA keeps UMAP fast and stable with high-dimensional histograms.
    n_components = min(40, Xs.shape[1], max(2, Xs.shape[0] - 1))
    Xp = PCA(n_components=n_components, random_state=args.seed).fit_transform(Xs)

    method = "UMAP"
    try:
        import umap

        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=max(5, int(args.neighbors)),
            min_dist=max(0.0, float(args.min_dist)),
            metric="euclidean",
            random_state=int(args.seed),
            verbose=False,
        )
        embedding = reducer.fit_transform(Xp)
    except Exception:
        method = "PCA2D"
        embedding = PCA(n_components=2, random_state=args.seed).fit_transform(Xp)

    x_norm = _minmax_to_unit(embedding[:, 0])
    y_norm = _minmax_to_unit(embedding[:, 1])

    out = []
    for i, rec in enumerate(records):
        out.append(
            {
                "name": rec["name"],
                "x": round(float(x_norm[i]), 4),
                "y": round(float(y_norm[i]), 4),
                "kind": rec["kind"],
                "source": rec["source"],
                "colors": rec["colors"],
            }
        )

    coords_json_path.parent.mkdir(parents=True, exist_ok=True)
    coords_js_path.parent.mkdir(parents=True, exist_ok=True)
    coords_json_path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    coords_js_path.write_text(
        "window.__PALETTE_COORDS__=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";",
        encoding="utf-8",
    )

    print(f"Input palettes: {len(records)}")
    print(f"Feature matrix: {X.shape}")
    print(f"Projection method: {method}")
    print(f"Saved coords: {coords_json_path}")
    print(f"Saved JS fallback: {coords_js_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
