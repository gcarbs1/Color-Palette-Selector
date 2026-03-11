# Color Palette Selector

Interface local para explorar paletas de cores, visualizar exemplos de gráficos e navegar no mapa de similaridade (`Palette Space`).

## Estrutura

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

## Como rodar

```bash
python3 -m http.server 8000
```

Abra: `http://localhost:8000`

## Dados de paleta

- Fonte base: snapshot local em `data/source/dataviz-color-finder-page.js`
- Extração: `scripts/extract_palettes.py`
- Saída:
  - `data/palettes.json` (dados principais)
  - `data/palettes.js` (fallback para uso local)
- Campos por paleta: `name`, `palette`, `source`, `kind`

Para regenerar os arquivos:

```bash
python3 scripts/extract_palettes.py
```

Para atualizar o snapshot remoto e regenerar:

```bash
python3 scripts/extract_palettes.py --refresh-source
```

## Coordenadas do Palette Space

- `data/palette_coords.json` e `data/palette_coords.js` armazenam as coordenadas 2D e metadados das paletas.
- O notebook `notebooks/palette_similarity.ipynb` documenta o pipeline de similaridade.
