// Reaction–diffusion on the graphics card. The processor path (index.js, with its worker) is the fallback;
// the kernel in kernel.js is the oracle for the first few steps (FR-035: "looks the same", not bit for bit,
// because float arithmetic on a graphics card can differ in the last digits).
import { seedFields } from "./kernel.js";
import { STEP, DISPLAY, FILL } from "./shaders.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const NOTICE = "The graphics card was reset, so the picture restarted.";

export function createGrayScottGpu(canvas, gpu, config, ctx, { ITERS_PER_STEP }) {
  let cfg = config;
  let W;
  let H;
  let state; // ping-pong pair, float32, W x H
  let iterations = 0;
  let paints = [];
  let painting = false;
  const P = { step: gpu.program("gs:step", STEP), display: gpu.program("gs:display", DISPLAY), fill: gpu.program("gs:fill", FILL) };

  function init(rng = ctx.rng) {
    paints = [];
    iterations = 0;
    W = Number(cfg.values.size);
    H = Math.round(W * 0.75);
    const { u, v } = seedFields(W, H, rng);
    const data = new Float32Array(W * H * 4);
    for (let i = 0; i < u.length; i++) {
      data[i * 4] = u[i];
      data[i * 4 + 1] = v[i];
      data[i * 4 + 3] = 1;
    }
    if (!state) state = gpu.pair({ w: W, h: H, format: "rgba32f" });
    else gpu.resize(state, W, H);
    gpu.upload(state.read, data);
  }

  /** The processor path's paint: a disc of radius 3 set to v = 0.5, u = 0.25, wrapping at the edges. */
  function applyPaints() {
    const cell = new Float32Array([0.25, 0.5, 0, 1]);
    for (const [cx, cy] of paints) {
      for (let y = -3; y <= 3; y++) {
        for (let x = -3; x <= 3; x++) {
          if (x * x + y * y > 9) continue;
          const xi = (cx + x + W) % W;
          const yi = (cy + y + H) % H;
          if (xi < 0 || yi < 0) continue; // the processor path writes nowhere for these
          gpu.upload(state.read, cell, { x: xi, y: yi, w: 1, h: 1 });
        }
      }
    }
    paints = [];
  }

  function render() {
    if (gpu.isLost()) return;
    applyPaints();
    const b = fitAspect(canvas.width, canvas.height, W / H);
    const viewport = [Math.round(b.x), Math.round(canvas.height - b.y - b.h), Math.round(b.w), Math.round(b.h)];
    gpu.draw(P.fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    gpu.draw(P.display, { uState: state.read, uPalette: gpu.paletteTexture(ctx.palette(cfg.values.palette)) }, null, { viewport });
    ctx.reportStats({ iterations });
  }

  function cellAt(ev) {
    const b = fitAspect(canvas.width, canvas.height, W / H);
    return [Math.floor(((ev.x - b.x) / b.w) * W), Math.floor(((ev.y - b.y) / b.h) * H)];
  }

  /** The two fields as the graphics card holds them. */
  function readState() {
    applyPaints();
    const px = gpu.readback(state.read, new Float32Array(W * H * 4));
    const u = new Float32Array(W * H);
    const v = new Float32Array(W * H);
    for (let i = 0; i < u.length; i++) {
      u[i] = px[i * 4];
      v[i] = px[i * 4 + 1];
    }
    return { u, v, w: W, h: H, iterations };
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening fields of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.includes("size")) init();
      render();
    },
    step() {
      if (gpu.isLost()) return;
      applyPaints();
      const { feed, kill, du, dv } = cfg.values;
      const uniforms = { uTexel: [1 / W, 1 / H], uFeed: feed, uKill: kill, uDu: du, uDv: dv };
      for (let i = 0; i < ITERS_PER_STEP; i++) {
        gpu.draw(P.step, { ...uniforms, uState: state.read }, state.write);
        state.swap();
      }
      iterations += ITERS_PER_STEP;
    },
    render,
    reset() {
      init();
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    pointer(ev) {
      if (ev.type === "down" && ev.button === 0) painting = true;
      if (ev.type === "up") painting = false;
      if ((ev.type === "down" || ev.type === "move") && painting) {
        paints.push(cellAt(ev));
        render();
      }
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState, gpu, finish: () => gpu.finish() } } : {}),
  };
}
