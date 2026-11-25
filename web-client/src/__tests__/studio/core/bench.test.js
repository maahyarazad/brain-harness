import { summarize, toMarkdownRow, TABLE_HEADER, MAX_CALL_MS } from "../../../studio/core/bench.js";

describe("summarize", () => {
  test("mean, 95th percentile and fps of a run of frame times", () => {
    const frames = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
    const s = summarize(frames);
    expect(s.frames).toBe(100);
    expect(s.meanMs).toBeCloseTo(50.5, 5);
    expect(s.p95Ms).toBe(95);
    expect(s.fps).toBeCloseTo(1000 / 50.5, 5);
  });

  test("a steady 16.67 ms frame is 60 fps", () => {
    const s = summarize(new Array(30).fill(1000 / 60));
    expect(s.fps).toBeCloseTo(60, 5);
    expect(s.p95Ms).toBeCloseTo(1000 / 60, 5);
  });

  test("an empty run gives nulls, never NaN", () => {
    expect(summarize([])).toEqual({ frames: 0, meanMs: null, p95Ms: null, fps: null });
  });

  test("ignores non-finite and negative entries", () => {
    const s = summarize([10, NaN, -3, Infinity, 20]);
    expect(s.frames).toBe(2);
    expect(s.meanMs).toBe(15);
  });
});

describe("toMarkdownRow", () => {
  test("has one cell per header column and writes 'not measured' for missing figures", () => {
    const cols = TABLE_HEADER.split("\n")[0].split("|").filter((c) => c.trim() !== "").length;
    const row = toMarkdownRow({
      visualization: "game-of-life", level: "medium", path: "processor", device: "laptop", phase: "baseline",
      summary: summarize([10, 12, 14]), workSummary: summarize([1.25, 1.75]), longestCallMs: 3.456,
    });
    expect(row.split("|").filter((c) => c.trim() !== "").length).toBe(cols);
    expect(row).toContain("game-of-life");
    expect(row).toContain("3.5");
    expect(row).toContain("1.50"); // mean work per frame, two decimals
    expect(row).toContain("not measured"); // no time-to-picture for an animated module
  });

  test("a static module has frame and work columns 'not measured', and a time to picture", () => {
    const row = toMarkdownRow({ visualization: "mandelbrot", level: "default", path: "processor", device: "d", phase: "p", timeToPictureMs: 93.4, longestCallMs: 8 });
    expect(row).toContain("| 93 |");
    // frame mean, frame p95, fps, work mean, work p95
    expect(row.match(/not measured/g).length).toBe(5);
  });

  test("a figure over the 50 ms rule is flagged", () => {
    const row = toMarkdownRow({ visualization: "x", level: "high", path: "gpu", device: "d", phase: "p", longestCallMs: MAX_CALL_MS + 1 });
    expect(row).toContain("⚠");
  });
});
