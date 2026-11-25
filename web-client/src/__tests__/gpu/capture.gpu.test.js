// Saving a picture, recording a video and making a catalog picture all read the canvas after an await,
// when an unpreserved WebGL buffer would already be cleared (specs/005 research R2 and R9).
import { afterEach, describe, expect, test } from "vitest";
import fluid from "../../studio/visualizations/fluid/index.js";
import { withQuality } from "../../studio/core/quality.js";
import { defaultsOf, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { makeThumbnail } from "../../studio/core/exportFile.js";
import { renderThumbnail } from "../../studio/core/thumbnail.js";

const module = withQuality(fluid);
let live = [];
afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function open() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const base = defaultsOf(module);
  const cfg = validateConfig(module, { ...base, values: { ...base.values, quality: "low" } }).config;
  const handle = createModuleContext({ seed: 1, dpr: 1 });
  const inst = module.create(canvas, cfg, handle.ctx);
  live.push({ inst, handle });
  for (let i = 0; i < 20; i++) inst.step();
  inst.render();
  return { canvas, inst };
}

/** How much of a picture is not the dark background: blank pictures score 0. */
async function ink(source) {
  const bmp = await createImageBitmap(source);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 50) lit++;
  return lit / (d.length / 4);
}

describe("capturing a GPU canvas after an await", () => {
  test("toBlob (Download image) is not blank", async () => {
    const { canvas } = open();
    await wait(50); // the browser has composited and would have cleared an unpreserved buffer
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    expect(blob.size).toBeGreaterThan(2000);
    expect(await ink(blob)).toBeGreaterThan(0.05);
  });

  test("the picture saved with a visualization (makeThumbnail) is not blank", async () => {
    const { canvas } = open();
    await wait(50);
    const url = makeThumbnail(canvas);
    expect(url).toMatch(/^data:image\/jpeg/);
    const blob = await (await fetch(url)).blob();
    expect(await ink(blob)).toBeGreaterThan(0.03);
  });

  test("captureStream (Record video) delivers a frame with the picture in it", async () => {
    const { canvas, inst } = open();
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
    c.width = 256;
    c.height = 192;
    const g = c.getContext("2d");
    g.drawImage(video, 0, 0, 256, 192);
    const d = g.getImageData(0, 0, 256, 192).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 50) lit++;
    stream.getTracks().forEach((t) => t.stop());
    expect(lit / (d.length / 4)).toBeGreaterThan(0.03);
  }, 20000);

  test("the catalog picture generator (renderThumbnail) is not blank", async () => {
    const out = await renderThumbnail(module);
    expect(out.width).toBe(320);
    expect(await ink(out)).toBeGreaterThan(0.05);
  }, 30000);
});
