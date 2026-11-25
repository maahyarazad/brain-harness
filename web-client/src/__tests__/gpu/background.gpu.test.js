// A picture that does not fill the canvas sits on the studio background, as it does on the processor path:
// the margins of every GPU port are the background color, not black.
import { afterEach, describe, expect, test } from "vitest";
import life from "../../studio/visualizations/life/index.js";
import elementaryCA from "../../studio/visualizations/elementaryCA/index.js";
import langton from "../../studio/visualizations/langton/index.js";
import grayScott from "../../studio/visualizations/grayScott/index.js";
import boids from "../../studio/visualizations/boids/index.js";
import sorting from "../../studio/visualizations/sorting/index.js";
import timesTable from "../../studio/visualizations/timesTable/index.js";
import doublePendulum from "../../studio/visualizations/doublePendulum/index.js";
import lorenz from "../../studio/visualizations/lorenz/index.js";
import fourier from "../../studio/visualizations/fourier/index.js";
import recaman from "../../studio/visualizations/recaman/index.js";
import maze from "../../studio/visualizations/maze/index.js";
import { configFor, withSweep, runGpu, runProcessor, finish } from "./gpuHarness.js";

const runs = [];
afterEach(() => runs.splice(0).forEach(finish));

const BG = [15, 15, 18];
const pixel = (inst, w, h, x, yFromTop) => {
  const px = inst.__debug.gpu.readback({ w, h, fbo: null }, new Uint8Array(w * h * 4));
  const i = ((h - 1 - yFromTop) * w + x) * 4;
  return [px[i], px[i + 1], px[i + 2]];
};

describe.each([
  ["life", life],
  ["elementary CA", elementaryCA],
  ["Langton's ant", langton],
  ["reaction–diffusion", grayScott],
  ["boids", boids],
  ["times-table circle", timesTable],
  ["double pendulum", doublePendulum],
  ["Lorenz attractor", lorenz],
  ["Fourier epicycles", fourier],
  ["Recamán's sequence", recaman],
  ["maze", maze],
])("%s on a wide canvas", (_name, mod) => {
  test("both margins are the background color", () => {
    const module = withSweep(mod);
    const r = runGpu(module, configFor(module, null, 3), { steps: 3, size: [400, 200] });
    runs.push(r);
    expect(r.inst.path).toBe("gpu");
    expect(pixel(r.inst, 400, 200, 2, 2)).toEqual(BG);
    expect(pixel(r.inst, 400, 200, 397, 197)).toEqual(BG);
    expect(pixel(r.inst, 400, 200, 2, 100)).toEqual(BG);
  });
});

test("sorting: the space above the bars is the background color", () => {
  const module = withSweep(sorting);
  const r = runGpu(module, configFor(module, null, 3), { steps: 3, size: [400, 200] });
  runs.push(r);
  expect(pixel(r.inst, 400, 200, 2, 1)).toEqual(BG);
});

test("the processor path leaves the same color in those margins (the reference for the above)", () => {
  const module = withSweep(life);
  const r = runProcessor(module, configFor(module, null, 3), { steps: 3, size: [400, 200] });
  const g = r.canvas.getContext("2d");
  expect([...g.getImageData(2, 2, 1, 1).data.slice(0, 3)]).toEqual(BG);
  finish(r);
});
