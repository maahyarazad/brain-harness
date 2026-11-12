// Helpers to run a visualization module headlessly with the canvas stub.
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { calls, resetCanvasCalls } from "./canvasStub.js";

export function makeCanvas(w = 160, h = 120) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Creates an instance, waits for async work, runs `steps` steps, and returns the recorded canvas calls. */
export async function runModule(module, config, { steps = 0, w = 160, h = 120 } = {}) {
  resetCanvasCalls();
  const canvas = makeCanvas(w, h);
  const handle = createModuleContext({ seed: config.seed, dpr: 1 });
  const inst = module.create(canvas, config, handle.ctx);
  await handle.ctx.idle();
  for (let i = 0; i < steps; i++) {
    inst.step();
    await handle.ctx.idle();
  }
  if (module.animated && steps) inst.render();
  await handle.ctx.idle();
  const recorded = calls.slice();
  return { inst, handle, canvas, calls: recorded };
}
