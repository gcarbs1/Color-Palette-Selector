#!/usr/bin/env python3
"""Extract palette metadata from dataviz-color-finder build output."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.request import urlopen

CHUNK_URL = (
    "https://holtzy.github.io/dataviz-color-finder/_next/static/chunks/"
    "app/page-acd47dc2338d5133.js"
)


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
    out_path = Path("data/palettes.json")
    out_js_path = Path("data/palettes.js")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with urlopen(CHUNK_URL, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

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

    print(f"Saved {len(slim)} palettes to {out_path} and {out_js_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
