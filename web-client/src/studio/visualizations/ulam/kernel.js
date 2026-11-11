/** Sieve of Eratosthenes: isPrime[n] = 1 for primes up to limit. */
export function sieve(limit) {
  const isPrime = new Uint8Array(limit + 1).fill(1);
  isPrime[0] = 0;
  if (limit >= 1) isPrime[1] = 0;
  for (let i = 2; i * i <= limit; i++) {
    if (isPrime[i]) for (let j = i * i; j <= limit; j += i) isPrime[j] = 0;
  }
  return isPrime;
}

/** Square spiral coordinates for indexes 0..count-1, as Int32Array [x0, y0, x1, y1, …]. */
export function squareSpiral(count) {
  const out = new Int32Array(count * 2);
  let x = 0, y = 0, dx = 1, dy = 0, len = 1, run = 0, turns = 0;
  for (let i = 0; i < count; i++) {
    out[i * 2] = x;
    out[i * 2 + 1] = y;
    x += dx;
    y += dy;
    if (++run === len) {
      run = 0;
      [dx, dy] = [dy, -dx];
      if (++turns % 2 === 0) len++;
    }
  }
  return out;
}

/** Hexagonal spiral in cartesian coordinates (unit spacing), Float32Array [x, y, …]. */
export function hexSpiral(count) {
  const out = new Float32Array(count * 2);
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // axial
  let i = 0;
  const put = (q, r) => {
    if (i >= count) return;
    out[i * 2] = q + r / 2;
    out[i * 2 + 1] = (r * Math.sqrt(3)) / 2;
    i++;
  };
  put(0, 0);
  for (let ring = 1; i < count; ring++) {
    let q = dirs[4][0] * ring, r = dirs[4][1] * ring;
    for (let side = 0; side < 6; side++) {
      for (let k = 0; k < ring; k++) {
        put(q, r);
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
  }
  return out;
}

/** Sacks spiral: n at radius √n and angle 2π√n. */
export function sacksSpiral(start, count) {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = Math.sqrt(start + i);
    out[i * 2] = s * Math.cos(2 * Math.PI * s);
    out[i * 2 + 1] = -s * Math.sin(2 * Math.PI * s);
  }
  return out;
}
