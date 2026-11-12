import { ruleTable, elementaryStep } from "./kernel.js";
import { gridImage, fitAspect, BG, BG_RGB } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "elementary-ca",
  name: "Elementary cellular automaton",
  howItWorks:
    "A single row of cells, each on or off. The next row is worked out cell by cell from the cell and its two neighbors: 8 possible patterns, each mapped to on or off. Those 8 answers, read as a binary number, are the rule number from 0 to 255. Rule 30 looks random, Rule 90 draws the Sierpiński triangle, and Rule 110 can compute anything a computer can. Rows scroll upward as new ones are added.",
  animated: true,
  random: true,
  interactive: false,
  stepsPerFrame: 1,
  knobs: [
    { key: "rule", label: "Rule number", type: "range", min: 0, max: 255, step: 1, default: 30 },
    { key: "width", label: "Width (cells)", type: "range", min: 64, max: 1024, step: 1, default: 400, live: false },
    {
      key: "start", label: "Start", type: "choice", default: "single",
      options: [{ value: "single", label: "Single cell" }, { value: "random", label: "Random" }],
    },
    { key: "density", label: "Starting density", type: "range", min: 0, max: 1, step: 0.01, default: 0.5, when: (v) => v.start === "random" },
    paletteKnob("palette", "magma"),
  ],
  presets: [
    { id: "r30", name: "Rule 30", values: { rule: 30, start: "single" } },
    { id: "r90", name: "Rule 90", values: { rule: 90, start: "single" } },
    { id: "r110", name: "Rule 110", values: { rule: 110, start: "random", density: 0.5 } },
    { id: "r184", name: "Rule 184 (traffic)", values: { rule: 184, start: "random", density: 0.45 } },
  ],
  sweep: { kind: "run", targets: [{ key: "rule", mode: "steps", list: [30, 90, 110, 184, 54, 150, 73] }] },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let W, H, rows, filled, table, img;

    function init() {
      W = cfg.values.width;
      H = Math.round(W * 0.75);
      table = ruleTable(cfg.values.rule);
      rows = [];
      const first = new Uint8Array(W);
      if (cfg.values.start === "single") first[Math.floor(W / 2)] = 1;
      else for (let i = 0; i < W; i++) first[i] = ctx.rng() < cfg.values.density ? 1 : 0;
      rows.push(first);
      filled = 1;
      img = gridImage(W, H);
    }

    function render() {
      const lut = ctx.palette(cfg.values.palette);
      const d = img.data;
      d.fill(0);
      for (let y = 0; y < H; y++) {
        const row = rows[y];
        for (let x = 0; x < W; x++) {
          const p = (y * W + x) * 4;
          if (row && row[x]) {
            const k = Math.round(80 + 175 * (y / H)) * 3;
            d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2];
          } else {
            d[p] = BG_RGB[0]; d[p + 1] = BG_RGB[1]; d[p + 2] = BG_RGB[2];
          }
          d[p + 3] = 255;
        }
      }
      clear(g, BG);
      const b = fitAspect(canvas.width, canvas.height, W / H);
      img.blit(g, b.x, b.y, b.w, b.h);
      ctx.reportStats({ generation: filled - 1 });
    }

    init();
    render();
    return {
      update(c, changed = []) {
        cfg = c;
        if (changed.some((k) => ["width", "start", "density"].includes(k))) init();
        else if (changed.includes("rule")) {
          table = ruleTable(c.values.rule);
          init();
        }
        render();
      },
      step() {
        const last = rows[rows.length - 1];
        const next = new Uint8Array(W);
        elementaryStep(last, next, table, true);
        rows.push(next);
        if (rows.length > H) rows.shift();
        filled++;
      },
      /** The screen is full of rows: an animated sweep can start the next rule. */
      isDone: () => filled >= H,
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
