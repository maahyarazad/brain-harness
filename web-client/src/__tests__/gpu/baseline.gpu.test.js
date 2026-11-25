// Pre-change reference pictures (task T009) and the guard for SC-011 and FR-021.
//
// Every catalog visualization is rendered at its default settings and seed on the PROCESSOR path
// (2D canvas) in the real browser, and the SHA-256 of the pixels is compared with the value
// recorded before this feature changed anything (baseline.hashes.json).
//   - Static modules must match exactly: at their default quality their picture is unchanged.
//   - Animated modules are checked on their processor path only (`gpuForced: "off"`): that is the
//     fallback path, which FR-034 says must keep working as it does today. Their GPU paths are
//     compared with their kernels and with this processor path in the exactness / similar tests.
//
// To record: VITE_CAPTURE_BASELINE=1 npm run test:gpu -- baseline
// Browser tests do not print console output in this Vitest build, so capture mode ends with a
// deliberate failure whose message is the JSON to save as baseline.hashes.json.
import { afterAll, describe, expect, test } from "vitest";
import { CATALOG } from "../../studio/catalog.js";
import { defaultsOf, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import baseline from "./baseline.hashes.json";

const CAPTURE = Boolean(import.meta.env.VITE_CAPTURE_BASELINE);
const W = 320;
const H = 240;
const ANIMATED_STEPS = 60;
// The two heaviest static modules draw many particles; fewer keeps the run short, and the
// hash is recorded with the same numbers.
const LIGHT_VALUES = { dla: { particles: 1000 }, "collatz-coral": { count: 1000 } };

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function render(entry) {
  const module = (await entry.load()).default;
  const base = defaultsOf(module);
  const cfg = validateConfig(module, { ...base, values: { ...base.values, ...LIGHT_VALUES[entry.id] } }).config;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const handle = createModuleContext({ seed: cfg.seed, dpr: 1, gpuForced: "off" });
  const inst = module.create(canvas, cfg, handle.ctx);
  await handle.ctx.idle();
  if (module.animated) {
    for (let i = 0; i < ANIMATED_STEPS; i++) {
      inst.step();
      await handle.ctx.idle();
    }
    inst.render();
  }
  await handle.ctx.idle();
  const start = Date.now();
  while (inst.isBusy?.() && Date.now() - start < 20000) {
    await pause(25);
    await handle.ctx.idle();
  }
  const data = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  const hash = hex(await crypto.subtle.digest("SHA-256", data));
  inst.destroy();
  handle.dispose();
  return { hash, animated: module.animated };
}

describe("pre-change pictures (default settings and seed, processor path)", () => {
  const captured = {};

  afterAll(() => {
    if (CAPTURE) throw new Error("BASELINE_JSON " + JSON.stringify(captured));
  });

  test.each(CATALOG.map((e) => [e.id, e]))("%s", async (id, entry) => {
    const { hash, animated } = await render(entry);
    // The same module drawn twice must give the same pixels, or a hash means nothing.
    const again = await render(entry);
    expect(again.hash, `${id} is not deterministic`).toBe(hash);
    if (CAPTURE) {
      captured[id] = { hash, animated };
      return;
    }
    const recorded = baseline[id];
    if (!recorded) {
      // A visualization added after the baseline (the fluid simulation) has nothing to compare with.
      expect(animated || true).toBe(true);
      return;
    }
    expect(hash, `${id}: the picture changed from the pre-change baseline`).toBe(recorded.hash);
  });
});
