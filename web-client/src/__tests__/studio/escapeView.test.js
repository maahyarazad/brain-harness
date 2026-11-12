// Pinch, trackpad and drag handling shared by the Mandelbrot and Julia modules.
import { vi } from "vitest";
import mandelbrot from "../../studio/visualizations/mandelbrot/index.js";
import { MAX_ZOOM, SETTLE_MS, PREVIEW_FACTOR } from "../../studio/visualizations/mandelbrot/escapeView.js";
import { escapeBand } from "../../studio/visualizations/mandelbrot/kernel.js";
import { createFrameDriver } from "./browserStubs.js";
import { defaultsOf } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { installCanvasStub } from "./canvasStub.js";
import { makeCanvas } from "./harness.js";

installCanvasStub();

const W = 400;
const H = 300;
const SPAN = 3;

function setup(view) {
  const canvas = makeCanvas(W, H);
  const views = [];
  const notices = [];
  const handle = createModuleContext({
    onView: (v) => views.push(v),
    onNotice: (n) => notices.push(n),
  });
  const cfg = defaultsOf(mandelbrot);
  if (view) cfg.view = { ...cfg.view, ...view };
  const inst = mandelbrot.create(canvas, cfg, handle.ctx);
  const last = () => views.at(-1) ?? cfg.view;
  return { inst, views, notices, last, handle };
}

// The complex-plane point under canvas pixel (px, py) for a view.
function world(view, px, py) {
  const dx = SPAN / view.zoom / Math.min(W, H);
  return [view.cx + (px - W / 2) * dx, view.cy - (py - H / 2) * dx];
}

test("pinch doubles the zoom and keeps the point under the fingers fixed", () => {
  const { inst, last, handle } = setup();
  const before = last();
  const [re, im] = world(before, 100, 80);
  inst.pointer({ type: "pinch", x: 100, y: 80, scale: 2 });
  const after = last();
  expect(after.zoom).toBeCloseTo(before.zoom * 2, 12);
  const [re2, im2] = world(after, 100, 80);
  expect(Math.abs(re2 - re)).toBeLessThan(1e-12);
  expect(Math.abs(im2 - im)).toBeLessThan(1e-12);
  inst.destroy();
  handle.dispose();
});

test("pinching out zooms out but never below 0.5", () => {
  const { inst, last, handle } = setup();
  inst.pointer({ type: "pinch", x: 200, y: 150, scale: 0.8 });
  expect(last().zoom).toBeCloseTo(0.8, 12);
  for (let i = 0; i < 10; i++) inst.pointer({ type: "pinch", x: 200, y: 150, scale: 0.5 });
  expect(last().zoom).toBe(0.5);
  inst.destroy();
  handle.dispose();
});

test("a trackpad pinch (ctrl + wheel) zooms at least as fast as a wheel notch ten times bigger", () => {
  const a = setup();
  a.inst.pointer({ type: "wheel", x: 200, y: 150, deltaY: -10, ctrlKey: true });
  const b = setup();
  b.inst.pointer({ type: "wheel", x: 200, y: 150, deltaY: -100, ctrlKey: false });
  expect(a.last().zoom).toBeGreaterThan(1);
  expect(a.last().zoom).toBeGreaterThanOrEqual(b.last().zoom);
  a.inst.destroy();
  b.inst.destroy();
});

test("pinching past the zoom limit clamps and tells the user once", () => {
  const { inst, last, notices, handle } = setup({ zoom: MAX_ZOOM / 4 });
  for (let i = 0; i < 5; i++) inst.pointer({ type: "pinch", x: 200, y: 150, scale: 2 });
  expect(last().zoom).toBe(MAX_ZOOM);
  expect(notices.filter((n) => /Zoom limit/.test(n))).toHaveLength(1);
  inst.destroy();
  handle.dispose();
});

test("a second finger cancels a drag without panning", () => {
  const { inst, views, handle } = setup();
  inst.pointer({ type: "down", x: 100, y: 100, button: 0 });
  inst.pointer({ type: "move", x: 150, y: 120, button: 0 });
  inst.pointer({ type: "up", x: 150, y: 120, button: 0, cancelDrag: true });
  // A later release must not apply the old drag either.
  inst.pointer({ type: "up", x: 300, y: 200, button: 0 });
  expect(views).toHaveLength(0);
  inst.destroy();
  handle.dispose();
});

// ---- No tearing (US7): kernel jobs finish only when the test releases them ----

