// Helpers for the GPU tests (specs/005-.../contracts/gpu-tests.md, "Helpers").
import { defaultsOf, applyPreset, validateConfig } from "../../studio/core/knobs.js";
import { withSweep } from "../../studio/core/sweep.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";

/** A real canvas in the test page. */
export function makeCanvas(w = 320, h = 240) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** A module's config for a preset (or its defaults), a seed and some extra values, as the studio would build it. */
export function configFor(module, presetId, seed, extra = {}) {
  const base = defaultsOf(module);
  const p = presetId ? applyPreset(module, presetId) : { values: base.values, input: null };
  return validateConfig(module, { ...base, seed, values: { ...p.values, ...extra }, input: p.input }).config;
}

export { withSweep };

function run(module, config, { steps = 0, size = [320, 240], ctxOptions = {} } = {}) {
  const canvas = makeCanvas(size[0], size[1]);
  const handle = createModuleContext({ seed: config.seed, dpr: 1, ...ctxOptions });
  const inst = module.create(canvas, config, handle.ctx);
  for (let i = 0; i < steps; i++) inst.step();
  inst.render();
  return { inst, canvas, handle };
}

/** module.create with the GPU path, `steps` calls to step(), then render(). */
export const runGpu = (module, config, options) => run(module, config, options);

/** The same with the processor path forced (ctx.gpuForced = "off"). */
export const runProcessor = (module, config, options) => run(module, config, { ...options, ctxOptions: { ...options?.ctxOptions, gpuForced: "off" } });

/** Ends an instance made by run(). */
export function finish({ inst, handle }) {
  inst.destroy();
  handle.dispose();
}

/** Both pictures shrunk to w x h, then the mean absolute difference per colour channel, out of 255. */
export function imageDiff(a, b, { w = 80, h = 60 } = {}) {
  const shrink = (src) => {
    const c = makeCanvas(w, h);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };
  const da = shrink(a);
  const db = shrink(b);
  let sum = 0;
  for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  return sum / ((da.length / 4) * 3);
}

/** WEBGL_lose_context helpers: resolve once the event has been delivered. The extension is taken before the loss, because a lost context no longer hands it out. */
const extensions = new WeakMap();
export function lose(canvas, gl) {
  const ext = gl.getExtension("WEBGL_lose_context");
  extensions.set(canvas, ext);
  const done = new Promise((r) => canvas.addEventListener("webglcontextlost", r, { once: true }));
  ext.loseContext();
  return done;
}
export function restore(canvas) {
  const done = new Promise((r) => canvas.addEventListener("webglcontextrestored", r, { once: true }));
  extensions.get(canvas).restoreContext();
  return done;
}
