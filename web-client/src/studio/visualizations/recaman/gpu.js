// Recamán's sequence on the graphics card. The sequence (recaman) stays on the processor and is the oracle; every
// arc is drawn in one instanced call instead of one canvas stroke each.
import { recaman } from "./kernel.js";
import { ARC_VERTEX, ARC_FRAGMENT, FILL } from "./shaders.js";
import { BG_RGB } from "../_shared/instance.js";

export function createRecamanGpu(canvas, gpu, config, ctx) {
  let cfg = config;
  let seq = recaman(cfg.values.terms);
  let shown = 1;
  const fill = gpu.program("recaman:fill", FILL);
  const arcsProgram = gpu.program("recaman:arcs", ARC_FRAGMENT, { vertex: ARC_VERTEX, attributes: ["aCorner", "aArc", "aSide", "aColor"] });
  const corners = gpu.buffer(new Float32Array([0, 1, 2, 3, 4, 5]));
  const arcs = gpu.buffer(new Float32Array(4), { dynamic: true });
  const sides = gpu.buffer(new Float32Array(1), { dynamic: true });
  const colors = gpu.buffer(new Float32Array(4), { dynamic: true });
  let drawn = 0;

  /** The arcs for the terms shown so far, exactly as the processor path lays them out. */
  function layout() {
    const { arcStyle } = cfg.values;
    const { width: w, height: h } = canvas;
    let max = 1;
    for (let i = 0; i < shown; i++) if (seq[i] > max) max = seq[i];
    const sx = (w * 0.96) / max;
    const ox = w * 0.02;
    const mid = h / 2;
    const flat = arcStyle === "ellipse" ? 0.5 : 1;
    const list = [];
    for (let n = 1; n < shown; n++) {
      const a = seq[n - 1], b = seq[n];
      const r = (Math.abs(b - a) / 2) * sx;
      list.push({ n, cx: ox + ((a + b) / 2) * sx, cy: mid, rx: r, ry: r * flat, above: arcStyle === "semicircle" ? true : n % 2 === 1 });
    }
    return list;
  }

  function render() {
    if (gpu.isLost()) return;
    const { palette, lineWidth } = cfg.values;
    const { width: w, height: h } = canvas;
    gpu.draw(fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    const list = layout();
    drawn = list.length;
    if (!list.length) return;
    const lut = ctx.palette(palette);
    const a = new Float32Array(list.length * 4);
    const s = new Float32Array(list.length);
    const c = new Float32Array(list.length * 4);
    list.forEach((arc, i) => {
      a.set([arc.cx, arc.cy, arc.rx, arc.ry], i * 4);
      s[i] = arc.above ? 1 : -1;
      const k = Math.max(0, Math.min(255, Math.round((arc.n / seq.length) * 255))) * 3; // what ctx.color(palette, n / seq.length) picks
      c.set([lut[k] / 255, lut[k + 1] / 255, lut[k + 2] / 255, 1], i * 4);
    });
    arcs.update(a);
    sides.update(s);
    colors.update(c);
    gpu.draw(arcsProgram, { uCanvas: [w, h], uHalf: (lineWidth * ctx.dpr) / 2 }, null, {
      blend: "alpha",
      instanced: {
        vertexCount: 6,
        instanceCount: list.length,
        attributes: [
          { buffer: corners, size: 1, divisor: 0 },
          { buffer: arcs, size: 4, divisor: 1 },
          { buffer: sides, size: 1, divisor: 1 },
          { buffer: colors, size: 4, divisor: 1 },
        ],
      },
    });
  }

  render();

  gpu.onRestored(() => render()); // the sequence is on the processor: draw it again

  return {
    path: "gpu",
    update(c) {
      if (c.values.terms !== cfg.values.terms) {
        seq = recaman(c.values.terms);
        shown = Math.min(shown, seq.length);
      }
      cfg = c;
      render();
    },
    step() {
      if (shown < seq.length) shown++;
    },
    render,
    reset() {
      shown = 1;
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState: () => ({ seq: [...seq], shown, arcs: layout(), drawn }), gpu, finish: () => gpu.finish() } } : {}),
  };
}
