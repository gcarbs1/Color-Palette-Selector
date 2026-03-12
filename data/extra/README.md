# Extra Palette Sources

Put your additional sources here as `.json` files.

## Auto-load behavior

- `scripts/extract_palettes.py` automatically loads `data/extra/*.json`.
- Files starting with `_` or `.` are ignored.
- Use `_template.json` as a base model for new files.

## Accepted JSON formats

1. Top-level list:

```json
[
  {
    "name": "My Palette",
    "palette": ["#112233", "#445566", "#778899"],
    "source": "My Source",
    "kind": "qualitative"
  }
]
```

2. Object with `palettes` key:

```json
{
  "palettes": [
    {
      "name": "My Palette",
      "palette": ["#112233", "#445566", "#778899"],
      "source": "My Source",
      "kind": "qualitative"
    }
  ]
}
```
