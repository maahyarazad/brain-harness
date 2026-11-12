// Seeded random numbers. Modules use ctx.rng (built from config.seed), never Math.random,
// so the same seed always gives the same picture.

export const MAX_SEED = 0xffffffff;

/** mulberry32: small, fast, good enough for visuals. Returns () → [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/** Integer in [min, max], inclusive. */
export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngPick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

export function isValidSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}
