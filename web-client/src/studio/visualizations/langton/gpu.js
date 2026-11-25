// Langton's ant on the graphics card. The ant's step stays on the processor (antStep, the oracle); the grid is
// kept in a texture and only the rows an ant has touched since the last picture are uploaded (FR-035).
import { parseTurnRule, antStep } from "./kernel.js";
import { DISPLAY, FILL } from "./shaders.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const NOTICE = "The graphics card was reset, so the picture restarted.";
const MAX_ANTS = 8;

export function createLangtonGpu(canvas, gpu, config, ctx, { RUN_STEPS }) {
  let cfg = config;
  let N;
  let grid; // the cells' states: what the kernel works on
  let px; // the same states as texture bytes (red channel), kept in step with `grid`
  let ants;
  let turns;
  let steps;
  let dirtyFrom; // the rows changed since the last upload
  let dirtyTo;
  let tex;
  const colors = gpu.target({ w: 12, h: 1, format: "rgba8", keepData: true });
  const P = { display: gpu.program("langton:display", DISPLAY), fill: gpu.program("langton:fill", FILL) };

  function init(rng = ctx.rng) {
    N = cfg.values.size;
    grid = new Uint8Array(N * N);
    turns = parseTurnRule(cfg.values.rule) ?? [1, -1];
    ants = [{ x: Math.floor(N / 2), y: Math.floor(N / 2), dir: 0 }];
    // The same draws, in the same order, as the processor path: so the same seed gives the same ants.
    for (let i = 1; i < cfg.values.ants; i++) {
      ants.push({
        x: Math.floor(N * (0.2 + 0.6 * rng())),
        y: Math.floor(N * (0.2 + 0.6 * rng())),
        dir: Math.floor(rng() * 4),
      });
    }
    px = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) px[i * 4 + 3] = 255;
    if (!tex) tex = gpu.target({ w: N, h: N, format: "rgba8", keepData: true });
    else gpu.resize(tex, N, N);
    gpu.upload(tex, px);
    steps = 0;
    dirtyFrom = N;
    dirtyTo = -1;
  }

  function uploadColors() {
    const lut = ctx.palette(cfg.values.palette);
    const n = turns.length;
    const data = new Uint8Array(12 * 4);
    for (let s = 0; s < 12; s++) {
      if (s === 0) {
        data[0] = BG_RGB[0];
        data[1] = BG_RGB[1];
        data[2] = BG_RGB[2];
      } else {
        const k = Math.round(60 + (195 * s) / Math.max(1, n - 1)) * 3; // the processor path's expression, unchanged
        data[s * 4] = lut[k];
        data[s * 4 + 1] = lut[k + 1];
        data[s * 4 + 2] = lut[k + 2];
      }
      data[s * 4 + 3] = 255;
    }
    gpu.upload(colors, data);
  }

  /** Sends the rows an ant has changed since the last time. */
  function flush() {
    if (dirtyTo < dirtyFrom) return;
    const from = dirtyFrom;
    const rows = dirtyTo - dirtyFrom + 1;
    gpu.upload(tex, px.subarray(from * N * 4, (from + rows) * N * 4), { x: 0, y: from, w: N, h: rows });
    dirtyFrom = N;
    dirtyTo = -1;
  }

  function render() {
    if (gpu.isLost()) return;
    flush();
    uploadColors();
    const b = fitAspect(canvas.width, canvas.height, 1);
    const viewport = [Math.round(b.x), Math.round(canvas.height - b.y - b.h), Math.round(b.w), Math.round(b.h)];
    const u = { uGrid: tex, uColors: colors, uSize: N };
    for (let i = 0; i < MAX_ANTS; i++) u[`uAnt${i}`] = ants[i] ? [ants[i].x, ants[i].y] : [-1, -1];
    gpu.draw(P.fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    gpu.draw(P.display, u, null, { viewport });
    ctx.reportStats({ steps });
  }

  /** The grid as the texture holds it, and the ants. */
  function readState() {
    flush();
    const bytes = gpu.readback(tex, new Uint8Array(N * N * 4));
    const out = new Uint8Array(N * N);
    for (let i = 0; i < out.length; i++) out[i] = bytes[i * 4];
    return { grid: out, ants: ants.map((a) => ({ ...a })), steps };
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening position of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.some((k) => k === "rule" || k === "ants" || k === "size")) init();
      render();
    },
    step() {
      if (gpu.isLost()) return;
      // Every cell an ant stands on is changed by this step; remember where, then copy the new states across.
      const at = ants.map((a) => a.y * N + a.x);
      antStep(grid, N, N, ants, turns);
      for (const i of at) {
        px[i * 4] = grid[i];
        const y = Math.floor(i / N);
        if (y < dirtyFrom) dirtyFrom = y;
        if (y > dirtyTo) dirtyTo = y;
      }
      steps++;
    },
    /** An animated sweep shows each rule for RUN_STEPS steps, then the next. */
    isDone: () => steps >= RUN_STEPS,
    render,
    reset() {
      init();
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState, gpu, finish: () => gpu.finish() } } : {}),
  };
}
