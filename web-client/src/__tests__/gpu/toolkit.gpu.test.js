// The shared GPU toolkit against a real WebGL implementation (contracts/gpu-toolkit.md).
import { afterEach, describe, expect, test, vi } from "vitest";
import { openGpu, probeGpu, resetProbeCache } from "../../studio/visualizations/_shared/gpu/index.js";

const SOLID = `uniform vec4 uColor; void main() { gl_FragColor = uColor; }`;
const COPY = `uniform sampler2D uTex; varying vec2 vUv; void main() { gl_FragColor = texture2D(uTex, vUv); }`;

let opened = [];
function open(opts = {}, size = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const gpu = openGpu(canvas, opts);
  if (gpu) opened.push(gpu);
  return gpu;
}

afterEach(() => {
  opened.forEach((g) => g.dispose());
  opened = [];
  delete globalThis.__VIZ_GL_VERSION__;
  window.history.replaceState(null, "", "/");
  resetProbeCache();
});

const px = (gpu, target, x = 0, y = 0) => {
  const out = new Uint8Array(4);
  gpu.readback(target, out, { x, y, w: 1, h: 1 });
  return [...out];
};
const pxf = (gpu, target, x = 0, y = 0) => {
  const out = new Float32Array(4);
  gpu.readback(target, out, { x, y, w: 1, h: 1 });
  return [...out];
};

describe("opening", () => {
  test("gives a WebGL2 Gpu with the capabilities the simulations need", () => {
    const gpu = open({ need: ["halfFloatTarget", "floatTarget"] });
    expect(gpu).not.toBeNull();
    expect(gpu.version).toBe(2);
    expect(gpu.caps).toMatchObject({ ok: true, floatTarget: true, halfFloatTarget: true, linearHalf: true });
    expect(gpu.caps.maxTexture).toBeGreaterThanOrEqual(2048);
    expect(gpu.isLost()).toBe(false);
  });

  test("returns null for a capability that is not there, or when forced off", () => {
    expect(open({ need: ["noSuchCapability"] })).toBeNull();
    expect(open({ ctx: { gpuForced: "off" } })).toBeNull();
    window.history.replaceState(null, "", "/?gpu=off");
    expect(open()).toBeNull();
  });

  test("the probe is cached and does not leak a context per call", () => {
    resetProbeCache();
    const a = probeGpu({ need: ["floatTarget"] });
    const b = probeGpu({ need: ["floatTarget"] });
    expect(b).toBe(a);
  });
});

describe("programs and drawing", () => {
  test("draws a uniform color into an 8-bit target", () => {
    const gpu = open();
    const t = gpu.target({ w: 4, h: 4, format: "rgba8" });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [1, 0.5, 0, 1] }, t);
    const [r, g, b, a] = px(gpu, t, 2, 2);
    expect([r, b, a]).toEqual([255, 0, 255]);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
  });

  test("a target passed as a uniform is bound as a texture", () => {
    const gpu = open();
    const a = gpu.target({ w: 4, h: 4 });
    const b = gpu.target({ w: 4, h: 4 });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [0, 1, 0, 1] }, a);
    gpu.draw(gpu.program("copy", COPY), { uTex: a }, b);
    expect(px(gpu, b, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  test("a texture used as an input for the first time does not redirect the pass (lazy build)", () => {
    const gpu = open();
    const out = gpu.target({ w: 4, h: 4 });
    const fresh = gpu.target({ w: 4, h: 4 }); // never drawn into, never bound: built during this draw
    const prog = gpu.program("copyOver", `uniform sampler2D uTex; varying vec2 vUv; void main() { gl_FragColor = texture2D(uTex, vUv) + vec4(0.0, 0.0, 1.0, 1.0); }`);
    gpu.draw(prog, { uTex: fresh }, out);
    expect(px(gpu, out, 1, 1)).toEqual([0, 0, 255, 255]); // the pass wrote to `out`
    expect(px(gpu, fresh, 1, 1)).toEqual([0, 0, 0, 0]); // and not into the input it read from
  });

  test("a palette used for the first time in a draw lands in the target, not in the palette", () => {
    const gpu = open();
    const lut = new Uint8Array(256 * 3).fill(200);
    const palette = gpu.paletteTexture(lut);
    const out = gpu.target({ w: 4, h: 4 });
    gpu.draw(gpu.program("copy", COPY), { uTex: palette }, out);
    expect(px(gpu, out, 1, 0)[0]).toBe(200);
    expect(px(gpu, palette, 5, 0).slice(0, 3)).toEqual([200, 200, 200]); // the palette is untouched
  });

  test("a shader error names the shader and numbers the source lines", () => {
    const gpu = open();
    expect(() => gpu.program("broken", "void main() { gl_FragColor = nope; }")).not.toThrow(); // compiled lazily
    const t = gpu.target({ w: 2, h: 2 });
    let message = "";
    try {
      gpu.draw(gpu.program("broken", "void main() { gl_FragColor = nope; }"), {}, t);
    } catch (e) {
      message = e.message;
    }
    expect(message).toContain('Shader "broken"');
    expect(message).toContain("failed to compile");
    expect(message).toMatch(/\n\s*\d+: /);
  });

  test("a program is compiled once per name", () => {
    const gpu = open();
    expect(gpu.program("solid", SOLID)).toBe(gpu.program("solid", SOLID));
  });
});

