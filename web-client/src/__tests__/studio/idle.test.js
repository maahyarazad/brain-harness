// A finished run uses next to no processing power (FR-024): the loop stops asking for frames.
import { installCanvasStub } from "./canvasStub.js";
import { runModule } from "./harness.js";
import { defaultsOf } from "../../studio/core/knobs.js";
import { findEntry } from "../../studio/catalog.js";

installCanvasStub();

async function load(id) {
  return (await findEntry(id).load()).default;
}

describe.each([["sorting", 40], ["maze", 12]])("%s", (id, size) => {
  test("is idle exactly when its run is finished, and busy again after Restart", async () => {
    const m = await load(id);
    const cfg = defaultsOf(m);
    cfg.values = { ...cfg.values, size };
    const { inst, handle } = await runModule(m, cfg, { steps: 0 });
    expect(inst.isIdle()).toBe(false);
    expect(inst.isDone()).toBe(false);
    let guard = 0;
    while (!inst.isDone() && guard++ < 200000) {
      inst.step();
      await handle.ctx.idle();
    }
    expect(inst.isDone()).toBe(true);
    expect(inst.isIdle()).toBe(true);
    inst.reset();
    expect(inst.isIdle()).toBe(false);
    inst.destroy();
    handle.dispose();
  }, 60000);
});

test("modules that never finish are never idle", async () => {
  for (const id of ["game-of-life", "boids", "lorenz", "langtons-ant"]) {
    const m = await load(id);
    const { inst, handle } = await runModule(m, defaultsOf(m), { steps: 3 });
    expect(inst.isIdle?.() ?? false, id).toBe(false);
    inst.destroy();
    handle.dispose();
  }
});
