# Color Palette Selector

Local interface to explore color palettes, preview chart examples, and navigate the similarity map (`Palette Space`).

It now includes `Palette Studio`, an area to:
- create your own palettes with HEX colors
- merge colors from the currently selected palette
- save local collections in the browser (`localStorage`)
- visualize saved palettes in `Palette Space`
- export palettes as JSON

## Structure

```
.
├── index.html
├── data/
│   ├── palettes.json
│   ├── palettes.js
│   ├── palette_coords.json
│   ├── palette_coords.js
│   ├── palette_space_preview.png
│   ├── extra/
│   │   ├── README.md
│   │   └── _template.json
│   └── source/
│       └── dataviz-color-finder-page.js
├── scripts/
│   └── extract_palettes.py
└── notebooks/
    ├── extract_palettes.ipynb
    └── palette_similarity.ipynb
```

## Run Locally

```bash
python3 -m http.server 8000
```

Open: `http://localhost:8000`

## Palette Data

- Base source: local snapshot at `data/source/dataviz-color-finder-page.js`
- Extraction: `scripts/extract_palettes.py`
- Output:
  - `data/palettes.json` (main data)
  - `data/palettes.js` (local fallback)
- Per-palette fields: `name`, `palette`, `source`, `kind`

To regenerate files:

```bash
python3 scripts/extract_palettes.py
```

To refresh the remote snapshot and regenerate:

```bash
python3 scripts/extract_palettes.py --refresh-source
```

To fetch an extra large source from Lospec and include it:

```bash
python3 scripts/fetch_lospec_palettes.py
python3 scripts/extract_palettes.py --dedupe-by name+signature
```

### Add More Sources (Without Repetition)

`extract_palettes.py` can merge additional JSON files and remove duplicates.

Fast path:

1. Copy `data/extra/_template.json` to a new file (example: `data/extra/my_source.json`)
2. Add your palettes
3. Run:

```bash
python3 scripts/extract_palettes.py --dedupe-by name+signature
```

`data/extra/*.json` is loaded automatically (files starting with `_` or `.` are ignored).

Supported extra JSON formats:
- a top-level list of palettes
- an object with a `palettes` list

Each palette item should contain: `name`, `palette` (hex list), `source`, `kind`.

Example:

```bash
python3 scripts/extract_palettes.py \
  --extra-json data/extra/my_source_a.json \
  --extra-json data/extra/my_source_b.json \
  --dedupe-by name+signature
```

Extra options:
- `--extra-dir path/to/folder`: load all `.json` files from an additional folder
- `--no-auto-extra-dir`: disable the automatic scan of `data/extra`

Deduplication modes:
- `none`: keeps everything
- `name`: removes repeated palette names (case-insensitive)
- `signature`: removes repeated normalized color sequences
- `name+signature`: removes duplicates if either name or color signature repeats

Default mode is `none` to preserve the full imported dataset.

## Palette Space Coordinates

- `data/palette_coords.json` and `data/palette_coords.js` store the 2D coordinates and palette metadata.
- The notebook `notebooks/palette_similarity.ipynb` documents the similarity pipeline.
- Fast rebuild command (recommended for larger datasets):

```bash
./.venv/bin/python scripts/build_palette_coords_fast.py
```
