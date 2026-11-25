// Pure helpers for the development-only bench page (/studio/__bench). They turn a run of
// frame times into the figures that go in specs/005-.../measurements.md
// (contracts/quality.md, research R10). No DOM, no timers.
//
// Two numbers per animated run, because one is not enough:
//  - frame time: the gap between animation frames, what a visitor sees. On a fast machine
//    it sits at the display's refresh interval (16.7 ms at 60 Hz) and cannot tell a cheap
//    module from an expensive one.
//  - work per frame: the time spent in step() + render() (and a GPU sync when the instance
//    offers one). This is what the 20% quality gate (FR-020) compares.

/** The longest single step/render/update/resize call a module may make (module contract, FR-025). */
export const MAX_CALL_MS = 50;

const NOT_MEASURED = "not measured";

export const TABLE_HEADER = [
  "| Visualization | Level | Path | Device | Frame ms (mean) | Frame ms (p95) | fps | Work ms/frame (mean) | Work ms/frame (p95) | Time to picture ms | Longest single call ms | Phase |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
].join("\n");

/** frameMs: times in milliseconds → { frames, meanMs, p95Ms, fps }. Bad entries are ignored. */
export function summarize(frameMs) {
  const v = frameMs.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return { frames: 0, meanMs: null, p95Ms: null, fps: null };
  const meanMs = v.reduce((s, x) => s + x, 0) / v.length;
  const p95Ms = v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)];
  return { frames: v.length, meanMs, p95Ms, fps: meanMs > 0 ? 1000 / meanMs : null };
}

const fmt = (x, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? NOT_MEASURED : x.toFixed(digits));

/** One Markdown table row for measurements.md. Missing figures are written "not measured", never guessed. */
export function toMarkdownRow({ visualization, level, path, device, phase, summary, workSummary, timeToPictureMs, longestCallMs }) {
  const s = summary ?? { meanMs: null, p95Ms: null, fps: null };
  const w = workSummary ?? { meanMs: null, p95Ms: null };
  const slow = Number.isFinite(longestCallMs) && longestCallMs > MAX_CALL_MS;
  const longest = fmt(longestCallMs) + (slow ? ` ⚠ over ${MAX_CALL_MS} ms` : "");
  return `| ${visualization} | ${level} | ${path} | ${device} | ${fmt(s.meanMs)} | ${fmt(s.p95Ms)} | ${fmt(s.fps)} | ${fmt(w.meanMs, 2)} | ${fmt(w.p95Ms, 2)} | ${fmt(timeToPictureMs, 0)} | ${longest} | ${phase} |`;
}
