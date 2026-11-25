// Saving a picture, recording a video and making the catalog picture read the canvas after an await, when an unpreserved
// WebGL buffer would already be cleared. The fluid has its own file; here are the ported visualizations (specs/005, R2 and R9).
import { afterEach, describe, expect, test } from "vitest";
import { PORTS } from "./ports.js";
import { configFor, runGpu, finish } from "./gpuHarness.js";
import { makeThumbnail } from "../../studio/core/exportFile.js";
import { renderThumbnail } from "../../studio/core/thumbnail.js";

let live = [];
afterEach(() => live.splice(0).forEach(finish));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const byName = (n) => PORTS.find(([name]) => name === n);

/** The share of pixels that are not the dark background: a blank picture scores 0. */
async function ink(source, floor = 50) {
  const bmp = await createImageBitmap(source);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > floor) lit++;
  return lit / (d.length / 4);
}

// A trail needs some length before there is a picture to save.
const STEPS = { "Lorenz attractor": 2500 };

function open(name, steps = STEPS[name] ?? 40) {
  const [, module] = byName(name);
  const r = runGpu(module, configFor(module, null, 1), { steps, size: [320, 240] });
  live.push(r);
  expect(r.inst.path).toBe("gpu");
  return r;
}

// Thin lines and sparse cells light few pixels, so the bar is "clearly more than a blank canvas", not "a lot".
const MIN = { "Game of Life": 0.05, "Lorenz attractor": 0.004, "Boids": 0.004 };

describe.each(["Game of Life", "Lorenz attractor", "Boids"])("%s", (name) => {
  test("toBlob (Download image) after a wait is not blank", async () => {
    const { canvas } = open(name);
    await wait(50);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    expect(blob.size).toBeGreaterThan(1000);
    expect(await ink(blob)).toBeGreaterThan(MIN[name]);
  });

  test("the saved picture (makeThumbnail) is not blank", async () => {
    const { canvas } = open(name);
    await wait(50);
    const url = makeThumbnail(canvas);
    expect(url).toMatch(/^data:image\/jpeg/);
    expect(await ink(await (await fetch(url)).blob(), 40)).toBeGreaterThan(MIN[name] / 2);
  });

  test("captureStream (Record video) delivers a frame with the picture in it", async () => {
    const { canvas, inst } = open(name);
    const stream = canvas.captureStream(30);
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    for (let i = 0; i < 6; i++) {
      inst.step();
      inst.render();
      await wait(40);
    }
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const g = c.getContext("2d");
    g.drawImage(video, 0, 0, 320, 240);
    const d = g.getImageData(0, 0, 320, 240).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 50) lit++;
    stream.getTracks().forEach((t) => t.stop());
    expect(lit / (d.length / 4)).toBeGreaterThan(MIN[name] / 2);
  }, 20000);
});

describe("the catalog picture generator (renderThumbnail) for all twelve", () => {
  test.each(PORTS)("%s: not blank", async (_name, module) => {
    const out = await renderThumbnail(module);
    expect(out.width).toBe(320);
    expect(await ink(out, 40)).toBeGreaterThan(0.002);
  }, 180000);
});
