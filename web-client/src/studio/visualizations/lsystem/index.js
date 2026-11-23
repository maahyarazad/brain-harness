import { parseRules, expandLSystem, turtleSegments } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const LIMIT = 2_000_000;

export default {
  id: "l-system",
  name: "L-system",
  howItWorks:
    "Start with a short string (the axiom) and rewrite every letter using the rules, again and again. Then read the result as instructions for a turtle with a pen: F and G draw a line forward, f moves without drawing, + and − turn by the angle, [ remembers the position and ] returns to it. Other letters only guide the rewriting. Simple rules give Koch curves, dragon curves and realistic plants.",
  animated: false,
  random: false,
  interactive: false,
  knobs: [
    { key: "axiom", label: "Axiom", type: "text", default: "X", maxLength: 100, pattern: /^[A-Za-z+\-[\]|]+$/, patternMessage: "Use letters and + - [ ] |" },
    { key: "rules", label: "Rules (one per line)", type: "text", multiline: true, default: "X=F+[[X]-X]-F[-FX]+X\nF=FF", maxLength: 500, parse: parseRules, live: false },
    { key: "angle", label: "Angle (°)", type: "range", min: 0, max: 180, step: 0.5, default: 25 },
    { key: "depth", label: "Recursion depth", type: "range", min: 0, max: 12, step: 1, default: 6 },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "plant", name: "Fractal plant", values: { axiom: "X", rules: "X=F+[[X]-X]-F[-FX]+X\nF=FF", angle: 25, depth: 6 } },
    { id: "koch", name: "Koch curve", values: { axiom: "F", rules: "F=F+F--F+F", angle: 60, depth: 4, palette: "magma" } },
    { id: "snowflake", name: "Koch snowflake", values: { axiom: "F--F--F", rules: "F=F+F--F+F", angle: 60, depth: 4, palette: "cividis" } },
    { id: "dragon", name: "Dragon curve", values: { axiom: "FX", rules: "X=X+YF+\nY=-FX-Y", angle: 90, depth: 12, palette: "twilight" } },
    { id: "hilbert", name: "Hilbert curve", values: { axiom: "A", rules: "A=+BF-AFA-FB+\nB=-AF+BFB+FA-", angle: 90, depth: 5, palette: "fire" } },
    { id: "arrowhead", name: "Sierpiński arrowhead", values: { axiom: "F", rules: "F=G-F-G\nG=F+G+F", angle: 60, depth: 7, palette: "viridis" } },
  ],
  sweep: { periodMs: 20000, targets: [{ key: "angle", mode: "wave", min: 15, max: 35 }] },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { presetId: "plant" },
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { axiom, rules, angle, depth, palette } = cfg.values;
      clear(g, BG);
      const parsed = parseRules(rules);
      if (!parsed.ok) return;
      const ex = expandLSystem(axiom, parsed.rules, depth, LIMIT);
      if (ex.capped) ctx.reportNotice(`Depth capped at ${ex.depthReached} for these rules, to keep the drawing a safe size.`);
      yield 0.2;
      const segs = turtleSegments(ex.string, angle);
      const n = segs.length / 4;
      ctx.reportStats({ segments: n.toLocaleString() });
      if (!n) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < segs.length; i += 2) {
        const x = segs[i], y = segs[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const s = Math.min((w * 0.92) / Math.max(maxX - minX, 1e-9), (h * 0.92) / Math.max(maxY - minY, 1e-9));
      const ox = (w - (maxX - minX) * s) / 2 - minX * s;
      const oy = (h - (maxY - minY) * s) / 2 - minY * s;
      g.lineWidth = Math.max(0.5, Math.min(2 * ctx.dpr, s * 0.3));
      g.lineCap = "round";
      const BUCKETS = 64;
      const per = Math.ceil(n / BUCKETS);
      for (let b = 0; b < BUCKETS; b++) {
        const from = b * per, to = Math.min(n, from + per);
        if (from >= to) break;
        g.strokeStyle = ctx.color(palette, 0.2 + 0.8 * (b / BUCKETS));
        g.beginPath();
        for (let i = from; i < to; i++) {
          g.moveTo(ox + segs[i * 4] * s, oy + segs[i * 4 + 1] * s);
          g.lineTo(ox + segs[i * 4 + 2] * s, oy + segs[i * 4 + 3] * s);
        }
        g.stroke();
        yield 0.2 + 0.8 * (to / n);
      }
    });
  },
};
