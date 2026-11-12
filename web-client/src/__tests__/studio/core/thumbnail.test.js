import { vi } from "vitest";
import { findEntry } from "../../../studio/catalog.js";
import { renderThumbnail, thumbnailConfig, THUMB_W, THUMB_H } from "../../../studio/core/thumbnail.js";
import { installCanvasStub } from "../canvasStub.js";

installCanvasStub();

const load = async (id) => (await findEntry(id).load()).default;

test("draws the background, then the picture in one copy", async () => {
  const m = { ...(await load("phyllotaxis")), thumbnail: { values: { angle: 137.6 } } };
  const canvas = await renderThumbnail(m);
  expect([canvas.width, canvas.height]).toEqual([THUMB_W, THUMB_H]);
  const log = canvas.getContext("2d").log;
  const draws = log.filter((e) => e.op === "fillRect" || e.op === "drawImage");
  expect(draws[0]).toMatchObject({ op: "fillRect", args: [0, 0, THUMB_W, THUMB_H] });
  expect(draws.slice(1)).toEqual([{ op: "drawImage", source: "canvas", dest: [0, 0, THUMB_W, THUMB_H] }]);
});

test("runs the recipe's steps on animated modules, then cleans up", async () => {
  const base = await load("sorting");
  const spies = {};
  const m = {
    ...base,
    thumbnail: { steps: 50 },
    create(canvas, cfg, ctx) {
      const inst = base.create(canvas, cfg, ctx);
      spies.step = vi.spyOn(inst, "step");
      spies.destroy = vi.spyOn(inst, "destroy");
      return inst;
    },
  };
  await renderThumbnail(m);
  expect(spies.step).toHaveBeenCalledTimes(50);
  expect(spies.destroy).toHaveBeenCalledTimes(1);
});

test('steps: "done" runs until the module says it has finished', async () => {
  const base = await load("sorting");
  let inst;
  const m = {
    ...base,
    thumbnail: { values: { size: 16 }, steps: "done" },
    create(canvas, cfg, ctx) {
      inst = base.create(canvas, cfg, ctx);
      vi.spyOn(inst, "destroy");
      return inst;
    },
  };
  await renderThumbnail(m);
  expect(inst.isDone()).toBe(true);
});

test("the recipe's preset, values and view make up the configuration", async () => {
  const m = { ...(await load("mandelbrot")), thumbnail: { values: { iterations: 400 }, view: { cx: -0.7, cy: 0.1, zoom: 20 } } };
  const cfg = thumbnailConfig(m);
  expect(cfg.values.iterations).toBe(400);
  expect(cfg.view).toEqual({ cx: -0.7, cy: 0.1, zoom: 20 });
});

test("a recipe naming a missing preset is rejected", async () => {
  const m = { ...(await load("dla")), thumbnail: { presetId: "nope" } };
  await expect(renderThumbnail(m)).rejects.toThrow(/doesn't exist/);
});
