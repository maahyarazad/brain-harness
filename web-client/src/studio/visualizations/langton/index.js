import { parseTurnRule, antStep } from "./kernel.js";
import { gridImage, fitAspect, BG, BG_RGB } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "langtons-ant",
  name: "Langton's ant",
  howItWorks:
    "An ant sits on a grid of colored cells. On each step it looks at its cell's color, turns right (R) or left (L) as the rule says for that color, changes the cell to the next color, and moves forward one cell. With the classic rule RL, the ant makes chaos for about 10,000 steps and then, suddenly, builds a straight diagonal highway forever. Longer rules like RLLR make symmetric patterns.",
  animated: true,
  random: true,
  interactive: false,
  stepsPerFrame: 50,
  knobs: [
    {
      key: "rule", label: "Turn rule (L/R per color)", type: "text", default: "RL", maxLength: 12,
      pattern: /^[LR]{2,12}$/, patternMessage: "Use 2 to 12 letters, only L and R",
    },
    { key: "ants", label: "Ants", type: "range", min: 1, max: 8, step: 1, default: 1, live: false },
    { key: "size", label: "Grid size", type: "range", min: 64, max: 512, step: 1, default: 200, live: false },
    paletteKnob("palette", "cividis"),
  ],
  presets: [
    { id: "classic", name: "Classic (RL)", values: { rule: "RL" } },
    { id: "rllr", name: "RLLR (symmetric)", values: { rule: "RLLR" } },
    { id: "llrr", name: "LLRR (growing)", values: { rule: "LLRR" } },
    { id: "lrrrrrllr", name: "LRRRRRLLR (square)", values: { rule: "LRRRRRLLR" } },
    { id: "crowd", name: "Four ants", values: { rule: "RL", ants: 4 } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let N, grid, ants, turns, img, steps;

    function init() {
      N = cfg.values.size;
      grid = new Uint8Array(N * N);
      turns = parseTurnRule(cfg.values.rule) ?? [1, -1];
      ants = [{ x: Math.floor(N / 2), y: Math.floor(N / 2), dir: 0 }];
      for (let i = 1; i < cfg.values.ants; i++) {
        ants.push({
          x: Math.floor(N * (0.2 + 0.6 * ctx.rng())),
          y: Math.floor(N * (0.2 + 0.6 * ctx.rng())),
          dir: Math.floor(ctx.rng() * 4),
        });
      }
      img = gridImage(N, N);
      steps = 0;
    }

    function render() {
      const lut = ctx.palette(cfg.values.palette);
      const d = img.data;
      const n = turns.length;
      for (let i = 0; i < grid.length; i++) {
        const s = grid[i];
        const p = i * 4;
        if (s === 0) {
          d[p] = BG_RGB[0]; d[p + 1] = BG_RGB[1]; d[p + 2] = BG_RGB[2];
        } else {
          const k = Math.round(60 + (195 * s) / Math.max(1, n - 1)) * 3;
          d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2];
        }
        d[p + 3] = 255;
      }
      for (const a of ants) {
        const p = (a.y * N + a.x) * 4;
        d[p] = 255; d[p + 1] = 60; d[p + 2] = 60;
      }
      clear(g, BG);
      const b = fitAspect(canvas.width, canvas.height, 1);
      img.blit(g, b.x, b.y, b.w, b.h);
      ctx.reportStats({ steps });
    }

    init();
    render();
    return {
      update(c, changed = []) {
        cfg = c;
        if (changed.some((k) => k === "rule" || k === "ants" || k === "size")) init();
        render();
      },
      step() {
        antStep(grid, N, N, ants, turns);
        steps++;
      },
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
    };
  },
};
