// Development-only page (/studio/__bench, `npm run dev`): measures every visualization and
// every quality level it offers, and prints Markdown rows for
// specs/005-navier-stokes-fluid-performance/measurements.md (research R10, FR-026).
//
// - Animated modules: a real requestAnimationFrame loop for WARMUP + FRAMES frames. The frame
//   time is the gap between animation frames (what a visitor sees); the longest single
//   step/render/create call is timed on its own (the 50 ms rule, FR-025).
// - Static modules: time from create() until no kernel, progressive task or redraw is pending.
//
// Keep this tab visible while it runs: browsers throttle animation frames in background tabs.
// Open with ?gpu=off to measure the processor path of a module that has a GPU path.
// `window.__bench` exposes the same thing to automation.
import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG } from "../catalog.js";
import { defaultsOf, validateConfig } from "../core/knobs.js";
import { createModuleContext } from "../core/moduleContext.js";
import { summarize, toMarkdownRow, TABLE_HEADER } from "../core/bench.js";
import "../studio.css";

const W = 960; // a typical studio canvas, in device pixels
const H = 720;
const WARMUP = 20;
const FRAMES = 120;
const STATIC_LIMIT_MS = 30000;
const FLOOR = 160;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

function makeCanvas(scale) {
  const c = document.createElement("canvas");
  c.width = Math.max(FLOOR, Math.round(W * scale));
  c.height = Math.max(FLOOR, Math.round(H * scale));
  return c;
}

const stepsFor = (module, values) =>
  typeof module.stepsPerFrame === "function" ? module.stepsPerFrame(values) : module.stepsPerFrame ?? 1;

