// The fluid simulation's shaders against a real WebGL implementation, checked by reading the
// textures back (specs/005-.../contracts/fluid-simulation.md, "Tests that cover it").
import { afterEach, describe, expect, test } from "vitest";
import fluid from "../../studio/visualizations/fluid/index.js";
import { withQuality } from "../../studio/core/quality.js";
import { defaultsOf, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";

const module = withQuality(fluid);
let live = [];

/** Opens the fluid on a real canvas. Defaults to the Low quality grids, to keep software rendering quick. */
function start({ values = {}, seed = 1, w = 256, h = 192, quality = "low", ctxOptions = {} } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const base = defaultsOf(module);
  const cfg = validateConfig(module, { ...base, seed, values: { ...base.values, quality, ...values } }).config;
  const handle = createModuleContext({ seed, dpr: 1, ...ctxOptions });
  const inst = module.create(canvas, cfg, handle.ctx);
  live.push({ inst, handle });
  return {
    inst,
    ctx: handle.ctx,
    cfg,
    canvas,
    handle,
    state: () => inst.__debug.readState(),
    step(n = 1) {
      for (let i = 0; i < n; i++) inst.step();
    },
    pointer: (type, id, x, y) => inst.pointer({ type, pointerId: id, x, y, button: 0 }),
  };
}

afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

// ---- reading the textures ----
const px = (grid, u, v) => ({ x: Math.min(grid.w - 1, Math.max(0, Math.floor(u * grid.w))), y: Math.min(grid.h - 1, Math.max(0, Math.floor(v * grid.h))) });
/** The largest value of one channel in a small window around (u, v); v counts up from the bottom, as the texture does. */
function windowMax(data, grid, u, v, channel = 0, radius = 2) {
  const c = px(grid, u, v);
  let best = -Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
      best = Math.max(best, data[(y * grid.w + x) * 4 + channel]);
    }
  }
  return best;
}
/** The most ink of any color near (u, v): a dark palette color has little red, so look at all three channels. */
const inkNear = (data, grid, u, v, radius = 2) => Math.max(...[0, 1, 2].map((c) => windowMax(data, grid, u, v, c, radius)));
const at = (data, grid, u, v) => {
  const c = px(grid, u, v);
  const i = (c.y * grid.w + c.x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const maxAbs = (arr, channels = [0, 1, 2]) => {
  let m = 0;
  for (let i = 0; i < arr.length; i += 4) for (const c of channels) m = Math.max(m, Math.abs(arr[i + c]));
  return m;
};
const total = (arr, channels = [0, 1, 2]) => {
  let s = 0;
  for (let i = 0; i < arr.length; i += 4) for (const c of channels) s += arr[i + c];
  return s;
};
/** Connected regions of cells whose brightest channel is over the threshold. */
// A threshold of 0.02 counts any ink at all; CLEAR is where the display shows it plainly.
const CLEAR = 0.3;
function blobs(dye, grid, threshold = 0.02) {
  const seen = new Uint8Array(grid.w * grid.h);
  const lit = (i) => Math.max(dye[i * 4], dye[i * 4 + 1], dye[i * 4 + 2]) > threshold;
  let count = 0;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !lit(start)) continue;
    count++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % grid.w;
      const y = (i / grid.w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const j = ny * grid.w + nx;
        if (!seen[j] && lit(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return count;
}
/** Mean size of the divergence of the velocity field, over interior cells. */
function divergence(velocity, grid) {
  let sum = 0;
  let n = 0;
  for (let y = 1; y < grid.h - 1; y++) {
    for (let x = 1; x < grid.w - 1; x++) {
      const i = y * grid.w + x;
      const d = 0.5 * (velocity[(i + 1) * 4] - velocity[(i - 1) * 4] + velocity[(i + grid.w) * 4 + 1] - velocity[(i - grid.w) * 4 + 1]);
      sum += Math.abs(d);
      n++;
    }
  }
  return sum / n;
}
const centroidX = (dye, grid) => {
  let sx = 0;
  let sw = 0;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const w = dye[(y * grid.w + x) * 4] + dye[(y * grid.w + x) * 4 + 1] + dye[(y * grid.w + x) * 4 + 2];
      sx += w * x;
      sw += w;
    }
  }
  return sw > 0 ? sx / sw / grid.w : NaN;
};

describe("opening", () => {
  test("takes the GPU path and shows a scene right away", () => {
    const f = start();
    expect(f.inst.path).toBe("gpu");
    expect(f.inst.unsupported).toBeFalsy();
    f.inst.render();
    const s = f.state();
    expect(total(s.dye)).toBeGreaterThan(0.5);
    expect(blobs(s.dye, s.dyeSize, CLEAR)).toBeGreaterThanOrEqual(3); // at least three splashes (Story 1 scenario 2)
  });
});

describe("splats", () => {
  test("a drag puts dye and velocity where the pointer went, and nowhere far from it", () => {
    const f = start();
    f.inst.action("clear");
    f.pointer("down", 1, 128, 96);
    f.pointer("move", 1, 150, 96); // to the right, by 22 of 256 pixels
    const s = f.state();
    expect(inkNear(s.dye, s.dyeSize, 150 / 256, 0.5)).toBeGreaterThan(0.05);
    expect(inkNear(s.dye, s.dyeSize, 0.05, 0.05)).toBeLessThan(1e-3);
    const v = at(s.velocity, s.simSize, 150 / 256, 0.5);
    expect(v[0]).toBeGreaterThan(50); // pushed to the right
    expect(Math.abs(v[1])).toBeLessThan(Math.abs(v[0]) * 0.2);
    expect(Math.abs(at(s.velocity, s.simSize, 0.05, 0.05)[0])).toBeLessThan(1e-3);
  });

  test("a faster drag pushes harder", () => {
    const slow = start();
    slow.inst.action("clear");
    slow.pointer("down", 1, 100, 96);
    slow.pointer("move", 1, 106, 96);
    const fast = start();
    fast.inst.action("clear");
    fast.pointer("down", 1, 100, 96);
    fast.pointer("move", 1, 130, 96);
    const a = maxAbs(slow.state().velocity, [0]);
    const b = maxAbs(fast.state().velocity, [0]);
    expect(b).toBeGreaterThan(a * 3);
  });

  test("a tap with no movement makes one small splash and does not use ctx.rng", () => {
    const f = start();
    f.inst.action("clear");
    let draws = 0;
    const real = f.ctx.rng;
    f.ctx.rng = () => (draws++, real());
    f.pointer("down", 1, 60, 60);
    f.pointer("up", 1, 60, 60);
    const s = f.state();
    expect(blobs(s.dye, s.dyeSize)).toBe(1);
    expect(inkNear(s.dye, s.dyeSize, 60 / 256, 1 - 60 / 192)).toBeGreaterThan(0.05);
    expect(draws).toBe(0);
  });

  test("a stroke that leaves the picture is cut at the edge and ends cleanly", () => {
    const f = start();
    f.inst.action("clear");
    f.pointer("down", 1, 250, 96);
    f.pointer("move", 1, 400, 96); // far outside
    f.pointer("move", 1, 600, 96);
    f.pointer("up", 1, 600, 96);
    const s = f.state();
    expect(total(s.dye)).toBe(0); // nothing was inside the picture to splash
    f.pointer("move", 1, 100, 100); // no stroke any more: a hover makes nothing
    expect(total(f.state().dye)).toBe(0);
  });

  test("two fingers stroke independently, each with its own color", () => {
    const f = start();
    f.inst.action("clear");
    f.pointer("down", 1, 40, 96);
    f.pointer("down", 2, 216, 96);
    f.pointer("move", 1, 60, 96);
    f.pointer("move", 2, 196, 96);
    f.pointer("up", 1, 60, 96);
    f.pointer("up", 2, 196, 96);
    const s = f.state();
    expect(blobs(s.dye, s.dyeSize)).toBe(2);
    const a = at(s.dye, s.dyeSize, 60 / 256, 0.5);
    const b = at(s.dye, s.dyeSize, 196 / 256, 0.5);
    expect(a[0] + a[1] + a[2]).toBeGreaterThan(0.05);
    expect(b[0] + b[1] + b[2]).toBeGreaterThan(0.05);
    expect(a.slice(0, 3)).not.toEqual(b.slice(0, 3));
    // Finger 1's movement made no ink at finger 2's place, so the middle is still empty.
    expect(inkNear(s.dye, s.dyeSize, 0.5, 0.5)).toBeLessThan(1e-3);
  });
});

describe("the flow", () => {
  test("dye is carried along by the motion", () => {
    const f = start({ values: { velocityDissipation: 0, densityDissipation: 0, curl: 0 } });
    f.inst.action("clear");
    f.pointer("down", 1, 60, 96);
    f.pointer("move", 1, 90, 96);
    f.pointer("up", 1, 90, 96);
    const before = centroidX(f.state().dye, f.state().dyeSize);
    f.step(30);
    const after = centroidX(f.state().dye, f.state().dyeSize);
    expect(after).toBeGreaterThan(before + 0.01);
  });

  test("the pressure solve keeps the flow from piling up: more iterations leave less divergence", () => {
    const residual = (iterations) => {
      const f = start({ values: { pressureIterations: iterations, curl: 0, velocityDissipation: 0 } });
      f.inst.action("clear");
      f.pointer("down", 1, 100, 96);
      for (let i = 1; i <= 6; i++) f.pointer("move", 1, 100 + i * 8, 96 + (i % 2) * 6);
      f.step(4);
      const s = f.state();
      return divergence(s.velocity, s.simSize);
    };
    const r4 = residual(4);
    const r20 = residual(20);
    const r60 = residual(60);
    expect(r20).toBeLessThan(r4);
    expect(r60).toBeLessThan(r20);
  });

  test("with no motion and no ink, nothing appears (no phantom energy)", () => {
    const f = start();
    f.inst.action("clear");
    f.step(20);
    const s = f.state();
    expect(maxAbs(s.velocity, [0, 1])).toBe(0);
    expect(maxAbs(s.dye)).toBe(0);
  });
});

describe("Burst, Clear and Reset", () => {
  test("Burst adds at least five separate splashes at once", () => {
    const f = start({ seed: 3 });
    f.inst.action("clear");
    f.inst.action("burst");
    const s = f.state();
    expect(blobs(s.dye, s.dyeSize, CLEAR)).toBeGreaterThanOrEqual(5);
  });

  test("Clear leaves velocity, dye and pressure all zero, and keeps the settings", () => {
    const f = start({ values: { curl: 17 } });
    f.pointer("down", 1, 100, 96);
    f.pointer("move", 1, 140, 96);
    f.step(5);
    f.inst.action("clear");
    const s = f.state();
    expect(maxAbs(s.velocity, [0, 1, 2, 3])).toBe(0);
    expect(maxAbs(s.dye, [0, 1, 2, 3])).toBe(0);
    expect(maxAbs(s.pressure, [0, 1, 2, 3])).toBe(0);
    expect(f.cfg.values.curl).toBe(17);
  });

  test("the key B bursts and C clears, in either case, and other keys are left to the shell", () => {
    const f = start({ seed: 3 });
    f.inst.action("clear");
    expect(f.inst.pointer({ type: "key", key: "B" })).toBe(true);
    expect(blobs(f.state().dye, f.state().dyeSize, CLEAR)).toBeGreaterThanOrEqual(5);
    expect(f.inst.pointer({ type: "key", key: "c" })).toBe(true);
    expect(maxAbs(f.state().dye)).toBe(0);
    for (const key of [" ", ".", "r", "R", "x", "ArrowLeft"]) expect(f.inst.pointer({ type: "key", key })).not.toBe(true);
  });

  test("Reset gives exactly the scene a fresh start gives for the same seed (same device)", () => {
    const fresh = start({ seed: 9 });
    fresh.step(10);
    const a = fresh.state();

    const used = start({ seed: 9 });
    used.pointer("down", 1, 30, 30);
    used.pointer("move", 1, 200, 150);
    used.inst.action("burst");
    used.step(7);
    used.inst.reset();
    used.step(10);
    const b = used.state();

    expect(b.dye.length).toBe(a.dye.length);
    let worst = 0;
    for (let i = 0; i < a.dye.length; i++) worst = Math.max(worst, Math.abs(a.dye[i] - b.dye[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  test("the same seed always opens with the same scene, a different seed with another", () => {
    const a = start({ seed: 4 });
    const b = start({ seed: 4 });
    const c = start({ seed: 5 });
    const da = a.state().dye;
    const db = b.state().dye;
    const dc = c.state().dye;
    let same = 0;
    let other = 0;
    for (let i = 0; i < da.length; i++) {
      same = Math.max(same, Math.abs(da[i] - db[i]));
      other = Math.max(other, Math.abs(da[i] - dc[i]));
    }
    expect(same).toBeLessThan(1e-6);
    expect(other).toBeGreaterThan(0.01);
  });
});

// ================= User Story 2: the settings =================

const LIMITS = { velocity: 1000, dye: 2 };
const kinetic = (v) => {
  let e = 0;
  for (let i = 0; i < v.length; i += 4) e += v[i] * v[i] + v[i + 1] * v[i + 1];
  return e;
};
/** Squared spin of the flow: large where there are many small swirls. */
function enstrophy(velocity, grid) {
  let e = 0;
  for (let y = 1; y < grid.h - 1; y++) {
    for (let x = 1; x < grid.w - 1; x++) {
      const i = y * grid.w + x;
      const w = 0.5 * (velocity[(i + 1) * 4 + 1] - velocity[(i - 1) * 4 + 1] - velocity[(i + grid.w) * 4] + velocity[(i - grid.w) * 4]);
      e += w * w;
    }
  }
  return e;
}
const finite = (arr) => {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
};
const strokeAcross = (f, id = 1, y = 96) => {
  f.pointer("down", id, 40, y);
  for (let i = 1; i <= 8; i++) f.pointer("move", id, 40 + i * 20, y + (i % 2) * 8);
  f.pointer("up", id, 200, y);
};

describe("dissipation: motion dies down and ink fades (SC-005)", () => {
  /** Steps until `measure` has fallen below a tenth of its value just after a stroke, up to `cap`. */
  function lifetime(setting, value, measure, cap = 480) {
    const f = start({ values: { [setting]: value, curl: 0, ...(setting === "velocityDissipation" ? { densityDissipation: 1 } : { velocityDissipation: 0.2 }) } });
    f.inst.action("clear");
    strokeAcross(f);
    const first = measure(f.state());
    for (let n = 4; n <= cap; n += 4) {
      f.step(4);
      if (measure(f.state()) < first * 0.1) return n;
    }
    return cap;
  }

  test("the motion of one stroke lasts at least 3 times longer at the lowest velocity dissipation than at the highest", () => {
    const lowest = lifetime("velocityDissipation", 0, (s) => kinetic(s.velocity));
    const highest = lifetime("velocityDissipation", 4, (s) => kinetic(s.velocity));
    expect(highest).toBeLessThan(120);
    expect(lowest).toBeGreaterThanOrEqual(3 * highest);
  });

  test("the ink of one stroke lasts at least 3 times longer at the lowest density dissipation than at the highest", () => {
    const total3 = (s) => total(s.dye);
    const knob = fluid.knobs.find((k) => k.key === "densityDissipation");
    const lowest = lifetime("densityDissipation", knob.min, total3);
    const highest = lifetime("densityDissipation", 4, total3);
    expect(highest).toBeLessThan(120);
    expect(lowest).toBeGreaterThanOrEqual(3 * highest);
  });
});

describe("curl and pressure iterations", () => {
  test("a higher Curl keeps more small-scale spin alive", () => {
    const spin = (curl) => {
      const f = start({ values: { curl, velocityDissipation: 0.2 } });
      f.inst.action("clear");
      strokeAcross(f, 1, 70);
      strokeAcross(f, 2, 120);
      f.step(40);
      const s = f.state();
      return enstrophy(s.velocity, s.simSize);
    };
    expect(spin(50)).toBeGreaterThan(spin(0) * 1.05);
  });
});

describe("changing a setting while running keeps what is on screen (FR-010)", () => {
  test("update() applies the new value on the next step and clears nothing", () => {
    const f = start();
    strokeAcross(f);
    f.step(10);
    const before = f.state();
    f.inst.update({ ...f.cfg, values: { ...f.cfg.values, curl: 10, velocityDissipation: 2, splatForce: 3000, palette: "viridis" } }, ["curl", "velocityDissipation", "splatForce", "palette"]);
    const after = f.state();
    expect(total(after.dye)).toBeCloseTo(total(before.dye), 3);
    expect(kinetic(after.velocity)).toBeCloseTo(kinetic(before.velocity), 1);
    f.step(5);
    expect(total(f.state().dye)).toBeGreaterThan(0); // and it carries on
  });

  test("a new palette colors the next stroke, not the ink already there", () => {
    const f = start({ values: { palette: "magma" } });
    f.inst.action("clear");
    f.inst.update({ ...f.cfg, values: { ...f.cfg.values, palette: "grayscale" } }, ["palette"]);
    f.pointer("down", 1, 100, 96);
    f.pointer("move", 1, 120, 96);
    const c = at(f.state().dye, f.state().dyeSize, 120 / 256, 0.5);
    // Grayscale: the three channels are equal.
    expect(Math.abs(c[0] - c[1])).toBeLessThan(0.002);
    expect(Math.abs(c[1] - c[2])).toBeLessThan(0.002);
  });
});

describe("stability at the extremes of every setting (SC-006, FR-011)", () => {
  const numeric = fluid.knobs.filter((k) => k.type === "range");
  const startValues = Object.fromEntries(numeric.map((k) => [k.key, k.default]));
  const allMin = Object.fromEntries(numeric.map((k) => [k.key, k.min]));
  const allMax = Object.fromEntries(numeric.map((k) => [k.key, k.max]));

  /** Runs with strokes and Bursts now and then, and checks the fields stay finite and bounded. */
  function run(values, steps) {
    const f = start({ values });
    for (let n = 0; n < steps; n++) {
      if (n % 90 === 0) strokeAcross(f, 1, 60 + ((n / 90) % 4) * 20);
      if (n % 400 === 200) f.inst.action("burst");
      f.step(1);
      if (n % 100 === 99 || n === steps - 1) {
        const s = f.state();
        expect(finite(s.velocity), `velocity finite at step ${n}`).toBe(true);
        expect(finite(s.dye), `dye finite at step ${n}`).toBe(true);
        expect(finite(s.pressure), `pressure finite at step ${n}`).toBe(true);
        expect(maxAbs(s.velocity, [0, 1]), `velocity bounded at step ${n}`).toBeLessThanOrEqual(LIMITS.velocity * 1.001);
        expect(maxAbs(s.dye), `dye bounded at step ${n}`).toBeLessThanOrEqual(LIMITS.dye * 1.001);
      }
    }
    return f;
  }

  test("every setting at its minimum, for a minute of running", () => {
    const f = run(allMin, 3600);
    strokeAcross(f);
    expect(total(f.state().dye)).toBeGreaterThan(0); // not blank
  }, 240000);

  test("every setting at its maximum, for a minute of running", () => {
    const f = run(allMax, 3600);
    strokeAcross(f);
    expect(total(f.state().dye)).toBeGreaterThan(0);
  }, 240000);

  test.each(numeric.flatMap((k) => [[k.key, "minimum", k.min], [k.key, "maximum", k.max]]))("%s at its %s, the others at their starting values", (key, _which, value) => {
    const f = run({ ...startValues, [key]: value }, 600);
    strokeAcross(f);
    expect(total(f.state().dye)).toBeGreaterThan(0);
  }, 120000);

  test("the slowest fading stays readable: heavy stirring does not end as a solid wash of one color", () => {
    const min = fluid.knobs.find((k) => k.key === "densityDissipation").min;
    const f = run({ ...startValues, velocityDissipation: 0, densityDissipation: min }, 1500);
    const s = f.state();
    // How the picture would look: brightness per texel. A solid wash is bright and flat.
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < s.dye.length; i += 4) {
      const lum = 1 - Math.exp(-2 * Math.max(s.dye[i], s.dye[i + 1], s.dye[i + 2]));
      n++;
      sum += lum;
      sum2 += lum * lum;
    }
    const mean = sum / n;
    const contrast = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    expect(mean).toBeLessThan(0.7);
    expect(contrast).toBeGreaterThan(0.04);
  }, 240000);
});
