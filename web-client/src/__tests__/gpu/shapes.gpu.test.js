// The shared shape builders (T066): thick segments with three kinds of end, and discs, as a 2D canvas would draw them.
import { afterEach, describe, expect, test } from "vitest";
import { openGpu } from "../../studio/visualizations/_shared/gpu/index.js";
import { createShapes } from "../../studio/visualizations/_shared/gpu/shapes.js";

const W = 100;
const H = 80;
let opened = [];
afterEach(() => {
  opened.forEach((g) => g.dispose());
  opened = [];
});

function setup() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const gpu = openGpu(canvas);
  opened.push(gpu);
  const shapes = createShapes(gpu);
  const clear = (c = [0, 0, 0, 1]) => {
    const prog = gpu.program("test:fill", "uniform vec4 uC; void main() { gl_FragColor = uC; }");
    gpu.draw(prog, { uC: c }, null);
  };
  const all = () => {
    const out = new Uint8Array(W * H * 4);
    gpu.readback({ w: W, h: H, fbo: null }, out);
    return out;
  };
  /** The color at canvas pixel (x, y), counting y from the top as the 2D canvas does. */
  const at = (px, x, y) => {
    const i = ((H - 1 - y) * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const lit = (px, x, y) => at(px, x, y).some((v) => v > 127);
  return { gpu, shapes, clear, all, at, lit, buf: (a) => gpu.buffer(new Float32Array(a)) };
}

const WHITE = [1, 1, 1, 1];

describe("segments", () => {
  test("a thick horizontal segment covers its width and nothing outside it; y counts from the top", () => {
    const t = setup();
    t.clear();
    t.shapes.segments(t.buf([20, 30, 70, 30]), { count: 1, width: 8, color: WHITE, canvas: [W, H], cap: "flat" });
    const px = t.all();
    for (const y of [26, 27, 29, 30, 32, 33]) expect(t.lit(px, 45, y), `inside at y ${y}`).toBe(true); // 26 to 34
    for (const y of [24, 25, 35, 36, 55]) expect(t.lit(px, 45, y), `outside at y ${y}`).toBe(false);
    expect(t.lit(px, 45, 2)).toBe(false); // nothing near the top: a flipped y would put it at 80 - 30 = 50
    expect(t.lit(px, 45, 50)).toBe(false);
  });

  test("the three kinds of end", () => {
    const flat = setup();
    const square = setup();
    const round = setup();
    for (const [t, cap] of [[flat, "flat"], [square, "square"], [round, "round"]]) {
      t.clear();
      t.shapes.segments(t.buf([30, 40, 70, 40]), { count: 1, width: 12, color: WHITE, canvas: [W, H], cap });
    }
    const f = flat.all();
    const s = square.all();
    const r = round.all();
    // 3 px before the start: past a flat end, on a square one, inside a round one on the center line.
    expect(flat.lit(f, 27, 40)).toBe(false);
    expect(square.lit(s, 27, 40)).toBe(true);
    expect(round.lit(r, 27, 40)).toBe(true);
    // The corner of the square end is filled; the same point is outside the round one.
    expect(square.lit(s, 25, 35)).toBe(true);
    expect(round.lit(r, 25, 35)).toBe(false);
    // 7 px past the start is beyond even the square end (6 px).
    expect(square.lit(s, 22, 40)).toBe(false);
    expect(round.lit(r, 22, 40)).toBe(false);
  });

  test("a diagonal segment keeps its width across the line", () => {
    const t = setup();
    t.clear();
    t.shapes.segments(t.buf([10, 10, 70, 70]), { count: 1, width: 10, color: WHITE, canvas: [W, H], cap: "flat" });
    const px = t.all();
    // Along the perpendicular through (40, 40): points up to 5 px from the line are lit, 8 px are not.
    const along = (d) => [Math.round(40 + (d * Math.SQRT1_2)), Math.round(40 - (d * Math.SQRT1_2))];
    for (const d of [-4, 0, 4]) expect(t.lit(px, ...along(d)), `${d} px from the line`).toBe(true);
    for (const d of [-8, 8]) expect(t.lit(px, ...along(d)), `${d} px from the line`).toBe(false);
  });

  test("the edge is soft: a pixel half covered gets about half the color", () => {
    const t = setup();
    t.clear();
    // Width 7 centered on y = 40.5... the center line at y = 40 covers pixel rows 37 (half), 38, 39, 40, 41, 42, 43 (half)
    t.shapes.segments(t.buf([20, 40, 70, 40]), { count: 1, width: 7, color: WHITE, canvas: [W, H], cap: "flat" });
    const px = t.all();
    const edge = t.at(px, 45, 36)[0]; // the pixel centered at 36.5: 0.5 px from the edge at 36.5 -> half covered
    expect(edge).toBeGreaterThan(90);
    expect(edge).toBeLessThan(170);
    expect(t.at(px, 45, 40)[0]).toBe(255);
  });

  test("the color's alpha blends with what is behind it", () => {
    const t = setup();
    t.clear([0, 0, 0, 1]);
    t.shapes.segments(t.buf([20, 40, 70, 40]), { count: 1, width: 10, color: [1, 1, 1, 0.5], canvas: [W, H], cap: "flat" });
    const v = t.at(t.all(), 45, 40)[0];
    expect(v).toBeGreaterThan(120);
    expect(v).toBeLessThan(136);
  });

  test("many segments at once, each in its place", () => {
    const t = setup();
    t.clear();
    const data = [];
    for (let i = 0; i < 39; i++) data.push(5, 2 + i * 2, 95, 2 + i * 2); // 39 horizontal lines, 2 px apart, from x = 5 to 95
    t.shapes.segments(t.buf(data), { count: 39, width: 1.6, color: WHITE, canvas: [W, H], cap: "flat" });
    const px = t.all();
    // Each line is a full pixel row high at its own height (line i at y = 2 + 2i covers row 1 + 2i and the soft edge around it).
    for (const i of [0, 7, 38]) expect(t.at(px, 50, 2 + i * 2 - 1)[0] + t.at(px, 50, 2 + i * 2)[0], `line ${i}`).toBeGreaterThan(300);
    expect(t.lit(px, 97, 12), "right of the ends").toBe(false);
    expect(t.lit(px, 2, 12), "left of the starts").toBe(false);
  });

  test("a segment of no length with round ends is a disc; with flat ends it is nothing", () => {
    const round = setup();
    round.clear();
    round.shapes.segments(round.buf([50, 40, 50, 40]), { count: 1, width: 12, color: WHITE, canvas: [W, H], cap: "round" });
    const r = round.all();
    expect(round.lit(r, 50, 40)).toBe(true);
    expect(round.lit(r, 54, 40)).toBe(true);
    expect(round.lit(r, 58, 40)).toBe(false);
    const flat = setup();
    flat.clear();
    flat.shapes.segments(flat.buf([50, 40, 50, 40]), { count: 1, width: 12, color: WHITE, canvas: [W, H], cap: "flat" });
    expect(flat.lit(flat.all(), 50, 40)).toBe(false);
  });

  test("zero instances draw nothing and do not throw", () => {
    const t = setup();
    t.clear();
    expect(() => t.shapes.segments(t.buf([0, 0, 1, 1]), { count: 0, width: 4, color: WHITE, canvas: [W, H] })).not.toThrow();
  });
});

describe("discs", () => {
  test("a disc is filled to its radius", () => {
    const t = setup();
    t.clear();
    t.shapes.discs(t.buf([30, 25, 10]), { count: 1, color: [1, 0, 0, 1], canvas: [W, H] });
    const px = t.all();
    expect(t.at(px, 30, 25)).toEqual([255, 0, 0]);
    expect(t.lit(px, 38, 25)).toBe(true); // 8 px out
    expect(t.lit(px, 30, 17)).toBe(true);
    expect(t.lit(px, 42, 25)).toBe(false); // 12 px out
    expect(t.lit(px, 30, 40)).toBe(false);
    expect(t.lit(px, 38, 31)).toBe(false); // the square's corner region: 10 px diagonally away
  });

  test("several discs of different sizes", () => {
    const t = setup();
    t.clear();
    t.shapes.discs(t.buf([20, 20, 4, 60, 50, 12, 85, 70, 2]), { count: 3, color: WHITE, canvas: [W, H] });
    const px = t.all();
    expect(t.lit(px, 20, 20)).toBe(true);
    expect(t.lit(px, 60, 50)).toBe(true);
    expect(t.lit(px, 69, 50)).toBe(true); // 9 px from the big one's center
    expect(t.lit(px, 85, 70)).toBe(true);
    expect(t.lit(px, 20, 27)).toBe(false); // 7 px from a radius-4 disc
  });
});

describe("drawing into a target and on WebGL 1", () => {
  test("segments can be drawn into a target", () => {
    const t = setup();
    const target = t.gpu.target({ w: W, h: H, format: "rgba8" });
    t.shapes.segments(t.buf([10, 40, 90, 40]), { count: 1, width: 6, color: WHITE, canvas: [W, H], cap: "flat", target });
    const out = new Uint8Array(4);
    t.gpu.readback(target, out, { x: 50, y: H - 1 - 40, w: 1, h: 1 });
    expect(out[0]).toBe(255);
  });

  test("it works on a WebGL 1 context (instancing through the extension)", () => {
    globalThis.__VIZ_GL_VERSION__ = 1;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const gpu = openGpu(canvas);
      if (!gpu) return; // no WebGL 1 here; the toolkit tests cover that case
      opened.push(gpu);
      expect(gpu.version).toBe(1);
      const shapes = createShapes(gpu);
      shapes.segments(gpu.buffer(new Float32Array([10, 40, 90, 40])), { count: 1, width: 6, color: WHITE, canvas: [W, H], cap: "round" });
      const out = new Uint8Array(4);
      gpu.readback({ w: W, h: H, fbo: null }, out, { x: 50, y: H - 1 - 40, w: 1, h: 1 });
      expect(out[0]).toBe(255);
    } finally {
      delete globalThis.__VIZ_GL_VERSION__;
    }
  });
});

