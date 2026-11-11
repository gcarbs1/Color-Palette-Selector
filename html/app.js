      (function () {
        const DATA_URL = "./data/palettes.json";
        const DATA_FALLBACK_SCRIPT = "./data/palettes.js";
        const COORDS_FALLBACK_SCRIPT = "./data/palette_coords.js";
        const CUSTOM_STORAGE_KEY = "palette_explorer_custom_palettes_v1";
        const MAX_CUSTOM_COLORS = 20;
        const PAGE_SIZE = 180;
        const DEFAULT_PALETTE_NAME = "arbutus";
        const DEFAULT_COLORS = ["#0f1b3f", "#1647a3", "#4a7dde", "#7fa3ea", "#c8d9ff", "#ecf3f9"];
        const VISION_MATRICES = {
          normal: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ],
          protanopia: [
            [0.567, 0.433, 0],
            [0.558, 0.442, 0],
            [0, 0.242, 0.758]
          ],
          deuteranopia: [
            [0.625, 0.375, 0],
            [0.7, 0.3, 0],
            [0, 0.3, 0.7]
          ],
          tritanopia: [
            [0.95, 0.05, 0],
            [0, 0.433, 0.567],
            [0, 0.475, 0.525]
          ],
          achromatopsia: [
            [0.299, 0.587, 0.114],
            [0.299, 0.587, 0.114],
            [0.299, 0.587, 0.114]
          ]
        };

        const palettePill = document.querySelector(".palette-pill");
        const paletteDot = palettePill ? palettePill.querySelector(".dot") : null;
        const paletteLabel = document.getElementById("paletteLabel");
        const heroLogo = document.querySelector(".hero-logo");
        const wcPaths = Array.from(document.querySelectorAll(".wc-mark path"));

        const countBadge = document.getElementById("paletteCountBadge");
        const comboWrap = document.getElementById("paletteComboWrap");
        const comboButton = document.getElementById("paletteComboButton");
        const comboName = document.getElementById("comboName");
        const comboSwatches = document.getElementById("comboSwatches");
        const dropdown = document.getElementById("paletteDropdown");
        const searchInput = document.getElementById("paletteSearch");
        const optionsList = document.getElementById("paletteOptions");
        const visionMode = document.getElementById("visionMode");
        const maxColorsFilterInput = document.getElementById("maxColorsFilter");
        const workbenchColorFilterPicker = document.getElementById("workbenchColorFilterPicker");
        const workbenchColorFilterHex = document.getElementById("workbenchColorFilterHex");
        const workbenchColorFilterClear = document.getElementById("workbenchColorFilterClear");
        const paletteHexMeta = document.getElementById("paletteHexMeta");
        const paletteHexList = document.getElementById("paletteHexList");
        const studioMeta = document.getElementById("studioMeta");
        const studioNameInput = document.getElementById("studioName");
        const studioColorInput = document.getElementById("studioColorInput");
        const studioColorPicker = document.getElementById("studioColorPicker");
        const studioAddColorBtn = document.getElementById("studioAddColor");
        const studioAddCurrentBtn = document.getElementById("studioAddCurrent");
        const studioDraftList = document.getElementById("studioDraftList");
        const studioMessage = document.getElementById("studioMessage");
        const studioSaveBtn = document.getElementById("studioSavePalette");
        const studioExportBtn = document.getElementById("studioExportDraft");
        const studioClearBtn = document.getElementById("studioClearDraft");
        const studioCollection = document.getElementById("studioCollection");
        const studioClearLibraryBtn = document.getElementById("studioClearLibrary");
        const workbenchExportBtn = document.getElementById("workbenchExportSelected");

        const plotSvgs = {
          bar: document.getElementById("plot-bar"),
          line: document.getElementById("plot-line"),
          scatter: document.getElementById("plot-scatter"),
          box: document.getElementById("plot-box"),
          hist: document.getElementById("plot-hist"),
          heat: document.getElementById("plot-heat"),
          area: document.getElementById("plot-area"),
          donut: document.getElementById("plot-donut"),
          lollipop: document.getElementById("plot-lollipop")
        };

        const state = {
          basePalettes: [],
          customPalettes: [],
          palettes: [],
          selectedName: "",
          language: "r",
          vision: "normal",
          query: "",
          maxColorsFilter: 0,
          similarColorFilter: "",
          optionLimit: PAGE_SIZE,
          draftName: "",
          draftColors: []
        };

        wcPaths.forEach((path) => {
          path.dataset.originalFill = path.getAttribute("fill") || "#0f1b3f";
        });

        const loadedScriptCache = new Set();
        function loadScriptOnce(src) {
          const key = String(src || "").trim();
          if (!key) {
            return Promise.reject(new Error("Missing script src"));
          }
          if (loadedScriptCache.has(key)) {
            return Promise.resolve();
          }
          if (document.querySelector(`script[data-fallback-src="${key}"]`)) {
            loadedScriptCache.add(key);
            return Promise.resolve();
          }
          return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = key;
            script.async = true;
            script.dataset.fallbackSrc = key;
            script.onload = () => {
              loadedScriptCache.add(key);
              resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load fallback script: ${key}`));
            document.head.appendChild(script);
          });
        }

        function normalizeLanguage(value) {
          return value === "python" ? "python" : "r";
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        }

        function escapeAttr(value) {
          return escapeHtml(value).replace(/"/g, "&quot;");
        }

        function normalizeHex(color) {
          const value = String(color || "").trim();
          if (!value.startsWith("#")) return "";

          if (/^#[0-9a-f]{3}$/i.test(value)) {
            return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
          }

          if (/^#[0-9a-f]{4}$/i.test(value)) {
            return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
          }

          if (/^#[0-9a-f]{6}$/i.test(value)) {
            return value.toLowerCase();
          }

          if (/^#[0-9a-f]{8}$/i.test(value)) {
            return value.slice(0, 7).toLowerCase();
          }

          return "";
        }

        function hexToRgb(hex) {
          const clean = normalizeHex(hex).replace("#", "");
          if (!clean || clean.length !== 6) {
            return { r: 0, g: 0, b: 0 };
          }
          return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16)
          };
        }

        function rgbToHex({ r, g, b }) {
          const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
          const toHex = (value) => clamp(value).toString(16).padStart(2, "0");
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        function rgba(hex, alpha) {
          const rgb = hexToRgb(hex);
          return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        }

        function mixColor(a, b, t) {
          const c1 = hexToRgb(a);
          const c2 = hexToRgb(b);
          return rgbToHex({
            r: c1.r + (c2.r - c1.r) * t,
            g: c1.g + (c2.g - c1.g) * t,
            b: c1.b + (c2.b - c1.b) * t
          });
        }

        function colorDistance(a, b) {
          const c1 = hexToRgb(a);
          const c2 = hexToRgb(b);
          const dr = c1.r - c2.r;
          const dg = c1.g - c2.g;
          const db = c1.b - c2.b;
          return Math.sqrt(dr * dr + dg * dg + db * db);
        }

        function paletteClosestColorDistance(colors, targetHex) {
          const paletteColors = Array.isArray(colors) ? colors : [];
          const target = normalizeHex(targetHex);
          if (!target || !paletteColors.length) return Number.POSITIVE_INFINITY;

          let best = Number.POSITIVE_INFINITY;
          paletteColors.forEach((color) => {
            const hex = normalizeHex(color);
            if (!hex) return;
            const distance = colorDistance(hex, target);
            if (distance < best) {
              best = distance;
            }
          });

          return best;
        }

        function transformColorForVision(hex, mode) {
          const matrix = VISION_MATRICES[mode] || VISION_MATRICES.normal;
          const rgb = hexToRgb(hex);
          const nR = rgb.r / 255;
          const nG = rgb.g / 255;
          const nB = rgb.b / 255;

          return rgbToHex({
            r: 255 * (matrix[0][0] * nR + matrix[0][1] * nG + matrix[0][2] * nB),
            g: 255 * (matrix[1][0] * nR + matrix[1][1] * nG + matrix[1][2] * nB),
            b: 255 * (matrix[2][0] * nR + matrix[2][1] * nG + matrix[2][2] * nB)
          });
        }

        function normalizePaletteName(value, fallback) {
          const clean = String(value || "")
            .replace(/\s+/g, " ")
            .trim();
          if (clean) return clean.slice(0, 60);
          return String(fallback || "").trim();
        }

        function uniqueHexColors(colors, limit) {
          const capped = Math.max(1, Math.min(Number(limit) || MAX_CUSTOM_COLORS, MAX_CUSTOM_COLORS));
          const seen = new Set();
          const unique = [];
          (Array.isArray(colors) ? colors : []).forEach((color) => {
            if (unique.length >= capped) return;
            const hex = normalizeHex(color);
            if (!hex || seen.has(hex)) return;
            seen.add(hex);
            unique.push(hex);
          });
          return unique;
        }

        function makePaletteRecord(raw, fallbackOrigin) {
          const colors = uniqueHexColors(raw?.palette || []);
          const name = normalizePaletteName(raw?.name, "");
          if (!name || !colors.length) return null;

          const createdAtValue = Number(raw?.createdAt);
          return {
            id: String(raw?.id || "").trim(),
            name,
            source: String(raw?.source || "").trim(),
            kind: String(raw?.kind || "").trim(),
            palette: colors,
            origin: String(raw?.origin || fallbackOrigin || "base").trim() || "base",
            createdAt: Number.isFinite(createdAtValue) ? createdAtValue : 0
          };
        }

        function createCustomPaletteId() {
          return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }

        function readStateFromUrl() {
          const params = new URLSearchParams(window.location.search);
          state.language = normalizeLanguage(params.get("language") || "r");
          state.selectedName = (params.get("palette") || "").trim();
          const visionParam = String(params.get("vision") || "normal").trim().toLowerCase();
          state.vision = VISION_MATRICES[visionParam] ? visionParam : "normal";
        }

        function writeStateToUrl() {
          const url = new URL(window.location.href);
          url.searchParams.set("language", state.language);
          if (state.selectedName) {
            url.searchParams.set("palette", state.selectedName);
          } else {
            url.searchParams.delete("palette");
          }
          if (state.vision !== "normal") {
            url.searchParams.set("vision", state.vision);
          } else {
            url.searchParams.delete("vision");
          }

          history.replaceState({}, "", url);
        }

        function getPaletteByName(name) {
          const target = String(name || "").trim().toLowerCase();
          if (!target) return null;
          return state.palettes.find((palette) => palette.name.toLowerCase() === target) || null;
        }

        function getSelectedPalette() {
          return getPaletteByName(state.selectedName);
        }

        function ensureSelectedPalette() {
          if (!state.palettes.length) return;

          const selected = getPaletteByName(state.selectedName);
          if (selected) {
            state.selectedName = selected.name;
            return;
          }

          const preferred = getPaletteByName(DEFAULT_PALETTE_NAME);
          if (preferred) {
            state.selectedName = preferred.name;
            return;
          }

          state.selectedName = state.palettes[0].name;
        }

        function loadCustomPalettesFromStorage() {
          let parsed = [];
          try {
            parsed = JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) || "[]");
          } catch (_) {
            parsed = [];
          }

          if (!Array.isArray(parsed)) {
            state.customPalettes = [];
            return;
          }

          state.customPalettes = parsed
            .map((item) =>
              makePaletteRecord(
                {
                  id: item?.id || createCustomPaletteId(),
                  name: item?.name || "",
                  source: "My collection",
                  kind: "custom",
                  palette: item?.palette || [],
                  origin: "custom",
                  createdAt: item?.createdAt || 0
                },
                "custom"
              )
            )
            .filter(Boolean);
        }

        function saveCustomPalettesToStorage() {
          const payload = state.customPalettes.map((palette) => ({
            id: palette.id,
            name: palette.name,
            palette: palette.palette,
            createdAt: palette.createdAt || 0
          }));
          try {
            window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(payload));
          } catch (_) {
            // Ignore storage failures (private mode / quota).
          }
        }

        function paletteNameExists(name) {
          const target = String(name || "").trim().toLowerCase();
          if (!target) return false;
          return state.palettes.some((palette) => palette.name.toLowerCase() === target);
        }

        function nextAvailablePaletteName(name) {
          const baseName = normalizePaletteName(name, "My palette");
          if (!paletteNameExists(baseName)) return baseName;

          let counter = 2;
          let next = `${baseName} (${counter})`;
          while (paletteNameExists(next)) {
            counter += 1;
            next = `${baseName} (${counter})`;
          }
          return next;
        }

        function rebuildPaletteCatalog() {
          const merged = [];
          const seen = new Set();

          const pushUnique = (palette) => {
            const record = makePaletteRecord(palette, palette?.origin || "base");
            if (!record) return;
            const key = record.name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(record);
          };

          state.customPalettes
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .forEach((palette) => pushUnique({ ...palette, source: "My collection", kind: "custom", origin: "custom" }));

          state.basePalettes
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((palette) => pushUnique({ ...palette, origin: "base" }));

          state.palettes = merged
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        }

        function filteredPalettes() {
          const query = state.query.trim().toLowerCase();
          const maxColors = Number(state.maxColorsFilter) > 0 ? Math.floor(Number(state.maxColorsFilter)) : 0;
          const targetColor = normalizeHex(state.similarColorFilter);

          const filtered = state.palettes.filter((palette) => {
            const haystack = `${palette.name} ${palette.source} ${palette.kind}`.toLowerCase();
            if (query && !haystack.includes(query)) return false;
            if (maxColors > 0 && (palette.palette?.length || 0) > maxColors) return false;
            return true;
          });

          if (!targetColor) {
            return filtered;
          }

          return filtered
            .map((palette) => ({ palette, distance: paletteClosestColorDistance(palette.palette, targetColor) }))
            .sort((a, b) => a.distance - b.distance)
            .map((item) => item.palette);
        }

        function getDisplayPaletteColors(palette) {
          const baseColors = Array.isArray(palette?.palette) && palette.palette.length ? palette.palette : DEFAULT_COLORS;
          return baseColors.map((color) => transformColorForVision(color, state.vision));
        }

        function colorAt(colors, index) {
          if (!colors.length) return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
          return colors[((index % colors.length) + colors.length) % colors.length];
        }

        function buildDiversePlotPalette(colors, count) {
          const base = Array.isArray(colors) && colors.length ? colors : DEFAULT_COLORS;
          const target = Math.max(1, Math.min(Math.floor(count || base.length), base.length));

          if (base.length <= target) {
            return base.slice();
          }

          const sampled = [];
          const used = new Set();

          for (let i = 0; i < target; i += 1) {
            const ratio = target <= 1 ? 0 : i / (target - 1);
            let idx = Math.round(ratio * (base.length - 1));
            while (used.has(idx) && idx < base.length - 1) {
              idx += 1;
            }
            while (used.has(idx) && idx > 0) {
              idx -= 1;
            }
            if (!used.has(idx)) {
              used.add(idx);
              sampled.push(base[idx]);
            }
          }

          if (sampled.length < target) {
            for (let i = 0; i < base.length && sampled.length < target; i += 1) {
              if (!used.has(i)) {
                used.add(i);
                sampled.push(base[i]);
              }
            }
          }

          // Reorder extremes (start/end/start+1/end-1/...) to maximize contrast between neighbors.
          const diverse = [];
          let left = 0;
          let right = sampled.length - 1;
          while (left <= right) {
            if (left === right) {
              diverse.push(sampled[left]);
            } else {
              diverse.push(sampled[left], sampled[right]);
            }
            left += 1;
            right -= 1;
          }

          return diverse;
        }

        function renderSwatchesHtml(colors, limit) {
          return colors
            .slice(0, limit)
            .map((color) => `<span class="swatch" style="background:${color};"></span>`)
            .join("");
        }

        function renderPaletteHexValues(colors) {
          if (!paletteHexList || !paletteHexMeta) return;

          const safeColors = Array.isArray(colors) ? colors.map(normalizeHex).filter(Boolean) : [];
          paletteHexMeta.textContent = `${safeColors.length} colors`;

          if (!safeColors.length) {
            paletteHexList.innerHTML = '<li class="palette-hex-empty">No colors available.</li>';
            return;
          }

          paletteHexList.innerHTML = safeColors
            .map((color) => {
              const hex = color.toUpperCase();
              return `
                <li class="palette-hex-item">
                  <span class="palette-hex-swatch" style="background:${hex};"></span>
                  <span class="palette-hex-code">${hex}</span>
                </li>
              `;
            })
            .join("");
        }

        function resetHeroLogoTheme() {
          if (!heroLogo) return;
          heroLogo.style.setProperty("--hero-glow", "rgba(21, 46, 94, 0.22)");
          heroLogo.style.setProperty("--hero-bg-main", "rgba(22, 71, 163, 0.16)");
          heroLogo.style.setProperty("--hero-bg-fade", "rgba(22, 71, 163, 0.02)");
        }

        function relativeLuminance(hex) {
          const rgb = hexToRgb(hex);
          const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        }

        function contrastRatio(first, second) {
          const light = Math.max(relativeLuminance(first), relativeLuminance(second));
          const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
          return (light + 0.05) / (dark + 0.05);
        }

        function interfaceAccentFromPalette(colors) {
          const candidates = colors.map(normalizeHex).filter(Boolean);
          if (!candidates.length) return "#13294b";

          const ranked = candidates
            .map((color) => {
              const rgb = hexToRgb(color);
              const channels = [rgb.r, rgb.g, rgb.b].map((channel) => channel / 255);
              const maximum = Math.max(...channels);
              const minimum = Math.min(...channels);
              const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
              const luminance = relativeLuminance(color);
              const middleWeight = 1 - Math.min(1, Math.abs(luminance - 0.42) / 0.42);
              return { color, score: saturation * 0.72 + middleWeight * 0.28 };
            })
            .sort((first, second) => second.score - first.score);

          const selected = ranked[0].color;
          const luminance = relativeLuminance(selected);
          if (luminance > 0.9) return mixColor(selected, "#000000", 0.18);
          if (luminance < 0.025) return mixColor(selected, "#ffffff", 0.18);
          return selected;
        }

        function resetInterfaceTheme() {
          const rootStyle = document.documentElement?.style;
          if (!rootStyle) return;
          rootStyle.setProperty("--interface-accent", "#13294b");
          rootStyle.setProperty("--interface-accent-hover", "#2957a4");
          rootStyle.setProperty("--interface-accent-text", "#fffefa");
          rootStyle.setProperty("--interface-accent-soft", "#edf2fb");
          rootStyle.setProperty("--interface-accent-border", "#cad8f2");
          rootStyle.setProperty("--interface-accent-ring", "rgba(41, 87, 164, 0.16)");
        }

        function applyInterfaceTheme(colors) {
          const rootStyle = document.documentElement?.style;
          if (!rootStyle) return;

          if (!colors.length) {
            resetInterfaceTheme();
            return;
          }

          const accent = interfaceAccentFromPalette(colors);
          const darkText = "#111318";
          const lightText = "#fffefa";
          const text = contrastRatio(accent, darkText) >= contrastRatio(accent, lightText) ? darkText : lightText;
          const hover = mixColor(accent, "#000000", text === darkText ? 0.08 : 0.2);
          const soft = mixColor(accent, "#ffffff", 0.88);
          const border = mixColor(accent, "#ffffff", 0.58);
          const rgb = hexToRgb(accent);

          rootStyle.setProperty("--interface-accent", accent);
          rootStyle.setProperty("--interface-accent-hover", hover);
          rootStyle.setProperty("--interface-accent-text", text);
          rootStyle.setProperty("--interface-accent-soft", soft);
          rootStyle.setProperty("--interface-accent-border", border);
          rootStyle.setProperty("--interface-accent-ring", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
        }

        function applyHeroLogoTheme(colors) {
          if (!heroLogo) return;
          if (!colors.length) {
            resetHeroLogoTheme();
            return;
          }

          const base = hexToRgb(colors[0]);
          const accent = hexToRgb(colors[Math.min(1, colors.length - 1)] || colors[0]);
          heroLogo.style.setProperty("--hero-glow", `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.34)`);
          heroLogo.style.setProperty("--hero-bg-main", `rgba(${base.r}, ${base.g}, ${base.b}, 0.20)`);
          heroLogo.style.setProperty("--hero-bg-fade", `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.03)`);
        }

        function resetPalettePillTheme() {
          const rootStyle = document.documentElement?.style;
          if (rootStyle) {
            rootStyle.setProperty("--palette-pill-bg", "var(--green-bg)");
            rootStyle.setProperty("--palette-pill-border", "#c4d8ff");
          }

          resetHeroLogoTheme();
          resetInterfaceTheme();
          if (!palettePill || !paletteDot) return;
          palettePill.style.removeProperty("background");
          palettePill.style.removeProperty("border-color");
          palettePill.style.color = "var(--text)";
          paletteDot.style.background = "var(--green-m)";
          paletteDot.style.boxShadow = "0 0 0 4px var(--green-ring)";
          if (paletteLabel) {
            paletteLabel.textContent = "PALETTE: DEFAULT";
          }
        }

        function applyPalettePillTheme(colors) {
          if (!colors.length) {
            resetPalettePillTheme();
            return;
          }

          applyHeroLogoTheme(colors);
          applyInterfaceTheme(colors);

          if (!palettePill || !paletteDot) return;

          const base = colors[0];
          const accent = colors[Math.min(1, colors.length - 1)] || base;
          const bg = mixColor(base, "#ffffff", 0.82);
          const border = mixColor(accent, "#ffffff", 0.58);
          const rgb = hexToRgb(accent);

          const rootStyle = document.documentElement?.style;
          if (rootStyle) {
            rootStyle.setProperty("--palette-pill-bg", bg);
            rootStyle.setProperty("--palette-pill-border", border);
          }

          palettePill.style.color = "var(--text)";
          paletteDot.style.background = accent;
          paletteDot.style.boxShadow = `0 0 0 4px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`;
        }

        function buildRampFromPalette(colors, count) {
          if (!colors.length) return [];
          if (colors.length === 1) {
            return Array.from({ length: count }, () => colors[0]);
          }

          const ramp = [];
          const maxIndex = colors.length - 1;
          for (let i = 0; i < count; i += 1) {
            const t = count <= 1 ? 0 : i / (count - 1);
            const position = t * maxIndex;
            const left = Math.floor(position);
            const right = Math.min(maxIndex, left + 1);
            ramp.push(mixColor(colors[left], colors[right], position - left));
          }
          return ramp;
        }

        function applyPaletteToLogoWithColors(paletteName, colors) {
          if (!colors.length) {
            wcPaths.forEach((path) => {
              path.style.fill = path.dataset.originalFill;
            });
            resetPalettePillTheme();
            return;
          }

          const ramp = buildRampFromPalette(colors, wcPaths.length);
          wcPaths.forEach((path, index) => {
            path.style.fill = ramp[index] || colors[0];
          });

          applyPalettePillTheme(colors);
          if (paletteLabel) {
            paletteLabel.textContent = `PALETTE: ${String(paletteName || "DEFAULT").toUpperCase()}`;
          }
        }

        function interpolatePalette(colors, t) {
          if (!colors.length) return "#000000";
          if (colors.length === 1) return colors[0];
          const clamped = Math.max(0, Math.min(1, t));
          const maxIndex = colors.length - 1;
          const pos = clamped * maxIndex;
          const left = Math.floor(pos);
          const right = Math.min(maxIndex, left + 1);
          return mixColor(colors[left], colors[right], pos - left);
        }

        function renderSelection() {
          const selected = getSelectedPalette();
          if (!selected) {
            comboName.textContent = "No palette selected";
            comboSwatches.innerHTML = "";
            renderPaletteHexValues([]);
            resetPalettePillTheme();
            return;
          }

          const displayColors = getDisplayPaletteColors(selected);
          comboName.textContent = selected.name;
          comboSwatches.innerHTML = renderSwatchesHtml(displayColors, 10);
          renderPaletteHexValues(displayColors);

          applyPaletteToLogoWithColors(selected.name, displayColors);
        }

        function refreshPaletteDependentViews() {
          ensureSelectedPalette();
          writeStateToUrl();
          renderSelection();
          renderOptions();
          renderPlots();
          syncSpaceDataWithCatalog();
          drawPaletteSpace();
          renderStudioCollection();
        }

        function setStudioMessage(text, status) {
          if (!studioMessage) return;
          studioMessage.textContent = String(text || "");
          studioMessage.classList.remove("is-error", "is-success");
          if (status === "error") {
            studioMessage.classList.add("is-error");
          } else if (status === "success") {
            studioMessage.classList.add("is-success");
          }
        }

        function renderStudioDraft() {
          if (!studioDraftList) return;

          state.draftColors = uniqueHexColors(state.draftColors, MAX_CUSTOM_COLORS);
          if (studioNameInput && state.draftName !== studioNameInput.value) {
            studioNameInput.value = state.draftName;
          }

          if (!state.draftColors.length) {
            studioDraftList.innerHTML = "";
            return;
          }

          studioDraftList.innerHTML = state.draftColors
            .map(
              (color, index) => `
                <li class="studio-chip">
                  <span class="studio-chip-swatch" style="background:${color};"></span>
                  <span class="studio-chip-code">${color.toUpperCase()}</span>
                  <button type="button" class="studio-chip-remove" data-remove-index="${index}" aria-label="Remove color">×</button>
                </li>
              `
            )
            .join("");
        }

        function downloadPaletteJson(filename, payload) {
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }

        function renderStudioCollection() {
          if (!studioCollection || !studioMeta) return;

          const sorted = state.customPalettes
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          studioMeta.textContent = `${sorted.length} saved`;

          if (!sorted.length) {
            studioCollection.innerHTML = '<div class="studio-empty">No saved palettes yet.</div>';
            return;
          }

          studioCollection.innerHTML = sorted
            .map((palette) => {
              const swatches = renderSwatchesHtml(palette.palette, 12);
              return `
                <article class="studio-palette-item">
                  <div class="studio-palette-head">
                    <span class="studio-palette-name">${escapeHtml(palette.name)}</span>
                    <span class="studio-palette-meta">${palette.palette.length} colors</span>
                  </div>
                  <div class="swatch-row">${swatches}</div>
                  <div class="studio-inline">
                    <button type="button" class="studio-btn" data-action="apply" data-id="${escapeAttr(palette.id)}">Apply</button>
                    <button type="button" class="studio-btn" data-action="export" data-id="${escapeAttr(palette.id)}">JSON</button>
                    <button type="button" class="studio-btn danger" data-action="delete" data-id="${escapeAttr(palette.id)}">Delete</button>
                  </div>
                </article>
              `;
            })
            .join("");
        }

        function addColorToDraft(rawColor) {
          const hex = normalizeHex(rawColor);
          if (!hex) {
            setStudioMessage("Invalid color. Use the #RRGGBB format.", "error");
            return;
          }

          if (state.draftColors.includes(hex)) {
            setStudioMessage("This color is already in the draft.", "error");
            return;
          }

          if (state.draftColors.length >= MAX_CUSTOM_COLORS) {
            setStudioMessage(`Limit of ${MAX_CUSTOM_COLORS} colors per palette.`, "error");
            return;
          }

          state.draftColors.push(hex);
          renderStudioDraft();
          setStudioMessage("Color added to draft.", "success");
        }

        function addCurrentPaletteToDraft() {
          const selected = getSelectedPalette();
          if (!selected) {
            setStudioMessage("Select a palette before adding colors.", "error");
            return;
          }

          const merged = uniqueHexColors([...state.draftColors, ...selected.palette], MAX_CUSTOM_COLORS);
          const added = merged.length - state.draftColors.length;
          state.draftColors = merged;

          if (!state.draftName) {
            state.draftName = `${selected.name} remix`;
          }

          renderStudioDraft();
          if (added > 0) {
            setStudioMessage(`${added} color(s) added from the current palette.`, "success");
          } else {
            setStudioMessage("All colors from the current palette are already in the draft.", "error");
          }
        }

        function exportPaletteByNameAndColors(name, colors) {
          const safeName = normalizePaletteName(name, "my-palette")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          const safeColors = uniqueHexColors(colors, MAX_CUSTOM_COLORS);
          if (!safeColors.length) {
            setStudioMessage("Add colors before exporting.", "error");
            return;
          }

          downloadPaletteJson(`${safeName || "palette"}.json`, {
            name: normalizePaletteName(name, "My palette"),
            palette: safeColors,
            source: "My collection",
            kind: "custom"
          });
          setStudioMessage("JSON exported successfully.", "success");
        }

        function exportSelectedPaletteFromWorkbench() {
          const selected = getSelectedPalette();
          if (!selected) {
            setStudioMessage("Select a palette before exporting JSON.", "error");
            return;
          }

          const colors = Array.isArray(selected.palette) ? selected.palette.map(normalizeHex).filter(Boolean) : [];
          if (!colors.length) {
            setStudioMessage("Selected palette has no colors to export.", "error");
            return;
          }

          const safeName = normalizePaletteName(selected.name, "selected-palette")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          downloadPaletteJson(`${safeName || "selected-palette"}.json`, {
            name: normalizePaletteName(selected.name, "Selected palette"),
            palette: colors,
            source: String(selected.source || ""),
            kind: String(selected.kind || ""),
            origin: String(selected.origin || "base")
          });
          setStudioMessage(`JSON exported: ${selected.name}.`, "success");
        }

        function saveDraftPalette() {
          const rawName = studioNameInput ? studioNameInput.value : state.draftName;
          const colors = uniqueHexColors(state.draftColors, MAX_CUSTOM_COLORS);

          if (colors.length < 2) {
            setStudioMessage("Build a palette with at least 2 colors to save.", "error");
            return;
          }

          const finalName = nextAvailablePaletteName(rawName || "My palette");
          const record = makePaletteRecord(
            {
              id: createCustomPaletteId(),
              name: finalName,
              source: "My collection",
              kind: "custom",
              palette: colors,
              origin: "custom",
              createdAt: Date.now()
            },
            "custom"
          );

          if (!record) {
            setStudioMessage("Could not save the palette.", "error");
            return;
          }

          state.customPalettes.push(record);
          saveCustomPalettesToStorage();
          rebuildPaletteCatalog();

          state.selectedName = record.name;
          state.draftName = record.name;
          refreshPaletteDependentViews();
          renderStudioDraft();
          setStudioMessage("Palette saved to your collection.", "success");
        }

        function clearDraftPalette() {
          state.draftName = "";
          state.draftColors = [];
          if (studioNameInput) studioNameInput.value = "";
          if (studioColorInput) studioColorInput.value = "";
          renderStudioDraft();
          setStudioMessage("Draft cleared.", "success");
        }

        function removeCustomPaletteById(id) {
          const before = state.customPalettes.length;
          const target = state.customPalettes.find((palette) => palette.id === id);
          state.customPalettes = state.customPalettes.filter((palette) => palette.id !== id);
          if (state.customPalettes.length === before) return;

          saveCustomPalettesToStorage();
          rebuildPaletteCatalog();

          if (target && target.name.toLowerCase() === state.selectedName.toLowerCase()) {
            ensureSelectedPalette();
          }

          refreshPaletteDependentViews();
          setStudioMessage("Palette removed from your collection.", "success");
        }

        function clearCustomPaletteLibrary() {
          if (!state.customPalettes.length) {
            setStudioMessage("Your collection is already empty.", "error");
            return;
          }

          const confirmed = window.confirm("Do you want to remove all palettes from your collection?");
          if (!confirmed) return;

          state.customPalettes = [];
          saveCustomPalettesToStorage();
          rebuildPaletteCatalog();
          ensureSelectedPalette();
          refreshPaletteDependentViews();
          setStudioMessage("Collection cleared.", "success");
        }

        function renderOptions() {
          const filtered = filteredPalettes();
          countBadge.textContent = `${filtered.length} palettes`;

          if (!filtered.length) {
            optionsList.innerHTML = '<div style="padding:12px;color:#6a6a66;font-size:12px;">No palettes found.</div>';
            return;
          }

          const visible = filtered.slice(0, state.optionLimit);
          const selectedName = state.selectedName.toLowerCase();

          const rows = visible
            .map((palette) => {
              const active = palette.name.toLowerCase() === selectedName;
              const swatches = renderSwatchesHtml(getDisplayPaletteColors(palette), 8);
              const kind = palette.kind || "unknown";
              const source = palette.source || "source not available";
              return `
                <button
                  type="button"
                  class="option-item${active ? " active" : ""}"
                  data-name="${escapeAttr(palette.name)}"
                  role="option"
                  aria-selected="${active ? "true" : "false"}"
                >
                  <span class="option-name">${escapeHtml(palette.name)}</span>
                  <div class="swatch-row">${swatches}</div>
                  <span class="option-meta">${palette.palette.length} colors • ${escapeHtml(kind)}</span>
                  <span class="option-meta">${escapeHtml(source)}</span>
                </button>
              `;
            })
            .join("");

          const moreButton =
            filtered.length > visible.length
              ? `<button type="button" class="load-more" id="loadMoreOptions">Load more (${filtered.length - visible.length})</button>`
              : "";

          optionsList.innerHTML = `${rows}${moreButton}`;

          optionsList.querySelectorAll(".option-item").forEach((button) => {
            button.addEventListener("click", () => {
              const nextName = button.dataset.name || "";
              if (!nextName) return;
              selectPalette(nextName);
              closeDropdown();
            });
          });

          const loadMoreButton = document.getElementById("loadMoreOptions");
          if (loadMoreButton) {
            loadMoreButton.addEventListener("click", () => {
              state.optionLimit += PAGE_SIZE;
              renderOptions();
            });
          }
        }

        function renderEmptyPlots(message) {
          Object.values(plotSvgs).forEach((svg) => {
            svg.innerHTML = `
              <rect x="12" y="12" width="296" height="176" rx="4" fill="#f7f5ef" stroke="#d9d6cd"></rect>
              <text x="160" y="104" text-anchor="middle" font-size="11" fill="#5f615f" font-family="Outfit, sans-serif">
                ${escapeHtml(message)}
              </text>
            `;
          });
        }

        function renderBarPlot(colors) {
          const values = [7, 4, 8, 5, 6, 3];
          const plotColors = buildDiversePlotPalette(colors, values.length);
          const max = 9;
          const left = 42;
          const right = 292;
          const baseline = 164;
          const top = 22;
          const available = right - left;
          const step = available / values.length;
          const barWidth = step * 0.62;

          const bars = values
            .map((value, index) => {
              const h = ((baseline - top) * value) / max;
              const x = left + index * step + (step - barWidth) / 2;
              const y = baseline - h;
              return `
                <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${colorAt(plotColors, index)}"></rect>
              `;
            })
            .join("");

          return bars;
        }

        function renderLinePlot(colors) {
          const series = [
            { name: "A", values: [2, 3, 3, 5, 6, 6, 8] },
            { name: "B", values: [6, 5, 7, 6, 7, 8, 7] },
            { name: "C", values: [3, 4, 5, 4, 3, 5, 6] }
          ];
          const plotColors = buildDiversePlotPalette(colors, series.length);
          const left = 38;
          const right = 272;
          const top = 22;
          const bottom = 164;
          const max = 10;
          const step = (right - left) / (series[0].values.length - 1);

          const lines = series
            .map((item, seriesIndex) => {
              const color = colorAt(plotColors, seriesIndex);
              const points = item.values.map((value, index) => ({
                x: left + index * step,
                y: bottom - ((bottom - top) * value) / max
              }));
              const path = points
                .map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
                .join(" ");
              const last = points[points.length - 1];
              return `
                <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                <circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3.5" fill="${color}" stroke="#fffefa" stroke-width="1.5"></circle>
                <text x="${(last.x + 8).toFixed(2)}" y="${(last.y + 3).toFixed(2)}" font-size="8" font-weight="700" fill="${color}" font-family="Outfit, sans-serif">${item.name}</text>
              `;
            })
            .join("");

          return `
            ${lines}
          `;
        }

        function renderScatterPlot(colors) {
          const plotColors = buildDiversePlotPalette(colors, 3);
          const left = 38;
          const right = 292;
          const top = 22;
          const bottom = 164;
          const points = Array.from({ length: 30 }, (_, index) => {
            const group = index % 3;
            const xValue = 8 + ((index * 17 + group * 11) % 88);
            const yValue = Math.min(96, 12 + xValue * (0.48 + group * 0.1) + ((index * 13) % 25));
            return {
              x: left + ((right - left) * xValue) / 100,
              y: bottom - ((bottom - top) * yValue) / 100,
              group
            };
          });

          const circles = points
            .map(
              (point) =>
                `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.4" fill="${colorAt(plotColors, point.group)}" fill-opacity="0.78" stroke="#fffefa" stroke-width="1"></circle>`
            )
            .join("");

          return circles;
        }

        function renderBoxPlot(colors) {
          const groups = [
            { min: 18, q1: 32, med: 44, q3: 57, max: 72 },
            { min: 15, q1: 28, med: 36, q3: 50, max: 66 },
            { min: 22, q1: 35, med: 46, q3: 60, max: 78 },
            { min: 12, q1: 24, med: 40, q3: 54, max: 70 }
          ];
          const plotColors = buildDiversePlotPalette(colors, groups.length);
          const left = 58;
          const right = 278;
          const top = 22;
          const bottom = 164;
          const step = (right - left) / (groups.length - 1);
          const y = (value) => bottom - ((bottom - top) * value) / 80;

          const boxes = groups
            .map((group, index) => {
              const x = left + index * step;
              const boxTop = y(group.q3);
              const boxBottom = y(group.q1);
              const median = y(group.med);
              const minY = y(group.min);
              const maxY = y(group.max);
              const color = colorAt(plotColors, index);
              return `
                <line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="${color}" stroke-width="1.5"></line>
                <line x1="${x - 10}" y1="${minY}" x2="${x + 10}" y2="${minY}" stroke="${color}" stroke-width="1.5"></line>
                <line x1="${x - 10}" y1="${maxY}" x2="${x + 10}" y2="${maxY}" stroke="${color}" stroke-width="1.5"></line>
                <rect x="${x - 16}" y="${boxTop}" width="32" height="${boxBottom - boxTop}" rx="2" fill="${rgba(
                  color,
                  0.28
                )}" stroke="${color}" stroke-width="1.5"></rect>
                <line x1="${x - 16}" y1="${median}" x2="${x + 16}" y2="${median}" stroke="${color}" stroke-width="2"></line>
              `;
            })
            .join("");

          return boxes;
        }

        function renderHistogram(colors) {
          const bins = [2, 5, 6, 9, 8, 6, 4, 2];
          const max = 10;
          const left = 38;
          const right = 292;
          const baseline = 164;
          const top = 22;
          const width = right - left;
          const barW = width / bins.length;

          const bars = bins
            .map((value, index) => {
              const h = ((baseline - top) * value) / max;
              const x = left + index * barW + 1;
              const y = baseline - h;
              const fill = interpolatePalette(colors, index / Math.max(1, bins.length - 1));
              return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(barW - 1).toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}" stroke="#fffefa" stroke-width="0.75"></rect>`;
            })
            .join("");

          return bars;
        }

        function renderHeatmap(colors) {
          const rows = 5;
          const cols = 6;
          const left = 43;
          const top = 30;
          const cw = 39;
          const ch = 27;

          const cells = [];
          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const x = left + col * cw;
              const y = top + row * ch;
              const value = (Math.sin((row + 1) * (col + 2)) + 1) / 2;
              cells.push(
                `<rect x="${x}" y="${y}" width="${cw - 2}" height="${ch - 2}" rx="2" fill="${interpolatePalette(
                  colors,
                  value
                )}" stroke="#fffefa" stroke-width="1"></rect>`
              );
            }
          }

          return cells.join("");
        }

        function renderAreaPlot(colors) {
          const series = [
            [2, 3, 3, 4, 4, 5, 4],
            [1, 1, 2, 2, 3, 2, 3],
            [1, 2, 1, 2, 1, 2, 2]
          ];
          const plotColors = buildDiversePlotPalette(colors, series.length);
          const left = 38;
          const right = 292;
          const top = 22;
          const bottom = 164;
          const max = 10;
          const step = (right - left) / (series[0].length - 1);
          const cumulative = new Array(series[0].length).fill(0);

          const areas = series
            .map((row, rowIndex) => {
              const lower = cumulative.slice();
              const upper = row.map((value, idx) => {
                cumulative[idx] += value;
                return cumulative[idx];
              });
              const upperPoints = upper.map((value, idx) => {
                const x = left + idx * step;
                const y = bottom - ((bottom - top) * value) / max;
                return { x, y };
              });
              const lowerPoints = lower
                .map((value, idx) => ({
                  x: left + idx * step,
                  y: bottom - ((bottom - top) * value) / max
                }))
                .reverse();
              const area = [
                ...upperPoints.map((point, idx) => `${idx ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
                ...lowerPoints.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
                "Z"
              ].join(" ");
              const color = colorAt(plotColors, rowIndex);
              return `<path d="${area}" fill="${color}" fill-opacity="0.86" stroke="#fffefa" stroke-width="1"></path>`;
            })
            .join("");

          return areas;
        }

        function polarToCartesian(cx, cy, radius, angleDeg) {
          const angleRad = ((angleDeg - 90) * Math.PI) / 180;
          return {
            x: cx + radius * Math.cos(angleRad),
            y: cy + radius * Math.sin(angleRad)
          };
        }

        function donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
          const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
          const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
          const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
          const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
          const largeArc = endAngle - startAngle > 180 ? 1 : 0;

          return [
            `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
            `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
            `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
            "Z"
          ].join(" ");
        }

        function renderDonutPlot(colors) {
          const values = [22, 18, 15, 12, 10, 8];
          const plotColors = buildDiversePlotPalette(colors, values.length);
          const total = values.reduce((acc, value) => acc + value, 0);
          let angle = 0;
          const cx = 160;
          const cy = 100;
          const outer = 70;
          const inner = 34;

          const paths = values
            .map((value, index) => {
              const span = (value / total) * 360;
              const start = angle;
              const end = angle + span;
              angle = end;
              return `<path d="${donutSegmentPath(cx, cy, outer, inner, start, end)}" fill="${colorAt(plotColors, index)}" stroke="#fffefa" stroke-width="2"></path>`;
            })
            .join("");

          return `
            ${paths}
            <circle cx="${cx}" cy="${cy}" r="${inner - 1}" fill="#fffefa"></circle>
          `;
        }

        function renderLollipopPlot(colors) {
          const values = [9, 8, 7, 6, 5];
          const labels = ["A", "B", "C", "D", "E"];
          const plotColors = buildDiversePlotPalette(colors, values.length);
          const max = 10;
          const left = 54;
          const right = 282;
          const top = 30;
          const step = 28;

          const items = values
            .map((value, index) => {
              const y = top + index * step;
              const x = left + ((right - left) * value) / max;
              const color = colorAt(plotColors, index);
              return `
                <text x="${left - 10}" y="${y + 3}" text-anchor="end" font-size="8" font-weight="700" fill="#5f615f" font-family="Outfit, sans-serif">${labels[index]}</text>
                <line x1="${left}" y1="${y}" x2="${x}" y2="${y}" stroke="${rgba(color, 0.56)}" stroke-width="3"></line>
                <circle cx="${x}" cy="${y}" r="5.5" fill="${color}" stroke="#fffefa" stroke-width="1.5"></circle>
              `;
            })
            .join("");

          return items;
        }

        function renderPlots() {
          const selected = getSelectedPalette();
          const colors = getDisplayPaletteColors(selected);
          const palette = colors.length ? colors : DEFAULT_COLORS;

          plotSvgs.bar.innerHTML = renderBarPlot(palette);
          plotSvgs.line.innerHTML = renderLinePlot(palette);
          plotSvgs.scatter.innerHTML = renderScatterPlot(palette);
          plotSvgs.box.innerHTML = renderBoxPlot(palette);
          plotSvgs.hist.innerHTML = renderHistogram(palette);
          plotSvgs.heat.innerHTML = renderHeatmap(palette);
          plotSvgs.area.innerHTML = renderAreaPlot(palette);
          plotSvgs.donut.innerHTML = renderDonutPlot(palette);
          plotSvgs.lollipop.innerHTML = renderLollipopPlot(palette);
        }

        function openDropdown() {
          dropdown.hidden = false;
          comboButton.setAttribute("aria-expanded", "true");
          searchInput.focus();
          searchInput.select();
        }

        function closeDropdown() {
          dropdown.hidden = true;
          comboButton.setAttribute("aria-expanded", "false");
        }

        function selectPalette(nextName) {
          const selected = getPaletteByName(nextName);
          if (!selected) return;
          state.selectedName = selected.name;
          refreshPaletteDependentViews();
        }

        function applyWorkbenchFilters() {
          state.optionLimit = PAGE_SIZE;
          renderOptions();
        }

        function setWorkbenchMaxColorsFilter(rawValue) {
          const parsed = Number(rawValue);
          const next = Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 0;
          state.maxColorsFilter = next;
          if (maxColorsFilterInput && next > 0 && maxColorsFilterInput.value !== String(next)) {
            maxColorsFilterInput.value = String(next);
          } else if (maxColorsFilterInput && next === 0 && maxColorsFilterInput.value.trim()) {
            maxColorsFilterInput.value = "";
          }
          applyWorkbenchFilters();
        }

        function setWorkbenchSimilarColorFilter(rawValue) {
          const raw = String(rawValue || "").trim();
          if (!raw) {
            state.similarColorFilter = "";
            if (workbenchColorFilterHex) workbenchColorFilterHex.value = "";
            applyWorkbenchFilters();
            return;
          }

          const normalized = normalizeHex(raw);
          if (!normalized) {
            state.similarColorFilter = "";
            applyWorkbenchFilters();
            return;
          }

          state.similarColorFilter = normalized;
          if (workbenchColorFilterHex && workbenchColorFilterHex.value !== normalized.toUpperCase()) {
            workbenchColorFilterHex.value = normalized.toUpperCase();
          }
          if (workbenchColorFilterPicker && workbenchColorFilterPicker.value.toLowerCase() !== normalized) {
            workbenchColorFilterPicker.value = normalized;
          }
          applyWorkbenchFilters();
        }

        function bindEvents() {
          comboButton.addEventListener("click", () => {
            if (dropdown.hidden) {
              openDropdown();
            } else {
              closeDropdown();
            }
          });

          searchInput.addEventListener("input", () => {
            state.query = searchInput.value;
            state.optionLimit = PAGE_SIZE;
            renderOptions();
          });

          maxColorsFilterInput?.addEventListener("input", () => {
            setWorkbenchMaxColorsFilter(maxColorsFilterInput.value);
          });

          workbenchColorFilterPicker?.addEventListener("input", () => {
            setWorkbenchSimilarColorFilter(workbenchColorFilterPicker.value);
          });

          workbenchColorFilterHex?.addEventListener("input", () => {
            const raw = workbenchColorFilterHex.value;
            if (!raw.trim()) {
              setWorkbenchSimilarColorFilter("");
              return;
            }
            const normalized = normalizeHex(raw);
            if (normalized) {
              setWorkbenchSimilarColorFilter(normalized);
            }
          });

          workbenchColorFilterHex?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            setWorkbenchSimilarColorFilter(workbenchColorFilterHex.value);
          });

          workbenchColorFilterHex?.addEventListener("blur", () => {
            setWorkbenchSimilarColorFilter(workbenchColorFilterHex.value);
          });

          workbenchColorFilterClear?.addEventListener("click", () => {
            state.similarColorFilter = "";
            if (workbenchColorFilterHex) workbenchColorFilterHex.value = "";
            if (workbenchColorFilterPicker) workbenchColorFilterPicker.value = "#dfe3ce";
            applyWorkbenchFilters();
          });

          visionMode.addEventListener("change", () => {
            const nextMode = String(visionMode.value || "normal").toLowerCase();
            state.vision = VISION_MATRICES[nextMode] ? nextMode : "normal";
            writeStateToUrl();
            renderSelection();
            renderOptions();
            renderPlots();
          });

          workbenchExportBtn?.addEventListener("click", () => {
            exportSelectedPaletteFromWorkbench();
          });

          document.addEventListener("click", (event) => {
            if (!comboWrap.contains(event.target)) {
              closeDropdown();
            }
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              closeDropdown();
            }
          });
        }

        function bindStudioEvents() {
          if (!studioDraftList) return;

          studioNameInput?.addEventListener("input", () => {
            state.draftName = studioNameInput.value;
          });

          studioAddColorBtn?.addEventListener("click", () => {
            addColorToDraft(studioColorInput ? studioColorInput.value : "");
            if (studioColorInput) {
              studioColorInput.value = "";
              studioColorInput.focus();
            }
          });

          studioColorInput?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addColorToDraft(studioColorInput.value);
            studioColorInput.value = "";
          });

          studioColorPicker?.addEventListener("input", () => {
            if (!studioColorInput) return;
            studioColorInput.value = studioColorPicker.value.toUpperCase();
          });

          studioAddCurrentBtn?.addEventListener("click", () => {
            addCurrentPaletteToDraft();
          });

          studioSaveBtn?.addEventListener("click", () => {
            saveDraftPalette();
          });

          studioExportBtn?.addEventListener("click", () => {
            exportPaletteByNameAndColors(studioNameInput?.value || state.draftName || "My palette", state.draftColors);
          });

          studioClearBtn?.addEventListener("click", () => {
            clearDraftPalette();
          });

          studioClearLibraryBtn?.addEventListener("click", () => {
            clearCustomPaletteLibrary();
          });

          studioDraftList.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target.closest("button[data-remove-index]") : null;
            if (!target) return;

            const index = Number(target.getAttribute("data-remove-index"));
            if (!Number.isInteger(index) || index < 0 || index >= state.draftColors.length) return;
            state.draftColors.splice(index, 1);
            renderStudioDraft();
            setStudioMessage("Color removed from draft.", "success");
          });

          studioCollection?.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
            if (!target) return;

            const action = target.getAttribute("data-action");
            const id = target.getAttribute("data-id");
            if (!action || !id) return;

            const palette = state.customPalettes.find((item) => item.id === id);
            if (!palette) return;

            if (action === "apply") {
              selectPalette(palette.name);
              setStudioMessage(`Palette applied: ${palette.name}.`, "success");
              return;
            }

            if (action === "export") {
              exportPaletteByNameAndColors(palette.name, palette.palette);
              return;
            }

            if (action === "delete") {
              removeCustomPaletteById(id);
            }
          });
        }

        async function loadPalettes() {
          let raw;
          try {
            const response = await fetch(DATA_URL, { cache: "no-cache" });
            if (!response.ok) {
              throw new Error(`Could not load ${DATA_URL}: ${response.status}`);
            }
            raw = await response.json();
          } catch (error) {
            try {
              await loadScriptOnce(DATA_FALLBACK_SCRIPT);
            } catch (_) {
              // Keep original error flow below.
            }
            if (Array.isArray(window.__LOCAL_PALETTES__) && window.__LOCAL_PALETTES__.length) {
              raw = window.__LOCAL_PALETTES__;
            } else {
              throw error;
            }
          }

          const list = Array.isArray(raw) ? raw : [];

          state.basePalettes = list
            .map((item) =>
              makePaletteRecord(
                {
                  name: item?.name || "",
                  source: item?.source || "",
                  kind: item?.kind || "",
                  palette: item?.palette || [],
                  origin: "base"
                },
                "base"
              )
            )
            .filter(Boolean);
        }

        function handleLoadError(error) {
          countBadge.textContent = "Error";
          comboName.textContent = "Load failed";
          comboSwatches.innerHTML = "";
          optionsList.innerHTML =
            '<div style="padding:12px;color:#6a6a66;font-size:12px;">Failed to load local palettes. Run <code>python3 -m http.server 8000</code> and open http://localhost:8000.</div>';
          renderEmptyPlots("No data");
          renderPaletteHexValues([]);
          resetPalettePillTheme();
          renderStudioDraft();
          renderStudioCollection();
        }

        // ── Palette Space ──────────────────────────────────────────────────────
        const COORDS_URL = "./data/palette_coords.json";

        const SPACE_KIND_COLORS = {
          qualitative : "#4e79a7",
          sequential  : "#f28e2b",
          diverging   : "#e15759",
          cyclic      : "#76b7b2",
          ""          : "#bab0ac",
        };

        const psCanvas  = document.getElementById("psCanvas");
        const psTooltip = document.getElementById("psTooltip");
        const psWrap    = document.getElementById("psWrap");

        let spaceBaseData    = [];
        let spaceData        = [];
        let spacePoints      = [];
        let spaceHovered     = -1;
        let spaceZoom        = 1;
        let spacePanX        = 0;
        let spacePanY        = 0;
        let spaceIsDragging  = false;
        let spaceDragStartX  = 0;
        let spaceDragStartY  = 0;
        let spaceDragPanX    = 0;
        let spaceDragPanY    = 0;
        let spaceTouchPinching      = false;
        let spaceTouchMoved         = false;
        let spaceTouchHadPinch      = false;
        let spaceTouchStartDistance = 0;
        let spaceTouchStartZoom     = 1;
        let spaceTouchAnchorWorldX  = 0;
        let spaceTouchAnchorWorldY  = 0;

        function spaceClamp(value, min, max) {
          return Math.max(min, Math.min(max, value));
        }

        function spaceHash(input) {
          const text = String(input || "");
          let hash = 2166136261;
          for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
          }
          return hash >>> 0;
        }

        function paletteFeature(colors) {
          const safe = uniqueHexColors(colors || [], MAX_CUSTOM_COLORS);
          if (!safe.length) return null;

          const rgbs = safe.map((color) => hexToRgb(color));
          const len = rgbs.length || 1;

          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          rgbs.forEach((rgb) => {
            sumR += rgb.r;
            sumG += rgb.g;
            sumB += rgb.b;
          });

          const meanR = sumR / len;
          const meanG = sumG / len;
          const meanB = sumB / len;

          let varR = 0;
          let varG = 0;
          let varB = 0;
          rgbs.forEach((rgb) => {
            varR += (rgb.r - meanR) ** 2;
            varG += (rgb.g - meanG) ** 2;
            varB += (rgb.b - meanB) ** 2;
          });

          return {
            meanR: meanR / 255,
            meanG: meanG / 255,
            meanB: meanB / 255,
            stdR: Math.sqrt(varR / len) / 255,
            stdG: Math.sqrt(varG / len) / 255,
            stdB: Math.sqrt(varB / len) / 255,
            count: len / MAX_CUSTOM_COLORS
          };
        }

        function featureDistance(a, b) {
          return (
            (a.meanR - b.meanR) ** 2 +
            (a.meanG - b.meanG) ** 2 +
            (a.meanB - b.meanB) ** 2 +
            0.35 * (a.stdR - b.stdR) ** 2 +
            0.35 * (a.stdG - b.stdG) ** 2 +
            0.35 * (a.stdB - b.stdB) ** 2 +
            0.1 * (a.count - b.count) ** 2
          );
        }

        function fallbackCoordsFromHash(seed) {
          const hash = spaceHash(seed);
          const x = (((hash & 1023) / 1023) * 2) - 1;
          const y = ((((hash >>> 10) & 1023) / 1023) * 2) - 1;
          return {
            x: spaceClamp(x, -0.95, 0.95),
            y: spaceClamp(y, -0.95, 0.95)
          };
        }

        function estimateCustomSpaceCoords(palette) {
          const colors = uniqueHexColors(palette?.palette || palette?.colors || [], MAX_CUSTOM_COLORS);
          const feature = paletteFeature(colors);
          const candidates = feature
            ? spaceBaseData
                .map((rec) => {
                  const x = Number(rec?.x);
                  const y = Number(rec?.y);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                  const recFeature = paletteFeature(rec?.colors || rec?.palette || []);
                  if (!recFeature) return null;
                  return { x, y, d: featureDistance(feature, recFeature) };
                })
                .filter(Boolean)
                .sort((a, b) => a.d - b.d)
                .slice(0, 8)
            : [];

          let x = 0;
          let y = 0;

          if (candidates.length) {
            let totalWeight = 0;
            candidates.forEach((cand) => {
              const weight = 1 / (Math.sqrt(cand.d) + 1e-5);
              x += cand.x * weight;
              y += cand.y * weight;
              totalWeight += weight;
            });
            x /= totalWeight || 1;
            y /= totalWeight || 1;
          } else {
            const fallback = fallbackCoordsFromHash(`${palette?.name || "custom"}:${colors.join(",")}`);
            x = fallback.x;
            y = fallback.y;
          }

          // Small deterministic jitter helps avoid stacking points at exactly the same coordinate.
          const jitterHash = spaceHash(`${palette?.name || ""}:${colors.join(",")}`);
          const angle = ((jitterHash % 3600) / 3600) * Math.PI * 2;
          const radius = 0.012 + (((jitterHash >>> 12) % 1000) / 1000) * 0.028;
          x += Math.cos(angle) * radius;
          y += Math.sin(angle) * radius;

          return {
            x: spaceClamp(x, -0.98, 0.98),
            y: spaceClamp(y, -0.98, 0.98)
          };
        }

        function syncSpaceDataWithCatalog() {
          if (!psCanvas) return;

          const merged = [];
          const seenNames = new Set();

          (Array.isArray(spaceBaseData) ? spaceBaseData : []).forEach((rec) => {
            const name = String(rec?.name || "").trim();
            const x = Number(rec?.x);
            const y = Number(rec?.y);
            if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return;

            const key = name.toLowerCase();
            if (seenNames.has(key)) return;
            seenNames.add(key);

            merged.push({
              ...rec,
              name,
              x: spaceClamp(x, -1, 1),
              y: spaceClamp(y, -1, 1),
              kind: String(rec?.kind || "").trim(),
              colors: uniqueHexColors(rec?.colors || rec?.palette || [], MAX_CUSTOM_COLORS)
            });
          });

          state.customPalettes.forEach((palette) => {
            const name = String(palette?.name || "").trim();
            if (!name) return;

            const key = name.toLowerCase();
            if (seenNames.has(key)) return;

            const colors = uniqueHexColors(palette?.palette || [], MAX_CUSTOM_COLORS);
            if (!colors.length) return;

            const pos = estimateCustomSpaceCoords({ name, palette: colors });
            merged.push({
              name,
              kind: "custom",
              colors,
              x: pos.x,
              y: pos.y,
              origin: "custom"
            });
            seenNames.add(key);
          });

          spaceData = merged;
          if (spaceHovered >= spaceData.length) {
            spaceHovered = -1;
          }
        }

        async function loadCoordsData() {
          if (!psCanvas) return;
          let raw;
          try {
            const resp = await fetch(COORDS_URL, { cache: "no-cache" });
            if (!resp.ok) throw new Error("fetch failed");
            raw = await resp.json();
          } catch (_) {
            try {
              await loadScriptOnce(COORDS_FALLBACK_SCRIPT);
            } catch (_) {
              // Keep original fallback flow below.
            }
            if (Array.isArray(window.__PALETTE_COORDS__) && window.__PALETTE_COORDS__.length) {
              raw = window.__PALETTE_COORDS__;
            } else {
              raw = [];
            }
          }
          spaceBaseData = Array.isArray(raw) ? raw : [];
          syncSpaceDataWithCatalog();
        }

        function computeSpacePoints() {
          const W   = psCanvas ? (psCanvas.width  || 800) : 800;
          const H   = psCanvas ? (psCanvas.height || 450) : 450;
          const pad = 32;
          spacePoints = spaceData.map((rec) => ({
            px: pad + (rec.x + 1) / 2 * (W - 2 * pad),
            py: pad + (1 - (rec.y + 1) / 2) * (H - 2 * pad),
            rec,
          }));
        }

        // map a base canvas point through current zoom+pan to screen coords
        function toScreen(px, py) {
          return { sx: px * spaceZoom + spacePanX, sy: py * spaceZoom + spacePanY };
        }

        function drawPaletteSpace() {
          if (!psCanvas || !spaceData.length) return;
          const W = psCanvas.offsetWidth || 800;
          const H = Math.round(W * 0.56);
          psCanvas.width  = W;
          psCanvas.height = H;

          computeSpacePoints();

          const ctx     = psCanvas.getContext("2d");
          const selName = state.selectedName.toLowerCase();
          ctx.clearRect(0, 0, W, H);

          // faint background grid (fixed, not zoomed)
          ctx.strokeStyle = "rgba(0,0,0,0.035)";
          ctx.lineWidth   = 1;
          for (let i = 0; i <= 4; i++) {
            const gx = 32 + (i / 4) * (W - 64);
            const gy = 32 + (i / 4) * (H - 64);
            ctx.beginPath(); ctx.moveTo(gx, 32); ctx.lineTo(gx, H - 32); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(32, gy); ctx.lineTo(W - 32, gy); ctx.stroke();
          }

          const BASE_R  = Math.max(2.5, W / 240);
          const scaledR = Math.min(BASE_R * spaceZoom, BASE_R * 5);

          // regular points
          for (let i = 0; i < spacePoints.length; i++) {
            const sp = spacePoints[i];
            if (sp.rec.name.toLowerCase() === selName) continue;
            if (i === spaceHovered) continue;
            const { sx, sy } = toScreen(sp.px, sp.py);
            if (sx < -scaledR || sx > W + scaledR || sy < -scaledR || sy > H + scaledR) continue;
            const color = sp.rec.colors && sp.rec.colors[0]
              ? (normalizeHex(sp.rec.colors[0]) || "#888")
              : (SPACE_KIND_COLORS[sp.rec.kind] || SPACE_KIND_COLORS[""]);
            ctx.globalAlpha = 0.72;
            ctx.fillStyle   = color;
            ctx.beginPath();
            ctx.arc(sx, sy, scaledR, 0, Math.PI * 2);
            ctx.fill();
          }

          // hovered point
          if (spaceHovered >= 0 && spaceHovered < spacePoints.length) {
            const sp    = spacePoints[spaceHovered];
            const { sx, sy } = toScreen(sp.px, sp.py);
            const color = sp.rec.colors && sp.rec.colors[0]
              ? (normalizeHex(sp.rec.colors[0]) || "#888")
              : (SPACE_KIND_COLORS[sp.rec.kind] || SPACE_KIND_COLORS[""]);
            ctx.globalAlpha = 1;
            ctx.fillStyle   = color;
            ctx.beginPath(); ctx.arc(sx, sy, scaledR * 1.9, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth   = 2;
            ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.arc(sx, sy, scaledR * 1.9 + 1.5, 0, Math.PI * 2); ctx.stroke();
          }

          // selected point — always on top, fixed visual size regardless of zoom
          const selIdx = spacePoints.findIndex((sp) => sp.rec.name.toLowerCase() === selName);
          if (selIdx >= 0) {
            const sp    = spacePoints[selIdx];
            const { sx, sy } = toScreen(sp.px, sp.py);
            const color = sp.rec.colors && sp.rec.colors[0]
              ? (normalizeHex(sp.rec.colors[0]) || "#1647a3")
              : "#1647a3";
            const SR  = Math.max(scaledR * 2.6, BASE_R * 2.6);
            const rgb = hexToRgb(color);
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
            ctx.lineWidth   = SR;
            ctx.beginPath(); ctx.arc(sx, sy, SR + SR * 0.65, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth   = 2.5;
            ctx.beginPath(); ctx.arc(sx, sy, SR + 3, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.28)";
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.arc(sx, sy, SR + 4.5, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(sx, sy, SR, 0, Math.PI * 2); ctx.fill();
          }

          ctx.globalAlpha = 1;
        }

        function canvasCoords(clientX, clientY) {
          const rect   = psCanvas.getBoundingClientRect();
          return {
            cx: (clientX - rect.left) * (psCanvas.width  / rect.width),
            cy: (clientY - rect.top)  * (psCanvas.height / rect.height),
          };
        }

        function touchDistance(t1, t2) {
          const dx = t1.clientX - t2.clientX;
          const dy = t1.clientY - t2.clientY;
          return Math.hypot(dx, dy);
        }

        function touchMidpoint(t1, t2) {
          return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
          };
        }

        function findSpaceHit(clientX, clientY) {
          if (!psCanvas || !spacePoints.length) return -1;
          const { cx, cy } = canvasCoords(clientX, clientY);
          const THRESHOLD  = 10; // fixed 10 screen-px regardless of zoom
          let best = -1, bestDist = Infinity;
          for (let i = 0; i < spacePoints.length; i++) {
            const { sx, sy } = toScreen(spacePoints[i].px, spacePoints[i].py);
            const dx = sx - cx, dy = sy - cy;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < THRESHOLD && d < bestDist) { bestDist = d; best = i; }
          }
          return best;
        }

        function showSpaceTooltip(idx, clientX, clientY) {
          if (!psTooltip || !psWrap) return;
          if (idx < 0) { psTooltip.hidden = true; return; }
          const rec      = spacePoints[idx].rec;
          const swatches = (rec.colors || []).slice(0, 14)
            .map((c) => `<span class="ps-tooltip-swatch" style="background:${normalizeHex(c) || "#ccc"}"></span>`)
            .join("");
          psTooltip.innerHTML = `
            <div class="ps-tooltip-name">${escapeHtml(rec.name)}</div>
            <div class="ps-tooltip-swatches">${swatches}</div>
            <div class="ps-tooltip-meta">${escapeHtml(rec.kind || "unknown")} · ${(rec.colors || []).length} colors</div>`;
          const wrapRect = psWrap.getBoundingClientRect();
          const tx = clientX - wrapRect.left, ty = clientY - wrapRect.top;
          const TW = 210, TH = 90;
          let left = tx + 16; if (left + TW > wrapRect.width)  left = tx - TW - 16;
          let top  = ty - TH / 2; if (top < 4) top = 4; if (top + TH > wrapRect.height) top = wrapRect.height - TH - 4;
          psTooltip.style.left = `${left}px`;
          psTooltip.style.top  = `${top}px`;
          psTooltip.hidden     = false;
        }

        function zoomAtPoint(cx, cy, factor) {
          const worldX = (cx - spacePanX) / spaceZoom;
          const worldY = (cy - spacePanY) / spaceZoom;
          spaceZoom = Math.max(0.35, Math.min(25, spaceZoom * factor));
          spacePanX = cx - worldX * spaceZoom;
          spacePanY = cy - worldY * spaceZoom;
        }

        function bindSpaceEvents() {
          if (!psCanvas) return;

          // scroll to zoom
          psCanvas.addEventListener("wheel", (e) => {
            // Allow normal page scrolling; reserve canvas zoom for ctrl/cmd + wheel.
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const { cx, cy } = canvasCoords(e.clientX, e.clientY);
            zoomAtPoint(cx, cy, e.deltaY < 0 ? 1.15 : 1 / 1.15);
            drawPaletteSpace();
          }, { passive: false });

          // drag to pan
          psCanvas.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            spaceIsDragging = true;
            spaceDragStartX = e.clientX;
            spaceDragStartY = e.clientY;
            spaceDragPanX   = spacePanX;
            spaceDragPanY   = spacePanY;
            psCanvas.classList.add("dragging");
            if (psTooltip) psTooltip.hidden = true;
          });

          window.addEventListener("mousemove", (e) => {
            if (!spaceIsDragging) return;
            const rect   = psCanvas.getBoundingClientRect();
            const scaleX = psCanvas.width  / rect.width;
            const scaleY = psCanvas.height / rect.height;
            spacePanX = spaceDragPanX + (e.clientX - spaceDragStartX) * scaleX;
            spacePanY = spaceDragPanY + (e.clientY - spaceDragStartY) * scaleY;
            drawPaletteSpace();
          });

          window.addEventListener("mouseup", () => {
            if (!spaceIsDragging) return;
            spaceIsDragging = false;
            psCanvas.classList.remove("dragging");
          });

          // hover
          psCanvas.addEventListener("mousemove", (e) => {
            if (spaceIsDragging) return;
            const idx = findSpaceHit(e.clientX, e.clientY);
            if (idx !== spaceHovered) { spaceHovered = idx; drawPaletteSpace(); }
            if (idx >= 0) {
              showSpaceTooltip(idx, e.clientX, e.clientY);
              psCanvas.classList.add("hovering");
            } else {
              if (psTooltip) psTooltip.hidden = true;
              psCanvas.classList.remove("hovering");
            }
          });

          psCanvas.addEventListener("mouseleave", () => {
            if (spaceIsDragging) return;
            spaceHovered = -1;
            if (psTooltip) psTooltip.hidden = true;
            psCanvas.classList.remove("hovering");
            drawPaletteSpace();
          });

          // click to select (only if not a drag)
          psCanvas.addEventListener("click", (e) => {
            const movedX = Math.abs(e.clientX - spaceDragStartX);
            const movedY = Math.abs(e.clientY - spaceDragStartY);
            if (movedX > 4 || movedY > 4) return;
            const idx = findSpaceHit(e.clientX, e.clientY);
            if (idx >= 0) {
              selectPalette(spacePoints[idx].rec.name);
              if (psTooltip) psTooltip.hidden = true;
            }
          });

          // touch support: pan (1 finger), pinch zoom (2 fingers), tap to select
          psCanvas.addEventListener("touchstart", (e) => {
            if (!e.touches.length) return;

            if (psTooltip) psTooltip.hidden = true;
            spaceHovered = -1;
            psCanvas.classList.remove("hovering");

            if (e.touches.length === 1) {
              const touch = e.touches[0];
              spaceIsDragging = true;
              spaceTouchPinching = false;
              spaceTouchHadPinch = false;
              spaceTouchMoved = false;
              spaceDragStartX = touch.clientX;
              spaceDragStartY = touch.clientY;
              spaceDragPanX = spacePanX;
              spaceDragPanY = spacePanY;
              psCanvas.classList.add("dragging");
            } else if (e.touches.length >= 2) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];
              const dist = touchDistance(t1, t2);
              if (dist > 0) {
                const center = touchMidpoint(t1, t2);
                const { cx, cy } = canvasCoords(center.x, center.y);
                spaceIsDragging = false;
                spaceTouchPinching = true;
                spaceTouchHadPinch = true;
                spaceTouchMoved = true;
                spaceTouchStartDistance = dist;
                spaceTouchStartZoom = spaceZoom;
                spaceTouchAnchorWorldX = (cx - spacePanX) / spaceZoom;
                spaceTouchAnchorWorldY = (cy - spacePanY) / spaceZoom;
                psCanvas.classList.add("dragging");
              }
            }

            e.preventDefault();
          }, { passive: false });

          psCanvas.addEventListener("touchmove", (e) => {
            if (!e.touches.length) return;

            if (spaceTouchPinching && e.touches.length >= 2) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];
              const dist = touchDistance(t1, t2);
              if (spaceTouchStartDistance > 0 && dist > 0) {
                const center = touchMidpoint(t1, t2);
                const { cx, cy } = canvasCoords(center.x, center.y);
                const factor = dist / spaceTouchStartDistance;
                spaceZoom = Math.max(0.35, Math.min(25, spaceTouchStartZoom * factor));
                spacePanX = cx - spaceTouchAnchorWorldX * spaceZoom;
                spacePanY = cy - spaceTouchAnchorWorldY * spaceZoom;
                drawPaletteSpace();
              }
              e.preventDefault();
              return;
            }

            if (spaceIsDragging && e.touches.length === 1) {
              const touch = e.touches[0];
              const rect = psCanvas.getBoundingClientRect();
              const scaleX = psCanvas.width / rect.width;
              const scaleY = psCanvas.height / rect.height;
              const deltaX = touch.clientX - spaceDragStartX;
              const deltaY = touch.clientY - spaceDragStartY;

              if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
                spaceTouchMoved = true;
              }

              spacePanX = spaceDragPanX + deltaX * scaleX;
              spacePanY = spaceDragPanY + deltaY * scaleY;
              drawPaletteSpace();
              e.preventDefault();
            }
          }, { passive: false });

          psCanvas.addEventListener("touchend", (e) => {
            if (e.touches.length >= 2) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];
              const dist = touchDistance(t1, t2);
              if (dist > 0) {
                const center = touchMidpoint(t1, t2);
                const { cx, cy } = canvasCoords(center.x, center.y);
                spaceTouchPinching = true;
                spaceTouchStartDistance = dist;
                spaceTouchStartZoom = spaceZoom;
                spaceTouchAnchorWorldX = (cx - spacePanX) / spaceZoom;
                spaceTouchAnchorWorldY = (cy - spacePanY) / spaceZoom;
              }
              e.preventDefault();
              return;
            }

            if (e.touches.length === 1) {
              const touch = e.touches[0];
              spaceIsDragging = true;
              spaceTouchPinching = false;
              spaceTouchStartDistance = 0;
              spaceDragStartX = touch.clientX;
              spaceDragStartY = touch.clientY;
              spaceDragPanX = spacePanX;
              spaceDragPanY = spacePanY;
              psCanvas.classList.add("dragging");
              e.preventDefault();
              return;
            }

            psCanvas.classList.remove("dragging");
            spaceIsDragging = false;
            spaceTouchPinching = false;
            spaceTouchStartDistance = 0;

            const endedTouch = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
            const shouldSelect = endedTouch && !spaceTouchMoved && !spaceTouchHadPinch;
            if (shouldSelect) {
              const idx = findSpaceHit(endedTouch.clientX, endedTouch.clientY);
              if (idx >= 0) {
                selectPalette(spacePoints[idx].rec.name);
              }
            }

            spaceTouchMoved = false;
            spaceTouchHadPinch = false;
            e.preventDefault();
          }, { passive: false });

          psCanvas.addEventListener("touchcancel", () => {
            spaceIsDragging = false;
            spaceTouchPinching = false;
            spaceTouchMoved = false;
            spaceTouchHadPinch = false;
            spaceTouchStartDistance = 0;
            psCanvas.classList.remove("dragging");
          });

          // zoom buttons
          document.getElementById("psZoomIn")?.addEventListener("click", () => {
            zoomAtPoint((psCanvas.width || 800) / 2, (psCanvas.height || 450) / 2, 1.5);
            drawPaletteSpace();
          });
          document.getElementById("psZoomOut")?.addEventListener("click", () => {
            zoomAtPoint((psCanvas.width || 800) / 2, (psCanvas.height || 450) / 2, 1 / 1.5);
            drawPaletteSpace();
          });
          document.getElementById("psZoomReset")?.addEventListener("click", () => {
            spaceZoom = 1; spacePanX = 0; spacePanY = 0;
            drawPaletteSpace();
          });

          // reset on resize
          let resizeTimer;
          window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              spaceZoom = 1; spacePanX = 0; spacePanY = 0;
              drawPaletteSpace();
            }, 150);
          });
        }

        function initPaletteSpace() {
          if (!psCanvas) return;
          bindSpaceEvents();
          drawPaletteSpace();
        }

        // ── App init ────────────────────────────────────────────────────────────
        async function init() {
          readStateFromUrl();
          visionMode.value = state.vision;
          bindEvents();
          bindStudioEvents();
          loadCustomPalettesFromStorage();
          renderStudioDraft();
          renderStudioCollection();

          try {
            await loadPalettes();
          } catch (error) {
            handleLoadError(error);
            return;
          }

          rebuildPaletteCatalog();
          await loadCoordsData();

          refreshPaletteDependentViews();
          initPaletteSpace();
        }

        init();
      })();
