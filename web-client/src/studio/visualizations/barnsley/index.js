import { fernPoints, BOUNDS } from "./kernel.js";
import { staticInstance, fitAspect, BG } from "../_shared/instance.js";
import { clear, plotAccumulator } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";
import { createRng } from "../../core/rng.js";

const weight = (key, label, def) => ({ key, label, type: "range", min: 0, max: 1, step: 0.01, default: def });

export default {
  id: "barnsley-fern",
  name: "Barnsley fern",
  howItWorks:
    "Four simple transformations each shrink, tilt and move the plane a little. Start at a point, pick one transformation at random (each with its own weight), apply it, plot the result, and repeat. Transform 1 draws the stem, 2 makes each frond a smaller copy of the whole leaf, and 3 and 4 add the left and right leaflets. Change the weights to grow different ferns.",
  animated: false,
  random: true,
  interactive: false,
  knobs: [
    weight("w1", "Weight: stem", 0.01),
    weight("w2", "Weight: smaller copies", 0.85),
    weight("w3", "Weight: left leaflet", 0.07),
    weight("w4", "Weight: right leaflet", 0.07),
    { key: "points", label: "Points", type: "range", min: 10000, max: 2000000, step: 1000, default: 400000, scale: "log", live: false },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "classic", name: "Classic fern", values: { w1: 0.01, w2: 0.85, w3: 0.07, w4: 0.07 } },
    { id: "thin", name: "Thin fern", values: { w1: 0.01, w2: 0.95, w3: 0.02, w4: 0.02 } },
    { id: "bushy", name: "Bushy fern", values: { w1: 0.01, w2: 0.7, w3: 0.15, w4: 0.15 } },
    { id: "lopsided", name: "Lopsided", values: { w1: 0.02, w2: 0.8, w3: 0.16, w4: 0.02, palette: "fire" } },
  ],
  // The two leaflets grow in turn, so the fern leans one way, then the other.
  sweep: {
    periodMs: 30000,
    minIntervalMs: 300,
    targets: [
      { key: "w3", mode: "wave", min: 0.02, max: 0.15 },
      { key: "w4", mode: "wave", min: 0.02, max: 0.15, phase: 0.5 },
    ],
    presetValues: { points: 150000 },
  },
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { w1, w2, w3, w4, points, palette } = cfg.values;
      clear(g, BG);
      const aspect = (BOUNDS.maxX - BOUNDS.minX) / (BOUNDS.maxY - BOUNDS.minY);
      const box = fitAspect(w, h * 0.96, aspect);
      const bw = Math.max(1, Math.floor(box.w)), bh = Math.max(1, Math.floor(box.h));
      const counts = new Uint32Array(bw * bh);
      const lut = ctx.palette(palette);
      const rng = createRng(cfg.seed);
      const img = g.createImageData(bw, bh);
      const fake = { createImageData: () => img, putImageData() {} };
      const draw = () => {
        plotAccumulator(fake, counts, bw, bh, lut, { gamma: 0.45 });
        g.putImageData(img, Math.floor(box.x), Math.floor(box.y + h * 0.02));
      };
      let i = 0;
      for (const p of { [Symbol.iterator]: () => fernPoints({ weights: [w1, w2, w3, w4], count: points, rng, w: bw, h: bh, counts }) }) {
        yield p;
        if (++i % 10 === 0) draw();
      }
      draw();
    });
  },
};
