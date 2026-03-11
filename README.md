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

## Palette Space Coordinates

- `data/palette_coords.json` and `data/palette_coords.js` store the 2D coordinates and palette metadata.
- The notebook `notebooks/palette_similarity.ipynb` documents the similarity pipeline.
