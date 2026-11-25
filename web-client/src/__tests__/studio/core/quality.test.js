import { withQuality, effectiveLevel, scaleFor, leversFor, hasAuto, QUALITY_LEVELS } from "../../../studio/core/quality.js";
import { withSweep, isSweepKey } from "../../../studio/core/sweep.js";
import { defaultsOf, validateConfig } from "../../../studio/core/knobs.js";
import { encodeConfig, decodeConfig } from "../../../studio/core/shareLink.js";

const base = (extra = {}) => ({
  id: "stub", name: "Stub", howItWorks: "x".repeat(50), animated: false, random: false, interactive: false,
  knobs: [{ key: "n", label: "N", type: "range", min: 1, max: 10, step: 1, default: 5 }],
  presets: [{ id: "p", name: "P", values: { n: 7 } }],
  create() {},
  ...extra,
});
const descriptor = { scale: { low: 0.5, medium: 1, high: 1 }, levers: { low: { k: 1 }, medium: { k: 2 }, high: { k: 3 } } };

describe("withQuality", () => {
  test("a module without a descriptor is returned untouched (nothing to trade, no control)", () => {
    const m = base();
    expect(withQuality(m)).toBe(m);
  });

  test("a static module gets Low / Medium / High, default Medium, in the Performance group, last", () => {
    const q = withQuality(base({ quality: descriptor }));
    const knob = q.knobs.at(-1);
    expect(knob).toMatchObject({ key: "quality", type: "choice", group: "Performance", default: "medium" });
    expect(knob.options.map((o) => o.value)).toEqual(["low", "medium", "high"]);
    expect(q.knobs[0].key).toBe("n");
  });

  test("an animated module also gets Auto, and Auto is its default", () => {
    const q = withQuality(base({ animated: true, quality: descriptor }));
    const knob = q.knobs.at(-1);
    expect(knob.default).toBe("auto");
    expect(knob.options.map((o) => o.value)).toEqual(["auto", "low", "medium", "high"]);
    expect(hasAuto(q)).toBe(true);
    expect(hasAuto(withQuality(base({ quality: descriptor })))).toBe(false);
  });

  test("is idempotent", () => {
    const once = withQuality(base({ quality: descriptor }));
    expect(withQuality(once)).toBe(once);
    expect(once.knobs.filter((k) => k.key === "quality")).toHaveLength(1);
  });

  test("composes with withSweep: the sweep knobs and preset stay, quality comes after them", () => {
    const m = withQuality(withSweep(base({ quality: descriptor, sweep: { periodMs: 1000, targets: [{ key: "n", mode: "wave", min: 2, max: 8 }] } })));
    const keys = m.knobs.map((k) => k.key);
    expect(keys.indexOf("sweep")).toBeGreaterThan(-1);
    expect(keys.at(-1)).toBe("quality");
    expect(m.presets.some((p) => p.id === "sweep")).toBe(true);
  });

  test("quality is never a sweep key", () => {
    expect(isSweepKey("quality")).toBe(false);
  });
});

describe("effective level", () => {
  test("a chosen level is used as it is", () => {
    for (const l of QUALITY_LEVELS) expect(effectiveLevel({ quality: l }, "low")).toBe(l);
  });

  test("auto follows the governor, but never goes above medium (FR-021)", () => {
    expect(effectiveLevel({ quality: "auto" }, "low")).toBe("low");
    expect(effectiveLevel({ quality: "auto" }, "medium")).toBe("medium");
    expect(effectiveLevel({ quality: "auto" }, "high")).toBe("medium");
    expect(effectiveLevel({ quality: "auto" })).toBe("medium");
  });

  test("a missing or unknown value is treated as auto", () => {
    expect(effectiveLevel({}, "low")).toBe("low");
    expect(effectiveLevel(undefined)).toBe("medium");
    expect(effectiveLevel({ quality: "bogus" })).toBe("medium");
  });

  test("scaleFor and leversFor read the descriptor and fall back safely", () => {
    const m = base({ quality: descriptor });
    expect(scaleFor(m, "low")).toBe(0.5);
    expect(scaleFor(m, "high")).toBe(1);
    expect(scaleFor(base(), "low")).toBe(1);
    expect(scaleFor(base({ quality: { scale: { low: 0 } } }), "low")).toBe(1); // not in (0, 1]
    expect(scaleFor(base({ quality: { scale: { low: 2 } } }), "low")).toBe(1);
    expect(leversFor(m, "medium")).toEqual({ k: 2 });
    expect(leversFor(base(), "medium")).toBeNull();
  });
});

describe("old items and share links (FR-021)", () => {
  const m = withQuality(base({ animated: true, random: true, quality: descriptor }));

  test("a config saved before this feature validates with the default and no 'replaced' notice", () => {
    const old = { vizId: "stub", values: { n: 7 }, seed: 3, view: null, input: null, presetId: null };
    const r = validateConfig(m, old);
    expect(r.config.values.quality).toBe("auto");
    expect(r.replaced).toEqual([]);
  });

  test("an unknown quality value is replaced by the default and reported", () => {
    const r = validateConfig(m, { values: { quality: "ultra" } });
    expect(r.config.values.quality).toBe("auto");
    expect(r.replaced.map((x) => x.key)).toEqual(["quality"]);
  });

  test("defaults are not written into a share link, so an old link and a new one decode the same", async () => {
    const withKnob = defaultsOf(m);
    const without = base({ animated: true, random: true });
    const a = await encodeConfig(m, withKnob);
    const b = await encodeConfig(without, defaultsOf(without));
    expect(a.payload).toBe(b.payload);
    const decoded = await decodeConfig(m, b.payload);
    expect(decoded.config.values.quality).toBe("auto");
    expect(decoded.replaced).toEqual([]);
  });

  test("a chosen level survives a share-link round trip", async () => {
    const cfg = { ...defaultsOf(m), values: { ...defaultsOf(m).values, quality: "low" } };
    const { payload } = await encodeConfig(m, cfg);
    const back = await decodeConfig(m, payload);
    expect(back.config.values.quality).toBe("low");
  });
});
