// SC-005: a saved visualization reopens to the same picture.
import { CATALOG } from "../../studio/catalog.js";
import { defaultsOf, validateConfig } from "../../studio/core/knobs.js";
import { createSaved, getSaved } from "../../studio/core/storage.js";
import { createRng } from "../../studio/core/rng.js";
import { SWEEP_KNOBS } from "../../studio/core/sweep.js";
import { installCanvasStub } from "./canvasStub.js";
import { runModule } from "./harness.js";

installCanvasStub();
beforeEach(() => localStorage.clear());

// As in modules.contract.test.js: kernels run on the main thread in tests, so the
// heaviest modules use lighter values to stay well inside the 5 s test timeout.
const LIGHT_VALUES = { dla: { particles: 1000 } };

/** Random valid values, limited to the lower part of each range so the test stays fast. */
function tunedValues(module, rng) {
  const values = { ...defaultsOf(module).values };
  // The studio's own sweep knobs are left at their defaults, so the random draws
  // (and so the test's cost) stay the same as for the module's own knobs.
  for (const k of module.knobs.filter((x) => !SWEEP_KNOBS.some((s) => s.key === x.key))) {
    if (k.type === "range") {
      const span = (k.max - k.min) * (k.live === false ? 0.15 : 0.5);
      values[k.key] = k.min + rng() * span;
    } else if (k.type === "choice") values[k.key] = k.options[Math.floor(rng() * k.options.length)].value;
    else if (k.type === "toggle") values[k.key] = rng() < 0.5;
    else if (k.type === "palette") values[k.key] = ["viridis", "magma", "fire"][Math.floor(rng() * 3)];
  }
  return values;
}

test.each(CATALOG.map((e) => [e.id, e]))("%s replays identically after save and reload", async (_id, entry) => {
  const module = (await entry.load()).default;
  const rng = createRng(2024);
  const values = { ...tunedValues(module, rng), ...LIGHT_VALUES[module.id] };
  const { config } = validateConfig(module, { values, seed: 777 });
  const steps = module.animated ? 20 : 0;

  const before = await runModule(module, config, { steps });
  before.inst.destroy();
  before.handle.dispose();

  const saved = createSaved({ name: "Mine", config, thumbnail: null });
  expect(saved.ok).toBe(true);
  // Simulate a reload: read back from storage and validate again.
  const record = JSON.parse(JSON.stringify(getSaved(saved.record.id)));
  const reloaded = validateConfig(module, record.config);
  expect(reloaded.replaced).toEqual([]);

  const after = await runModule(module, reloaded.config, { steps });
  after.inst.destroy();
  after.handle.dispose();
  expect(after.calls).toEqual(before.calls);
});