async function measureAnimated(module, cfg, scale) {
  const calls = [];
  let work = 0; // step + render time of the frame being measured
  const timed = (fn) => {
    const t = performance.now();
    fn();
    const d = performance.now() - t;
    calls.push(d);
    work += d;
  };
  const handle = createModuleContext({ seed: cfg.seed, dpr: 1 });
  const canvas = makeCanvas(scale);
  let inst;
  timed(() => {
    inst = module.create(canvas, cfg, handle.ctx);
  });
  await handle.ctx.idle();
  const perFrame = stepsFor(module, cfg.values);
  const frames = [];
  const works = [];
  let acc = 0;
  await new Promise((resolve) => {
    let last = null;
    let n = 0;
    const tick = (ts) => {
      if (last !== null) {
        n++;
        if (n > WARMUP) frames.push(ts - last);
      }
      last = ts;
      work = 0;
      acc += perFrame;
      while (acc >= 1) {
        timed(() => inst.step());
        acc -= 1;
      }
      timed(() => inst.render());
      // A GPU instance queues its commands and returns at once, so wait for them: otherwise
      // the work figure would hide the cost. Processor instances have nothing to wait for.
      timed(() => inst.__debug?.finish?.());
      if (n > WARMUP) works.push(work);
      if (n < WARMUP + FRAMES) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const path = inst.path ?? "processor";
  try {
    inst.destroy();
  } catch {
    /* ignore */
  }
  handle.dispose();
  return { summary: summarize(frames), workSummary: summarize(works), longestCallMs: Math.max(0, ...calls), path };
}

async function measureStatic(module, cfg, scale) {
  const calls = [];
  const handle = createModuleContext({ seed: cfg.seed, dpr: 1 });
  const canvas = makeCanvas(scale);
  const t0 = performance.now();
  const inst = module.create(canvas, cfg, handle.ctx);
  calls.push(performance.now() - t0);
  await handle.ctx.idle();
  while (inst.isBusy?.() && performance.now() - t0 < STATIC_LIMIT_MS) {
    await sleep(16);
    await handle.ctx.idle();
  }
  const timeToPictureMs = performance.now() - t0;
  const path = inst.path ?? "processor";
  try {
    inst.destroy();
  } catch {
    /* ignore */
  }
  handle.dispose();
  return { timeToPictureMs, longestCallMs: Math.max(0, ...calls), path };
}

/** The levels a module offers: Low, Medium and High when it has a quality knob, else one default run. */
function levelsOf(module) {
  return module.knobs.some((k) => k.key === "quality") ? ["low", "medium", "high"] : [null];
}

const STATIC_RUNS = 5;
const ANIMATED_RUNS = 3;

/** The run whose figure is the median, so one slow or fast outlier (a garbage collection, a worker starting) does not decide. */
function medianRun(runs, figure) {
  const sorted = [...runs].sort((a, b) => figure(a) - figure(b));
  return sorted[Math.floor(sorted.length / 2)];
}

export async function measureEntry(entry, { device, phase, onlyLevel = null } = {}) {
  const module = (await entry.load()).default;
  const levels = levelsOf(module);
  const configFor = (level) => {
    const base = defaultsOf(module);
    const values = level ? { ...base.values, quality: level } : base.values;
    return validateConfig(module, { ...base, values }).config;
  };
  const scaleOf = (level) => (level && module.quality?.scale?.[level]) || 1;
  const once = (level) => {
    const cfg = configFor(level);
    return module.animated ? measureAnimated(module, cfg, scaleOf(level)) : measureStatic(module, cfg, scaleOf(level));
  };
  // The first run of a module pays for compiling its code and starting its workers; throw it away so
  // the first level measured is not charged for it.
  await once(levels.includes("medium") ? "medium" : levels[0]);
  const rows = [];
  for (const level of levels) {
    if (onlyLevel && level !== onlyLevel) continue;
    const runs = [];
    for (let i = 0; i < (module.animated ? ANIMATED_RUNS : STATIC_RUNS); i++) runs.push(await once(level));
    const r = module.animated
      ? medianRun(runs, (x) => x.workSummary.meanMs ?? Infinity)
      : medianRun(runs, (x) => x.timeToPictureMs);
    rows.push({
      id: entry.id,
      animated: module.animated,
      level: level ?? "default",
      path: r.path,
      row: toMarkdownRow({
        visualization: entry.id,
        level: level ?? "default",
        path: r.path,
        device,
        phase,
        summary: r.summary,
        workSummary: r.workSummary,
        timeToPictureMs: r.timeToPictureMs,
        // The longest call of any run: the 50 ms rule is about the worst case.
        longestCallMs: Math.max(...runs.map((x) => x.longestCallMs)),
      }),
    });
    await nextFrame();
  }
  return rows;
}

const defaultDevice = () => {
  const ua = navigator.userAgent;
  const brand = /(Chrome|Firefox|Safari)\/[\d.]+/.exec(ua)?.[0] ?? "browser";
  return `${navigator.platform || "unknown"} ${brand}, ${Math.round(window.devicePixelRatio * 100) / 100}x`;
};

export default function BenchPage() {
  const [device, setDevice] = useState(defaultDevice);
  const [phase, setPhase] = useState("baseline");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const state = useRef({ device, phase });
  state.current = { device, phase };

  const run = useCallback(async (entries) => {
    const out = [];
    for (const entry of entries) {
      setBusy(entry.name);
      try {
        out.push(...(await measureEntry(entry, state.current)));
      } catch (err) {
        out.push({ id: entry.id, level: "-", row: `| ${entry.id} | - | - | ${state.current.device} | error: ${String(err?.message ?? err)} | | | | | ${state.current.phase} |` });
      }
      setRows((r) => [...r.filter((x) => !out.some((o) => o.id === x.id && o.level === x.level)), ...out.filter((o) => o.id === entry.id)]);
    }
    setBusy(null);
    return out;
  }, []);

  // For automation: window.__bench.runAll({ device, phase }), window.__bench.run("mandelbrot")
  useEffect(() => {
    window.__bench = {
      entries: () => CATALOG.map((e) => e.id),
      run: async (id, opts = {}) => {
        const entry = CATALOG.find((e) => e.id === id);
        if (!entry) throw new Error(`unknown visualization ${id}`);
        return measureEntry(entry, { ...state.current, ...opts });
      },
      runAll: async (opts = {}) => {
        const out = [];
        for (const entry of CATALOG) out.push(...(await measureEntry(entry, { ...state.current, ...opts })));
        return out;
      },
      header: TABLE_HEADER,
    };
    return () => {
      delete window.__bench;
    };
  }, []);

  const table = [TABLE_HEADER, ...rows.map((r) => r.row)].join("\n");

  return (
    <div className="studio">
      <div className="studio-header">
        <h1>Bench (development only)</h1>
      </div>
      <main>
        <p className="muted">
          Keep this tab visible while it runs. Path shown is the one the module actually took (add <code>?gpu=off</code> to force the processor path).
        </p>
        <p>
          <label>
            Device <input value={device} onChange={(e) => setDevice(e.target.value)} size={48} />
          </label>{" "}
          <label>
            Phase <input value={phase} onChange={(e) => setPhase(e.target.value)} size={14} />
          </label>
        </p>
        <p>
          <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => run(CATALOG)}>
            Measure all
          </button>{" "}
          {busy && <span role="status">Measuring {busy}…</span>}
        </p>
        <ul className="bench-list">
          {CATALOG.map((e) => (
            <li key={e.id}>
              <button type="button" className="btn btn-small" disabled={Boolean(busy)} onClick={() => run([e])}>
                Measure
              </button>{" "}
              {e.name}
            </li>
          ))}
        </ul>
        <h2>Table</h2>
        <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(table)}>
          Copy as Markdown
        </button>
        <pre style={{ overflow: "auto", maxHeight: "40vh" }}>{table}</pre>
      </main>
    </div>
  );
}
