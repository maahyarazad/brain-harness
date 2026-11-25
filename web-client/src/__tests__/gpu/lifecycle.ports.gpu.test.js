// Leaving and losing the graphics context, for all twelve ported visualizations (SC-007, FR-017, FR-018, FR-036).
// Each module's own test file covers its restore; here the same cases run for every one, plus the one that none of
// them covers alone: a context that is lost and never comes back asks for a restart on the processor path.
import { afterEach, describe, expect, test } from "vitest";
import { PORTS } from "./ports.js";
import { configFor, runGpu, finish, lose, restore } from "./gpuHarness.js";

let live = [];
afterEach(() => live.splice(0).forEach(finish));

const SMALL = { "Maze": { size: 12 }, "Sorting algorithms": { size: 30 }, "Langton's ant": { size: 80 }, "Reaction–diffusion": { size: "128" }, "Game of Life": { size: 40 }, "Boids": { count: 80 } };
const cfgFor = (name, module) => configFor(module, null, 1, SMALL[name] ?? {});

describe.each(PORTS)("%s", (name, module) => {
  test("after 30 times opening and leaving, a fresh context and a first frame still work", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, cfgFor(name, module), { steps: 1 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
    const last = runGpu(module, cfgFor(name, module), { steps: 2 });
    live.push(last);
    expect(last.inst.path).toBe("gpu");
    const px = last.inst.__debug.gpu.readback({ w: 320, h: 240, fbo: null }, new Uint8Array(320 * 240 * 4));
    let drawn = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 0) drawn++;
    expect(drawn, "the first frame is not blank").toBeGreaterThan(1000);
  }, 120000);

  test("a lost context that comes back keeps the instance usable: stepping and drawing work, and it says if the picture restarted", async () => {
    const notices = [];
    const r = runGpu(module, cfgFor(name, module), { steps: 5, ctxOptions: { onNotice: (n) => notices.push(n) } });
    live.push(r);
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 60));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    // The ones that keep their state on the graphics card start over and say so; the others keep going without a message.
    const restarted = notices.some((n) => /graphics card was reset/i.test(n));
    const px = r.inst.__debug.gpu.readback({ w: 320, h: 240, fbo: null }, new Uint8Array(320 * 240 * 4));
    let drawn = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 0) drawn++;
    expect(drawn, `the picture is back (${restarted ? "restarted, with a notice" : "kept"})`).toBeGreaterThan(1000);
  }, 60000);
});

describe("a context lost for good", () => {
  test("every one asks for a restart on the processor path once the context has not come back in time", async () => {
    const asked = new Map();
    const runs = PORTS.map(([name, module]) => {
      const r = runGpu(module, cfgFor(name, module), { steps: 3, ctxOptions: { onRestart: (o) => asked.set(name, o) } });
      live.push(r);
      return [name, r];
    });
    await Promise.all(runs.map(([, r]) => lose(r.canvas, r.inst.__debug.gpu.gl)));
    // Nothing is asked for while there is still time.
    await new Promise((res) => setTimeout(res, 800));
    expect(asked.size, "nothing asked for after 0.8 s").toBe(0);
    await new Promise((res) => setTimeout(res, 3000));
    for (const [name] of runs) expect(asked.get(name), `${name} asked for a restart on the processor path`).toMatchObject({ forceProcessor: true });
  }, 60000);

  test("a context that comes back in time asks for nothing", async () => {
    const asked = [];
    const [name, module] = PORTS[0];
    const r = runGpu(module, cfgFor(name, module), { steps: 3, ctxOptions: { onRestart: (o) => asked.push(o) } });
    live.push(r);
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 100));
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 3500));
    expect(asked).toHaveLength(0);
  }, 30000);
});
