// Elementary cellular automaton on the graphics card. The processor path (index.js) is the fallback and the
// oracle: every row must equal the one elementaryStep() gives, for the same settings and seed (FR-035).
import { ruleTable } from "./kernel.js";
import { NEXT_ROW, COPY_ROW, DISPLAY, FILL } from "./shaders.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const NOTICE = "The graphics card was reset, so the picture restarted.";

export function createElementaryGpu(canvas, gpu, config, ctx) {
  let cfg = config;
  let W;
  let H;
  let filled; // rows made so far; the newest is row number filled - 1
  let rows; // two W x 1 targets: the row just made, and the one being made
  let hist; // W x H: a ring of the last H rows
  let colors; // H x 1: the color of a live cell on each screen row
  const tableTex = gpu.target({ w: 8, h: 1, format: "rgba8", keepData: true });
  const P = {
    next: gpu.program("eca:next", NEXT_ROW),
    copy: gpu.program("eca:copy", COPY_ROW),
    display: gpu.program("eca:display", DISPLAY),
    fill: gpu.program("eca:fill", FILL),
  };

  function uploadTable() {
    const t = ruleTable(cfg.values.rule);
    const data = new Uint8Array(8 * 4);
    for (let i = 0; i < 8; i++) {
      data[i * 4] = t[i] ? 255 : 0;
      data[i * 4 + 3] = 255;
    }
    gpu.upload(tableTex, data);
  }

  function init(rng = ctx.rng) {
    W = cfg.values.width;
    H = Math.round(W * 0.75);
    const first = new Uint8Array(W);
    // The same draws, in the same order, as the processor path: so the same seed gives the same first row.
    if (cfg.values.start === "single") first[Math.floor(W / 2)] = 1;
    else for (let i = 0; i < W; i++) first[i] = rng() < cfg.values.density ? 1 : 0;
    if (!rows) {
      rows = gpu.pair({ w: W, h: 1, format: "rgba8" });
      hist = gpu.target({ w: W, h: H, format: "rgba8", keepData: true });
      colors = gpu.target({ w: H, h: 1, format: "rgba8", keepData: true });
    } else {
      gpu.resize(rows, W, 1);
      gpu.resize(hist, W, H);
      gpu.resize(colors, H, 1);
    }
    const px = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      px[i * 4] = first[i] ? 255 : 0;
      px[i * 4 + 3] = 255;
    }
    gpu.upload(hist, new Uint8Array(W * H * 4)); // all rows empty
    gpu.upload(hist, px, { x: 0, y: 0, w: W, h: 1 });
    gpu.upload(rows.read, px);
    uploadTable();
    filled = 1;
  }

  function uploadColors() {
    const lut = ctx.palette(cfg.values.palette);
    const data = new Uint8Array(H * 4);
    for (let y = 0; y < H; y++) {
      const k = Math.round(80 + 175 * (y / H)) * 3; // the processor path's expression, unchanged
      data[y * 4] = lut[k];
      data[y * 4 + 1] = lut[k + 1];
      data[y * 4 + 2] = lut[k + 2];
      data[y * 4 + 3] = 255;
    }
    gpu.upload(colors, data);
  }

  function render() {
    if (gpu.isLost()) return;
    uploadColors();
    const b = fitAspect(canvas.width, canvas.height, W / H);
    const viewport = [Math.round(b.x), Math.round(canvas.height - b.y - b.h), Math.round(b.w), Math.round(b.h)];
    gpu.draw(P.fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    gpu.draw(
      P.display,
      { uHist: hist, uColors: colors, uBg: BG_RGB.map((c) => c / 255), uFilled: filled, uRows: H },
      null,
      { viewport }
    );
    ctx.reportStats({ generation: filled - 1 });
  }

  /** The rows on screen, oldest first, as the processor path keeps them. */
  function readRows() {
    const px = gpu.readback(hist, new Uint8Array(W * H * 4));
    const out = [];
    for (let n = Math.max(0, filled - H); n < filled; n++) {
      const r = n % H;
      const row = new Uint8Array(W);
      for (let x = 0; x < W; x++) row[x] = px[(r * W + x) * 4] > 127 ? 1 : 0;
      out.push(row);
    }
    return out;
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening row of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.some((k) => ["width", "start", "density", "rule"].includes(k))) init();
      render();
    },
    step() {
      if (gpu.isLost()) return;
      gpu.draw(P.next, { uPrev: rows.read, uTable: tableTex, uTexel: 1 / W }, rows.write);
      rows.swap();
      gpu.draw(P.copy, { uSrc: rows.read }, hist, { viewport: [0, filled % H, W, 1] });
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
    destroy() {
      gpu.dispose();
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState: readRows, gpu, finish: () => gpu.finish() } } : {}),
  };
}