describe("zoom without tearing", () => {
  let driver, jobs, origRaf, origCaf;

  beforeEach(() => {
    vi.useFakeTimers();
    driver = createFrameDriver();
    origRaf = globalThis.requestAnimationFrame;
    origCaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = driver.raf;
    globalThis.cancelAnimationFrame = driver.caf;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
    vi.useRealTimers();
  });

  const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };

  function controlledSetup() {
    jobs = [];
    const canvas = makeCanvas(W, H);
    const handle = createModuleContext({});
    handle.ctx.runKernel = (name, args) => {
      let resolve, reject;
      const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
      promise.catch(() => {});
      const job = { args, cancelled: false, done: false };
      job.release = () => !job.cancelled && !job.done && ((job.done = true), resolve(escapeBand(args)));
      jobs.push(job);
      return { promise, cancel: () => !job.done && ((job.cancelled = true), reject(new Error("AbortError"))) };
    };
    const inst = mandelbrot.create(canvas, defaultsOf(mandelbrot), handle.ctx);
    const log = canvas.getContext("2d").log;
    return { inst, log, handle };
  }

  const pending = () => jobs.filter((j) => !j.cancelled && !j.done);
  async function releaseAll() {
    for (let round = 0; round < 5; round++) {
      pending().forEach((j) => j.release());
      await flush();
    }
  }
  const draws = (log) => log.filter((e) => e.op === "drawImage");
  const lowW = Math.ceil(W / PREVIEW_FACTOR);

  test("a pinch redraws the last picture scaled to the new view at once", async () => {
    const { inst, log } = controlledSetup();
    await releaseAll();
    log.length = 0;
    const before = jobs.length;
    inst.pointer({ type: "pinch", x: 100, y: 80, scale: 2 });
    // Synchronously: one scaled copy of the finished frame, no new kernel work yet.
    const d = draws(log);
    expect(d).toHaveLength(1);
    expect(d[0].source).toBe("canvas");
    expect(d[0].dest[2]).toBeCloseTo(W * 2, 6);
    expect(d[0].dest[3]).toBeCloseTo(H * 2, 6);
    // The point under the fingers stays put: (100, 80) maps to itself.
    expect(d[0].dest[0] + 100 * 2).toBeCloseTo(100, 6);
    expect(d[0].dest[1] + 80 * 2).toBeCloseTo(80, 6);
    expect(jobs.length).toBe(before);
  });

  test("the preview pass covers the whole canvas in one draw; nothing is painted strip by strip", async () => {
    const { inst, log } = controlledSetup();
    await releaseAll();
    log.length = 0;
    inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.5 });
    driver.advanceFrames(1);
    const preview = pending();
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((j) => j.args.width === lowW)).toBe(true);
    // Releasing all but one chunk shows nothing new.
    preview.slice(1).forEach((j) => j.release());
    await flush();
    expect(draws(log)).toHaveLength(1); // only the instant scaled copy
    preview[0].release();
    await flush();
    const d = draws(log);
    expect(d).toHaveLength(2);
    expect(d[1].dest).toEqual([0, 0, W, H]);
    expect(log.some((e) => e.op === "putImageData")).toBe(false);
  });

  test("during a burst only preview passes run; the full pass starts once the view settles", async () => {
    const { inst } = controlledSetup();
    await releaseAll();
    const start = jobs.length;
    for (let i = 0; i < 6; i++) {
      inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.1 });
      vi.advanceTimersByTime(16);
      driver.advanceFrames(1);
      pending().forEach((j) => j.release());
      await flush();
    }
    expect(jobs.slice(start).every((j) => j.args.width === lowW)).toBe(true);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(pending().some((j) => j.args.width === W)).toBe(true);
  });

  test("the sharp picture appears in one draw only when every chunk is done", async () => {
    const { inst, log } = controlledSetup();
    await releaseAll();
    inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.2 });
    driver.advanceFrames(1);
    pending().forEach((j) => j.release());
    await flush();
    vi.advanceTimersByTime(SETTLE_MS);
    const full = pending();
    expect(full.length).toBeGreaterThan(1);
    expect(full.every((j) => j.args.width === W)).toBe(true);
    log.length = 0;
    full.slice(1).forEach((j) => j.release());
    await flush();
    expect(draws(log)).toHaveLength(0);
    full[0].release();
    await flush();
    const d = draws(log);
    expect(d).toHaveLength(1);
    expect(d[0].dest).toEqual([0, 0, W, H]);
  });

  test("a new zoom during the full pass cancels it and its results are never drawn", async () => {
    const { inst, log } = controlledSetup();
    await releaseAll();
    inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.2 });
    driver.advanceFrames(1);
    pending().forEach((j) => j.release());
    await flush();
    vi.advanceTimersByTime(SETTLE_MS);
    const full = pending().filter((j) => j.args.width === W);
    expect(full.length).toBeGreaterThan(0);
    inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.2 });
    expect(full.every((j) => j.cancelled)).toBe(true);
    log.length = 0;
    full.forEach((j) => j.release()); // no-ops: cancelled
    await flush();
    expect(draws(log)).toHaveLength(0);
  });

  test("panning follows the pointer live, then sharpens in one step", async () => {
    const { inst, log } = controlledSetup();
    await releaseAll();
    log.length = 0;
    inst.pointer({ type: "down", x: 100, y: 100, button: 0 });
    inst.pointer({ type: "move", x: 130, y: 110, button: 0 });
    const d = draws(log);
    expect(d).toHaveLength(1);
    expect(d[0].dest).toEqual([30, 10, W, H]);
    inst.pointer({ type: "up", x: 130, y: 110, button: 0 });
    driver.advanceFrames(1);
    pending().forEach((j) => j.release());
    await flush();
    vi.advanceTimersByTime(SETTLE_MS);
    const full = pending();
    expect(full.every((j) => j.args.width === W)).toBe(true);
    log.length = 0;
    full.forEach((j) => j.release());
    await flush();
    expect(draws(log)).toEqual([{ op: "drawImage", source: "canvas", dest: [0, 0, W, H] }]);
  });
});
