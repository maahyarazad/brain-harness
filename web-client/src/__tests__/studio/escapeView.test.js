// Pinch, trackpad and drag handling shared by the Mandelbrot and Julia modules.
import { vi } from "vitest";
import mandelbrot from "../../studio/visualizations/mandelbrot/index.js";
import { MAX_ZOOM } from "../../studio/visualizations/mandelbrot/escapeView.js";
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

test("pinch bursts start at most one render per frame", async () => {
  const { inst, handle } = setup();
  const spy = vi.spyOn(handle.ctx, "runKernel");
  for (let i = 0; i < 6; i++) inst.pointer({ type: "pinch", x: 200, y: 150, scale: 1.1 });
  await new Promise((r) => setTimeout(r, 50));
  const bands = Math.ceil(H / 16);
  expect(spy.mock.calls.length).toBe(bands);
  inst.destroy();
  handle.dispose();
});
