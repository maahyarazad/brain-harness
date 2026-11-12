import { pascalModRows } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "pascal-mod",
  name: "Pascal's triangle mod n",
  howItWorks:
    "Each number in Pascal's triangle is the sum of the two above it. Instead of the numbers, color each entry by its remainder when divided by n. Remainder 0 is left dark. With n = 2 the Sierpiński triangle appears; prime n give similar self-similar triangles, and other n mix several patterns.",
  animated: false,
  random: false,
  interactive: false,
  knobs: [
    { key: "modulus", label: "Modulus n", type: "range", min: 2, max: 20, step: 1, default: 2 },
    { key: "rows", label: "Rows", type: "range", min: 8, max: 1024, step: 1, default: 256, scale: "log" },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "sierpinski", name: "Sierpiński (mod 2)", values: { modulus: 2, rows: 256 } },
    { id: "mod3", name: "Mod 3", values: { modulus: 3, rows: 243 } },
    { id: "mod6", name: "Mod 6", values: { modulus: 6, rows: 512 } },
  ],
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { modulus, rows, palette } = cfg.values;
      clear(g, BG);
      const cell = Math.min(w / rows, h / (rows * 0.866));
      const rowH = cell * 0.866;
      const top = (h - rows * rowH) / 2;
      const cx = w / 2;
      const size = Math.max(cell, 1);
      const colors = Array.from({ length: modulus }, (_, v) => ctx.color(palette, modulus === 2 ? 0.85 : 0.2 + (0.8 * v) / (modulus - 1)));
      let r = 0;
      for (const row of pascalModRows(rows, modulus)) {
        const y = top + r * rowH;
        for (let k = 0; k <= r; k++) {
          const v = row[k];
          if (v === 0) continue;
          g.fillStyle = colors[v];
          g.fillRect(cx + (k - r / 2) * cell - cell / 2, y, size, Math.max(rowH, 1));
        }
        r++;
        if (r % 16 === 0) yield r / rows;
      }
    });
  },
};
