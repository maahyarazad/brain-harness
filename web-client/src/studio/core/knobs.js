// Validation of knob values and whole configurations (see data-model.md).
import { PALETTE_NAMES } from "./palettes.js";
import { isValidSeed } from "./rng.js";

function decimals(step) {
  const s = String(step);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

export function snapToStep(knob, v) {
  const step = knob.step ?? 1;
  const snapped = knob.min + Math.round((v - knob.min) / step) * step;
  return Number(snapped.toFixed(Math.min(12, decimals(step) + decimals(knob.min))));
}

/** Checks one text value. Returns null when valid, else an error message. */
export function textError(knob, text) {
  if (typeof text !== "string") return "Must be text";
  if (knob.maxLength && text.length > knob.maxLength) return `At most ${knob.maxLength} characters`;
  if (knob.pattern && !knob.pattern.test(text)) return knob.patternMessage ?? "Not a valid value";
  if (knob.parse) {
    const r = knob.parse(text);
    if (!r.ok) return r.error;
  }
  return null;
}

/** → { value, replaced: boolean, note? } */
export function validateValue(knob, value) {
  switch (knob.type) {
    case "range": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return { value: knob.default, replaced: true };
      if (n < knob.min) return { value: knob.min, replaced: true, note: `Min is ${knob.min}` };
      if (n > knob.max) return { value: knob.max, replaced: true, note: `Max is ${knob.max}` };
      const snapped = snapToStep(knob, n);
      const clamped = Math.min(knob.max, Math.max(knob.min, snapped));
      return { value: clamped, replaced: false };
    }
    case "choice":
      return knob.options.some((o) => o.value === value)
        ? { value, replaced: false }
        : { value: knob.default, replaced: true };
    case "toggle":
      return typeof value === "boolean"
        ? { value, replaced: false }
        : { value: Boolean(value), replaced: value !== 0 && value !== 1 && value !== undefined };
    case "text":
      return textError(knob, value) === null
        ? { value, replaced: false }
        : { value: knob.default, replaced: true };
    case "palette":
      return PALETTE_NAMES.includes(value) ? { value, replaced: false } : { value: knob.default, replaced: true };
    default:
      return { value: knob.default, replaced: true };
  }
}

export function defaultValues(module) {
  return Object.fromEntries(module.knobs.map((k) => [k.key, k.default]));
}

export function defaultsOf(module) {
  return {
    vizId: module.id,
    values: defaultValues(module),
    seed: module.random ? 1 : 0,
    view: module.defaultView ? { ...module.defaultView } : null,
    input: null,
    presetId: null,
  };
}

/**
 * Validates a whole configuration. Missing values take defaults silently;
 * invalid ones are replaced and reported as { key, given, used }.
 */
export function validateConfig(module, config = {}) {
  const replaced = [];
  const given = config.values ?? {};
  const values = {};
  for (const knob of module.knobs) {
    if (!(knob.key in given)) {
      values[knob.key] = knob.default;
      continue;
    }
    const r = validateValue(knob, given[knob.key]);
    values[knob.key] = r.value;
    if (r.replaced) replaced.push({ key: knob.key, given: given[knob.key], used: r.value });
  }
  for (const key of Object.keys(given)) {
    if (!module.knobs.some((k) => k.key === key)) replaced.push({ key, given: given[key], used: undefined });
  }

  let seed = module.random ? 1 : 0;
  if (config.seed !== undefined && config.seed !== null) {
    if (isValidSeed(config.seed)) seed = config.seed;
    else replaced.push({ key: "seed", given: config.seed, used: seed });
  }

  let view = module.defaultView ? { ...module.defaultView } : null;
  if (config.view && module.validateView) {
    const r = module.validateView(config.view);
    view = r.value;
    replaced.push(...(r.replaced ?? []));
  }

  let input = null;
  if (config.input && module.validateInput) {
    const r = module.validateInput(config.input);
    input = r.value;
    replaced.push(...(r.replaced ?? []));
  }

  const presetId =
    config.presetId && (module.presets ?? []).some((p) => p.id === config.presetId) ? config.presetId : null;

  return { config: { vizId: module.id, values, seed, view, input, presetId }, replaced };
}

/** Applies a preset: its values on top of defaults, plus its input if it has one. */
export function applyPreset(module, presetId) {
  const preset = (module.presets ?? []).find((p) => p.id === presetId);
  if (!preset) return null;
  const values = { ...defaultValues(module), ...preset.values };
  return { values, input: preset.input ?? null, view: preset.view ? { ...preset.view } : null, presetId };
}

export function diffFromDefaults(module, values) {
  const out = {};
  for (const knob of module.knobs) {
    if (values[knob.key] !== knob.default) out[knob.key] = values[knob.key];
  }
  return out;
}

export function describeReplaced(replaced) {
  if (!replaced.length) return null;
  const parts = replaced.map((r) =>
    r.used === undefined ? `"${r.key}" was ignored` : `"${r.key}" was reset to ${JSON.stringify(r.used)}`
  );
  return `Some settings were invalid: ${parts.join(", ")}.`;
}
