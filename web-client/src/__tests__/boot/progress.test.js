import { createProgress, formatPercent } from "../../boot/progress.js";

/** A fetch whose responses stream the given chunk sizes. */
function streamFetch(table) {
  return vi.fn(async (url) => {
    const spec = table[url];
    if (spec === "reject") throw new Error("network");
    if (spec === 404) return { ok: false, status: 404 };
    if (spec === "nobody") return { ok: true, body: null };
    let i = 0;
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => (i < spec.length ? { done: false, value: new Uint8Array(spec[i++]) } : { done: true }),
        }),
      },
    };
  });
}

test("percent climbs from 0 to 100 as bytes arrive and ends done", async () => {
  const seen = [];
  const p = createProgress(
    [
      { url: "/a.js", size: 300 },
      { url: "/b.css", size: 100 },
    ],
    { fetchFn: streamFetch({ "/a.js": [100, 100, 100], "/b.css": [100] }), onProgress: (s) => seen.push(s) }
  );
  await p.finished;
  expect(seen[0]).toEqual({ percent: 0, done: false });
  const percents = seen.map((s) => s.percent);
  expect([...percents].sort((a, b) => a - b)).toEqual(percents); // never goes down
  expect(Math.max(...percents)).toBe(100);
  expect(seen.at(-1)).toEqual({ percent: 100, done: true });
});

test("never above 100, even when files are bigger than listed", async () => {
  const seen = [];
  const p = createProgress([{ url: "/a.js", size: 100 }], { fetchFn: streamFetch({ "/a.js": [500] }), onProgress: (s) => seen.push(s) });
  await p.finished;
  expect(Math.max(...seen.map((s) => s.percent))).toBe(100);
});

test("a failed or missing file counts as finished", async () => {
  const p = createProgress(
    [
      { url: "/a.js", size: 50 },
      { url: "/b.js", size: 50 },
      { url: "/c.js", size: 50 },
    ],
    { fetchFn: streamFetch({ "/a.js": "reject", "/b.js": 404, "/c.js": [50] }) }
  );
  await p.finished;
  expect(p.state()).toEqual({ percent: 100, done: true });
});

test("a response without a readable body counts as loaded", async () => {
  const p = createProgress([{ url: "/a.js", size: 10 }], { fetchFn: streamFetch({ "/a.js": "nobody" }) });
  await p.finished;
  expect(p.state()).toEqual({ percent: 100, done: true });
});

test("an empty or missing list is done at once", async () => {
  for (const list of [[], undefined]) {
    const p = createProgress(list, { fetchFn: vi.fn() });
    await p.finished;
    expect(p.state()).toEqual({ percent: 0, done: true });
  }
});

test("formatPercent gives an integer string from 0 to 100", () => {
  expect(formatPercent(0)).toBe("0");
  expect(formatPercent(36.6)).toBe("37");
  expect(formatPercent(100)).toBe("100");
  expect(formatPercent(140)).toBe("100");
  expect(formatPercent(-5)).toBe("0");
  expect(formatPercent(NaN)).toBe("0");
});
