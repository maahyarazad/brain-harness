// Game of Life on the graphics card. The processor path (index.js) is the fallback and the oracle: this
// instance must produce exactly the same grid, step for step, for the same settings and seed (FR-035).
import { parseRule, randomGrid, aliveCells } from "./kernel.js";
import { STEP, DISPLAY, CLEAR, FILL } from "./shaders.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const ALIVE_INDEX = 200; // the palette entry a live cell uses, as in the processor path
const NOTICE = "The graphics card was reset, so the picture restarted.";

export function createLifeGpu(canvas, gpu, config, ctx, { MAX_CELLS }) {
  let cfg = config;
  let W;
  let H;
  let rule;
  let generation = 0;
  let drawing = null;
  let state; // ping-pong pair of W x H rgba8 textures
  const ruleTex = gpu.target({ w: 9, h: 1, format: "rgba8", keepData: true });
  const P = { step: gpu.program("life:step", STEP), display: gpu.program("life:display", DISPLAY), clear: gpu.program("life:clear", CLEAR), fill: gpu.program("life:fill", FILL) };

  const bits = (grid) => {
    const out = new Uint8Array(grid.length * 4);
    for (let i = 0; i < grid.length; i++) {
      out[i * 4] = grid[i] ? 255 : 0;
      out[i * 4 + 3] = 255;
    }
    return out;
  };

  function uploadRule() {
    const data = new Uint8Array(9 * 4);
    for (let n = 0; n < 9; n++) {
      data[n * 4] = rule.birth.has(n) ? 255 : 0;
      data[n * 4 + 1] = rule.survive.has(n) ? 255 : 0;
      data[n * 4 + 3] = 255;
    }
    gpu.upload(ruleTex, data);
  }

  /** `rng` is the running generator for a normal start, as in the processor path; a restored context starts over from the seed. */
  function init(rng = ctx.rng) {
    W = cfg.values.size;
    H = Math.round(W * 0.75);
    rule = parseRule(cfg.values.rule) ?? parseRule("B3/S23");
    let grid;
    if (cfg.input?.cells) {
      grid = new Uint8Array(W * H);
      for (const [x, y] of cfg.input.cells) if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = 1;
    } else {
      // The same call, in the same order, as the processor path: so the same seed gives the same grid.
      grid = randomGrid(W, H, cfg.values.density, rng);
    }
    if (!state) state = gpu.pair({ w: W, h: H, format: "rgba8" });
    else gpu.resize(state, W, H);
    gpu.upload(state.read, bits(grid));
    uploadRule();
    generation = 0;
  }

  function box() {
    return fitAspect(canvas.width, canvas.height, W / H);
  }

  function render() {
    if (gpu.isLost()) return;
    const lut = ctx.palette(cfg.values.palette);
    const k = ALIVE_INDEX * 3;
    const b = box();
    // The picture is fitted and centred. fitAspect counts y from the top; a GL viewport counts from the bottom.
    const viewport = [Math.round(b.x), Math.round(canvas.height - b.y - b.h), Math.round(b.w), Math.round(b.h)];
    // Clear the whole canvas to the studio background, then draw the grid inside its box.
    gpu.draw(P.fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    gpu.draw(
      P.display,
      { uState: state.read, uAlive: [lut[k] / 255, lut[k + 1] / 255, lut[k + 2] / 255], uDead: [(BG_RGB[0] + 8) / 255, (BG_RGB[1] + 8) / 255, (BG_RGB[2] + 10) / 255] },
      null,
      { viewport }
    );
    ctx.reportStats({ generation });
  }

  function cellAt(ev) {
    const b = box();
    const x = Math.floor(((ev.x - b.x) / b.w) * W);
    const y = Math.floor(((ev.y - b.y) / b.h) * H);
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  }

  const readCell = ({ x, y }) => {
    const out = new Uint8Array(4);
    gpu.readback(state.read, out, { x, y, w: 1, h: 1 });
    return out[0] > 127 ? 1 : 0;
  };
  const writeCell = ({ x, y }, v) => gpu.upload(state.read, new Uint8Array([v ? 255 : 0, 0, 0, 255]), { x, y, w: 1, h: 1 });

  function readGrid() {
    const px = gpu.readback(state.read, new Uint8Array(W * H * 4));
    const grid = new Uint8Array(W * H);
    for (let i = 0; i < grid.length; i++) grid[i] = px[i * 4] > 127 ? 1 : 0;
    return grid;
  }

  function commitDrawing() {
    const input = { cells: aliveCells(readGrid(), W).slice(0, MAX_CELLS) };
    cfg = { ...cfg, input };
    ctx.setInput(input);
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening grid of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      const restart = changed.some((k) => k === "size" || k === "density") || c.input !== cfg.input;
      cfg = c;
      if (changed.includes("rule")) {
        rule = parseRule(c.values.rule) ?? rule;
        uploadRule();
      }
      if (restart) init();
      render();
    },
    step() {
      if (gpu.isLost()) return;
      gpu.draw(P.step, { uState: state.read, uRule: ruleTex, uTexel: [1 / W, 1 / H], uWrap: cfg.values.wrap ? 1 : 0 }, state.write);
      state.swap();
      generation++;
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
      if (ev.type === "down" && ev.button === 0) {
        const c = cellAt(ev);
        if (!c) return;
        drawing = readCell(c) ? 0 : 1;
        writeCell(c, drawing);
        render();
      } else if (ev.type === "move" && drawing !== null) {
        const c = cellAt(ev);
        if (c && readCell(c) !== drawing) {
          writeCell(c, drawing);
          render();
        }
      } else if (ev.type === "up" && drawing !== null) {
        drawing = null;
        commitDrawing();
      } else if (ev.type === "key" && (ev.key === "c" || ev.key === "C")) {
        gpu.draw(P.clear, {}, state.read);
        gpu.draw(P.clear, {}, state.write);
        generation = 0;
        render();
        commitDrawing();
        return true;
      }
      return undefined;
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState: readGrid, gpu, finish: () => gpu.finish() } } : {}),
  };
}
