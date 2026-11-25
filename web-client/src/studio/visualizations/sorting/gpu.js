// Sorting algorithms on the graphics card. The sort (the generators in kernel.js) stays on the processor and is
// the oracle; the bars or dots are drawn from two small textures in a single pass (FR-035).
import { ALGORITHMS, initialArray } from "./kernel.js";
import { DISPLAY } from "./shaders.js";
import { BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const NOTICE = "The graphics card was reset, so the picture restarted.";
const COMPARE = [255, 209, 102]; // #ffd166
const SWAP = [255, 93, 93]; // #ff5d5d

export function createSortingGpu(canvas, gpu, config, ctx) {
  let cfg = config;
  let arr;
  let view;
  let gen;
  let last;
  let comparisons;
  let swaps;
  let done;
  let n; // the size the textures were made for
  let values;
  let colors;
  const P = { display: gpu.program("sorting:display", DISPLAY) };

  function init(rng = ctx.rng) {
    arr = initialArray(cfg.values.size, cfg.values.order, rng);
    view = arr.slice();
    gen = ALGORITHMS[cfg.values.algorithm](arr);
    last = null;
    comparisons = 0;
    swaps = 0;
    done = false;
    if (!values) {
      values = gpu.target({ w: view.length, h: 1, format: "rgba8", keepData: true });
      colors = gpu.target({ w: view.length, h: 1, format: "rgba8", keepData: true });
    } else if (view.length !== n) {
      gpu.resize(values, view.length, 1);
      gpu.resize(colors, view.length, 1);
    }
    n = view.length;
  }

  /** Sends the values and the colors of the bars. */
  function uploadBars(max) {
    const lut = ctx.palette(cfg.values.palette);
    const v = new Uint8Array(n * 4);
    const c = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      v[i * 4] = view[i] >> 8;
      v[i * 4 + 1] = view[i] & 255;
      v[i * 4 + 3] = 255;
      let rgb;
      if (!done && last && (last.i === i || last.j === i)) rgb = last.op === "compare" ? COMPARE : SWAP;
      else {
        // What ctx.color(palette, t) does: the palette entry at round(t * 255).
        const k = Math.max(0, Math.min(255, Math.round((0.15 + 0.85 * (view[i] / max)) * 255))) * 3;
        rgb = [lut[k], lut[k + 1], lut[k + 2]];
      }
      c[i * 4] = rgb[0];
      c[i * 4 + 1] = rgb[1];
      c[i * 4 + 2] = rgb[2];
      c[i * 4 + 3] = 255;
    }
    gpu.upload(values, v);
    gpu.upload(colors, c);
  }

  function render() {
    if (gpu.isLost()) return;
    const { width: w, height: h } = canvas;
    let max = 0;
    for (let i = 0; i < n; i++) if (view[i] > max) max = view[i];
    uploadBars(max);
    const bw = w / n;
    const dots = cfg.values.display === "bars" ? 0 : 1;
    gpu.draw(
      P.display,
      {
        uValues: values,
        uColors: colors,
        uSize: [w, h],
        uN: n,
        uMax: max,
        uBarW: Math.max(1, bw - (bw > 3 ? 1 : 0)),
        uDots: dots,
        uRadius: Math.max(1.5, Math.min(bw / 2, 4 * ctx.dpr)),
        uBg: BG_RGB.map((x) => x / 255),
      },
      null
    );
    ctx.reportStats({ comparisons, swaps, status: done ? "Sorted" : "Sorting" });
  }

  /** What the textures hold, decoded, and the counters. */
  function readState() {
    let max = 0;
    for (let i = 0; i < n; i++) if (view[i] > max) max = view[i];
    uploadBars(max);
    const bytes = gpu.readback(values, new Uint8Array(n * 4));
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = bytes[i * 4] * 256 + bytes[i * 4 + 1];
    return { view: out, last: last ? { ...last } : null, comparisons, swaps, done };
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening array of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.some((k) => ["algorithm", "size", "order"].includes(k))) init();
      render();
    },
    step() {
      if (done || gpu.isLost()) return;
      const r = gen.next();
      if (r.done) {
        done = true;
        last = null;
        return;
      }
      last = r.value;
      if (last.op === "compare") comparisons++;
      else if (last.op === "swap") {
        swaps++;
        [view[last.i], view[last.j]] = [view[last.j], view[last.i]];
      } else {
        swaps++;
        view[last.i] = last.value;
      }
    },
    /** The array is sorted: an animated sweep can start the next algorithm. */
    isDone: () => done,
    /** A finished sort changes nothing until the settings or the array do, so the loop can stop asking for frames (FR-024). */
    isIdle: () => done,
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
