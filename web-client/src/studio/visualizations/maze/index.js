import { createGrid, GENERATORS, solver, toggleWall, N, E, S, W } from "./kernel.js";
import { fitAspect, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

function validateInput(input) {
  const v = {};
  if (Array.isArray(input?.toggled)) v.toggled = input.toggled.filter((t) => Array.isArray(t) && Number.isInteger(t[0]) && [1, 2, 4, 8].includes(t[1])).slice(0, 2000);
  for (const k of ["start", "end"]) if (Number.isInteger(input?.[k])) v[k] = input[k];
  return { value: Object.keys(v).length ? v : null, replaced: [] };
}

export default {
  id: "maze",
  name: "Maze generation and pathfinding",
  howItWorks:
    "First a maze is carved out of a grid of walls. Depth-first search digs long winding corridors; Prim's algorithm grows the maze outward like a crystal, giving many short dead ends; Wilson's algorithm uses random walks and makes every possible maze equally likely. Then a solver searches from start (top left) to goal (bottom right): breadth-first search and Dijkstra spread out evenly, while A* uses a distance estimate (the heuristic) to head toward the goal. Click a wall to add or remove it, or drag the start and goal markers.",
  animated: true,
  random: true,
  interactive: true,
  stepsPerFrame: (v) => Math.max(1, Math.round((v.size * v.size * 0.75) / 400)),
  validateInput,
  knobs: [
    { key: "size", label: "Grid width", type: "range", min: 5, max: 150, step: 1, default: 30, live: false },
    {
      key: "generator", label: "Maze generator", type: "choice", default: "dfs",
      options: [{ value: "dfs", label: "Depth-first search" }, { value: "prim", label: "Prim's algorithm" }, { value: "wilson", label: "Wilson's algorithm" }],
    },
    {
      key: "solver", label: "Solver", type: "choice", default: "astar",
      options: [{ value: "astar", label: "A*" }, { value: "dijkstra", label: "Dijkstra" }, { value: "bfs", label: "Breadth-first search" }],
    },
    {
      key: "heuristic", label: "A* heuristic", type: "choice", default: "manhattan",
      options: [{ value: "manhattan", label: "Manhattan" }, { value: "euclidean", label: "Euclidean" }],
      when: (v) => v.solver === "astar",
    },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "dfs-astar", name: "DFS + A*", values: { generator: "dfs", solver: "astar" } },
    { id: "prim-bfs", name: "Prim's + BFS", values: { generator: "prim", solver: "bfs" } },
    { id: "wilson-dijkstra", name: "Wilson's + Dijkstra", values: { generator: "wilson", solver: "dijkstra", size: 40 } },
    { id: "big", name: "Big maze", values: { size: 120, generator: "dfs", solver: "astar" } },
  ],
  sweep: { kind: "run", targets: [{ key: "generator", mode: "steps", list: ["dfs", "prim", "wilson"] }] },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let grid, cols, rows, phase, gen, solve, solveState, result, carved, start, end;
    let drag = null;

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
    }

    function box() {
      return fitAspect(canvas.width, canvas.height, cols / rows);
    }

    function render() {
      const b = box();
      const c = b.w / cols;
      const pal = cfg.values.palette;
      clear(g, BG);
      g.fillStyle = "#1b1b22";
      g.fillRect(b.x, b.y, b.w, b.h);
      const visited = result?.visited ?? solveState?.visited;
      for (let i = 0; i < cols * rows; i++) {
        const x = b.x + (i % cols) * c, y = b.y + Math.floor(i / cols) * c;
        if (phase === "generate" && !carved[i]) {
          g.fillStyle = "#26262f";
          g.fillRect(x, y, c, c);
        } else if (visited && visited[i]) {
          g.fillStyle = ctx.color(pal, 0.35, 0.45);
          g.fillRect(x, y, c, c);
        }
      }
      if (result?.path) {
        g.strokeStyle = ctx.color(pal, 0.95);
        g.lineWidth = Math.max(2, c * 0.35);
        g.lineCap = "round";
        g.lineJoin = "round";
        g.beginPath();
        result.path.forEach((i, k) => {
          const x = b.x + ((i % cols) + 0.5) * c, y = b.y + (Math.floor(i / cols) + 0.5) * c;
          if (k) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.stroke();
      }
      g.strokeStyle = "#e8e8ee";
      g.lineWidth = Math.max(1, c * 0.12);
      g.lineCap = "square";
      g.beginPath();
      for (let i = 0; i < cols * rows; i++) {
        const w = grid.walls[i];
        const x = b.x + (i % cols) * c, y = b.y + Math.floor(i / cols) * c;
        if (w & N) { g.moveTo(x, y); g.lineTo(x + c, y); }
        if (w & W) { g.moveTo(x, y); g.lineTo(x, y + c); }
        if ((w & E) && i % cols === cols - 1) { g.moveTo(x + c, y); g.lineTo(x + c, y + c); }
        if ((w & S) && Math.floor(i / cols) === rows - 1) { g.moveTo(x, y + c); g.lineTo(x + c, y + c); }
      }
      g.stroke();
      const marker = (i, color) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(b.x + ((i % cols) + 0.5) * c, b.y + (Math.floor(i / cols) + 0.5) * c, Math.max(3, c * 0.32), 0, 2 * Math.PI);
        g.fill();
      };
      marker(start, "#5fcf8a");
      marker(end, "#ff6b6b");
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
    return {
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
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
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
    };
  },
};
