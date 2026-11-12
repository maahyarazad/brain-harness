// Escape-time iteration for the Mandelbrot and Julia sets.
// Returns iteration counts per pixel for rows [rowStart, rowEnd); -1 means "never escaped".

const PERIOD_START = 20;
const PERIOD_EPS = 1e-14;

// Points in the main cardioid or the period-2 bulb are in the Mandelbrot set.
function insideKnownBulb(x, y) {
  const xq = x - 0.25;
  const y2 = y * y;
  const q = xq * xq + y2;
  if (q * (q + xq) <= 0.25 * y2) return true;
  return (x + 1) * (x + 1) + y2 <= 0.0625;
}

export function escapeBand({ x0, y0, dx, width, rowStart, rowEnd, maxIter, smooth, juliaC = null }) {
  const rows = rowEnd - rowStart;
  const counts = new Float32Array(width * rows);
  const bail = smooth ? 256 : 4;
  const LOG2 = Math.log(2);
  for (let r = 0; r < rows; r++) {
    const py = y0 - (rowStart + r) * dx;
    for (let c = 0; c < width; c++) {
      const px = x0 + c * dx;
      let zx, zy, cx, cy;
      if (juliaC) {
        zx = px; zy = py; cx = juliaC[0]; cy = juliaC[1];
      } else {
        zx = 0; zy = 0; cx = px; cy = py;
      }
      if (!juliaC && insideKnownBulb(cx, cy)) {
        counts[r * width + c] = -1;
        continue;
      }
      let i = 0;
      let x2 = zx * zx, y2 = zy * zy;
      // Periodicity check: if the orbit comes back to a saved point it is
      // cycling and will never escape.
      let sx = zx, sy = zy, nextSave = PERIOD_START;
      let cycled = false;
      while (x2 + y2 <= bail && i < maxIter) {
        zy = 2 * zx * zy + cy;
        zx = x2 - y2 + cx;
        x2 = zx * zx;
        y2 = zy * zy;
        i++;
        if (Math.abs(zx - sx) < PERIOD_EPS && Math.abs(zy - sy) < PERIOD_EPS) {
          cycled = true;
          break;
        }
        if (i === nextSave) {
          sx = zx;
          sy = zy;
          nextSave += PERIOD_START;
        }
      }
      let v = -1;
      if (!cycled && i < maxIter) {
        v = i;
        if (smooth) {
          const logZn = Math.log(x2 + y2) / 2;
          v = i + 1 - Math.log(logZn / LOG2) / LOG2;
          if (v < 0) v = 0;
        }
      }
      counts[r * width + c] = v;
    }
  }
  return { rowStart, rowEnd, counts };
}
