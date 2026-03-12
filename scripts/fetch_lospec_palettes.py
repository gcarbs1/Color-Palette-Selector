#!/usr/bin/env python3
"""Fetch palettes from Lospec public API and save as local extra source JSON."""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT_DIR / "data/extra/lospec_palettes.json"
LOSPEC_LOAD_URL = "https://lospec.com/palette-list/load"
USER_AGENT = "Color-Palette-Selector/1.0 (+local extraction script)"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output JSON file path.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=0,
        help=(
            "Optional safety cap for page requests. "
            "Use 0 to fetch all available pages."
        ),
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=12,
        help="Number of concurrent requests when fetching pages > 0.",
    )
    return parser.parse_args()


def _normalize_hex(color: Any) -> str | None:
    raw = str(color or "").strip().lstrip("#")
    if len(raw) != 6:
        return None
    if any(ch not in "0123456789abcdefABCDEF" for ch in raw):
        return None
    return f"#{raw.upper()}"


def _fetch_page(page: int) -> dict[str, Any]:
    query = urlencode(
        {
            "colorNumberFilterType": "any",
            "colorNumber": "",
            "page": page,
            "tag": "",
            "sortingType": "default",
        }
    )
    req = Request(
        f"{LOSPEC_LOAD_URL}?{query}",
        headers={"User-Agent": USER_AGENT},
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as err:  # pragma: no cover - defensive network retry
            last_error = err
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    assert last_error is not None
    raise last_error


def _convert_palette(item: dict[str, Any]) -> dict[str, Any] | None:
    slug = str(item.get("slug", "")).strip()
    title = str(item.get("title", "")).strip()
    colors = item.get("colors", [])
    if not slug or not isinstance(colors, list):
        return None

    normalized_colors = []
    for c in colors:
        color = _normalize_hex(c)
        if color:
            normalized_colors.append(color)

    if not normalized_colors:
        return None

    display_name = title if title else slug
    return {
        "name": f"Lospec/{display_name}",
        "palette": normalized_colors,
        "source": "Lospec Palette List API",
        "kind": "pixel-art",
        "_slug": slug,
    }


def main() -> int:
    args = _parse_args()
    out_path = args.out.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    all_items: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()

    # Page 0 gives both palettes and totalCount.
    first_page = _fetch_page(0)
    total_count = int(first_page.get("totalCount") or 0)
    first_records = first_page.get("palettes", [])
    if not isinstance(first_records, list):
        first_records = []

    for raw in first_records:
        if not isinstance(raw, dict):
            continue
        converted = _convert_palette(raw)
        if not converted:
            continue
        slug = converted.pop("_slug", "")
        if not slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        all_items.append(converted)

    # API usually returns ~10 records per page after page 0.
    estimated_pages = max(1, math.ceil(total_count / 10))
    if args.max_pages > 0:
        last_page = max(0, args.max_pages - 1)
    else:
        # +2 for safety since page 0 often has one extra featured palette.
        last_page = estimated_pages + 2

    pages_to_fetch = [p for p in range(1, last_page + 1)]
    fetched_pages = 1

    if pages_to_fetch:
        workers = max(1, int(args.workers or 1))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_page = {executor.submit(_fetch_page, page): page for page in pages_to_fetch}
            for future in as_completed(future_to_page):
                fetched_pages += 1
                page_data = future.result()
                records = page_data.get("palettes", [])
                if not isinstance(records, list):
                    records = []

                for raw in records:
                    if not isinstance(raw, dict):
                        continue
                    converted = _convert_palette(raw)
                    if not converted:
                        continue
                    slug = converted.pop("_slug", "")
                    if not slug or slug in seen_slugs:
                        continue
                    seen_slugs.add(slug)
                    all_items.append(converted)

                if fetched_pages % 50 == 0:
                    print(f"Fetched pages so far: {fetched_pages}", flush=True)

    all_items.sort(key=lambda x: str(x.get("name", "")).lower())
    out_path.write_text(json.dumps(all_items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Fetched pages: {fetched_pages}")
    print(f"API total count hint: {total_count if total_count is not None else 'unknown'}")
    print(f"Saved palettes: {len(all_items)}")
    print(f"Output: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
