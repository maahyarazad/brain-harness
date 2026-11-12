// Drawing helpers shared by visualization modules.

export function clear(g, color) {
  const { width, height } = g.canvas;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (color) {
    g.fillStyle = color;
    g.fillRect(0, 0, width, height);
  } else {
    g.clearRect(0, 0, width, height);
  }
}

/** Background color that matches the page theme. */
export function background() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "#0f0f12";
  return "#0f0f12";
}

/** Log tone-mapped accumulation buffer → ImageData. counts is a Uint32Array of w*h. */
export function plotAccumulator(g, counts, w, h, lut, { gamma = 0.6, bg = [15, 15, 18] } = {}) {
  let max = 1;
  for (let i = 0; i < counts.length; i++) if (counts[i] > max) max = counts[i];
  const logMax = Math.log1p(max);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i];
    const p = i * 4;
    if (c === 0) {
      d[p] = bg[0];
      d[p + 1] = bg[1];
      d[p + 2] = bg[2];
    } else {
      const t = Math.pow(Math.log1p(c) / logMax, gamma);
      const k = Math.round(64 + t * 191) * 3;
      d[p] = lut[k];
      d[p + 1] = lut[k + 1];
      d[p + 2] = lut[k + 2];
    }
    d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function polyline(g, points) {
  if (!points.length) return;
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.stroke();
}

/** Bounding box of [x, y] points. */
export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Transform that fits a box into w×h with a margin. Returns (x, y) → [px, py]. */
export function fitTransform(box, w, h, margin = 0.05) {
  const bw = Math.max(box.maxX - box.minX, 1e-9);
  const bh = Math.max(box.maxY - box.minY, 1e-9);
  const s = Math.min((w * (1 - 2 * margin)) / bw, (h * (1 - 2 * margin)) / bh);
  const ox = (w - bw * s) / 2 - box.minX * s;
  const oy = (h - bh * s) / 2 - box.minY * s;
  return { scale: s, map: (x, y) => [ox + x * s, oy + y * s] };
}

/** Turtle graphics state for Collatz and L-systems. Angles in radians. */
export function createTurtle(x = 0, y = 0, heading = -Math.PI / 2) {
  const stack = [];
  const t = {
    x,
    y,
    heading,
    forward(len) {
      t.x += Math.cos(t.heading) * len;
      t.y += Math.sin(t.heading) * len;
    },
    turn(rad) {
      t.heading += rad;
    },
    push() {
      stack.push([t.x, t.y, t.heading]);
    },
    pop() {
      const s = stack.pop();
      if (s) [t.x, t.y, t.heading] = s;
    },
  };
  return t;
}

export const DEG = Math.PI / 180;
