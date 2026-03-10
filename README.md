# Color Palette Selector

Versao local (sem dependencia de iframe externo) para explorar paletas e sincronizar o hero logo.

## Estrutura atual

```
.
├── data/
│   ├── palettes.json
│   └── palettes.js
├── index.html
├── palette-explorer.html
├── scripts/
│   └── extract_palettes.py
├── notebooks/
│   └── extract_palettes.ipynb
└── README.md
```

## O que esta pagina faz

- Carrega um `iframe` local (`palette-explorer.html`).
- Usa base local `data/palettes.json` com todas as paletas extraidas.
- Fallback offline: `data/palettes.js` (usado quando `fetch` falha, por exemplo em `file://`).
- Sincroniza a paleta selecionada no iframe com o hero logo da pagina principal via `postMessage`.
- Permite controlar por URL:
  - `?language=r`
  - `?language=python`
  - `?language=r&palette=viridis`

## Como as fontes sao extraidas

- Origem: build publico do projeto `dataviz-color-finder`.
- Script: `scripts/extract_palettes.py`
- Saida: `data/palettes.json` e `data/palettes.js`
- Campos extraidos por paleta: `name`, `palette`, `source`, `kind`

Para regenerar:

```bash
python3 -m venv .venv
.venv/bin/python scripts/extract_palettes.py
```

Notebook de apoio: `notebooks/extract_palettes.ipynb`.

## Publicar no GitHub Pages

1. Suba os arquivos para seu repositorio.
2. No GitHub: `Settings > Pages`.
3. Selecione `Deploy from a branch`.
4. Escolha branch `main` e pasta `/ (root)`.
5. Salve.

## Observacao

Todo o fluxo principal agora funciona localmente, sem depender de leitura cross-origin do conteudo interno de terceiros.
