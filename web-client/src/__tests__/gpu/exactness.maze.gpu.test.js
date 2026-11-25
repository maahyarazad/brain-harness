// SC-016 / FR-035: the GPU maze holds exactly the maze, visited cells and path the kernels give, at every step, and draws them.
import { afterEach, describe, expect, test } from "vitest";
import mazeModule from "../../studio/visualizations/maze/index.js";
import { createGrid, GENERATORS, solver, toggleWall, N, E, S, W } from "../../studio/visualizations/maze/kernel.js";
import { createRng } from "../../studio/core/rng.js";
import { fitAspect } from "../../studio/visualizations/_shared/instance.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(mazeModule);
const runs = [];
afterEach(() => runs.splice(0).forEach(finish));
const gpuRun = (config, options) => {
  const r = runGpu(module, config, options);
  runs.push(r);
  return r;
};
const processorRun = (config, options) => {
  const r = runProcessor(module, config, options);
  runs.push(r);
  return r;
};

const PRESETS = module.presets.filter((p) => p.id !== "sweep").map((p) => p.id);
const GENERATORS_ = ["dfs", "prim", "wilson"];
const SOLVERS = ["astar", "dijkstra", "bfs"];
const SEEDS = [1, 2, 3, 4, 5];

/** The processor path's own logic, kept as a small model. */
function oracle(config) {
  const v = config.values;
  const cols = v.size;
  const rows = Math.max(3, Math.round(cols * 0.75));
  const grid = createGrid(cols, rows);
  const m = {
    cols,
    rows,
    grid,
    gen: GENERATORS[v.generator](grid, createRng(config.seed)),
    phase: "generate",
    carved: new Uint8Array(cols * rows),
    start: 0,
    end: cols * rows - 1,
    solveState: null,
    result: null,
    solve: null,
  };
  const startSolve = () => {
    m.solve = solver(v.solver, grid, m.start, m.end, v.heuristic);
    m.solveState = null;
    m.result = null;
    m.phase = "solve";
  };
  m.step = () => {
    if (m.phase === "generate") {
      const r = m.gen.next();
      if (r.done) {
        m.carved.fill(1);
        startSolve();
      } else m.carved[r.value] = 1;
    } else if (m.phase === "solve") {
      const r = m.solve.next();
      if (r.done) {
        m.result = r.value;
        m.phase = "done";
      } else m.solveState = r.value;
    }
  };
  m.visited = () => m.result?.visited ?? m.solveState?.visited ?? null;
  return m;
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function expectSame(inst, o, label) {
  const g = inst.__debug.readState();
  expect(g.phase, `${label}: phase`).toBe(o.phase);
  expect(same(g.walls, o.grid.walls), `${label}: walls`).toBe(true);
  expect(same(g.carved, o.carved), `${label}: carved`).toBe(true);
  const v = o.visited();
  expect(g.visited === null, `${label}: has visited`).toBe(v === null);
  if (v) expect(same(g.visited, v), `${label}: visited`).toBe(true);
  expect(g.path, `${label}: path`).toEqual(o.result?.path ?? null);
}

const pixels = (inst, w, h) => {
  const data = inst.__debug.gpu.readback({ w, h, fbo: null }, new Uint8Array(w * h * 4));
  return (x, y) => {
    const i = ((h - 1 - Math.round(y)) * w + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
};
const near = (a, b, t = 4) => a.every((v, i) => Math.abs(v - b[i]) <= t);

describe("the maze, the visited cells and the path equal the kernels', at every step", () => {
  test.each(GENERATORS_.flatMap((g) => SOLVERS.map((s) => [g, s])))("%s then %s, 5 seeds", (generator, solverName) => {
    for (const seed of SEEDS) {
      const config = configFor(module, "dfs-astar", seed, { generator, solver: solverName, size: 14 });
      const { inst } = gpuRun(config);
      expect(inst.path).toBe("gpu");
      const o = oracle(config);
      expectSame(inst, o, `seed ${seed}, the start`);
      let n = 0;
      while (o.phase !== "done" && n < 200000) {
        inst.step();
        o.step();
        n++;
        if (n <= 20 || n % 13 === 0 || o.phase === "done") expectSame(inst, o, `seed ${seed}, step ${n}`);
      }
      expect(o.phase).toBe("done");
      expect(inst.isDone()).toBe(true);
      expect(inst.isIdle()).toBe(true);
    }
  }, 120000);

  test("the biggest maze, to the end", () => {
    const config = configFor(module, "big", 2, { size: 150, generator: "dfs", solver: "bfs" });
    const { inst } = gpuRun(config);
    const o = oracle(config);
    let n = 0;
    while (o.phase !== "done" && n < 400000) {
      inst.step();
      o.step();
      n++;
    }
    expectSame(inst, o, "the end");
  }, 120000);

  test.each(PRESETS)("preset %s", (preset) => {
    const config = configFor(module, preset, 3, { size: 18 });
    const { inst } = gpuRun(config);
    const o = oracle(config);
    while (o.phase !== "done") {
      inst.step();
      o.step();
    }
    expectSame(inst, o, preset);
  }, 60000);

  test("a goal that cannot be reached is reported and has no path", () => {
    const notices = [];
    const config = configFor(module, "dfs-astar", 1, { size: 8 });
    const { inst } = gpuRun(config, { ctxOptions: { onNotice: (n) => notices.push(n) } });
    // Seal the goal by toggling a wall on every open side of it, once the maze exists.
    while (inst.__debug.readState().phase === "generate") inst.step();
    const g = inst.__debug.readState();
    const goal = g.end;
    const b = fitAspect(320, 240, g.cols / g.rows);
    const c = b.w / g.cols;
    // Clicking the goal cell itself would drag the goal, so close each open side from the neighbour's edge.
    const sides = [
      [N, goal - g.cols, 0.5, 0.95],
      [S, goal + g.cols, 0.5, 0.05],
      [W, goal - 1, 0.95, 0.5],
      [E, goal + 1, 0.05, 0.5],
    ];
    for (const [bit, j, fx, fy] of sides) {
      if (g.walls[goal] & bit) continue; // already a wall
      const x = j % g.cols, y = Math.floor(j / g.cols);
      inst.pointer({ type: "down", x: b.x + (x + fx) * c, y: b.y + (y + fy) * c });
    }
    let guard = 0;
    while (!inst.isDone() && guard++ < 100000) inst.step();
    expect(inst.__debug.readState().noPath).toBe(true);
    expect(notices.some((n) => /No path/i.test(n))).toBe(true);
  });
});

describe("it draws what the processor path draws", () => {
  /** A canvas of 800 x 600 shows a 20 x 15 maze with 40 px cells. */
  const config = () => configFor(module, "dfs-astar", 4, { size: 20 });

  test("while generating: cells not yet reached are the lighter grey, the rest the box color", () => {
    const r = gpuRun(config(), { size: [800, 600] });
    const o = oracle(config());
    for (let n = 0; n < 60; n++) {
      r.inst.step();
      o.step();
    }
    r.inst.render();
    const at = pixels(r.inst, 800, 600);
    let uncarvedOk = 0;
    let carvedOk = 0;
    let uncarved = 0;
    let carvedN = 0;
    for (let i = 0; i < 300; i++) {
      const cx = (i % 20) * 40 + 20;
      const cy = Math.floor(i / 20) * 40 + 20;
      // The middle of a cell is clear of walls (they are on its edges, 5 px wide at most).
      const c = at(cx, cy);
      if (o.carved[i]) {
        carvedN++;
        if (near(c, [0x1b, 0x1b, 0x22]) || near(c, [0x1b, 0x1b, 0x22].map((v) => v), 40)) carvedOk++;
      } else {
        uncarved++;
        if (near(c, [0x26, 0x26, 0x2f])) uncarvedOk++;
      }
    }
    expect(uncarved).toBeGreaterThan(200);
    expect(uncarvedOk / uncarved).toBeGreaterThan(0.97);
    expect(carvedOk / carvedN).toBeGreaterThan(0.9);
  });

  test("walls are drawn in the wall color where the maze has them, and not where it does not", () => {
    const r = gpuRun(config(), { size: [800, 600] });
    const o = oracle(config());
    while (o.phase === "generate") {
      r.inst.step();
      o.step();
    }
    r.inst.render();
    const at = pixels(r.inst, 800, 600);
    let withWall = 0;
    let without = 0;
    let rightWith = 0;
    let rightWithout = 0;
    for (let i = 0; i < 300; i++) {
      const x = (i % 20) * 40, y = Math.floor(i / 20) * 40;
      const w = o.grid.walls[i];
      if (i % 20 > 0) {
        // the wall on a cell's left edge, sampled half way down it
        const c = at(x, y + 20);
        if (w & W) { withWall++; if (near(c, [0xe8, 0xe8, 0xee], 6)) rightWith++; }
        else { without++; if (!near(c, [0xe8, 0xe8, 0xee], 30)) rightWithout++; }
      }
      if (Math.floor(i / 20) > 0) {
        const c = at(x + 20, y);
        if (w & N) { withWall++; if (near(c, [0xe8, 0xe8, 0xee], 6)) rightWith++; }
        else { without++; if (!near(c, [0xe8, 0xe8, 0xee], 30)) rightWithout++; }
      }
    }
    expect(withWall).toBeGreaterThan(100);
    expect(without).toBeGreaterThan(100);
    expect(rightWith / withWall, "wall pixels where there is a wall").toBeGreaterThan(0.98);
    expect(rightWithout / without, "no wall colour where there is none").toBeGreaterThan(0.98);
  });

  test("the outer border is drawn on all four sides", () => {
    const r = gpuRun(config(), { size: [800, 600] });
    while (!r.inst.isDone()) r.inst.step();
    r.inst.render();
    const at = pixels(r.inst, 800, 600);
    const wall = [0xe8, 0xe8, 0xee];
    // The lines are 4.8 px wide and centred on the box edge, so the two outer pixels of each side show half of one.
    for (const y of [60, 180, 300, 420, 540]) {
      expect(near(at(799, y), wall, 8), `right border at y ${y}: ${at(799, y)}`).toBe(true);
      expect(near(at(0, y), wall, 8), `left border at y ${y}: ${at(0, y)}`).toBe(true);
    }
    for (const x of [60, 180, 300, 420, 540, 700]) {
      expect(near(at(x, 599), wall, 8), `bottom border at x ${x}: ${at(x, 599)}`).toBe(true);
      expect(near(at(x, 0), wall, 8), `top border at x ${x}: ${at(x, 0)}`).toBe(true);
    }
  });

  test("the solved maze shows visited cells tinted, the path in the palette's colour and the two markers", () => {
    const r = gpuRun(config(), { size: [800, 600] });
    const o = oracle(config());
    while (o.phase !== "done") {
      r.inst.step();
      o.step();
    }
    r.inst.render();
    const at = pixels(r.inst, 800, 600);
    const lut = r.handle.ctx.palette(config().values.palette);
    const pk = Math.round(0.95 * 255) * 3;
    const vk = Math.round(0.35 * 255) * 3;
    const visitedColor = [0, 1, 2].map((j) => Math.round(0.55 * [0x1b, 0x1b, 0x22][j] + 0.45 * lut[vk + j]));
    const centre = (i) => [(i % 20) * 40 + 20, Math.floor(i / 20) * 40 + 20];
    // The start and the goal markers.
    expect(near(at(...centre(o.start)), [0x5f, 0xcf, 0x8a], 6)).toBe(true);
    expect(near(at(...centre(o.end)), [0xff, 0x6b, 0x6b], 6)).toBe(true);
    // A path cell's middle (not the markers) is the path colour.
    const path = o.result.path;
    const middle = path[Math.floor(path.length / 2)];
    expect(near(at(...centre(middle)), [lut[pk], lut[pk + 1], lut[pk + 2]], 6)).toBe(true);
    // A visited cell off the path has the visited tint; an unvisited cell is the plain box.
    const v = o.result.visited;
    const onPath = new Set(path);
    const off = [...Array(300).keys()].filter((i) => v[i] && !onPath.has(i));
    const unvisited = [...Array(300).keys()].filter((i) => !v[i]);
    expect(off.length).toBeGreaterThan(5);
    const tinted = off.filter((i) => near(at(...centre(i)), visitedColor, 6)).length;
    expect(tinted / off.length, `visited off-path cells with the tint ${visitedColor}`).toBeGreaterThan(0.9);
    if (unvisited.length) expect(unvisited.filter((i) => near(at(...centre(i)), [0x1b, 0x1b, 0x22], 4)).length / unvisited.length).toBeGreaterThan(0.9);
  });

  test.each(PRESETS)("preset %s: imageDiff at most 12 against the processor path once solved", (preset) => {
    const config = configFor(module, preset, 4, { size: 24 });
    const g = gpuRun(config);
    const p = processorRun(config);
    for (const r of [g, p]) {
      let guard = 0;
      while (!r.inst.isDone() && guard++ < 200000) r.inst.step();
      r.inst.render();
    }
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
  }, 60000);
});

describe("editing the maze, as on the processor path", () => {
  const solved = (extra = {}) => {
    const config = configFor(module, "dfs-astar", 4, { size: 20, ...extra });
    const inputs = [];
    const r = gpuRun(config, { size: [800, 600], ctxOptions: { onInput: (i) => inputs.push(i) } });
    while (!r.inst.isDone()) r.inst.step();
    return { r, inputs, config };
  };
  const centre = (i) => [(i % 20) * 40 + 20, Math.floor(i / 20) * 40 + 20];

  test("clicking near a cell's edge toggles that wall, reports it, and solves again", () => {
    const { r, inputs } = solved();
    const before = r.inst.__debug.readState();
    // The left edge of cell 25 (x = 5, y = 1): it is a wall or it is open; either way the click flips it.
    const hadWall = Boolean(before.walls[25] & W);
    r.inst.pointer({ type: "down", x: 5 * 40 + 3, y: 1 * 40 + 20 });
    const after = r.inst.__debug.readState();
    expect(Boolean(after.walls[25] & W)).toBe(!hadWall);
    expect(Boolean(after.walls[24] & E), "and the neighbour's side").toBe(!hadWall);
    expect(inputs.at(-1).toggled).toContainEqual([25, W]);
    expect(after.phase).toBe("solve"); // solving again
    while (!r.inst.isDone()) r.inst.step();
    expect(r.inst.__debug.readState().phase).toBe("done");
  });

  test("dragging the start and the goal moves them, never onto each other, and reports where they ended", () => {
    const { r, inputs } = solved();
    const s = r.inst.__debug.readState();
    r.inst.pointer({ type: "down", x: centre(s.start)[0], y: centre(s.start)[1] });
    r.inst.pointer({ type: "move", x: centre(45)[0], y: centre(45)[1] });
    expect(r.inst.__debug.readState().start).toBe(45);
    r.inst.pointer({ type: "move", x: centre(s.end)[0], y: centre(s.end)[1] }); // onto the goal: refused
    expect(r.inst.__debug.readState().start).toBe(45);
    r.inst.pointer({ type: "up", x: 0, y: 0 });
    expect(inputs.at(-1)).toMatchObject({ start: 45, end: s.end });
    // The goal too.
    r.inst.pointer({ type: "down", x: centre(s.end)[0], y: centre(s.end)[1] });
    r.inst.pointer({ type: "move", x: centre(200)[0], y: centre(200)[1] });
    r.inst.pointer({ type: "up", x: 0, y: 0 });
    expect(r.inst.__debug.readState().end).toBe(200);
  });

  test("nothing can be edited while the maze is still being made", () => {
    const config = configFor(module, "dfs-astar", 4, { size: 20 });
    const { inst } = gpuRun(config, { size: [800, 600] });
    for (let i = 0; i < 10; i++) inst.step();
    const walls = inst.__debug.readState().walls;
    inst.pointer({ type: "down", x: 100, y: 100 });
    expect(same(inst.__debug.readState().walls, walls)).toBe(true);
  });

  test("a saved link's edits and endpoints are applied when the maze is finished", () => {
    const base = configFor(module, "dfs-astar", 4, { size: 20 });
    const config = { ...base, input: { toggled: [[25, W]], start: 3, end: 100 } };
    const { inst } = gpuRun(config);
    const o = oracle(config);
    o.start = 3;
    o.end = 100;
    while (!inst.isDone()) inst.step();
    const s = inst.__debug.readState();
    expect(s.start).toBe(3);
    expect(s.end).toBe(100);
    // The kernel with the same edit.
    while (o.phase === "generate") o.step();
    toggleWall(o.grid, 25, W);
    expect(Boolean(s.walls[25] & W)).toBe(Boolean(o.grid.walls[25] & W));
  });
});

describe("changing a setting", () => {
  test("a new generator or size starts over; a new solver solves again on the same maze", () => {
    const config = configFor(module, "dfs-astar", 4, { size: 16 });
    const { inst } = gpuRun(config);
    while (!inst.isDone()) inst.step();
    const walls = inst.__debug.readState().walls;
    inst.update({ ...config, values: { ...config.values, solver: "bfs" } }, ["solver"]);
    expect(inst.__debug.readState().phase).toBe("solve");
    expect(same(inst.__debug.readState().walls, walls)).toBe(true);
    inst.update({ ...config, values: { ...config.values, generator: "prim" } }, ["generator"]);
    expect(inst.__debug.readState().phase).toBe("generate");
    inst.update({ ...config, values: { ...config.values, size: 30 } }, ["size"]);
    expect(inst.__debug.readState().cols).toBe(30);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "dfs-astar", 1, { size: 10 }), { steps: 5 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back draws the same maze again (it is on the processor)", async () => {
    const config = configFor(module, "dfs-astar", 4, { size: 20 });
    const r = gpuRun(config, { size: [800, 600] });
    while (!r.inst.isDone()) r.inst.step();
    r.inst.render();
    const before = pixels(r.inst, 800, 600);
    const sample = [[45, 20], [85, 60], [405, 300], [600, 220]].map(([x, y]) => before(x, y));
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 50));
    const after = pixels(r.inst, 800, 600);
    expect([[45, 20], [85, 60], [405, 300], [600, 220]].map(([x, y]) => after(x, y))).toEqual(sample);
  });
});
