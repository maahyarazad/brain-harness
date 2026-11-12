import { seedFields, grayScottSteps } from "./kernel.js";
import { registerKernel } from "../../core/workerPool.js";
import { gridImage, fitAspect, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

registerKernel("grayScottSteps", grayScottSteps);

const ITERS_PER_STEP = 8;

export default {
  id: "gray-scott",
  name: "Reaction–diffusion",
  howItWorks:
    "Two chemicals, U and V, spread across a surface at different speeds. Wherever they meet, V turns U into more V. U is fed in at the feed rate, and V is removed at the kill rate. That's all, but tiny changes to feed and kill give spots, stripes, mazes, dividing cells and coral. Drag on the picture to add more V.",
  animated: true,
  random: true,
  interactive: true,
  stepsPerFrame: 1,
  knobs: [
    { key: "feed", label: "Feed rate", type: "range", min: 0.01, max: 0.1, step: 0.0001, default: 0.0545 },
    { key: "kill", label: "Kill rate", type: "range", min: 0.04, max: 0.075, step: 0.0001, default: 0.062 },
    { key: "du", label: "Diffusion of U", type: "range", min: 0.2, max: 1.2, step: 0.01, default: 1 },
    { key: "dv", label: "Diffusion of V", type: "range", min: 0.1, max: 0.8, step: 0.01, default: 0.5 },
    {
      key: "size", label: "Grid size", type: "choice", default: "256",
      options: [{ value: "128", label: "128 × 96" }, { value: "256", label: "256 × 192" }, { value: "384", label: "384 × 288" }],
    },
    paletteKnob("palette", "magma"),
  ],
  presets: [
    { id: "coral", name: "Coral", values: { feed: 0.0545, kill: 0.062 } },
    { id: "mitosis", name: "Mitosis (spots)", values: { feed: 0.0367, kill: 0.0649 } },
    { id: "maze", name: "Maze stripes", values: { feed: 0.029, kill: 0.057 } },
    { id: "holes", name: "Holes", values: { feed: 0.039, kill: 0.058 } },
    { id: "waves", name: "Waves", values: { feed: 0.014, kill: 0.054 } },
  ],
  sweep: {
    periodMs: 120000,
    targets: [
      { key: "feed", mode: "wave", min: 0.03, max: 0.06 },
      { key: "kill", mode: "wave", min: 0.058, max: 0.064, phase: 0.25 },
    ],
  },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { presetId: "maze", steps: 1500 },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let W, H, u, v, img, inFlight = null, pendingIters = 0, iterations = 0;
    let paints = [];
    let painting = false;

    function init() {
      inFlight?.cancel();
      inFlight = null;
      pendingIters = 0;
      iterations = 0;
      paints = [];
      W = Number(cfg.values.size);
      H = Math.round(W * 0.75);
      ({ u, v } = seedFields(W, H, ctx.rng));
      img = gridImage(W, H);
    }

    function applyPaints() {
      for (const [cx, cy] of paints) {
        for (let y = -3; y <= 3; y++) {
          for (let x = -3; x <= 3; x++) {
            if (x * x + y * y > 9) continue;
            const i = ((cy + y + H) % H) * W + ((cx + x + W) % W);
            v[i] = 0.5;
            u[i] = 0.25;
          }
        }
      }
      paints = [];
    }

    function pump() {
      if (inFlight || pendingIters === 0) return;
      applyPaints();
      const steps = Math.min(pendingIters, 64);
      pendingIters -= steps;
      const { feed, kill, du, dv } = cfg.values;
      const task = ctx.runKernel("grayScottSteps", { u, v, w: W, h: H, feed, kill, du, dv, steps });
      inFlight = task;
      task.promise.then(
        (r) => {
          if (inFlight !== task) return;
          u = r.u;
          v = r.v;
          iterations += steps;
          inFlight = null;
          applyPaints();
          paintImage();
          pump();
        },
        () => {}
      );
    }

    // Writes the current fields into the image. Only call while the fields are not with the worker.
    function paintImage() {
      const lut = ctx.palette(cfg.values.palette);
      const d = img.data;
      for (let i = 0; i < v.length; i++) {
        const t = Math.min(1, Math.max(0, (v[i] - 0.02) * 3));
        const k = Math.round(t * 255) * 3;
        const p = i * 4;
        d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2]; d[p + 3] = 255;
      }
    }

    // Draws the latest completed frame; the simulation may be running in the worker meanwhile.
    function render() {
      if (!inFlight) {
        applyPaints();
        paintImage();
      }
      clear(g, BG);
      const b = fitAspect(canvas.width, canvas.height, W / H);
      img.blit(g, b.x, b.y, b.w, b.h);
      ctx.reportStats({ iterations });
    }

    function cellAt(ev) {
      const b = fitAspect(canvas.width, canvas.height, W / H);
      return [Math.floor(((ev.x - b.x) / b.w) * W), Math.floor(((ev.y - b.y) / b.h) * H)];
    }

    init();
    render();
    return {
      update(c, changed = []) {
        cfg = c;
        if (changed.includes("size")) init();
        render();
      },
      step() {
        // Don't queue more than a few batches if the worker falls behind.
        pendingIters = Math.min(pendingIters + ITERS_PER_STEP, 256);
        pump();
      },
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {
        inFlight?.cancel();
      },
      pointer(ev) {
        if (ev.type === "down" && ev.button === 0) painting = true;
        if (ev.type === "up") painting = false;
        if ((ev.type === "down" || ev.type === "move") && painting) {
          paints.push(cellAt(ev));
          render();
        }
      },
    };
  },
};
