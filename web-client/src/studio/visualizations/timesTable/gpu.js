// The times-table circle on the graphics card. The processor path (index.js) is the fallback and the oracle.
// The lines are thick segments drawn in one instanced call (shapes.js) instead of N canvas strokes. Where the
// ends of each line go comes from the same functions the processor path uses (timesTableLines, circlePoint), so the
// geometry is the formula by construction; what moves to the graphics card is the drawing, which is the cost.
import { circlePoint } from "./kernel.js";
import { createShapes } from "../_shared/gpu/shapes.js";
import { BG_RGB } from "../_shared/instance.js";

const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

export function createTimesTableGpu(canvas, gpu, config, ctx) {
  let cfg = config;
  let m = cfg.values.m;
  const shapes = createShapes(gpu);
  const fill = gpu.program("times:fill", FILL);
  const lines = gpu.buffer(new Float32Array(4), { dynamic: true });
  const colors = gpu.buffer(new Float32Array(4), { dynamic: true });
  let count = 0;
  let colorKey = ""; // the colors only change with the palette and the number of points

  function render() {
    if (gpu.isLost()) return;
    const { N, opacity, palette } = cfg.values;
    const { width: w, height: h } = canvas;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.45;
    const ends = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      const [x1, y1] = circlePoint(k, N, cx, cy, r);
      const [x2, y2] = circlePoint((k * m) % N, N, cx, cy, r);
      ends[k * 4] = x1;
      ends[k * 4 + 1] = y1;
      ends[k * 4 + 2] = x2;
      ends[k * 4 + 3] = y2;
    }
    lines.update(ends);
    const key = `${palette}|${N}`;
    if (key !== colorKey) {
      const lut = ctx.palette(palette);
      const c = new Float32Array(N * 4);
      for (let k = 0; k < N; k++) {
        const i = Math.max(0, Math.min(255, Math.round((k / N) * 255))) * 3; // what ctx.color(palette, k / N) picks
        c[k * 4] = lut[i] / 255;
        c[k * 4 + 1] = lut[i + 1] / 255;
        c[k * 4 + 2] = lut[i + 2] / 255;
        c[k * 4 + 3] = 1;
      }
      colors.update(c);
      colorKey = key;
    }
    count = N;
    gpu.draw(fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    shapes.segments(lines, {
      count: N,
      width: Math.max(0.5, ctx.dpr * 0.75),
      color: [1, 1, 1, opacity], // the processor path's globalAlpha
      colors,
      cap: "flat",
      canvas: [w, h],
    });
    ctx.reportStats({ m: m.toFixed(2) });
  }

  render();

  gpu.onRestored(() => {
    colorKey = ""; // the buffers are empty again
    m = cfg.values.m;
    render();
  });

  return {
    path: "gpu",
    update(c) {
      if (c.values.m !== cfg.values.m) m = c.values.m;
      cfg = c;
      render();
    },
    step() {
      if (cfg.values.animate) m = (m + cfg.values.rate) % 100;
    },
    render,
    reset() {
      m = cfg.values.m;
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState: () => ({ m, count }), gpu, finish: () => gpu.finish() } } : {}),
  };
}
