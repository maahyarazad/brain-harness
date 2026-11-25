import { vi } from "vitest";
import { openGpu, probeGpu, gpuMode, resetProbeCache } from "../../../studio/visualizations/_shared/gpu/index.js";
import { installCanvasStub } from "../canvasStub.js";

// jsdom has no WebGL. These tests prove that every module takes its processor path there,
// which is why every existing test keeps passing unchanged (specs/005 R2, FR-034).

afterEach(() => {
  delete globalThis.__VIZ_GPU__;
  window.history.replaceState(null, "", "/");
  resetProbeCache();
  vi.restoreAllMocks();
});

describe("openGpu without WebGL", () => {
  test("returns null, without throwing, when the browser has no WebGL", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(openGpu(document.createElement("canvas"), { need: [] })).toBeNull();
    expect(probeGpu().ok).toBe(false);
  });

  test("returns null when getContext throws", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(openGpu(document.createElement("canvas"))).toBeNull();
  });

  test("a fake 2D context handed back for 'webgl2' (the test canvas stub does this) is not mistaken for WebGL", () => {
    installCanvasStub();
    expect(probeGpu().ok).toBe(false);
    expect(openGpu(document.createElement("canvas"))).toBeNull();
  });

  test("the probe result is cached: the browser is asked once", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    probeGpu();
    probeGpu();
    probeGpu();
    const asks = spy.mock.calls.length;
    resetProbeCache();
    probeGpu();
    expect(spy.mock.calls.length).toBeGreaterThan(asks);
    expect(asks).toBeLessThanOrEqual(2); // webgl2 then webgl, once
  });
});

describe("forcing the processor path", () => {
  test("?gpu=off in the address", () => {
    window.history.replaceState(null, "", "/studio/life?gpu=off");
    expect(gpuMode()).toBe("off");
  });

  test("globalThis.__VIZ_GPU__ = 'off'", () => {
    globalThis.__VIZ_GPU__ = "off";
    expect(gpuMode()).toBe("off");
  });

  test("ctx.gpuForced = 'off'", () => {
    expect(gpuMode({ gpuForced: "off" })).toBe("off");
  });

  test("otherwise 'auto'", () => {
    expect(gpuMode()).toBe("auto");
    expect(gpuMode({ gpuForced: "auto" })).toBe("auto");
    window.history.replaceState(null, "", "/?gpu=on");
    expect(gpuMode()).toBe("auto");
  });

  test("when forced off, the browser is not even asked for a context", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    expect(openGpu(document.createElement("canvas"), { ctx: { gpuForced: "off" } })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
