/** "RLLR" → array of +1 (right) / -1 (left), or null when invalid. */
export function parseTurnRule(text) {
  if (!/^[LR]{2,12}$/.test(String(text))) return null;
  return [...text].map((c) => (c === "R" ? 1 : -1));
}

// Directions: 0 up, 1 right, 2 down, 3 left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Advances every ant one step on a wrapping grid. ants: [{ x, y, dir }]. */
export function antStep(grid, w, h, ants, turns) {
  const n = turns.length;
  for (const ant of ants) {
    const i = ant.y * w + ant.x;
    const s = grid[i];
    ant.dir = (ant.dir + turns[s] + 4) % 4;
    grid[i] = (s + 1) % n;
    ant.x = (ant.x + DX[ant.dir] + w) % w;
    ant.y = (ant.y + DY[ant.dir] + h) % h;
  }
}
