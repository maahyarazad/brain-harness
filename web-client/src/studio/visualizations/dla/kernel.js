// Diffusion-limited aggregation on a fixed grid. Deterministic for a given seed.
import { createRng } from "../../core/rng.js";

export const DLA_W = 480;
export const DLA_H = 360;

/**
 * Returns { order: Uint32Array (0 = empty, else arrival number), stuck, budgetExhausted }.
 * seedShape: "point" | "line" | "circle"
 */
export function dlaGrow({ w = DLA_W, h = DLA_H, particles, stickiness, seedShape, seed, stepBudget }, report = () => {}) {
  const rng = createRng(seed);
  const order = new Uint32Array(w * h);
  let count = 0;
  const stick = (x, y) => {
    order[y * w + x] = ++count;
  };
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  let radius = 2;
  let top = h - 1;
  const ringR = Math.floor(Math.min(w, h) * 0.45);

  if (seedShape === "line") {
    for (let x = 0; x < w; x++) stick(x, h - 1);
  } else if (seedShape === "circle") {
    for (let a = 0; a < 2 * Math.PI; a += 0.5 / ringR) {
      const x = Math.round(cx + ringR * Math.cos(a)), y = Math.round(cy + ringR * Math.sin(a));
      if (!order[y * w + x]) stick(x, y);
    }
  } else {
    stick(cx, cy);
  }
  const seedCount = count;
  const budget = stepBudget ?? particles * 40000;
  let steps = 0;

  const occupied = (x, y) => x >= 0 && y >= 0 && x < w && y < h && order[y * w + x] > 0;
  const touching = (x, y) => occupied(x + 1, y) || occupied(x - 1, y) || occupied(x, y + 1) || occupied(x, y - 1);

  function launch() {
    if (seedShape === "line") return [Math.floor(rng() * w), Math.max(0, top - 6)];
    if (seedShape === "circle") {
      const a = rng() * 2 * Math.PI, r = rng() * 6;
      return [Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))];
    }
    const a = rng() * 2 * Math.PI;
    const r = radius + 5;
    return [Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))];
  }

  const target = seedCount + particles;
  let lastReport = 0;
  while (count < target && steps < budget) {
    let [x, y] = launch();
    if (occupied(x, y)) {
      steps++;
      continue;
    }
    for (;;) {
      if (++steps > budget) break;
      const r = rng();
      if (r < 0.25) x++;
      else if (r < 0.5) x--;
      else if (r < 0.75) y++;
      else y--;
      if (seedShape === "line") {
        x = (x + w) % w;
        if (y < top - 30 || y < 0) break; // wandered off: relaunch
        if (y >= h) y = h - 1;
      } else if (seedShape === "circle") {
        if (x < 0 || y < 0 || x >= w || y >= h) break;
      } else {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > (radius * 2 + 20) ** 2 || x < 0 || y < 0 || x >= w || y >= h) break;
      }
      if (occupied(x, y)) break;
      if (touching(x, y) && rng() < stickiness) {
        stick(x, y);
        if (seedShape === "point") radius = Math.max(radius, Math.ceil(Math.hypot(x - cx, y - cy)));
        if (seedShape === "line") top = Math.min(top, y);
        break;
      }
    }
    if (seedShape === "point" && radius * 2 + 20 > Math.min(w, h)) {
      if (radius + 6 >= Math.min(cx, cy)) break; // cluster reached the edge
    }
    if (count - lastReport >= 200) {
      lastReport = count;
      report((count - seedCount) / particles);
    }
  }
  return { order, stuck: count - seedCount, seedCount, budgetExhausted: count < target && steps >= budget, w, h };
}
