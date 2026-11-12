/** "B3/S23" → { birth: Set, survive: Set } or null when invalid. */
export function parseRule(text) {
  const m = String(text).trim().match(/^B([0-8]*)\/S([0-8]*)$/i);
  if (!m) return null;
  return { birth: new Set([...m[1]].map(Number)), survive: new Set([...m[2]].map(Number)) };
}

/** One generation. grid/next are Uint8Array(w*h) of 0/1. */
export function lifeStep(grid, next, w, h, rule, wrap) {
  const birth = new Uint8Array(9), survive = new Uint8Array(9);
  rule.birth.forEach((n) => (birth[n] = 1));
  rule.survive.forEach((n) => (survive[n] = 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let nx = x + dx, ny = y + dy;
          if (wrap) {
            nx = (nx + w) % w;
            ny = (ny + h) % h;
          } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          n += grid[ny * w + nx];
        }
      }
      const alive = grid[y * w + x];
      next[y * w + x] = alive ? survive[n] : birth[n];
    }
  }
}

export function randomGrid(w, h, density, rng) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = rng() < density ? 1 : 0;
  return g;
}

/** Alive cells as [x, y] pairs. */
export function aliveCells(grid, w) {
  const out = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) out.push([i % w, Math.floor(i / w)]);
  return out;
}

export const GLIDER_GUN = [
  [1, 5], [1, 6], [2, 5], [2, 6], [11, 5], [11, 6], [11, 7], [12, 4], [12, 8], [13, 3], [13, 9], [14, 3], [14, 9],
  [15, 6], [16, 4], [16, 8], [17, 5], [17, 6], [17, 7], [18, 6], [21, 3], [21, 4], [21, 5], [22, 3], [22, 4], [22, 5],
  [23, 2], [23, 6], [25, 1], [25, 2], [25, 6], [25, 7], [35, 3], [35, 4], [36, 3], [36, 4],
];
