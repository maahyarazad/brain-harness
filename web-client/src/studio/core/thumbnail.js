// Sample pictures for the catalog cards (specs/004-studio-home-sweep/contracts/thumbnail.md).
// Used only by the development page that generates public/studio/thumbs/<id>.webp.
import { applyPreset, defaultsOf, validateConfig } from "./knobs.js";
import { createModuleContext } from "./moduleContext.js";

export const THUMB_W = 320;
export const THUMB_H = 240;
export const MAX_STEPS = 20000;
const BG = "#0f0f12";
const BUSY_LIMIT_MS = 20000;

const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** The configuration a module's `thumbnail` recipe describes, validated. */
export function thumbnailConfig(module) {
  const recipe = module.thumbnail ?? {};
  const base = defaultsOf(module);
  let values = base.values;
  let input = null;
  let view = base.view;
  if (recipe.presetId) {
    const p = applyPreset(module, recipe.presetId);
    if (!p) throw new Error(`${module.id}: thumbnail preset "${recipe.presetId}" doesn't exist`);
    values = p.values;
    input = p.input;
    if (p.view) view = p.view;
  }
  if (recipe.values) values = { ...values, ...recipe.values };
  if (recipe.view) view = { ...recipe.view };
  return validateConfig(module, { ...base, values, input, view }).config;
}

/** Renders the module's sample picture onto a w × h canvas filled with the studio background. */
export async function renderThumbnail(module, { w = THUMB_W, h = THUMB_H } = {}) {
  const cfg = thumbnailConfig(module);
  const steps = module.thumbnail?.steps ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const handle = createModuleContext({ seed: cfg.seed, dpr: 1 });
  let inst = null;
  try {
    inst = module.create(canvas, cfg, handle.ctx);
    await handle.ctx.idle();
    if (module.animated) {
      const untilDone = steps === "done";
      const limit = untilDone ? MAX_STEPS : Math.min(MAX_STEPS, steps);
      for (let i = 0; i < limit; i++) {
        if (untilDone && inst.isDone?.()) break;
        inst.step();
        // Some modules hand each step to a worker and drop steps while it is
        // behind (Reaction–diffusion): wait for that work before the next step.
        await handle.ctx.idle();
        if (i % 200 === 199) await pause();
      }
      inst.render();
    }
    await handle.ctx.idle();
    const start = Date.now();
    while (inst.isBusy?.() && Date.now() - start < BUSY_LIMIT_MS) {
      await pause(50);
      await handle.ctx.idle();
    }

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const g = out.getContext("2d");
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    const s = Math.min(w / canvas.width, h / canvas.height);
    g.drawImage(canvas, (w - canvas.width * s) / 2, (h - canvas.height * s) / 2, canvas.width * s, canvas.height * s);
    return out;
  } finally {
    try {
      inst?.destroy();
    } catch {
      /* ignore */
    }
    handle.dispose();
  }
}

/** WebP quality for a module's picture: 0.8, or the recipe's own `quality`. */
export const thumbnailQuality = (module) => module.thumbnail?.quality ?? 0.8;

/** The canvas as a WebP blob. */
export function thumbnailBlob(canvas, quality = 0.8) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser can't encode WebP."))), "image/webp", quality)
  );
}
