import { CATALOG } from "../../../studio/catalog.js";
import { encodeConfig, decodeConfig, buildShareUrl } from "../../../studio/core/shareLink.js";
import { defaultsOf } from "../../../studio/core/knobs.js";

test.each(CATALOG.map((e) => [e.id, e]))("%s defaults round-trip", async (_id, entry) => {
  const m = (await entry.load()).default;
  const cfg = defaultsOf(m);
  const enc = await encodeConfig(m, cfg);
  expect(enc.ok).toBe(true);
  const dec = await decodeConfig(m, enc.payload);
  expect(dec.replaced).toEqual([]);
  expect(dec.config).toEqual(cfg);
});

test("a tuned configuration with view and input round-trips", async () => {
  const m = (await import("../../../studio/visualizations/voronoi/index.js")).default;
  const cfg = {
    ...defaultsOf(m),
    values: { ...defaultsOf(m).values, count: 50, metric: "manhattan", relax: 3 },
    seed: 99,
    input: { points: [[0.1, 0.2], [0.5, 0.5], [0.9, 0.7]] },
  };
  const enc = await encodeConfig(m, cfg);
  const url = buildShareUrl("voronoi", enc.payload, "http://x");
  expect(url).toMatch(/^http:\/\/x\/studio\/voronoi\?c=1\./);
  expect(url.length).toBeLessThan(2000);
  expect((await decodeConfig(m, enc.payload)).config).toEqual(cfg);
});

test("garbage and unknown versions fall back to defaults with a message", async () => {
  const m = (await import("../../../studio/visualizations/phyllotaxis/index.js")).default;
  const bad = await decodeConfig(m, "1.!!!not-base64!!!");
  expect(bad.config).toEqual(defaultsOf(m));
  expect(bad.error).toMatch(/damaged/);
  const old = await decodeConfig(m, "9.abc");
  expect(old.error).toMatch(/format/);
});

test("out-of-range values in a link are clamped and reported", async () => {
  const m = (await import("../../../studio/visualizations/phyllotaxis/index.js")).default;
  const enc = await encodeConfig(m, { ...defaultsOf(m), values: { ...defaultsOf(m).values, count: 999999 } });
  const dec = await decodeConfig(m, enc.payload);
  expect(dec.config.values.count).toBe(20000);
  expect(dec.replaced[0].key).toBe("count");
});

test("too much drawing can't go in a link", async () => {
  const m = (await import("../../../studio/visualizations/fourier/index.js")).default;
  const outline = Array.from({ length: 600 }, (_, i) => [i / 600, 0]);
  const r = await encodeConfig(m, { ...defaultsOf(m), input: { outline } });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/Export a file/);
});
