import { vi } from "vitest";
import { findEntry } from "../../../studio/catalog.js";
import { defaultsOf, validateConfig, applyPreset } from "../../../studio/core/knobs.js";
import { createModuleContext } from "../../../studio/core/moduleContext.js";
import { installCanvasStub } from "../canvasStub.js";
import { UNSUPPORTED_TEXT } from "../../../studio/visualizations/fluid/index.js";

installCanvasStub();

let module;
beforeAll(async () => {
  module = (await findEntry("fluid-simulation").load()).default; // with the sweep and quality knobs added, as the viewer sees it
});

describe("the settings (spec Story 2 scenario 1, FR-008)", () => {
  test("have the starting values of the reference simulation", () => {
    const v = defaultsOf(module).values;
    expect(v).toMatchObject({
      pressureIterations: 20,
      pressure: 0.8,
      curl: 30,
      splatRadius: 0.25,
      splatForce: 6000,
      velocityDissipation: 0.2,
      densityDissipation: 1,
    });
  });

  test("come with a palette, a seed and a Quality choice that starts on Auto", () => {
    const keys = module.knobs.map((k) => k.key);
    expect(keys).toContain("palette");
    expect(keys).toContain("quality");
    expect(module.random).toBe(true);
    expect(module.knobs.find((k) => k.key === "quality").default).toBe("auto");
  });

  test("each default lies inside its range, and every range is a real range", () => {
    for (const k of module.knobs.filter((k) => k.type === "range")) {
      expect(k.min, k.key).toBeLessThan(k.max);
      expect(k.default, k.key).toBeGreaterThanOrEqual(k.min);
      expect(k.default, k.key).toBeLessThanOrEqual(k.max);
      expect(k.live, k.key).not.toBe(false); // applies on the next step without restarting (FR-010)
    }
  });

  test("the lowest density dissipation still fades, so ink cannot only pile up", () => {
    expect(module.knobs.find((k) => k.key === "densityDissipation").min).toBeGreaterThan(0);
  });

  test("Quality comes last, in its own group, after the sweep settings", () => {
    const keys = module.knobs.map((k) => k.key);
    expect(keys.at(-1)).toBe("quality");
    expect(module.knobs.at(-1).group).toBe("Performance");
    expect(keys.indexOf("sweep")).toBeGreaterThan(keys.indexOf("palette"));
  });
});

describe("presets and the animated sweep (FR-013)", () => {
  test("at least three named presets with clearly different characters, plus the generated Animated sweep", () => {
    const named = module.presets.filter((p) => p.id !== "sweep");
    expect(named.length).toBeGreaterThanOrEqual(3);
    expect(module.presets.find((p) => p.id === "sweep")?.name).toBe("Animated sweep");
    const key = (p) => `${p.values.velocityDissipation}/${p.values.densityDissipation}/${p.values.curl}`;
    expect(new Set(named.map(key)).size).toBe(named.length);
  });

  test("every preset's values pass validation without a replacement", () => {
    for (const p of module.presets) {
      const a = applyPreset(module, p.id);
      expect(validateConfig(module, { values: a.values, seed: 1 }).replaced, p.id).toEqual([]);
    }
  });

  test("the sweep moves range settings, inside their limits", () => {
    expect(module.sweep.targets.length).toBeGreaterThanOrEqual(1);
    for (const t of module.sweep.targets) {
      const knob = module.knobs.find((k) => k.key === t.key);
      expect(knob?.type, t.key).toBe("range");
      expect(t.min).toBeGreaterThanOrEqual(knob.min);
      expect(t.max).toBeLessThanOrEqual(knob.max);
    }
  });
});

describe("what the visitor reads and can do", () => {
  test("the explanation covers each stage and the dissipation idea (FR-012)", () => {
    const text = module.howItWorks.toLowerCase();
    for (const phrase of [
      "velocity dissipation slows the motion over time",
      "density dissipation fades the ink",
      "pressure",
      "pressure iterations",
      "curl",
      "burst",
      "clear",
      "quality",
      "carries the ink and the motion",
      "lingering",
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text.split(/\s+/).length).toBeLessThan(220);
  });

  test("Burst and Clear are actions that do not take the shell's keys", () => {
    expect(module.actions.map((a) => a.id)).toEqual(["burst", "clear"]);
    for (const a of module.actions) expect([" ", ".", "r", "R"]).not.toContain(a.key);
  });

  test("each finger is its own stroke", () => {
    expect(module.multiTouch).toBe(true);
    expect(module.interactive).toBe(true);
  });

  test("it is in Simulation and emergence, and a search for 'fluid' or 'Navier' finds its card", () => {
    const entry = findEntry("fluid-simulation");
    expect(entry.category).toBe("simulation");
    expect(entry.summary.toLowerCase()).toContain("fluid");
    expect(entry.summary).toContain("Navier–Stokes");
  });
});

describe("without graphics acceleration (no WebGL in jsdom)", () => {
  test("it shows the plain message, paints the background, and answers every call", () => {
    const onMessage = vi.fn();
    const handle = createModuleContext({ onMessage });
    const canvas = document.createElement("canvas");
    const inst = module.create(canvas, defaultsOf(module), handle.ctx);
    expect(inst.unsupported).toBe(true);
    expect(onMessage).toHaveBeenCalledWith({ text: UNSUPPORTED_TEXT });
    expect(UNSUPPORTED_TEXT).toMatch(/graphics acceleration/);
    expect(UNSUPPORTED_TEXT).toMatch(/other visualizations still work/);
    expect(() => {
      inst.update(defaultsOf(module), ["curl"]);
      inst.resize(100, 100);
      inst.setQuality("low");
      inst.step();
      inst.render();
      inst.reset();
      inst.action("burst");
      inst.pointer({ type: "down", x: 1, y: 1, pointerId: 1 });
      inst.destroy();
    }).not.toThrow();
    expect(onMessage).toHaveBeenLastCalledWith(null); // destroy clears the message
  });

  test("when forced onto the processor path it behaves the same", () => {
    const onMessage = vi.fn();
    const handle = createModuleContext({ onMessage, gpuForced: "off" });
    const inst = module.create(document.createElement("canvas"), defaultsOf(module), handle.ctx);
    expect(inst.unsupported).toBe(true);
  });
});
