import {
  LEVELS, OPENING_SPLATS, BURST_SPLATS, COLOR_RANGE, DT, SPLASH_GAIN, DYE_INTENSITY,
  levelValues, simSize, dissipationDivisor, stepUniforms, initialSplats, burstSplats, strokeColor, lutColorAt,
} from "../../../studio/visualizations/fluid/kernel.js";
import { createRng } from "../../../studio/core/rng.js";

// A palette whose color at t is [t, 1 - t, 0.5], so the sampled t can be read back from the color.
const colorAt = (t) => [t, 1 - t, 0.5];

describe("quality levels and grid sizes", () => {
  test("the three levels match the plan (research R3)", () => {
    expect(levelValues("low")).toEqual({ sim: 64, dye: 256 });
    expect(levelValues("medium")).toEqual({ sim: 128, dye: 512 });
    expect(levelValues("high")).toEqual({ sim: 256, dye: 1024 });
    expect(LEVELS).toEqual(["low", "medium", "high"]);
  });

  test("an unknown level falls back to medium", () => {
    expect(levelValues("ultra")).toEqual(levelValues("medium"));
    expect(levelValues(undefined)).toEqual(levelValues("medium"));
  });

  test("the short side of the grid gets the level's size and the long side follows the aspect", () => {
    expect(simSize("medium", 4 / 3)).toEqual({ sim: { w: 171, h: 128 }, dye: { w: 683, h: 512 } });
    expect(simSize("medium", 3 / 4)).toEqual({ sim: { w: 128, h: 171 }, dye: { w: 512, h: 683 } });
    expect(simSize("low", 1)).toEqual({ sim: { w: 64, h: 64 }, dye: { w: 256, h: 256 } });
  });

  test("a silly aspect is clamped, never producing a zero or huge grid", () => {
    for (const a of [0, -1, NaN, Infinity, 1e-9, 1e9]) {
      const s = simSize("high", a);
      for (const side of [s.sim.w, s.sim.h, s.dye.w, s.dye.h]) {
        expect(Number.isInteger(side)).toBe(true);
        expect(side).toBeGreaterThanOrEqual(1);
        expect(side).toBeLessThanOrEqual(4096);
      }
    }
  });
});

describe("dissipation and per-step values", () => {
  test("the field is divided by 1 + rate × dt each step", () => {
    expect(dissipationDivisor(0, DT)).toBe(1);
    expect(dissipationDivisor(1, DT)).toBeCloseTo(1 + 1 / 60, 10);
    expect(dissipationDivisor(4, 1 / 30)).toBeCloseTo(1 + 4 / 30, 10);
  });

  test("a zero rate never fades and a high rate fades quickly (the idea behind SC-005)", () => {
    const after = (rate, seconds) => Math.pow(1 / dissipationDivisor(rate, DT), seconds * 60);
    expect(after(0, 10)).toBe(1);
    expect(after(0.2, 5)).toBeCloseTo(Math.exp(-1), 1); // velocity default: e-folding time of about 5 s
    expect(after(1, 1)).toBeCloseTo(Math.exp(-1), 1); // density default: about 1 s
    expect(after(0, 3) / after(4, 3)).toBeGreaterThan(1e3);
  });

  test("stepUniforms turns the settings into what the passes need", () => {
    const u = stepUniforms({
      pressureIterations: 20, pressure: 0.8, curl: 30, splatRadius: 0.25, splatForce: 6000,
      velocityDissipation: 0.2, densityDissipation: 1,
    });
    expect(u).toMatchObject({ iterations: 20, pressure: 0.8, curl: 30, force: 6000 });
    expect(u.velocityDivisor).toBeCloseTo(1 + 0.2 / 60, 10);
    expect(u.densityDivisor).toBeCloseTo(1 + 1 / 60, 10);
  });

  test("stepUniforms rounds the iteration count and survives bad numbers", () => {
    expect(stepUniforms({ pressureIterations: 12.7 }).iterations).toBe(13);
    const u = stepUniforms({ pressureIterations: NaN, pressure: undefined, curl: "x", splatForce: null });
    for (const v of Object.values(u)) expect(Number.isFinite(v)).toBe(true);
    expect(u.iterations).toBeGreaterThanOrEqual(1);
  });
});