describe("targets", () => {
  test("8-bit upload and readback round-trip, including a region", () => {
    const gpu = open();
    const t = gpu.target({ w: 4, h: 4, format: "rgba8" });
    const data = new Uint8Array(4 * 4 * 4).map((_, i) => (i * 7) % 256);
    gpu.upload(t, data);
    const out = new Uint8Array(data.length);
    gpu.readback(t, out);
    expect([...out]).toEqual([...data]);
    gpu.upload(t, new Uint8Array([9, 8, 7, 6]), { x: 1, y: 2, w: 1, h: 1 });
    expect(px(gpu, t, 1, 2)).toEqual([9, 8, 7, 6]);
  });

  test("a 32-bit float target keeps values exactly", () => {
    const gpu = open({ need: ["floatTarget"] });
    const t = gpu.target({ w: 2, h: 2, format: "rgba32f" });
    const data = new Float32Array([0.1234567, -2.5, 1e-7, 123456.75, ...new Array(12).fill(0.5)]);
    gpu.upload(t, data);
    const out = new Float32Array(16);
    gpu.readback(t, out);
    expect([...out.slice(0, 4)]).toEqual([...data.slice(0, 4)]);
  });

  test("a half-float target can be rendered into and read back", () => {
    const gpu = open({ need: ["halfFloatTarget"] });
    const t = gpu.target({ w: 4, h: 4, format: "rgba16f" });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [0.25, 1.5, -0.5, 1] }, t);
    const [r, g, b] = pxf(gpu, t, 1, 1);
    expect(r).toBeCloseTo(0.25, 3);
    expect(g).toBeCloseTo(1.5, 3);
    expect(b).toBeCloseTo(-0.5, 3);
  });

  test("a pair swaps what is read and what is written", () => {
    const gpu = open();
    const p = gpu.pair({ w: 4, h: 4 });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [1, 0, 0, 1] }, p.write);
    p.swap();
    expect(px(gpu, p.read, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(gpu, p.write, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  test("resize with keep copies the old content into the new size; without keep it clears", () => {
    const gpu = open();
    const t = gpu.target({ w: 4, h: 4, filter: "nearest" });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [0, 0, 1, 1] }, t);
    gpu.resize(t, 8, 6, { keep: true });
    expect([t.w, t.h]).toEqual([8, 6]);
    expect(px(gpu, t, 4, 3)).toEqual([0, 0, 255, 255]);
    gpu.resize(t, 4, 4);
    expect(px(gpu, t, 2, 2)).toEqual([0, 0, 0, 0]);
  });

  test("a palette lookup becomes a 256 x 1 texture with the same colors", () => {
    const gpu = open();
    const lut = new Uint8Array(256 * 3).map((_, i) => (i * 5) % 256);
    const tex = gpu.paletteTexture(lut);
    expect([tex.w, tex.h]).toEqual([256, 1]);
    expect(px(gpu, tex, 0, 0).slice(0, 3)).toEqual([lut[0], lut[1], lut[2]]);
    expect(px(gpu, tex, 255, 0).slice(0, 3)).toEqual([lut[255 * 3], lut[255 * 3 + 1], lut[255 * 3 + 2]]);
    expect(gpu.paletteTexture(lut)).toBe(tex); // cached per lookup table
  });
});

