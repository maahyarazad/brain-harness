import { escapeBand } from "../../../studio/visualizations/mandelbrot/kernel.js";
const one = (x, y, extra = {}) =>
  escapeBand({ x0: x, y0: y, dx: 1, width: 1, rowStart: 0, rowEnd: 1, maxIter: 200, smooth: false, ...extra }).counts[0];
test("c = 0 never escapes", () => expect(one(0, 0)).toBe(-1));
test("c = 1 escapes quickly", () => {
  const v = one(1, 0);
  expect(v).toBeGreaterThanOrEqual(0);
  expect(v).toBeLessThan(5);
});
test("Julia mode uses the fixed c", () => expect(one(0, 0, { juliaC: [0, 0] })).toBe(-1));
test("same inputs give the same output", () => {
  const args = { x0: -2, y0: 1, dx: 0.05, width: 60, rowStart: 0, rowEnd: 40, maxIter: 100, smooth: true };
  expect([...escapeBand(args).counts]).toEqual([...escapeBand(args).counts]);
});

// The speedups (cardioid/bulb shortcut, periodicity check) must not change the picture.
function reference({ x0, y0, dx, width, rowStart, rowEnd, maxIter, smooth, juliaC = null }) {
  const out = [];
  const bail = smooth ? 256 : 4;
  const LOG2 = Math.log(2);
  for (let row = rowStart; row < rowEnd; row++) {
    const py = y0 - row * dx;
    for (let col = 0; col < width; col++) {
      const px = x0 + col * dx;
      let zx = juliaC ? px : 0, zy = juliaC ? py : 0;
      const cx = juliaC ? juliaC[0] : px, cy = juliaC ? juliaC[1] : py;
      let i = 0, x2 = zx * zx, y2 = zy * zy;
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
          v = i + 1 - Math.log(Math.log(x2 + y2) / 2 / LOG2) / LOG2;
          if (v < 0) v = 0;
        }
      }
      out.push(v);
    }
  }
  return out;
}

function frame(cx, cy, zoom, juliaC = null) {
  const W = 64, H = 48;
  const dx = 3 / zoom / H;
  return { x0: cx - (W / 2) * dx, y0: cy + (H / 2) * dx, dx, width: W, rowStart: 0, rowEnd: H, maxIter: 300, smooth: true, juliaC };
}

test.each([
  ["Mandelbrot default view", frame(-0.6, 0, 1)],
  ["Mandelbrot seahorse valley 50×", frame(-0.745, 0.11, 50)],
  ["Julia default", frame(0, 0, 1, [-0.8, 0.156])],
])("speedups give the same counts as the plain loop: %s", (_name, args) => {
  const fast = [...escapeBand(args).counts];
  const ref = reference(args);
  expect(fast).toHaveLength(ref.length);
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] === -1) expect(fast[i]).toBe(-1);
    else expect(Math.abs(fast[i] - Math.fround(ref[i]))).toBeLessThan(1e-9);
  }
});
