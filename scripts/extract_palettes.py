#!/usr/bin/env python3
"""Extract palette metadata from a local dataviz-color-finder chunk snapshot."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.request import urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]
CHUNK_URL = (
    "https://holtzy.github.io/dataviz-color-finder/_next/static/chunks/"
    "app/page-acd47dc2338d5133.js"
)
DEFAULT_SOURCE_SNAPSHOT = ROOT_DIR / "data/source/dataviz-color-finder-page.js"
DEFAULT_JSON_OUT = ROOT_DIR / "data/palettes.json"
DEFAULT_JS_OUT = ROOT_DIR / "data/palettes.js"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-path",
        type=Path,
        default=DEFAULT_SOURCE_SNAPSHOT,
        help="Local JS snapshot used as extraction source.",
    )
    parser.add_argument(
        "--refresh-source",
        action="store_true",
        help="Download the latest source chunk and overwrite --source-path.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=DEFAULT_JSON_OUT,
        help="Output JSON file for palettes.",
    )
    parser.add_argument(
        "--js-out",
        type=Path,
        default=DEFAULT_JS_OUT,
        help="Output JS file with window.__LOCAL_PALETTES__ payload.",
    )
    return parser.parse_args()


def _download_source_chunk() -> str:
    with urlopen(CHUNK_URL, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _load_source(source_path: Path, refresh_source: bool) -> tuple[str, str]:
    source_path = source_path.resolve()

    if refresh_source:
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_text(_download_source_chunk(), encoding="utf-8")
        return source_path.read_text(encoding="utf-8", errors="replace"), "remote refresh"

    if not source_path.exists():
        raise FileNotFoundError(
            f"Missing local source snapshot: {source_path}\n"
            "Run again with --refresh-source to download it."
        )

    return source_path.read_text(encoding="utf-8", errors="replace"), "local snapshot"


def _extract_array_blob(js_source: str) -> str:
    marker = 'h=[{name:"'
    start = js_source.find(marker)
    if start == -1:
        raise RuntimeError("Palette marker not found in source chunk.")

    arr_start = js_source.find("[", start)
    if arr_start == -1:
        raise RuntimeError("Palette array start not found.")

    depth = 0
    in_string = False
    escaped = False
    arr_end = -1

    for idx in range(arr_start, len(js_source)):
        ch = js_source[idx]

        if escaped:
            escaped = False
            continue

        if ch == "\\":
            escaped = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "[":
            depth += 1
            continue

        if ch == "]":
            depth -= 1
            if depth == 0:
                arr_end = idx
                break

    if arr_end == -1:
        raise RuntimeError("Palette array end not found.")

    return js_source[arr_start : arr_end + 1]


def _js_array_to_json(js_array_blob: str) -> list[dict]:
    # Convert object keys from JS literal to JSON
    normalized = re.sub(r"([{\[,])([a-zA-Z_][a-zA-Z0-9_]*)\s*:", r'\1"\2":', js_array_blob)

    # Convert JS \xNN escapes to JSON-compatible \u00NN escapes
    normalized = re.sub(r"\\x([0-9A-Fa-f]{2})", r"\\u00\1", normalized)

    # Defensive cleanup for occasional trailing commas
    normalized = re.sub(r",\s*([}\]])", r"\1", normalized)

    data = json.loads(normalized)
    if not isinstance(data, list):
        raise RuntimeError("Parsed palette payload is not a list.")
    return data


def main() -> int:
    args = _parse_args()
    out_path = args.json_out.resolve()
    out_js_path = args.js_out.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_js_path.parent.mkdir(parents=True, exist_ok=True)

    raw, source_mode = _load_source(args.source_path, args.refresh_source)

    js_array_blob = _extract_array_blob(raw)
    palettes = _js_array_to_json(js_array_blob)

    # Normalize and keep only fields needed by local app.
    slim = []
    for item in palettes:
        name = str(item.get("name", "")).strip()
        colors = [str(c).strip() for c in item.get("palette", []) if str(c).strip()]
        source = str(item.get("source", "")).strip()
        kind = str(item.get("kind", "")).strip()

        if not name or not colors:
            continue

        slim.append(
            {
                "name": name,
                "palette": colors,
                "source": source,
                "kind": kind,
            }
        )

    # Sort for deterministic output.
    slim.sort(key=lambda x: x["name"].lower())

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))

    js_payload = "window.__LOCAL_PALETTES__=" + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";"
    with out_js_path.open("w", encoding="utf-8") as f:
        f.write(js_payload)

    print(f"Loaded source from {args.source_path.resolve()} ({source_mode})")
    print(f"Saved {len(slim)} palettes to {out_path} and {out_js_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
