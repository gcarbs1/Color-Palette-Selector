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
DEFAULT_EXTRA_DIR = ROOT_DIR / "data/extra"
HEX_COLOR_RE = re.compile(r"^#?[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")
DEDUPE_CHOICES = ("none", "name", "signature", "name+signature")


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
    parser.add_argument(
        "--extra-json",
        action="append",
        type=Path,
        default=[],
        help=(
            "Additional JSON file(s) with palettes to merge into the extracted set. "
            "Can be used multiple times."
        ),
    )
    parser.add_argument(
        "--extra-dir",
        action="append",
        type=Path,
        default=[],
        help=(
            "Directory containing additional JSON files to merge. "
            "Every '*.json' file is included (except names starting with '_' or '.'). "
            "Can be used multiple times."
        ),
    )
    parser.add_argument(
        "--no-auto-extra-dir",
        action="store_true",
        help=(
            "Disable automatic loading from data/extra when the folder exists."
        ),
    )
    parser.add_argument(
        "--dedupe-by",
        choices=DEDUPE_CHOICES,
        default="none",
        help=(
            "Deduplication strategy after merging palettes: "
            "'name' (case-insensitive name), "
            "'signature' (same normalized color sequence), "
            "'name+signature' (drop if either repeats), "
            "or 'none'."
        ),
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


def _normalize_hex(value: object) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if not HEX_COLOR_RE.match(raw):
        return None
    hex_value = raw.upper()
    if not hex_value.startswith("#"):
        hex_value = f"#{hex_value}"
    if len(hex_value) == 7:
        hex_value = f"{hex_value}FF"
    return hex_value


def _normalize_colors(colors: object) -> list[str]:
    if not isinstance(colors, list):
        return []

    unique_colors: list[str] = []
    seen: set[str] = set()
    for color in colors:
        hex_color = _normalize_hex(color)
        if not hex_color or hex_color in seen:
            continue
        seen.add(hex_color)
        unique_colors.append(hex_color)
    return unique_colors


def _normalize_record(item: object, fallback_source: str = "") -> dict | None:
    if not isinstance(item, dict):
        return None

    name = str(item.get("name", "")).strip()
    palette = _normalize_colors(item.get("palette", []))
    source = str(item.get("source", "")).strip() or fallback_source
    kind = str(item.get("kind", "")).strip()

    if not name or not palette:
        return None

    return {
        "name": name,
        "palette": palette,
        "source": source,
        "kind": kind,
    }


def _load_extra_json(extra_path: Path) -> list[dict]:
    path = extra_path.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Missing extra JSON source: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        raw_items = payload
    elif isinstance(payload, dict) and isinstance(payload.get("palettes"), list):
        raw_items = payload["palettes"]
    else:
        raise RuntimeError(
            f"Unsupported extra JSON format in {path}. "
            "Expected a list or an object with a 'palettes' list."
        )

    fallback_source = f"extra:{path.stem}"
    normalized: list[dict] = []
    for item in raw_items:
        record = _normalize_record(item, fallback_source=fallback_source)
        if record:
            normalized.append(record)
    return normalized


def _collect_extra_json_files(
    explicit_files: list[Path],
    extra_dirs: list[Path],
    no_auto_extra_dir: bool,
) -> list[Path]:
    candidates: list[Path] = [path.resolve() for path in explicit_files]
    dirs_to_scan: list[Path] = [path.resolve() for path in extra_dirs]

    if not no_auto_extra_dir:
        dirs_to_scan.append(DEFAULT_EXTRA_DIR.resolve())

    for directory in dirs_to_scan:
        if not directory.exists():
            continue
        if not directory.is_dir():
            raise NotADirectoryError(f"Extra source path is not a directory: {directory}")
        for json_file in sorted(directory.glob("*.json")):
            if json_file.name.startswith((".", "_")):
                continue
            candidates.append(json_file.resolve())

    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        deduped.append(path)
    return deduped


def _palette_signature(record: dict) -> str:
    palette = record.get("palette", [])
    if not isinstance(palette, list):
        return ""
    return "|".join(str(color) for color in palette)


def _dedupe_records(records: list[dict], mode: str) -> tuple[list[dict], dict[str, int]]:
    stats = {
        "removed_total": 0,
        "removed_by_name": 0,
        "removed_by_signature": 0,
    }
    if mode == "none":
        return records, stats

    deduped: list[dict] = []
    seen_names: set[str] = set()
    seen_signatures: set[str] = set()

    for record in records:
        name_key = str(record.get("name", "")).strip().casefold()
        signature_key = _palette_signature(record)

        duplicated_name = mode in ("name", "name+signature") and name_key in seen_names
        duplicated_signature = mode in ("signature", "name+signature") and signature_key in seen_signatures

        if duplicated_name or duplicated_signature:
            stats["removed_total"] += 1
            if duplicated_name:
                stats["removed_by_name"] += 1
            if duplicated_signature:
                stats["removed_by_signature"] += 1
            continue

        deduped.append(record)
        if mode in ("name", "name+signature"):
            seen_names.add(name_key)
        if mode in ("signature", "name+signature"):
            seen_signatures.add(signature_key)

    return deduped, stats


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
    base_records = []
    for item in palettes:
        record = _normalize_record(item)
        if record:
            base_records.append(record)

    extra_files = _collect_extra_json_files(args.extra_json, args.extra_dir, args.no_auto_extra_dir)
    extra_records: list[dict] = []
    for extra_path in extra_files:
        extra_records.extend(_load_extra_json(extra_path))

    merged = [*base_records, *extra_records]
    slim, dedupe_stats = _dedupe_records(merged, args.dedupe_by)

    # Sort for deterministic output.
    slim.sort(key=lambda x: x["name"].lower())

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))

    js_payload = "window.__LOCAL_PALETTES__=" + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";"
    with out_js_path.open("w", encoding="utf-8") as f:
        f.write(js_payload)

    print(f"Loaded source from {args.source_path.resolve()} ({source_mode})")
    print(f"Base palettes: {len(base_records)}")
    print(f"Extra palettes: {len(extra_records)} from {len(extra_files)} file(s)")
    print(f"Dedupe mode: {args.dedupe_by}")
    print(
        "Removed duplicates: "
        f"{dedupe_stats['removed_total']} "
        f"(name={dedupe_stats['removed_by_name']}, signature={dedupe_stats['removed_by_signature']})"
    )
    print(f"Saved {len(slim)} palettes to {out_path} and {out_js_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
