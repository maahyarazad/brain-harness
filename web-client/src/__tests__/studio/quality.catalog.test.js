// Quality across the whole catalog (specs/005 FR-020 to FR-022, Story 4): the control is on exactly the
// modules that declared one, old links and saved items open unchanged, and the level is stored.
import { CATALOG } from "../../studio/catalog.js";
import { defaultsOf, validateConfig, applyPreset } from "../../studio/core/knobs.js";
import { encodeConfig, decodeConfig } from "../../studio/core/shareLink.js";
import { hasAuto, effectiveLevel, scaleFor } from "../../studio/core/quality.js";
import { levelValues } from "../../studio/visualizations/fluid/kernel.js";

const modules = [];
beforeAll(async () => {
  for (const entry of CATALOG) modules.push([entry.id, (await entry.load()).default]);
});

const each = (fn) => () => {
  for (const [id, m] of modules) fn(id, m);
};

describe("which modules have a Quality choice", () => {
  test("exactly those that declared a quality descriptor, and the fluid is one of them", each((id, m) => {
    const knob = m.knobs.find((k) => k.key === "quality");
    expect(Boolean(knob), id).toBe(Boolean(m.quality));
  }));

  test("the fluid simulation always has it (the spec asks for it by name)", () => {
    const fluid = modules.find(([id]) => id === "fluid-simulation")[1];
    expect(fluid.knobs.find((k) => k.key === "quality")).toBeDefined();
  });

  test("animated modules offer Auto, Low, Medium and High and start on Auto; static ones offer no Auto and start on Medium", each((id, m) => {
    const knob = m.knobs.find((k) => k.key === "quality");
    if (!knob) return;
    const values = knob.options.map((o) => o.value);
    if (m.animated) {
      expect(values, id).toEqual(["auto", "low", "medium", "high"]);
      expect(knob.default, id).toBe("auto");
      expect(hasAuto(m), id).toBe(true);
    } else {
      expect(values, id).toEqual(["low", "medium", "high"]);
      expect(knob.default, id).toBe("medium");
      expect(hasAuto(m), id).toBe(false);
    }
  }));

  test("the control is in the Performance group, after the module's own settings", each((id, m) => {
    const knob = m.knobs.find((k) => k.key === "quality");
    if (!knob) return;
    expect(knob.group).toBe("Performance");
    expect(m.knobs.at(-1).key, id).toBe("quality");
    expect(knob.hidden).toBeFalsy();
  }));
});

describe("Medium is today's behaviour (FR-021)", () => {
  test("a scale never makes the picture bigger than today's, and Medium is exactly 1", each((id, m) => {
    for (const level of ["low", "medium", "high"]) {
      const s = scaleFor(m, level);
      expect(s, `${id} ${level}`).toBeGreaterThan(0);
      expect(s, `${id} ${level}`).toBeLessThanOrEqual(1);
    }
    expect(scaleFor(m, "medium"), id).toBe(1);
  }));

  test("Auto resolves to Medium on a device that keeps up, so it shows today's picture", each((id, m) => {
    expect(effectiveLevel(defaultsOf(m).values, "medium"), id).toBe("medium");
  }));

  test("the fluid's Medium grids are the ones the plan names", () => {
    const fluid = modules.find(([id]) => id === "fluid-simulation")[1];
    expect(fluid.quality.levers.medium).toEqual(levelValues("medium"));
  });
});

describe("old links, saved items and presets (FR-021, Story 4 scenarios 5 and 6)", () => {
  test("a configuration made before this feature validates with no replacement and no notice", each((id, m) => {
    const defaults = defaultsOf(m);
    const { quality, ...old } = defaults.values; // what an old save has: no quality value
    const r = validateConfig(m, { ...defaults, values: old });
    expect(r.replaced, id).toEqual([]);
    expect(r.config.values.quality, id).toBe(m.knobs.find((k) => k.key === "quality")?.default);
  }));

  test("a share link made before this feature decodes to the default", async () => {
    for (const [id, m] of modules) {
      const hasKnob = m.knobs.some((k) => k.key === "quality");
      if (!hasKnob) continue;
      // The payload an old build made: the same module without the quality knob.
      const without = { ...m, knobs: m.knobs.filter((k) => k.key !== "quality") };
      const { payload } = await encodeConfig(without, defaultsOf(without));
      const back = await decodeConfig(m, payload);
      expect(back.replaced, id).toEqual([]);
      expect(back.config.values.quality, id).toBe(m.knobs.find((k) => k.key === "quality").default);
    }
  });

  test("the default is not written into a new share link, so it is no longer than an old one", async () => {
    for (const [id, m] of modules) {
      if (!m.knobs.some((k) => k.key === "quality")) continue;
      const without = { ...m, knobs: m.knobs.filter((k) => k.key !== "quality") };
      const a = await encodeConfig(m, defaultsOf(m));
      const b = await encodeConfig(without, defaultsOf(without));
      expect(a.payload, id).toBe(b.payload);
    }
  });

  test("a chosen level survives a share-link round trip and a save", async () => {
    for (const [id, m] of modules) {
      if (!m.knobs.some((k) => k.key === "quality")) continue;
      const cfg = defaultsOf(m);
      cfg.values.quality = "low";
      const { payload } = await encodeConfig(m, cfg);
      expect((await decodeConfig(m, payload)).config.values.quality, id).toBe("low");
      expect(validateConfig(m, JSON.parse(JSON.stringify(cfg))).config.values.quality, id).toBe("low");
    }
  });

  test("an unknown level is replaced by the default and reported", each((id, m) => {
    if (!m.knobs.some((k) => k.key === "quality")) return;
    const r = validateConfig(m, { values: { quality: "ultra" } });
    expect(r.config.values.quality, id).toBe(m.knobs.find((k) => k.key === "quality").default);
    expect(r.replaced.map((x) => x.key), id).toContain("quality");
  }));

  test("no preset sets the quality, so applying one cannot change the visitor's choice", each((id, m) => {
    for (const p of m.presets.filter((p) => p.id !== "sweep")) {
      expect("quality" in p.values, `${id}/${p.id}`).toBe(false);
    }
    const sweep = m.presets.find((p) => p.id === "sweep");
    if (sweep) expect("quality" in sweep.values, `${id}/sweep`).toBe(false);
    for (const p of m.presets) expect(() => applyPreset(m, p.id)).not.toThrow();
  }));
});
