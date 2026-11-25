// Maze generation and pathfinding on the graphics card. The generators and solvers (kernel.js) stay on the
// processor and are the oracle, so the maze, the visited cells and the path are exactly the processor path's; the
// graphics card draws them: cells in one pass, walls and the path as instanced segments, the markers as discs.
// Clicking a wall and dragging the start and goal are the same code as the processor path's.
import { createGrid, GENERATORS, solver, toggleWall, N, E, S, W } from "./kernel.js";
import { CELLS, FILL } from "./shaders.js";
import { createShapes } from "../_shared/gpu/shapes.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";

const BASE = [0x1b, 0x1b, 0x22]; // "#1b1b22"
const UNCARVED = [0x26, 0x26, 0x2f]; // "#26262f"
const WALL = [0xe8 / 255, 0xe8 / 255, 0xee / 255, 1]; // "#e8e8ee"
const START = [0x5f / 255, 0xcf / 255, 0x8a / 255, 1]; // "#5fcf8a"
const GOAL = [1, 0x6b / 255, 0x6b / 255, 1]; // "#ff6b6b"

export function createMazeGpu(canvas, gpu, config, ctx) {
  let cfg = config;
  let grid, cols, rows, phase, gen, solve, solveState, result, carved, start, end;
  let drag = null;
  const shapes = createShapes(gpu);
  const fill = gpu.program("maze:fill", FILL);
  const cells = gpu.program("maze:cells", CELLS);
  let cellTex = null;
  const buffers = {
    walls: gpu.buffer(new Float32Array(4), { dynamic: true }),
    path: gpu.buffer(new Float32Array(4), { dynamic: true }),
    markers: gpu.buffer(new Float32Array(3), { dynamic: true }),
    markers2: gpu.buffer(new Float32Array(3), { dynamic: true }),
  };

  function startSolve() {
    solve = solver(cfg.values.solver, grid, start, end, cfg.values.heuristic);
    solveState = null;
    result = null;
    phase = "solve";
  }

  function applyEdits() {
    for (const [i, bit] of cfg.input?.toggled ?? []) if (i >= 0 && i < grid.walls.length) toggleWall(grid, i, bit);
  }

  function init() {
    cols = cfg.values.size;
    rows = Math.max(3, Math.round(cols * 0.75));
    grid = createGrid(cols, rows);
    gen = GENERATORS[cfg.values.generator](grid, ctx.rng);
    phase = "generate";
    carved = new Uint8Array(cols * rows);
    start = Number.isInteger(cfg.input?.start) && cfg.input.start < cols * rows ? cfg.input.start : 0;
    end = Number.isInteger(cfg.input?.end) && cfg.input.end < cols * rows ? cfg.input.end : cols * rows - 1;
    solveState = null;
    result = null;
    if (!cellTex) cellTex = gpu.target({ w: cols, h: rows, format: "rgba8", keepData: false });
    else gpu.resize(cellTex, cols, rows);
  }

  function box() {
    return fitAspect(canvas.width, canvas.height, cols / rows);
  }

  const visitedNow = () => result?.visited ?? solveState?.visited;

  function render() {
    if (gpu.isLost()) return;
    const b = box();
    const c = b.w / cols;
    const pal = cfg.values.palette;
    const lut = ctx.palette(pal);
    const col = (t) => {
      const k = Math.round(t * 255) * 3;
      return [lut[k] / 255, lut[k + 1] / 255, lut[k + 2] / 255];
    };
    const size = [canvas.width, canvas.height];
    gpu.draw(fill, { uColor: BG_RGB.map((v) => v / 255) }, null);

    // The cells: not yet generated, visited by the solver, or empty.
    const visited = visitedNow();
    const px = new Uint8Array(cols * rows * 4);
    for (let i = 0; i < cols * rows; i++) {
      if (phase === "generate" && !carved[i]) px[i * 4] = 255;
      else if (visited && visited[i]) px[i * 4 + 1] = 255;
      px[i * 4 + 3] = 255;
    }
    gpu.upload(cellTex, px);
    const viewport = [Math.round(b.x), Math.round(canvas.height - b.y - b.h), Math.round(b.w), Math.round(b.h)];
    gpu.draw(
      cells,
      { uCells: cellTex, uBase: BASE.map((v) => v / 255), uUncarved: UNCARVED.map((v) => v / 255), uVisited: [...col(0.35), 0.45] },
      null,
      { viewport }
    );

    // The path through the cell centers.
    if (result?.path && result.path.length > 1) {
      const p = result.path;
      const data = new Float32Array((p.length - 1) * 4);
      for (let k = 1; k < p.length; k++) {
        const a = p[k - 1], d = p[k];
        data.set(
          [b.x + ((a % cols) + 0.5) * c, b.y + (Math.floor(a / cols) + 0.5) * c, b.x + ((d % cols) + 0.5) * c, b.y + (Math.floor(d / cols) + 0.5) * c],
          (k - 1) * 4
        );
      }
      buffers.path.update(data);
      shapes.segments(buffers.path, { count: p.length - 1, width: Math.max(2, c * 0.35), color: [...col(0.95), 1], cap: "round", canvas: size });
    }

    // The walls: every cell's top and left wall, and the right and bottom edges of the box.
    const list = [];
    for (let i = 0; i < cols * rows; i++) {
      const w = grid.walls[i];
      const x = b.x + (i % cols) * c, y = b.y + Math.floor(i / cols) * c;
      if (w & N) list.push(x, y, x + c, y);
      if (w & W) list.push(x, y, x, y + c);
      if (w & E && i % cols === cols - 1) list.push(x + c, y, x + c, y + c);
      if (w & S && Math.floor(i / cols) === rows - 1) list.push(x, y + c, x + c, y + c);
    }
    if (list.length) {
      buffers.walls.update(new Float32Array(list));
      shapes.segments(buffers.walls, { count: list.length / 4, width: Math.max(1, c * 0.12), color: WALL, cap: "square", canvas: size });
    }

    // The start and the goal.
    const radius = Math.max(3, c * 0.32);
    const at = (i) => [b.x + ((i % cols) + 0.5) * c, b.y + (Math.floor(i / cols) + 0.5) * c];
    buffers.markers.update(new Float32Array([...at(start), radius]));
    shapes.discs(buffers.markers, { count: 1, color: START, canvas: size });
    buffers.markers2.update(new Float32Array([...at(end), radius]));
    shapes.discs(buffers.markers2, { count: 1, color: GOAL, canvas: size });

    const stats = { phase: phase === "generate" ? "Generating" : phase === "solve" ? "Solving" : "Done" };
    if (visited) stats.visited = result?.count ?? solveState?.count ?? 0;
    if (result?.path) stats.pathLength = result.path.length - 1;
    ctx.reportStats(stats);
  }

  function cellAt(ev) {
    const b = box();
    const c = b.w / cols;
    const fx = (ev.x - b.x) / c, fy = (ev.y - b.y) / c;
    if (fx < 0 || fy < 0 || fx >= cols || fy >= rows) return null;
    return { i: Math.floor(fy) * cols + Math.floor(fx), fx: fx % 1, fy: fy % 1 };
  }

  function commit(extra) {
    const input = {
      toggled: [...(cfg.input?.toggled ?? []), ...(extra ?? [])],
      start,
      end,
    };
    cfg = { ...cfg, input };
    ctx.setInput(input);
  }

  init();
  render();

  gpu.onRestored(() => render()); // the maze and the solver are on the processor: draw them again

  return {
    path: "gpu",
    update(c, changed = []) {
      const regen = changed.some((k) => k === "size" || k === "generator");
      const resolve = changed.some((k) => k === "solver" || k === "heuristic");
      cfg = c;
      if (regen) init();
      else if (resolve && phase !== "generate") startSolve();
      render();
    },
    step() {
      if (phase === "generate") {
        const r = gen.next();
        if (r.done) {
          carved.fill(1);
          applyEdits();
          startSolve();
        } else carved[r.value] = 1;
      } else if (phase === "solve") {
        const r = solve.next();
        if (r.done) {
          result = r.value;
          phase = "done";
          if (result.noPath) ctx.reportNotice("No path: the goal can't be reached from the start.");
        } else solveState = r.value;
      }
    },
    /** Generated and solved: an animated sweep can start the next maze. */
    isDone: () => phase === "done",
    /** Generated and solved: nothing changes until the settings or the endpoints do (FR-024). */
    isIdle: () => phase === "done",
    render,
    reset() {
      init();
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    pointer(ev) {
      if (phase === "generate") return;
      const hit = cellAt(ev);
      if (ev.type === "down" && hit) {
        if (hit.i === start) drag = "start";
        else if (hit.i === end) drag = "end";
        else {
          const { fx, fy } = hit;
          const d = [[fy, N], [1 - fx, E], [1 - fy, S], [fx, W]].sort((a, b) => a[0] - b[0])[0];
          toggleWall(grid, hit.i, d[1]);
          commit([[hit.i, d[1]]]);
          startSolve();
          render();
        }
      } else if (ev.type === "move" && drag && hit) {
        if (drag === "start" && hit.i !== end) start = hit.i;
        if (drag === "end" && hit.i !== start) end = hit.i;
        render();
      } else if (ev.type === "up" && drag) {
        drag = null;
        commit();
        startSolve();
        render();
      }
    },
    ...(import.meta.env.MODE !== "production"
      ? {
          __debug: {
            readState: () => ({
              phase,
              cols,
              rows,
              walls: Uint8Array.from(grid.walls),
              carved: Uint8Array.from(carved),
              visited: visitedNow() ? Uint8Array.from(visitedNow()) : null,
              path: result?.path ? [...result.path] : null,
              noPath: Boolean(result?.noPath),
              start,
              end,
            }),
            gpu,
            finish: () => gpu.finish(),
          },
        }
      : {}),
  };
}
