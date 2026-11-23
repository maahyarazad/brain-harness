import { sieve, squareSpiral, hexSpiral, sacksSpiral } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

function layout(cfg, w, h) {
  const { start, shape, size } = cfg.values;
  const coords = shape === "square" ? squareSpiral(size) : shape === "hexagonal" ? hexSpiral(size) : sacksSpiral(start, size);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < size; i++) {
    const x = coords[i * 2], y = coords[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const cell = (Math.min(w, h) * 0.96) / (span + 1);
  const ox = w / 2 - ((minX + maxX) / 2) * cell;
  const oy = h / 2 - ((minY + maxY) / 2) * cell;
  const px = new Float32Array(size * 2);
  for (let i = 0; i < size; i++) {
    px[i * 2] = ox + coords[i * 2] * cell;
    px[i * 2 + 1] = oy + coords[i * 2 + 1] * cell;
  }
  return { px, cell };
}

export default {
  id: "ulam-spiral",
  name: "Ulam spiral",
  howItWorks:
    "Write the whole numbers in a spiral, starting from the middle, and mark the primes. The primes line up along diagonals far more than chance would suggest, and nobody has fully explained why. The Sacks spiral puts n at radius √n, so perfect squares line up on one ray. Hover over the picture to see which number is where.",
  animated: false,
  random: false,
  interactive: true,
  knobs: [
    { key: "start", label: "Starting number", type: "range", min: 1, max: 100000, step: 1, default: 1, scale: "log" },
    {
      key: "shape", label: "Spiral shape", type: "choice", default: "square",
      options: [{ value: "square", label: "Square" }, { value: "hexagonal", label: "Hexagonal" }, { value: "sacks", label: "Sacks spiral" }],
    },
    { key: "size", label: "Numbers shown", type: "range", min: 100, max: 250000, step: 1, default: 20000, scale: "log", live: false },
    { key: "dot", label: "Dot size", type: "range", min: 0.5, max: 6, step: 0.5, default: 1.5 },
    { key: "showComposite", label: "Show non-primes faintly", type: "toggle", default: false },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "classic", name: "Classic square", values: { shape: "square", size: 40000 } },
    { id: "sacks", name: "Sacks spiral", values: { shape: "sacks", size: 60000, dot: 1 } },
    { id: "start41", name: "Start at 41", values: { shape: "square", start: 41, size: 10000, dot: 3 } },
  ],
  // Animated sweep: slide the starting number, so the diagonals of primes drift.
  sweep: { periodMs: 30000, targets: [{ key: "start", mode: "log", min: 1, max: 5000 }] },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: {},
  create(canvas, config, ctx) {
    let lay = null;
    let primes = null;
    const inst = staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { start, size, dot, palette, showComposite } = cfg.values;
      clear(g, BG);
      primes = sieve(start + size);
      lay = layout(cfg, w, h);
      const r = Math.max(0.5, Math.min(lay.cell * 0.5, dot * ctx.dpr));
      for (let i = 0; i < size; i++) {
        const n = start + i;
        const x = lay.px[i * 2], y = lay.px[i * 2 + 1];
        if (primes[n]) {
          g.fillStyle = ctx.color(palette, 0.35 + 0.65 * (i / size));
          g.fillRect(x - r, y - r, r * 2, r * 2);
        } else if (showComposite) {
          g.fillStyle = "rgba(255,255,255,0.08)";
          g.fillRect(x - r / 2, y - r / 2, r, r);
        }
        if (i % 5000 === 4999) yield i / size;
      }
    });
    return {
      ...inst,
      update: inst.update,
      resize: inst.resize,
      destroy: inst.destroy,
      pointer(ev) {
        if (ev.type !== "move" || !lay) return;
        const { start, size } = inst.config.values;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < size; i++) {
          const dx = lay.px[i * 2] - ev.x, dy = lay.px[i * 2 + 1] - ev.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0 && bestD < Math.max(64, lay.cell * lay.cell * 4)) {
          const n = start + best;
          ctx.reportStats({ number: n, prime: primes?.[n] ? "yes" : "no" });
        }
      },
    };
  },
};