describe("instanced drawing", () => {
  test("draws one quad per instance at the per-instance offset", () => {
    const gpu = open({}, 8);
    const vs = `attribute vec2 aCorner; attribute vec2 aOffset; void main() { gl_Position = vec4(aCorner * 0.2 + aOffset, 0.0, 1.0); }`;
    const fs = `void main() { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); }`;
    const prog = gpu.program("instanced", fs, { vertex: vs, attributes: ["aCorner", "aOffset"] });
    const corners = gpu.buffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    const offsets = gpu.buffer(new Float32Array([-0.5, -0.5, 0.5, 0.5]));
    gpu.draw(prog, {}, null, { clear: [0, 0, 0, 1], instanced: {
      vertexCount: 6, instanceCount: 2,
      attributes: [{ buffer: corners, size: 2, divisor: 0 }, { buffer: offsets, size: 2, divisor: 1 }],
    } });
    const canvasTarget = { w: 8, h: 8, fbo: null };
    const read = (x, y) => {
      const out = new Uint8Array(4);
      gpu.readback(canvasTarget, out, { x, y, w: 1, h: 1 });
      return [...out];
    };
    expect(read(2, 2)).toEqual([255, 255, 0, 255]); // first instance, lower left
    expect(read(5, 5)).toEqual([255, 255, 0, 255]); // second instance, upper right
    expect(read(5, 2)).toEqual([0, 0, 0, 255]); // between them: untouched
  });
});

describe("context loss", () => {
  const nextEvent = (canvas, name) => new Promise((r) => canvas.addEventListener(name, r, { once: true }));
  // restoreContext() is ignored if it runs before the browser has finished handling the loss (for
  // example in the microtask right after the event), so let the event task end first.
  const settle = () => new Promise((r) => setTimeout(r, 30));

  test("is reported, draws become no-ops, and after a restore drawing works again", async () => {
    const lost = vi.fn();
    const restored = vi.fn();
    const gpu = open();
    gpu.onLost(lost);
    gpu.onRestored(restored);
    const t = gpu.target({ w: 4, h: 4 });
    const prog = gpu.program("solid", SOLID);
    gpu.draw(prog, { uColor: [1, 0, 0, 1] }, t);
    const ext = gpu.gl.getExtension("WEBGL_lose_context");
    const p1 = nextEvent(gpu.canvas, "webglcontextlost");
    ext.loseContext();
    await p1;
    await settle();
    expect(gpu.isLost()).toBe(true);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(() => gpu.draw(prog, { uColor: [0, 1, 0, 1] }, t)).not.toThrow();
    const p2 = nextEvent(gpu.canvas, "webglcontextrestored");
    ext.restoreContext();
    await p2;
    expect(gpu.isLost()).toBe(false);
    expect(restored).toHaveBeenCalledTimes(1);
    // The old target and program are rebuilt on first use. Their content is gone: the module re-initializes.
    gpu.draw(prog, { uColor: [0, 0, 1, 1] }, t);
    expect(px(gpu, t, 1, 1)).toEqual([0, 0, 255, 255]);
  });

  test("a context that is not restored in time is reported as unrecovered", async () => {
    const onUnrecovered = vi.fn();
    const gpu = open({ onUnrecovered, unrecoveredMs: 80 });
    gpu.gl.getExtension("WEBGL_lose_context").loseContext();
    await new Promise((r) => setTimeout(r, 250));
    expect(onUnrecovered).toHaveBeenCalledTimes(1);
  });

  test("without a handler, the shell is asked to restart on the processor path", async () => {
    const requestRestart = vi.fn();
    const gpu = open({ ctx: { requestRestart }, unrecoveredMs: 80 });
    gpu.gl.getExtension("WEBGL_lose_context").loseContext();
    await new Promise((r) => setTimeout(r, 250));
    expect(requestRestart).toHaveBeenCalledWith({ forceProcessor: true });
  });

  test("a restore in time cancels the unrecovered report", async () => {
    const onUnrecovered = vi.fn();
    const gpu = open({ onUnrecovered, unrecoveredMs: 300 });
    const ext = gpu.gl.getExtension("WEBGL_lose_context");
    const p1 = nextEvent(gpu.canvas, "webglcontextlost");
    ext.loseContext();
    await p1;
    await settle();
    const p2 = nextEvent(gpu.canvas, "webglcontextrestored");
    ext.restoreContext();
    await p2;
    await new Promise((r) => setTimeout(r, 450));
    expect(onUnrecovered).not.toHaveBeenCalled();
  });
});

