import { chaosPoints } from "./kernel.js";
import { staticInstance, fitAspect, BG } from "../_shared/instance.js";
import { clear, plotAccumulator } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";
import { createRng } from "../../core/rng.js";

export default {
  id: "chaos-game",
  name: "Chaos game",
  howItWorks:
    "Mark the corners of a polygon. Start anywhere, pick a corner at random, and jump a fixed fraction of the way toward it. Plot the point and repeat thousands of times. With 3 corners and a ratio of ½ the Sierpiński triangle appears. Rules about which corner may be picked next, or adding the center as a target, give carpets, snowflakes and stars.",
  animated: false,
  random: true,
  interactive: false,
  knobs: [
    { key: "corners", label: "Corners", type: "range", min: 3, max: 10, step: 1, default: 3 },
    { key: "ratio", label: "Jump ratio", type: "range", min: 0.1, max: 0.9, step: 0.001, default: 0.5 },
    { key: "points", label: "Points", type: "range", min: 10000, max: 2000000, step: 1000, default: 300000, scale: "log", live: false },
    {
      key: "restriction", label: "Corner rule", type: "choice", default: "none",
      options: [
        { value: "none", label: "Any corner" },
        { value: "not-same", label: "Never the same corner twice" },
        { value: "not-neighbor", label: "Never a neighbor of the last corner" },
      ],
    },
    { key: "includeCenter", label: "Center is a target too", type: "toggle", default: false },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "sierpinski", name: "Sierpiński triangle", values: { corners: 3, ratio: 0.5, restriction: "none" } },
    { id: "vicsek", name: "Vicsek snowflake", values: { corners: 4, ratio: 0.6667, includeCenter: true, restriction: "none" } },
    { id: "carpet-star", name: "Square, no repeats", values: { corners: 4, ratio: 0.5, restriction: "not-same" } },
    { id: "pentagon", name: "Pentagon flake", values: { corners: 5, ratio: 0.618, restriction: "none" } },
    { id: "pentagram", name: "Pentagon, no repeats", values: { corners: 5, ratio: 0.5, restriction: "not-same" } },
    { id: "hexagon", name: "Hexagon star", values: { corners: 6, ratio: 0.6667, restriction: "none" } },
  ],
  sweep: { periodMs: 30000, targets: [{ key: "ratio", mode: "wave", min: 0.4, max: 0.7 }], presetValues: { points: 150000 } },
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { corners, ratio, points, restriction, includeCenter, palette } = cfg.values;
      clear(g, BG);
      const box = fitAspect(w, h, 1);
      const size = Math.floor(box.w);
      const counts = new Uint32Array(size * size);
      const rng = createRng(cfg.seed);
      const lut = ctx.palette(palette);
      const gen = chaosPoints({ corners, ratio, count: points, restriction, includeCenter, rng, w: size, h: size, counts });
      const draw = () => {
        const off = g.createImageData(size, size);
        // Reuse plotAccumulator's tone mapping via a temporary context-less path
        plotAccumulatorInto(off, counts, lut);
        g.putImageData(off, Math.floor(box.x), Math.floor(box.y));
      };
      let chunks = 0;
      for (const p of { [Symbol.iterator]: () => gen }) {
        yield p;
        if (++chunks % 10 === 0) draw();
      }
      draw();
    });
  },
};

function plotAccumulatorInto(img, counts, lut) {
  const fake = { createImageData: () => img, putImageData() {} };
  plotAccumulator(fake, counts, img.width, img.height, lut);
}
