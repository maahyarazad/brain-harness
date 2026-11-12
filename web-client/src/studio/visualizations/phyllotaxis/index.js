import { phyllotaxisPoints } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export const GOLDEN_ANGLE = 137.50776;

export default {
  id: "phyllotaxis",
  name: "Phyllotaxis",
  howItWorks:
    "Sunflowers place each new seed at a fixed angle from the last one, slightly farther out. At the golden angle, about 137.508°, the seeds pack perfectly and you see interlocking spirals (their counts are Fibonacci numbers). Move the angle by just 0.1° and the pattern breaks into straight arms with gaps between them.",
  animated: false,
  random: false,
  interactive: false,
  knobs: [
    { key: "angle", label: "Angle (°)", type: "range", min: 0, max: 360, step: 0.001, default: 137.508 },
    { key: "count", label: "Points", type: "range", min: 10, max: 20000, step: 1, default: 2000, scale: "log" },
    { key: "spacing", label: "Spacing", type: "range", min: 1, max: 20, step: 0.1, default: 6 },
    { key: "dot", label: "Dot size", type: "range", min: 1, max: 10, step: 0.1, default: 3 },
    paletteKnob("palette", "fire"),
  ],
  presets: [
    { id: "golden", name: "Golden angle", values: { angle: GOLDEN_ANGLE } },
    { id: "off", name: "137.6° (broken)", values: { angle: 137.6 } },
    { id: "rational", name: "90° (four arms)", values: { angle: 90, count: 600 } },
    { id: "mirror", name: "222.492° (golden, mirrored)", values: { angle: 222.492 } },
  ],
  // Around the golden angle: spirals appear and dissolve.
  sweep: { periodMs: 40000, targets: [{ key: "angle", mode: "wave", min: 137, max: 138 }] },
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, (g, cfg, _ctx, { w, h }) => {
      const { angle, count, spacing, dot, palette } = cfg.values;
      clear(g, BG);
      const pts = phyllotaxisPoints(count, angle, spacing);
      const maxR = spacing * Math.sqrt(count) + dot;
      const s = Math.min(ctx.dpr, (Math.min(w, h) * 0.48) / maxR);
      const r = Math.max(0.5, dot * s);
      for (let i = 0; i < count; i++) {
        g.fillStyle = ctx.color(palette, 0.2 + 0.8 * (i / count));
        g.beginPath();
        g.arc(w / 2 + pts[i * 2] * s, h / 2 + pts[i * 2 + 1] * s, r, 0, 2 * Math.PI);
        g.fill();
      }
    });
  },
};
