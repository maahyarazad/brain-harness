// Escape-time iteration for the Mandelbrot and Julia sets.
// Returns iteration counts per pixel for rows [rowStart, rowEnd); -1 means "never escaped".

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
      let i = 0;
      let x2 = zx * zx, y2 = zy * zy;
      while (x2 + y2 <= bail && i < maxIter) {
        zy = 2 * zx * zy + cy;
        zx = x2 - y2 + cx;
        x2 = zx * zx;
        y2 = zy * zy;
        i++;
      }
      let v = -1;
      if (i < maxIter) {
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
