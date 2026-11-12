import { dlaGrow, DLA_W, DLA_H } from "./kernel.js";
import { registerKernel } from "../../core/workerPool.js";
import { gridImage, fitAspect, BG, BG_RGB } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

registerKernel("dlaGrow", dlaGrow);

export default {
  id: "dla",
  name: "Diffusion-limited aggregation",
  howItWorks:
    "Particles wander at random, one at a time. When a particle touches the growing cluster it may stick, with a chance set by the stickiness. Tips of the cluster catch wanderers before they can reach the gaps, so branches grow branches: frost, lightning and coral shapes. Low stickiness lets particles slip deeper and makes denser clusters. Colors show the order in which particles arrived.",
  animated: false,
  random: true,
  interactive: false,
  knobs: [
    { key: "particles", label: "Particles", type: "range", min: 100, max: 30000, step: 100, default: 6000, scale: "log", live: false },
    { key: "stickiness", label: "Stickiness", type: "range", min: 0.01, max: 1, step: 0.01, default: 1, live: false },
    {
      key: "seedShape", label: "Seed", type: "choice", default: "point",
      options: [{ value: "point", label: "Point (grows outward)" }, { value: "line", label: "Line (grows upward)" }, { value: "circle", label: "Circle (grows inward)" }],
    },
    paletteKnob("palette", "cividis"),
  ],
  presets: [
    { id: "frost", name: "Frost", values: { seedShape: "point", stickiness: 1, particles: 6000 } },
    { id: "dense", name: "Dense coral", values: { seedShape: "point", stickiness: 0.1, particles: 8000, palette: "magma" } },
    { id: "forest", name: "Lightning forest", values: { seedShape: "line", stickiness: 1, particles: 8000, palette: "viridis" } },
    { id: "inward", name: "Inward growth", values: { seedShape: "circle", stickiness: 0.5, particles: 8000, palette: "fire" } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let result = null;
    let task = null;
    const img = gridImage(DLA_W, DLA_H);

    function paint() {
      clear(g, BG);
      if (!result) return;
      const lut = ctx.palette(cfg.values.palette);
      const d = img.data;
      const total = result.stuck + result.seedCount;
      for (let i = 0; i < result.order.length; i++) {
        const o = result.order[i];
        const p = i * 4;
        if (!o) {
          d[p] = BG_RGB[0]; d[p + 1] = BG_RGB[1]; d[p + 2] = BG_RGB[2];
        } else {
          const t = o <= result.seedCount ? 0 : (o - result.seedCount) / Math.max(1, total - result.seedCount);
          const k = Math.round(40 + 215 * t) * 3;
          d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2];
        }
        d[p + 3] = 255;
      }
      const b = fitAspect(canvas.width, canvas.height, DLA_W / DLA_H);
      img.blit(g, b.x, b.y, b.w, b.h);
    }

    function run() {
      task?.cancel();
      result = null;
      clear(g, BG);
      const { particles, stickiness, seedShape } = cfg.values;
      task = ctx.runKernel(
        "dlaGrow",
        { particles, stickiness, seedShape, seed: cfg.seed },
        { onProgress: (p) => ctx.reportProgress(p) }
      );
      task.promise.then(
        (r) => {
          ctx.reportProgress(1);
          result = r;
          paint();
          ctx.reportStats({ stuck: r.stuck });
          if (r.budgetExhausted) ctx.reportNotice("Stopped early: at this stickiness, walkers rarely stick. Try a higher stickiness.");
          else if (r.stuck < particles) ctx.reportNotice("Stopped when the cluster reached the edge.");
        },
        () => {}
      );
    }

    run();
    return {
      update(c, changed = []) {
        const rerun = changed.some((k) => k !== "palette") || c.seed !== cfg.seed;
        cfg = c;
        if (rerun) run();
        else paint();
      },
      resize: paint,
      destroy() {
        task?.cancel();
      },
    };
  },
};
