import { buildExport, parseImport, pngFilename, slugify } from "../../../studio/core/exportFile.js";
import { findEntry } from "../../../studio/catalog.js";
import { defaultsOf } from "../../../studio/core/knobs.js";

const load = async (id) => (await findEntry(id).load()).default;

test("export → import round trip", async () => {
  const m = await load("mandelbrot");
  const cfg = { ...defaultsOf(m), values: { ...defaultsOf(m).values, iterations: 1200 }, view: { cx: -0.7453, cy: 0.1127, zoom: 650 } };
  const text = JSON.stringify(buildExport([{ name: "Seahorse valley", config: cfg }]));
  const r = await parseImport(text, load);
  expect(r.ok).toBe(true);
  expect(r.items).toEqual([{ name: "Seahorse valley", config: cfg }]);
  expect(r.skipped).toBe(0);
});

test("wrong format, version, and bad JSON are rejected", async () => {
  expect((await parseImport("{", load)).ok).toBe(false);
  expect((await parseImport(JSON.stringify({ format: "other" }), load)).reason).toMatch(/isn't a Visualization Playground/);
  expect((await parseImport(JSON.stringify({ format: "vizstudio", formatVersion: 9, items: [] }), load)).reason).toMatch(/newer/);
});

test("invalid items are skipped and invalid values replaced", async () => {
  const text = JSON.stringify({
    format: "vizstudio",
    formatVersion: 1,
    items: [
      { name: "ok", config: { vizId: "phyllotaxis", values: { count: -5 } } },
      { name: "unknown viz", config: { vizId: "nope" } },
      { config: { vizId: "phyllotaxis" } },
    ],
  });
  const r = await parseImport(text, load);
  expect(r.items).toHaveLength(1);
  expect(r.items[0].config.values.count).toBe(10);
  expect(r.skipped).toBe(2);
  expect(r.replaced).toHaveLength(1);
});

test("file names", () => {
  expect(pngFilename("mandelbrot", new Date(2026, 10, 11, 9, 5, 3))).toBe("mandelbrot-20261111-090503.png");
  expect(slugify("Seahorse Valley!")).toBe("seahorse-valley");
});