describe("dispose", () => {
  test("releases the context: opening and disposing 30 times in a row keeps working (SC-007)", () => {
    for (let i = 0; i < 30; i++) {
      const gpu = open({}, 8);
      expect(gpu, `open #${i + 1}`).not.toBeNull();
      const t = gpu.target({ w: 4, h: 4 });
      gpu.draw(gpu.program("solid", SOLID), { uColor: [1, 1, 1, 1] }, t);
      expect(px(gpu, t, 0, 0)).toEqual([255, 255, 255, 255]);
      gpu.dispose();
    }
    const last = open({}, 8);
    expect(last).not.toBeNull();
  });

  test("calls after dispose do nothing and do not throw", () => {
    const gpu = open();
    const t = gpu.target({ w: 2, h: 2 });
    const prog = gpu.program("solid", SOLID);
    gpu.dispose();
    expect(() => {
      gpu.draw(prog, { uColor: [1, 1, 1, 1] }, t);
      gpu.upload(t, new Uint8Array(16));
      gpu.readback(t, new Uint8Array(16));
      gpu.dispose();
    }).not.toThrow();
  });
});

describe("the WebGL1 path (older hardware)", () => {
  test("opens a WebGL1 context with the same Gpu API", () => {
    globalThis.__VIZ_GL_VERSION__ = 1;
    resetProbeCache();
    const gpu = open({ need: ["halfFloatTarget"] });
    expect(gpu).not.toBeNull();
    expect(gpu.version).toBe(1);
    const t = gpu.target({ w: 4, h: 4, format: "rgba8" });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [1, 0, 1, 1] }, t);
    expect(px(gpu, t, 1, 1)).toEqual([255, 0, 255, 255]);
    const h = gpu.target({ w: 4, h: 4, format: "rgba16f" });
    gpu.draw(gpu.program("solid", SOLID), { uColor: [0.5, 0.5, 0.5, 1] }, h);
    gpu.draw(gpu.program("copy", COPY), { uTex: h }, t);
    expect(px(gpu, t, 1, 1)[0]).toBeGreaterThan(120); // 0.5 survived the half-float round trip
  });

  test("instancing works through ANGLE_instanced_arrays", () => {
    globalThis.__VIZ_GL_VERSION__ = 1;
    resetProbeCache();
    const gpu = open({}, 8);
    expect(gpu.version).toBe(1);
    const vs = `attribute vec2 aCorner; attribute vec2 aOffset; void main() { gl_Position = vec4(aCorner * 0.2 + aOffset, 0.0, 1.0); }`;
    const prog = gpu.program("instanced1", `void main() { gl_FragColor = vec4(1.0); }`, { vertex: vs, attributes: ["aCorner", "aOffset"] });
    const corners = gpu.buffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    const offsets = gpu.buffer(new Float32Array([-0.5, -0.5, 0.5, 0.5]));
    gpu.draw(prog, {}, null, { clear: [0, 0, 0, 1], instanced: {
      vertexCount: 6, instanceCount: 2,
      attributes: [{ buffer: corners, size: 2, divisor: 0 }, { buffer: offsets, size: 2, divisor: 1 }],
    } });
    const out = new Uint8Array(4);
    gpu.readback({ w: 8, h: 8, fbo: null }, out, { x: 5, y: 5, w: 1, h: 1 });
    expect([...out]).toEqual([255, 255, 255, 255]);
  });
});
