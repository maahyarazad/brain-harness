// The fluid's life on a real device: a lost graphics context, new sizes, quality changes, leaving and
// coming back, and the older WebGL 1 path (specs/005 Story 3, FR-017 to FR-019, SC-007).
import { afterEach, describe, expect, test, vi } from "vitest";
import fluid from "../../studio/visualizations/fluid/index.js";
import { withQuality } from "../../studio/core/quality.js";
import { defaultsOf, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { resetProbeCache } from "../../studio/visualizations/_shared/gpu/index.js";
import { LOST_TEXT, RESET_NOTICE } from "../../studio/visualizations/fluid/gpu.js";

const module = withQuality(fluid);
let live = [];

function start({ values = {}, seed = 1, w = 256, h = 192, quality = "low", ctxOptions = {} } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const base = defaultsOf(module);
  const cfg = validateConfig(module, { ...base, seed, values: { ...base.values, quality, ...values } }).config;
  const handle = createModuleContext({ seed, dpr: 1, ...ctxOptions });
  const inst = module.create(canvas, cfg, handle.ctx);
  live.push({ inst, handle });
  return { inst, canvas, handle, ctx: handle.ctx, cfg, state: () => inst.__debug.readState(), step: (n = 1) => { for (let i = 0; i < n; i++) inst.step(); } };
}

afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
  delete globalThis.__VIZ_GL_VERSION__;
  resetProbeCache();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextEvent = (canvas, name) => new Promise((r) => canvas.addEventListener(name, r, { once: true }));
const total = (arr) => {
  let s = 0;
  for (let i = 0; i < arr.length; i += 4) s += arr[i] + arr[i + 1] + arr[i + 2];
  return s;
};
const meanInk = (s) => total(s.dye) / (s.dye.length / 4);
const maxDiff = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
/** Mean brightness of the canvas pixels, and how far right the brightness sits (0..1). */
function canvasInk(pixels, w, h) {
  let sum = 0;
  let sx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - 20; // above the studio background (#0f0f12, brightest channel 18)
      if (v > 0) {
        sum += v;
        sx += v * x;
      }
    }
  }
  return { sum, centroid: sum > 0 ? sx / sum / w : NaN };
}

describe("a lost graphics context (FR-017)", () => {
  test("when it comes back, the fluid restarts from its opening scene and says so", async () => {
    const onNotice = vi.fn();
    const fresh = start({ seed: 6 });
    const f = start({ seed: 6, ctxOptions: { onNotice } });
    f.step(30); // it has moved on from the opening scene
    const gl = f.inst.__debug.gpu.gl;
    const ext = gl.getExtension("WEBGL_lose_context");
    const lost = nextEvent(f.canvas, "webglcontextlost");
    ext.loseContext();
    await lost;
    await wait(30);
    expect(() => {
      f.step(3); // calls while lost are harmless
      f.inst.render();
    }).not.toThrow();
    const restored = nextEvent(f.canvas, "webglcontextrestored");
    ext.restoreContext();
    await restored;
    await wait(50);
    expect(onNotice).toHaveBeenCalledWith(RESET_NOTICE);
    expect(maxDiff(f.state().dye, fresh.state().dye)).toBeLessThan(1e-6); // the opening scene of the same seed
    f.step(5);
    expect(total(f.state().dye)).toBeGreaterThan(0.5); // and it runs again
  });

  test("a context that is not restored in time shows a message with a Restart action", async () => {
    const onMessage = vi.fn();
    const onRestart = vi.fn();
    const f = start({ ctxOptions: { onMessage, onRestart } });
    f.inst.__debug.gpu.gl.getExtension("WEBGL_lose_context").loseContext();
    await wait(3400); // the toolkit waits 3 s for a restore
    expect(onMessage).toHaveBeenCalledTimes(1);
    const message = onMessage.mock.calls[0][0];
    expect(message.text).toBe(LOST_TEXT);
    expect(message.actionLabel).toBe("Restart");
    message.onAction();
    expect(onRestart).toHaveBeenCalledWith({});
  }, 20000);
});

