import { parseRule, lifeStep, randomGrid, aliveCells, GLIDER_GUN } from "./kernel.js";
import { gridImage, fitAspect, BG, BG_RGB } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const MAX_CELLS = 4000;

function validateInput(input) {
  const cells = Array.isArray(input?.cells)
    ? input.cells.filter((c) => Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1])).slice(0, MAX_CELLS)
    : [];
  const replaced = cells.length !== (input?.cells?.length ?? 0) ? [{ key: "input.cells", given: "…", used: `${cells.length} cells` }] : [];
  return { value: cells.length ? { cells } : null, replaced };
}

export default {
  id: "game-of-life",
  name: "Game of Life",
  howItWorks:
    "Each cell of the grid is alive or dead. At every step, a dead cell with exactly the right number of live neighbors is born, and a live cell survives only with the right number of neighbors; all others die. Conway's rule is B3/S23: born with 3, survives with 2 or 3. Try other rules like HighLife (B36/S23). Click or drag on the grid to draw cells; press C with the grid focused to clear it.",
  animated: true,
  random: true,
  interactive: true,
  stepsPerFrame: 0.25,
  validateInput,
  knobs: [
    {
      key: "rule", label: "Rule (B…/S…)", type: "text", default: "B3/S23", maxLength: 24,
      parse: (t) => (parseRule(t) ? { ok: true } : { ok: false, error: "Write the rule like B3/S23" }),
    },
    { key: "size", label: "Grid width", type: "range", min: 32, max: 512, step: 1, default: 160, live: false },
    { key: "density", label: "Starting density", type: "range", min: 0, max: 1, step: 0.01, default: 0.3, live: false },
    { key: "wrap", label: "Wrap edges", type: "toggle", default: true },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "conway", name: "Conway (B3/S23)", values: { rule: "B3/S23" } },
    { id: "highlife", name: "HighLife (B36/S23)", values: { rule: "B36/S23", density: 0.25 } },
    { id: "seeds", name: "Seeds (B2/S)", values: { rule: "B2/S", density: 0.05 } },
    { id: "daynight", name: "Day & Night", values: { rule: "B3678/S34678", density: 0.5 } },
    { id: "gun", name: "Gosper glider gun", values: { rule: "B3/S23", size: 80, wrap: false }, input: { cells: GLIDER_GUN } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let W, H, grid, next, img, rule, generation;
    let drawing = null;

    function init() {
      W = cfg.values.size;
      H = Math.round(W * 0.75);
      rule = parseRule(cfg.values.rule) ?? parseRule("B3/S23");
      if (cfg.input?.cells) {
        grid = new Uint8Array(W * H);
        for (const [x, y] of cfg.input.cells) if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = 1;
      } else {
        grid = randomGrid(W, H, cfg.values.density, ctx.rng);
      }
      next = new Uint8Array(W * H);
      img = gridImage(W, H);
      generation = 0;
    }

    function box() {
      return fitAspect(canvas.width, canvas.height, W / H);
    }

    function render() {
      const lut = ctx.palette(cfg.values.palette);
      const d = img.data;
      const k = 200 * 3;
      for (let i = 0; i < grid.length; i++) {
        const p = i * 4;
        if (grid[i]) {
          d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2];
        } else {
          d[p] = BG_RGB[0] + 8; d[p + 1] = BG_RGB[1] + 8; d[p + 2] = BG_RGB[2] + 10;
        }
        d[p + 3] = 255;
      }
      clear(g, BG);
      const b = box();
      img.blit(g, b.x, b.y, b.w, b.h);
      ctx.reportStats({ generation });
    }

    function cellAt(ev) {
      const b = box();
      const x = Math.floor(((ev.x - b.x) / b.w) * W);
      const y = Math.floor(((ev.y - b.y) / b.h) * H);
      return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
    }

    function commitDrawing() {
      const input = { cells: aliveCells(grid, W).slice(0, MAX_CELLS) };
      cfg = { ...cfg, input };
      ctx.setInput(input);
    }

    init();
    render();
    return {
      update(c, changed = []) {
        const restart = changed.some((k) => k === "size" || k === "density") || c.input !== cfg.input;
        cfg = c;
        if (changed.includes("rule")) rule = parseRule(c.values.rule) ?? rule;
        if (restart) init();
        render();
      },
      step() {
        lifeStep(grid, next, W, H, rule, cfg.values.wrap);
        [grid, next] = [next, grid];
        generation++;
      },
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
      pointer(ev) {
        if (ev.type === "down" && ev.button === 0) {
          const i = cellAt(ev);
          if (i < 0) return;
          drawing = grid[i] ? 0 : 1;
          grid[i] = drawing;
          render();
        } else if (ev.type === "move" && drawing !== null) {
          const i = cellAt(ev);
          if (i >= 0 && grid[i] !== drawing) {
            grid[i] = drawing;
            render();
          }
        } else if (ev.type === "up" && drawing !== null) {
          drawing = null;
          commitDrawing();
        } else if (ev.type === "key" && (ev.key === "c" || ev.key === "C")) {
          grid.fill(0);
          generation = 0;
          render();
          commitDrawing();
          return true;
        }
      },
    };
  },
};