describe("a color for each segment", () => {
  test("each instance takes its own color, and the overall color multiplies it", () => {
    const t = setup();
    t.clear();
    t.shapes.segments(t.buf([10, 20, 90, 20, 10, 50, 90, 50]), {
      count: 2, width: 6, color: [1, 1, 1, 1], canvas: [W, H], cap: "flat",
      colors: t.buf([1, 0, 0, 1, 0, 1, 0, 1]),
    });
    const px = t.all();
    expect(t.at(px, 50, 20)).toEqual([255, 0, 0]);
    expect(t.at(px, 50, 50)).toEqual([0, 255, 0]);
    t.clear();
    t.shapes.segments(t.buf([10, 20, 90, 20]), { count: 1, width: 6, color: [1, 1, 1, 0.5], canvas: [W, H], cap: "flat", colors: t.buf([1, 1, 1, 1]) });
    const v = t.at(t.all(), 50, 20)[0];
    expect(v).toBeGreaterThan(120);
    expect(v).toBeLessThan(136);
  });
});

describe("rings", () => {
  test("a ring is lit only near its radius, as thick as asked, and hollow inside", () => {
    const t = setup();
    t.clear();
    t.shapes.rings(t.buf([50, 40, 20]), { count: 1, width: 4, color: WHITE, canvas: [W, H] });
    const px = t.all();
    expect(t.lit(px, 70, 40)).toBe(true); // on the ring: 20 px right of the center
    expect(t.lit(px, 50, 20)).toBe(true); // and above it
    expect(t.lit(px, 71, 40)).toBe(true); // 1 px outside the radius, inside the 2 px half-width
    expect(t.lit(px, 74, 40)).toBe(false); // 4 px outside
    expect(t.lit(px, 66, 40)).toBe(false); // 4 px inside
    expect(t.lit(px, 50, 40)).toBe(false); // the middle is empty
  });

  test("several rings of different sizes, with the color's alpha", () => {
    const t = setup();
    t.clear();
    t.shapes.rings(t.buf([30, 40, 10, 70, 40, 5]), { count: 2, width: 2, color: [1, 1, 1, 0.5], canvas: [W, H] });
    const px = t.all();
    const v = t.at(px, 40, 40)[0]; // the small ring's right edge sits at 30 + 10
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThan(140);
    expect(t.lit(px, 70, 40)).toBe(false); // the second ring's middle
    expect(t.at(px, 75, 40)[0]).toBeGreaterThan(50); // its edge, 5 px right
  });

  test("a discs call is unchanged by the ring's extra width uniform", () => {
    const t = setup();
    t.clear();
    t.shapes.discs(t.buf([30, 25, 10]), { count: 1, color: WHITE, canvas: [W, H] });
    const px = t.all();
    expect(t.lit(px, 30, 25)).toBe(true);
    expect(t.lit(px, 42, 25)).toBe(false);
  });
});