describe("a new picture size or quality keeps the ink and the motion (FR-019, edge case 'Quality changed mid-run')", () => {
  function stirred(opts) {
    const f = start(opts);
    f.inst.action("clear");
    f.pointer = (type, id, x, y) => f.inst.pointer({ type, pointerId: id, x, y, button: 0 });
    f.pointer("down", 1, 60, 96);
    for (let i = 1; i <= 8; i++) f.pointer("move", 1, 60 + i * 15, 96 + (i % 2) * 6);
    f.pointer("up", 1, 180, 96);
    f.step(10);
    return f;
  }

  test("turning the phone (a different shape) resamples the fields instead of clearing them", () => {
    const f = stirred({});
    const before = f.state();
    f.canvas.width = 192;
    f.canvas.height = 256;
    f.inst.resize(192, 256);
    const after = f.state();
    expect(after.dyeSize.h).toBeGreaterThan(after.dyeSize.w); // the grids follow the new shape
    expect(meanInk(after)).toBeGreaterThan(meanInk(before) * 0.8);
    expect(meanInk(after)).toBeLessThan(meanInk(before) * 1.25);
    expect(total(after.velocity.map(Math.abs))).toBeGreaterThan(0);
    f.step(5);
    expect(total(f.state().dye)).toBeGreaterThan(0);
  });

  test("a bigger window keeps the picture too", () => {
    const f = stirred({});
    const before = f.state();
    f.canvas.width = 512;
    f.canvas.height = 384;
    f.inst.resize(512, 384);
    expect(meanInk(f.state())).toBeGreaterThan(meanInk(before) * 0.8);
  });

  test.each([["high"], ["medium"], ["low"]])("changing Quality to %s keeps the ink and never leaves an empty frame", (level) => {
    const f = stirred({ quality: level === "low" ? "high" : "low" });
    const before = f.state();
    f.inst.setQuality(level, { automatic: false });
    const after = f.state();
    const was = before.dyeSize.w;
    expect(after.dyeSize.w).not.toBe(was);
    expect(meanInk(after)).toBeGreaterThan(meanInk(before) * 0.8);
    expect(meanInk(after)).toBeLessThan(meanInk(before) * 1.25);
    expect(total(after.dye)).toBeGreaterThan(0);
  });

  test("the grids follow the quality level: Low is coarser than Medium than High", () => {
    const sizes = ["low", "medium", "high"].map((q) => start({ quality: q }).state().dyeSize.w);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });
});

describe("leaving and coming back (SC-007, FR-018)", () => {
  test("opening and leaving 30 times in a row works every time, and the context is given back", () => {
    for (let i = 0; i < 30; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 96;
      const handle = createModuleContext({ seed: 1, dpr: 1 });
      const base = defaultsOf(module);
      const cfg = validateConfig(module, { ...base, values: { ...base.values, quality: "low" } }).config;
      const inst = module.create(canvas, cfg, handle.ctx);
      expect(inst.path, `open #${i + 1}`).toBe("gpu");
      inst.step();
      inst.render();
      expect(total(inst.__debug.readState().dye)).toBeGreaterThan(0);
      inst.destroy();
      handle.dispose();
    }
    const f = start();
    expect(f.inst.path).toBe("gpu");
  });

  test("destroying twice, or touching it afterwards, does nothing", () => {
    const f = start();
    f.inst.destroy();
    expect(() => {
      f.inst.destroy();
      f.step(2);
      f.inst.render();
      f.inst.action("burst");
      f.inst.pointer({ type: "down", pointerId: 1, x: 5, y: 5 });
    }).not.toThrow();
  });
});

describe("the older WebGL 1 path", () => {
  function oldPath() {
    globalThis.__VIZ_GL_VERSION__ = 1;
    resetProbeCache();
    return start();
  }

  test("runs the same simulation: ink appears where dragged, then is carried along", () => {
    const f = oldPath();
    expect(f.inst.path).toBe("gpu");
    expect(f.inst.__debug.gpu.version).toBe(1);
    f.inst.action("clear");
    f.inst.render();
    expect(canvasInk(f.inst.__debug.readCanvas(), 256, 192).sum).toBe(0);
    const p = (type, x, y) => f.inst.pointer({ type, pointerId: 1, x, y, button: 0 });
    p("down", 60, 96);
    for (let i = 1; i <= 8; i++) p("move", 60 + i * 12, 96);
    p("up", 156, 96);
    f.inst.render();
    const first = canvasInk(f.inst.__debug.readCanvas(), 256, 192);
    expect(first.sum).toBeGreaterThan(500);
    for (let i = 0; i < 30; i++) f.inst.step();
    f.inst.render();
    const later = canvasInk(f.inst.__debug.readCanvas(), 256, 192);
    expect(later.sum).toBeGreaterThan(0);
    expect(later.centroid).toBeGreaterThan(first.centroid); // carried to the right by the flow it was dragged along
  });

  test("Burst and Clear work, and a lost context there is handled the same way", async () => {
    const f = oldPath();
    f.inst.action("clear");
    f.inst.action("burst");
    f.inst.render();
    expect(canvasInk(f.inst.__debug.readCanvas(), 256, 192).sum).toBeGreaterThan(5000);
    f.inst.action("clear");
    f.inst.render();
    expect(canvasInk(f.inst.__debug.readCanvas(), 256, 192).sum).toBe(0);
    const ext = f.inst.__debug.gpu.gl.getExtension("WEBGL_lose_context");
    const lost = nextEvent(f.canvas, "webglcontextlost");
    ext.loseContext();
    await lost;
    await wait(30);
    const restored = nextEvent(f.canvas, "webglcontextrestored");
    ext.restoreContext();
    await restored;
    await wait(50);
    f.inst.render();
    expect(canvasInk(f.inst.__debug.readCanvas(), 256, 192).sum).toBeGreaterThan(500); // the opening scene is back
  });

  test("reading the fields back is refused with a clear message (WebGL 1 cannot read half floats)", () => {
    const f = oldPath();
    expect(() => f.state()).toThrow(/half-float/i);
  });
});
