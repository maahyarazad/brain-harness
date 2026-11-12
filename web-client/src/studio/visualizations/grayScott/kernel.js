// Gray–Scott reaction–diffusion on a wrapping grid (9-point Laplacian, Euler steps).

export function seedFields(w, h, rng) {
  const u = new Float32Array(w * h).fill(1);
  const v = new Float32Array(w * h);
  const squares = 10 + Math.floor(rng() * 8);
  for (let s = 0; s < squares; s++) {
    const cx = Math.floor(rng() * w), cy = Math.floor(rng() * h);
    const r = 3 + Math.floor(rng() * 5);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const i = ((cy + y + h) % h) * w + ((cx + x + w) % w);
        u[i] = 0.5;
        v[i] = 0.25;
      }
    }
  }
  return { u, v };
}

export function grayScottSteps({ u, v, w, h, feed, kill, du, dv, steps }) {
  let u2 = new Float32Array(w * h);
  let v2 = new Float32Array(w * h);
  let a = u, b = v;
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const i = y0 + x;
        const lu =
          0.2 * (a[ym + x] + a[yp + x] + a[y0 + xm] + a[y0 + xp]) +
          0.05 * (a[ym + xm] + a[ym + xp] + a[yp + xm] + a[yp + xp]) - a[i];
        const lv =
          0.2 * (b[ym + x] + b[yp + x] + b[y0 + xm] + b[y0 + xp]) +
          0.05 * (b[ym + xm] + b[ym + xp] + b[yp + xm] + b[yp + xp]) - b[i];
        const uvv = a[i] * b[i] * b[i];
        let nu = a[i] + du * lu - uvv + feed * (1 - a[i]);
        let nv = b[i] + dv * lv + uvv - (kill + feed) * b[i];
        u2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        v2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    [a, u2] = [u2, a];
    [b, v2] = [v2, b];
  }
  return { u: a, v: b };
}
