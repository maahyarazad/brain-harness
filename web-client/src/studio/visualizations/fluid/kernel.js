// Pure helpers for the fluid simulation: no DOM, no GL, no Math.random (the project's kernel rule).
// The solver itself is in shaders.js and gpu.js and is checked by reading its textures back in
// the GPU test project (specs/005-.../research.md R3: a second, CPU solver would only be a second
// thing to keep in step, and could not prove what the shaders do).

/** One simulation step is a fixed sixtieth of a second, whatever the frame rate (no wall clock). */
export const DT = 1 / 60;

export const LEVELS = ["low", "medium", "high"];

// The short side of each grid, per quality level (research R3). Set by measurement on the bench page.
const TABLE = {
  low: { sim: 64, dye: 256 },
  medium: { sim: 128, dye: 512 },
  high: { sim: 256, dye: 1024 },
};

export const OPENING_SPLATS = 5; // spec Story 1 scenario 2: at least three
export const BURST_SPLATS = 7; // spec Story 1 scenario 5: at least five
/** Splash colors are taken from this part of the palette, so none is near-black. */
export const COLOR_RANGE = [0.25, 0.95];
/** A tap with no movement makes one small splash with this small upward push (a fraction of the picture). */
export const TAP_PUSH = 0.01;
export const TAP_RADIUS = 0.6;
/** How much ink one splat adds. A stroke adds many, which build up to full color. */
export const DYE_INTENSITY = 0.15;
/**
 * The opening scene and Burst are only a handful of splashes, so each is made much stronger than the
 * single events of a drag (which add up). Without this the opening picture is nearly black.
 */
export const SPLASH_GAIN = 8;
const MAX_ASPECT = 4;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function levelValues(level) {
  return { ...(TABLE[level] ?? TABLE.medium) };
}

/** Grid sizes for a level and a picture shape: the level sets the short side, the aspect the long side. */
export function simSize(level, aspect) {
  const a = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 1 / MAX_ASPECT, MAX_ASPECT);
  const { sim, dye } = levelValues(level);
  const dims = (res) => {
    const long = Math.max(1, Math.round(res * Math.max(a, 1 / a)));
    return a >= 1 ? { w: long, h: res } : { w: res, h: long };
  };
  return { sim: dims(sim), dye: dims(dye) };
}

/**
 * Each step a field is divided by 1 + rate × dt. A rate of 0 never fades; the defaults give an
 * e-folding time of about 5 s for the motion (0.2) and about 1 s for the ink (1.0).
 */
export const dissipationDivisor = (rate, dt = DT) => 1 + rate * dt;

/** The settings, as what the passes need. Bad numbers fall back to the starting values. */
export function stepUniforms(values = {}) {
  return {
    iterations: Math.max(1, Math.round(num(values.pressureIterations, 20))),
    pressure: clamp(num(values.pressure, 0.8), 0, 1),
    curl: Math.max(0, num(values.curl, 30)),
    force: Math.max(0, num(values.splatForce, 6000)),
    radius: Math.max(0.01, num(values.splatRadius, 0.25)),
    velocityDivisor: dissipationDivisor(Math.max(0, num(values.velocityDissipation, 0.2))),
    densityDivisor: dissipationDivisor(Math.max(0, num(values.densityDissipation, 1))),
  };
}

const tOf = (u) => COLOR_RANGE[0] + (COLOR_RANGE[1] - COLOR_RANGE[0]) * u;

// Splashes go on distinct cells of a 4 x 2 grid over the picture, jittered inside each cell, so a
// handful of them never pile on top of each other and always read as separate splashes.
const GRID_COLS = 4;
const GRID_ROWS = 2;

/** `count` cells, each used once before any is used again, in an order that depends on the generator. */
function pickCells(rng, count) {
  const out = [];
  while (out.length < count) {
    const cells = [];
    for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) cells.push([c, r]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    out.push(...cells);
  }
  return out.slice(0, count);
}

function makeSplat(rng, colorAt, [col, row]) {
  // The order of these draws is fixed, so a seed always gives the same splashes.
  const x = 0.1 + (0.8 * (col + 0.3 + 0.4 * rng())) / GRID_COLS;
  const y = 0.12 + (0.76 * (row + 0.3 + 0.4 * rng())) / GRID_ROWS;
  const angle = rng() * Math.PI * 2;
  const magnitude = 0.02 + 0.05 * rng();
  const color = colorAt(tOf(rng()));
  return { x, y, dx: Math.cos(angle) * magnitude, dy: Math.sin(angle) * magnitude, color, gain: SPLASH_GAIN };
}

const splashes = (rng, count, colorAt) => pickCells(rng, count).map((cell) => makeSplat(rng, colorAt, cell));

/** The scene the fluid opens with, and returns to on Reset. `rng` is a fresh generator from the seed. */
export function initialSplats(rng, count = OPENING_SPLATS, colorAt = (t) => [t, t, t]) {
  return splashes(rng, count, colorAt);
}

/** The splashes of one press of Burst. `rng` is the running generator, so each Burst differs. */
export function burstSplats(rng, count = BURST_SPLATS, colorAt = (t) => [t, t, t]) {
  return splashes(rng, count, colorAt);
}

/** The color of the n-th stroke of a session: golden-ratio steps through the palette. */
export function strokeColor(count, colorAt) {
  return colorAt(tOf((count * 0.6180339887498949) % 1));
}

/** A palette lookup (256 RGB triples, as ctx.palette returns) as t → [r, g, b] in 0..1. */
export function lutColorAt(lut) {
  return (t) => {
    const i = Math.round(clamp(t, 0, 1) * 255);
    return [lut[i * 3] / 255, lut[i * 3 + 1] / 255, lut[i * 3 + 2] / 255];
  };
}
