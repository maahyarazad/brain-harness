/** Collatz path from n down to 1, e.g. 6 → [6, 3, 10, 5, 16, 8, 4, 2, 1]. */
export function collatzPath(n) {
  const path = [n];
  while (n !== 1) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1;
    path.push(n);
  }
  return path;
}

/** Paths for 1..count, each reversed so it starts at 1. */
export function coralPaths(count) {
  const out = [];
  for (let n = 1; n <= count; n++) out.push(collatzPath(n).reverse());
  return out;
}
