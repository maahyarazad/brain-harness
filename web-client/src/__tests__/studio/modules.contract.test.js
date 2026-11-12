import { vi } from "vitest";
import { CATALOG } from "../../studio/catalog.js";
import { defaultsOf, validateConfig, applyPreset } from "../../studio/core/knobs.js";
import { installCanvasStub } from "./canvasStub.js";
import { runModule } from "./harness.js";

installCanvasStub();

const KNOB_TYPES = ["range", "choice", "toggle", "text", "palette"];

// The runtime tests run every kernel on the main thread (jsdom has no workers),
// so at full defaults the heaviest modules come close to the 5s test timeout on
// slow CI runners. These lighter values still go through the same code paths.
const LIGHT_VALUES = {
  dla: { particles: 1000 },
  "collatz-coral": { count: 1000 },
};

function testConfig(module, extra = {}) {
  const cfg = defaultsOf(module);
  return { ...cfg, values: { ...cfg.values, ...LIGHT_VALUES[module.id] }, ...extra };
}

describe.each(CATALOG.map((e) => [e.id, e]))("%s", (id, entry) => {
  let module;
  beforeAll(async () => {
    module = (await entry.load()).default;
  });

  test("has the required fields", () => {
    expect(module.id).toBe(id);
    expect(typeof module.name).toBe("string");
    expect(module.howItWorks.length).toBeGreaterThan(40);
    for (const k of ["animated", "random", "interactive"]) expect(typeof module[k]).toBe("boolean");
    expect(typeof module.create).toBe("function");
    expect(Array.isArray(module.presets)).toBe(true);
  });

  test("knob definitions are valid", () => {
    const keys = new Set();
    for (const k of module.knobs) {
      expect(KNOB_TYPES).toContain(k.type);
      expect(keys.has(k.key)).toBe(false);
      keys.add(k.key);
      expect(typeof k.label).toBe("string");
      if (k.type === "range") {
        expect(k.min).toBeLessThan(k.max);
        expect(k.step).toBeGreaterThan(0);
      }
      if (k.type === "choice") expect(k.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("defaults and presets validate without replacements", () => {
    expect(validateConfig(module, defaultsOf(module)).replaced).toEqual([]);
    for (const p of module.presets) {
      const a = applyPreset(module, p.id);
      expect(validateConfig(module, { values: a.values, input: a.input, seed: 1 }).replaced).toEqual([]);
    }
  });

  test("runs create → update → step → resize → destroy without Math.random", async () => {
    const spy = vi.spyOn(Math, "random");
    const cfg = testConfig(module);
    const { inst, handle, canvas } = await runModule(module, cfg, { steps: module.animated ? 10 : 0 });
    inst.update(cfg, []);
    await handle.ctx.idle();
    canvas.width = 200;
    canvas.height = 150;
    inst.resize(200, 150);
    await handle.ctx.idle();
    if (module.animated) inst.reset();
    inst.destroy();
    handle.dispose();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("same configuration gives the same picture", async () => {
    const cfg = testConfig(module, { seed: 12345 });
    const steps = module.animated ? 15 : 0;
    const a = await runModule(module, cfg, { steps });
    a.inst.destroy();
    a.handle.dispose();
    const b = await runModule(module, cfg, { steps });
    b.inst.destroy();
    b.handle.dispose();
    expect(b.calls.length).toBeGreaterThan(0);
    expect(b.calls).toEqual(a.calls);
  });
});
