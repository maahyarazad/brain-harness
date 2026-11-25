// Quality: one ordinary knob, added to every module that declares what Low, Medium and High
// mean for it (specs/005-.../contracts/quality.md).
//
//   quality: {
//     scale:  { low: 0.5, medium: 1, high: 1 },          // optional: drawing-resolution factor the shell applies
//     levers: { low: {…}, medium: {…}, high: {…} },       // optional: module-specific values per level
//   }
//
// Because it is just a knob value, it travels through share links, saved items and exports with no
// format change, and an item made before this existed opens with the knob's default
// (validateConfig fills a missing knob from its default; share links store only differences).
// Animated modules also get "auto": the shell's governor (qualityGovernor.js) picks Low or Medium.
// Auto never goes above Medium, so a device that keeps up shows exactly today's picture (FR-021).

export const QUALITY_LEVELS = ["low", "medium", "high"];
export const QUALITY_KEY = "quality";

const WRAPPED = Symbol("withQuality");
const LABELS = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };
const options = (values) => values.map((value) => ({ value, label: LABELS[value] }));

/**
 * Adds the `quality` knob to a module that declares `quality`. Idempotent. Modules without a
 * descriptor are returned as they are: nothing to trade, so no control that does nothing (FR-020).
 */
export function withQuality(module) {
  if (!module?.quality || module[WRAPPED]) return module;
  if (module.knobs.some((k) => k.key === QUALITY_KEY)) return module;
  const animated = Boolean(module.animated);
  const knob = {
    key: QUALITY_KEY,
    label: "Quality",
    type: "choice",
    group: "Performance",
    default: animated ? "auto" : "medium",
    options: options(animated ? ["auto", ...QUALITY_LEVELS] : QUALITY_LEVELS),
  };
  return { ...module, knobs: [...module.knobs, knob], [WRAPPED]: true };
}

/** Does this module have an Auto choice (animated and it declared quality)? */
export const hasAuto = (module) => Boolean(module?.animated && module?.quality);

/**
 * The level to run at: the chosen one, or for "auto" (or anything unknown) the governor's level,
 * capped at medium.
 */
export function effectiveLevel(values, governorLevel = "medium") {
  const chosen = values?.[QUALITY_KEY];
  if (QUALITY_LEVELS.includes(chosen)) return chosen;
  return governorLevel === "low" ? "low" : "medium";
}

/** The drawing-resolution factor for a level, in (0, 1]; 1 when the module declares none. */
export function scaleFor(module, level) {
  const s = module?.quality?.scale?.[level];
  return Number.isFinite(s) && s > 0 && s <= 1 ? s : 1;
}

/** The module-specific values for a level, or null. */
export const leversFor = (module, level) => module?.quality?.levers?.[level] ?? null;
