// Color palettes as 256-entry RGB lookup tables.

const STOPS = {
  viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  magma: ["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
  twilight: ["#e2d9e2", "#9ebbc9", "#6785be", "#5e43a5", "#421e4f", "#541e3a", "#9a3b3b", "#c6775f", "#d9b7a6", "#e2d9e2"],
  fire: ["#000000", "#2b0000", "#6b0000", "#b31b00", "#e85d04", "#f48c06", "#faa307", "#ffd166", "#fff3b0", "#ffffff"],
  grayscale: ["#000000", "#ffffff"],
};

export const PALETTE_OPTIONS = [
  { value: "viridis", label: "Viridis (color-blind safe)" },
  { value: "cividis", label: "Cividis (color-blind safe)" },
  { value: "magma", label: "Magma" },
  { value: "twilight", label: "Twilight (cyclic)" },
  { value: "fire", label: "Fire" },
  { value: "grayscale", label: "Grayscale" },
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cache = new Map();

/** Uint8ClampedArray of 256 × [r, g, b]. */
export function paletteLut(name) {
  if (cache.has(name)) return cache.get(name);
  const stops = (STOPS[name] ?? STOPS.viridis).map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
    }
  }
  cache.set(name, lut);
  return lut;
}

/** CSS color for t in [0, 1]. */
export function paletteColor(name, t, alpha = 1) {
  const lut = paletteLut(name);
  const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 3;
  return alpha >= 1
    ? `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`
    : `rgba(${lut[i]},${lut[i + 1]},${lut[i + 2]},${alpha})`;
}

export function paletteKnob(key = "palette", defaultValue = "viridis", extra = {}) {
  return { key, label: "Palette", type: "palette", default: defaultValue, ...extra };
}

export const PALETTE_NAMES = PALETTE_OPTIONS.map((o) => o.value);
