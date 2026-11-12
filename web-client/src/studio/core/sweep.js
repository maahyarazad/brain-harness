// Animated sweeps (specs/004-studio-home-sweep/contracts/sweep.md).
//
// A module declares `sweep: { kind, periodMs, targets, ... }`. withSweep() adds two
// ordinary knobs (`sweep`, `sweepSpeed`) and an "Animated sweep" preset, so sweep
// state travels through share links, saves and exports like any other setting.
// createSweepDriver() moves the swept values a little on every animation frame.
import { snapToStep } from "./knobs.js";

export const SWEEP_PRESET_ID = "sweep";
export const DEFAULT_HOLD_MS = 1500;
const MAX_DT_MS = 100;
const WRAPPED = Symbol("withSweep");

export const SWEEP_KNOBS = [
  { key: "sweep", label: "Animated sweep", type: "toggle", default: false },
  {
    key: "sweepSpeed", label: "Sweep speed", type: "range", min: 0.1, max: 4, step: 0.1, default: 1,
    when: (v) => v.sweep,
  },
];

/** Adds the sweep knobs and preset to a module that declares `sweep`. Idempotent. */
export function withSweep(module) {
  if (!module?.sweep || module[WRAPPED]) return module;
  const presets = module.presets ?? [];
  const hasPreset = presets.some((p) => p.id === SWEEP_PRESET_ID);
  const { presetValues = {}, presetView } = module.sweep;
  const preset = {
    id: SWEEP_PRESET_ID,
    name: "Animated sweep",
    values: { ...presetValues, sweep: true },
    ...(presetView ? { view: { ...presetView } } : {}),
  };
  return {
    ...module,
    knobs: [...module.knobs, ...SWEEP_KNOBS],
    presets: hasPreset ? presets : [...presets, preset],
    [WRAPPED]: true,
  };
}

/** Knob keys a sweep moves; "view" for a zoom target. */
export function sweptKeys(module) {
  return (module?.sweep?.targets ?? []).map((t) => (t.view ? "view" : t.key));
}

const frac = (x) => x - Math.floor(x);
const isZoom = (target) => target.view === "zoom";

/** Position in [0, 1] along the target's range for phase t. */
function unitAt(target, t) {
  const p = frac(t + (target.phase ?? 0));
  if (target.mode === "wrap" || target.mode === "steps") return p;
  return (1 - Math.cos(2 * Math.PI * p)) / 2; // wave, log
}

/** The target's value at phase t, snapped to the knob's step and kept inside its limits. */
export function valueAt(target, t, knob) {
  if (target.mode === "steps") {
    const list = target.list;
    return list[Math.min(list.length - 1, Math.floor(frac(t + (target.phase ?? 0)) * list.length))];
  }
  const u = unitAt(target, t);
  const { min, max } = target;
  let v = target.mode === "log" ? Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min))) : min + u * (max - min);
  if (knob?.type === "range") {
    v = snapToStep(knob, v);
    v = Math.min(knob.max, Math.max(knob.min, v));
  }
  return v;
}

/**
 * The phase at which the target has `value`. For wave/log targets `rising`
 * picks the half of the cycle where the value is going up.
 */
export function phaseOf(target, value, rising = true) {
  const offset = target.phase ?? 0;
  if (target.mode === "steps") {
    const list = target.list;
    let i = list.indexOf(value);
    if (i < 0 && typeof value === "number") {
      let best = Infinity;
      list.forEach((x, k) => {
        if (typeof x === "number" && Math.abs(x - value) < best) {
          best = Math.abs(x - value);
          i = k;
        }
      });
    }
    return frac((Math.max(0, i) + 0.5) / list.length - offset);
  }
  const { min, max } = target;
  let u =
    target.mode === "log"
      ? (Math.log(Math.max(value, 1e-300)) - Math.log(min)) / (Math.log(max) - Math.log(min))
      : (value - min) / (max - min);
  u = Math.min(1, Math.max(0, u));
  if (target.mode === "wrap") return frac(Math.min(u, 1 - 1e-9) - offset);
  const half = Math.acos(1 - 2 * u) / (2 * Math.PI); // in [0, 0.5]: the rising half
  return frac((rising ? half : 1 - half) - offset);
}

/** True when phase t is on the rising half of a wave/log target. */
function isRising(target, t) {
  return frac(t + (target.phase ?? 0)) < 0.5;
}

function readTarget(cfg, target) {
  return isZoom(target) ? cfg.view?.zoom : cfg.values[target.key];
}

/**
 * Moves a module's swept settings over time.
 *
 * tick() is called once per animation frame while the sweep is on and playing.
 * It calls apply(values, changedKeys, viewPatch) at most once.
 */
export function createSweepDriver({
  module,
  getConfig,
  apply,
  isBusy = () => false,
  isDone = () => false,
  getPlaybackSpeed = () => 1,
  now = () => performance.now(),
}) {
  const decl = module.sweep;
  const targets = decl.targets;
  const kind = decl.kind ?? "continuous";
  const knobs = Object.fromEntries(module.knobs.map((k) => [k.key, k]));
  const holdMs = decl.holdMs ?? DEFAULT_HOLD_MS;
  const stepCount = Math.max(...targets.map((t) => (t.mode === "steps" ? t.list.length : 1)));

  let t = 0;
  let lastTick = null;
  let lastApplyAt = -Infinity;
  let doneSince = null;
  let lastWritten = new Map();

  /** Starts the phase from the first target's current value, so turning the sweep on doesn't jump. */
  function syncPhase(target = targets[0], rising = true) {
    const v = readTarget(getConfig(), target);
    if (v !== undefined && v !== null) t = phaseOf(target, v, rising);
  }

  function reset() {
    lastTick = null;
    doneSince = null;
    lastApplyAt = -Infinity;
    lastWritten = new Map();
    syncPhase();
  }
  reset();

  function write(at) {
    const cfg = getConfig();
    const values = {};
    const keys = [];
    let viewPatch = null;
    for (const target of targets) {
      const v = valueAt(target, t, knobs[target.key]);
      const key = isZoom(target) ? "view" : target.key;
      lastWritten.set(key, v);
      if (readTarget(cfg, target) === v) continue;
      if (isZoom(target)) viewPatch = { zoom: v };
      else values[target.key] = v;
      keys.push(key);
    }
    if (!keys.length) return;
    lastApplyAt = at;
    apply(values, keys, viewPatch);
  }

  function tick() {
    const at = now();
    const dt = lastTick === null ? 0 : Math.min(MAX_DT_MS, Math.max(0, at - lastTick));
    lastTick = at;
    const cfg = getConfig();

    // The user moved a swept setting (or zoomed): carry on from their value.
    for (const target of targets) {
      const key = isZoom(target) ? "view" : target.key;
      if (!lastWritten.has(key)) continue;
      const current = readTarget(cfg, target);
      if (current !== lastWritten.get(key)) {
        syncPhase(target, isRising(target, t));
        lastWritten = new Map();
        doneSince = null;
        break;
      }
    }

    if (isBusy()) return;
    const speed = getPlaybackSpeed() * (cfg.values.sweepSpeed ?? 1);

    if (kind === "run") {
      if (!isDone()) {
        doneSince = null;
        return;
      }
      if (doneSince === null) {
        doneSince = at;
        return;
      }
      if (at - doneSince < holdMs) return;
      doneSince = null;
      t = frac(t + 1 / stepCount);
      write(at);
      return;
    }

    t = frac(t + (dt * speed) / decl.periodMs);
    if (at - lastApplyAt < (decl.minIntervalMs ?? 0)) return;
    write(at);
  }

  return { tick, reset };
}
