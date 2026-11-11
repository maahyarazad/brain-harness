import { validateValue, validateConfig, defaultsOf, applyPreset, diffFromDefaults, describeReplaced } from "../../../studio/core/knobs.js";

const mod = {
  id: "test",
  random: true,
  knobs: [
    { key: "n", type: "range", min: 0, max: 500, step: 1, default: 10 },
    { key: "f", type: "range", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "c", type: "choice", default: "a", options: [{ value: "a" }, { value: "b" }] },
    { key: "t", type: "toggle", default: false },
    { key: "r", type: "text", default: "RL", pattern: /^[LR]{2,4}$/ },
    { key: "p", type: "palette", default: "viridis" },
  ],
  presets: [{ id: "big", name: "Big", values: { n: 400 } }],
};

test("ranges clamp with a note and snap to step", () => {
  expect(validateValue(mod.knobs[0], 999)).toMatchObject({ value: 500, note: "Max is 500" });
  expect(validateValue(mod.knobs[0], -3)).toMatchObject({ value: 0, note: "Min is 0" });
  expect(validateValue(mod.knobs[1], 0.123456).value).toBe(0.12);
  expect(validateValue(mod.knobs[0], "abc")).toMatchObject({ value: 10, replaced: true });
  expect(validateValue(mod.knobs[0], "42").value).toBe(42);
});

test("choices, toggles, text and palettes", () => {
  expect(validateValue(mod.knobs[2], "zzz")).toMatchObject({ value: "a", replaced: true });
  expect(validateValue(mod.knobs[3], true).value).toBe(true);
  expect(validateValue(mod.knobs[4], "RLX")).toMatchObject({ value: "RL", replaced: true });
  expect(validateValue(mod.knobs[4], "RLLR")).toMatchObject({ value: "RLLR", replaced: false });
  expect(validateValue(mod.knobs[5], "nope").value).toBe("viridis");
});

test("validateConfig reports replaced values and drops unknown keys", () => {
  const r = validateConfig(mod, { values: { n: 9999, bogus: 1 }, seed: -1 });
  expect(r.config.values.n).toBe(500);
  expect(r.config.values).not.toHaveProperty("bogus");
  expect(r.config.seed).toBe(1);
  expect(r.replaced.map((x) => x.key).sort()).toEqual(["bogus", "n", "seed"]);
  expect(describeReplaced(r.replaced)).toMatch(/"n" was reset to 500/);
});

test("defaults validate cleanly", () => {
  expect(validateConfig(mod, defaultsOf(mod)).replaced).toEqual([]);
});

test("presets and diffs", () => {
  const p = applyPreset(mod, "big");
  expect(p.values.n).toBe(400);
  expect(p.values.c).toBe("a");
  expect(diffFromDefaults(mod, p.values)).toEqual({ n: 400 });
  expect(applyPreset(mod, "missing")).toBeNull();
});
