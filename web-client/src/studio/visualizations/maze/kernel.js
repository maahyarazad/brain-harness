// Mazes on a cols×rows grid. walls[i] is a bitmask of the walls still standing around cell i.
export const N = 1, E = 2, S = 4, W = 8;
const DIRS = [
  [N, 0, -1, S],
  [E, 1, 0, W],
  [S, 0, 1, N],
  [W, -1, 0, E],
];

export function createGrid(cols, rows) {
  return { cols, rows, walls: new Uint8Array(cols * rows).fill(N | E | S | W) };
}

function neighbors(grid, i) {
  const { cols, rows } = grid;
  const x = i % cols, y = Math.floor(i / cols);
  const out = [];
  for (const [bit, dx, dy, opp] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push({ j: ny * cols + nx, bit, opp });
  }
  return out;
}

export function carve(grid, i, j) {
  const n = neighbors(grid, i).find((n) => n.j === j);
  if (!n) return;
  grid.walls[i] &= ~n.bit;
  grid.walls[j] &= ~n.opp;
}

export function toggleWall(grid, i, bit) {
  const n = neighbors(grid, i).find((n) => n.bit === bit);
  if (!n) return;
  if (grid.walls[i] & bit) {
    grid.walls[i] &= ~bit;
    grid.walls[n.j] &= ~n.opp;
  } else {
    grid.walls[i] |= bit;
    grid.walls[n.j] |= n.opp;
  }
}

/** Open neighbors (no wall between). */
export function passages(grid, i) {
  return neighbors(grid, i).filter((n) => !(grid.walls[i] & n.bit)).map((n) => n.j);
}

// --- Generators (yield the cell just carved into) ---

export function* dfsBacktracker(grid, rng) {
  const seen = new Uint8Array(grid.walls.length);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const i = stack[stack.length - 1];
    const options = neighbors(grid, i).filter((n) => !seen[n.j]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const { j } = options[Math.floor(rng() * options.length)];
    carve(grid, i, j);
    seen[j] = 1;
    stack.push(j);
    yield j;
  }
}

export function* prim(grid, rng) {
  const inMaze = new Uint8Array(grid.walls.length);
  const frontier = [];
  const inFrontier = new Uint8Array(grid.walls.length);
  const add = (i) => {
    inMaze[i] = 1;
    for (const { j } of neighbors(grid, i)) {
      if (!inMaze[j] && !inFrontier[j]) {
        inFrontier[j] = 1;
        frontier.push(j);
      }
    }
  };
  add(Math.floor(rng() * grid.walls.length));
  while (frontier.length) {
    const k = Math.floor(rng() * frontier.length);
    const j = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    const linked = neighbors(grid, j).filter((n) => inMaze[n.j]);
    const { j: i } = linked[Math.floor(rng() * linked.length)];
    carve(grid, i, j);
    add(j);
    yield j;
  }
}

export function* wilson(grid, rng) {
  const total = grid.walls.length;
  const inMaze = new Uint8Array(total);
  inMaze[Math.floor(rng() * total)] = 1;
  let remaining = total - 1;
  const next = new Int32Array(total);
  while (remaining > 0) {
    let start;
    do start = Math.floor(rng() * total);
    while (inMaze[start]);
    // Loop-erased random walk: remember only the last exit from each cell.
    let i = start;
    while (!inMaze[i]) {
      const ns = neighbors(grid, i);
      const j = ns[Math.floor(rng() * ns.length)].j;
      next[i] = j;
      i = j;
    }
    i = start;
    while (!inMaze[i]) {
      carve(grid, i, next[i]);
      inMaze[i] = 1;
      remaining--;
      yield i;
      i = next[i];
    }
  }
}

export const GENERATORS = { dfs: dfsBacktracker, prim, wilson };

// --- Solvers: yield { visited, frontier } and finish with { path } or { noPath: true } ---

class MinHeap {
  constructor() {
    this.a = [];
  }
  push(item, key) {
    const a = this.a;
    a.push([key, item]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

function buildPath(prev, end) {
  const path = [];
  for (let i = end; i !== -1; i = prev[i]) path.push(i);
  return path.reverse();
}

function* bestFirst(grid, start, end, h) {
  const n = grid.walls.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(start, h(start));
  let count = 0;
  while (heap.size) {
    const i = heap.pop();
    if (visited[i]) continue;
    visited[i] = 1;
    count++;
    if (i === end) return { path: buildPath(prev, end), visited, count };
    for (const j of passages(grid, i)) {
      const d = dist[i] + 1;
      if (d < dist[j]) {
        dist[j] = d;
        prev[j] = i;
        heap.push(j, d + h(j));
      }
    }
    yield { visited, count, current: i };
  }
  return { noPath: true, visited, count };
}

export function astar(grid, start, end, heuristic = "manhattan") {
  const { cols } = grid;
  const ex = end % cols, ey = Math.floor(end / cols);
  const h =
    heuristic === "euclidean"
      ? (i) => Math.hypot((i % cols) - ex, Math.floor(i / cols) - ey)
      : (i) => Math.abs((i % cols) - ex) + Math.abs(Math.floor(i / cols) - ey);
  return bestFirst(grid, start, end, h);
}

export function dijkstra(grid, start, end) {
  return bestFirst(grid, start, end, () => 0);
}

export function* bfs(grid, start, end) {
  const n = grid.walls.length;
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const queue = [start];
  visited[start] = 1;
  let head = 0, count = 0;
  while (head < queue.length) {
    const i = queue[head++];
    count++;
    if (i === end) return { path: buildPath(prev, end), visited, count };
    for (const j of passages(grid, i)) {
      if (!visited[j]) {
        visited[j] = 1;
        prev[j] = i;
        queue.push(j);
      }
    }
    yield { visited, count, current: i };
  }
  return { noPath: true, visited, count };
}

export function solver(kind, grid, start, end, heuristic) {
  if (kind === "astar") return astar(grid, start, end, heuristic);
  if (kind === "dijkstra") return dijkstra(grid, start, end);
  return bfs(grid, start, end);
}

/** Runs a generator to completion and returns its return value. */
export function runToEnd(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}