describe("the opening scene and Burst", () => {
  test("the same seed gives the same opening, a different seed a different one", () => {
    const a = initialSplats(createRng(7), OPENING_SPLATS, colorAt);
    const b = initialSplats(createRng(7), OPENING_SPLATS, colorAt);
    const c = initialSplats(createRng(8), OPENING_SPLATS, colorAt);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test("it has at least three splats (spec Story 1 scenario 2) at places inside the picture, moving", () => {
    expect(OPENING_SPLATS).toBeGreaterThanOrEqual(3);
    const s = initialSplats(createRng(1), OPENING_SPLATS, colorAt);
    expect(s).toHaveLength(OPENING_SPLATS);
    for (const p of s) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
      expect(Math.hypot(p.dx, p.dy)).toBeGreaterThan(0);
      expect(p.color).toHaveLength(3);
    }
  });

  test("Burst makes at least five splats at different places", () => {
    expect(BURST_SPLATS).toBeGreaterThanOrEqual(5);
    const s = burstSplats(createRng(3), BURST_SPLATS, colorAt);
    expect(s).toHaveLength(BURST_SPLATS);
    const places = new Set(s.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(places.size).toBe(BURST_SPLATS);
  });

  test("Burst continues the generator it is given: two bursts in a row differ, and repeat for the same seed", () => {
    const run = () => {
      const rng = createRng(5);
      return [burstSplats(rng, 7, colorAt), burstSplats(rng, 7, colorAt)];
    };
    const [first, second] = run();
    expect(first).not.toEqual(second);
    expect(run()).toEqual([first, second]);
  });

  test("colors are sampled between 0.25 and 0.95 of the palette, so none is near-black", () => {
    const seen = [];
    initialSplats(createRng(1), 40, (t) => (seen.push(t), colorAt(t)));
    burstSplats(createRng(2), 40, (t) => (seen.push(t), colorAt(t)));
    expect(seen.length).toBe(80);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(COLOR_RANGE[0]);
    expect(Math.max(...seen)).toBeLessThanOrEqual(COLOR_RANGE[1]);
    expect(COLOR_RANGE).toEqual([0.25, 0.95]);
  });

  test("splashes are spread out: none sits on top of another, for any seed", () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const list of [initialSplats(createRng(seed), OPENING_SPLATS, colorAt), burstSplats(createRng(seed), BURST_SPLATS, colorAt)]) {
        let closest = Infinity;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) closest = Math.min(closest, Math.hypot((list[i].x - list[j].x) * (4 / 3), list[i].y - list[j].y));
        }
        expect(closest, `seed ${seed}`).toBeGreaterThan(0.1);
      }
    }
  });

  test("more splashes than cells still works: cells are reused only after every cell has been used", () => {
    const list = initialSplats(createRng(2), 16, colorAt);
    expect(list).toHaveLength(16);
    const cell = (p) => `${Math.floor(((p.x - 0.1) / 0.8) * 4)},${Math.floor(((p.y - 0.12) / 0.76) * 2)}`;
    expect(new Set(list.slice(0, 8).map(cell)).size).toBe(8);
    expect(new Set(list.slice(8).map(cell)).size).toBe(8);
  });

  test("the opening and Burst splashes are stronger than one event of a drag, so the first picture is not dim", () => {
    expect(SPLASH_GAIN).toBeGreaterThan(1);
    for (const p of [...initialSplats(createRng(1), 5, colorAt), ...burstSplats(createRng(1), 7, colorAt)]) expect(p.gain).toBe(SPLASH_GAIN);
    // One splash should reach close to full color for a typical palette color (about 0.5 per channel).
    expect(0.5 * DYE_INTENSITY * SPLASH_GAIN).toBeGreaterThan(0.5);
  });

  test("no Math.random anywhere in the kernel", () => {
    const spy = vi.spyOn(Math, "random");
    initialSplats(createRng(1), 5, colorAt);
    burstSplats(createRng(1), 7, colorAt);
    strokeColor(3, colorAt);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("stroke colors", () => {
  test("each new stroke steps through the palette, deterministically, inside the range", () => {
    const ts = Array.from({ length: 50 }, (_, i) => strokeColor(i, (t) => [t, 0, 0])[0]);
    expect(new Set(ts.map((t) => t.toFixed(4))).size).toBe(50); // golden-ratio stepping never repeats soon
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(COLOR_RANGE[0]);
    expect(Math.max(...ts)).toBeLessThanOrEqual(COLOR_RANGE[1]);
    expect(strokeColor(7, colorAt)).toEqual(strokeColor(7, colorAt));
  });
});

describe("lutColorAt", () => {
  test("reads a 256-entry RGB lookup as 0..1 colors, clamping t", () => {
    const lut = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) lut.set([i, 255 - i, 128], i * 3);
    const at = lutColorAt(lut);
    expect(at(0)).toEqual([0, 1, 128 / 255]);
    expect(at(1)).toEqual([1, 0, 128 / 255]);
    expect(at(-5)).toEqual(at(0));
    expect(at(9)).toEqual(at(1));
    const mid = at(0.5);
    expect(mid[0]).toBeCloseTo(0.5, 1);
  });

  test("DT is one sixtieth of a second", () => {
    expect(DT).toBeCloseTo(1 / 60, 12);
  });
});
