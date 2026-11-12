import { collatzPath } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear, DEG } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

function walk(path, even, odd, seg, emit) {
  let x = 0, y = 0, a = -Math.PI / 2;
  emit(x, y, true);
  for (let i = 1; i < path.length; i++) {
    a += path[i] % 2 === 0 ? even : odd;
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg;
    emit(x, y, false);
  }
}

function* draw(g, cfg, ctx, { w, h }) {
  const { count, evenAngle, oddAngle, segment, fit, palette } = cfg.values;
  clear(g, BG);
  const even = evenAngle * DEG;
  const odd = oddAngle * DEG;
  const paths = [];
  let minX = 0, minY = 0, maxX = 0, maxY = 0, maxLen = 1;
  for (let n = 1; n <= count; n++) {
    const p = collatzPath(n).reverse();
    paths.push(p);
    if (p.length > maxLen) maxLen = p.length;
    walk(p, even, odd, 1, (x, y) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    if (n % 500 === 0) yield (n / count) * 0.3;
  }
  let scale, ox, oy;
  if (fit) {
    scale = Math.min((w * 0.92) / Math.max(maxX - minX, 1e-6), (h * 0.92) / Math.max(maxY - minY, 1e-6));
    ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
    oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
  } else {
    scale = segment * ctx.dpr;
    ox = w / 2;
    oy = h * 0.95;
  }
  g.lineWidth = Math.max(0.5, ctx.dpr * 0.75);
  g.globalAlpha = Math.min(0.6, 40 / Math.sqrt(count) + 0.08);
  for (let i = 0; i < paths.length; i++) {
    g.strokeStyle = ctx.color(palette, 0.15 + 0.85 * (paths[i].length / maxLen));
    g.beginPath();
    walk(paths[i], even, odd, 1, (x, y, first) => {
      const px = ox + x * scale;
      const py = oy + y * scale;
      if (first) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
    if (i % 200 === 0) yield 0.3 + 0.7 * (i / paths.length);
  }
  g.globalAlpha = 1;
}

export default {
  id: "collatz-coral",
  name: "Collatz coral",
  howItWorks:
    "Take any number. If it is even, halve it; if odd, triple it and add 1. Every number tried so far reaches 1. Here each number's path is drawn backwards from 1: a short line per step, bending one way for even numbers and the other way for odd ones. Numbers share the end of their paths, so the drawings merge into a branching coral.",
  animated: false,
  random: false,
  interactive: false,
  knobs: [
    { key: "count", label: "Numbers", type: "range", min: 1, max: 20000, step: 1, default: 5000, scale: "log", live: false },
    { key: "evenAngle", label: "Even-step angle (°)", type: "range", min: -30, max: 30, step: 0.1, default: 8 },
    { key: "oddAngle", label: "Odd-step angle (°)", type: "range", min: -30, max: 30, step: 0.1, default: -16 },
    { key: "fit", label: "Fit to canvas", type: "toggle", default: true },
    { key: "segment", label: "Segment length (px)", type: "range", min: 1, max: 20, step: 0.5, default: 6, when: (v) => !v.fit },
    paletteKnob("palette", "magma"),
  ],
  presets: [
    { id: "coral", name: "Coral", values: { evenAngle: 8, oddAngle: -16 } },
    { id: "seaweed", name: "Seaweed", values: { evenAngle: 2.5, oddAngle: -5, count: 10000, palette: "viridis" } },
    { id: "fan", name: "Fan", values: { evenAngle: 15, oddAngle: -20, count: 3000, palette: "twilight" } },
  ],
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, draw);
  },
};
