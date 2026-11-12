# Contract: Sweep (additions to the Visualization Module contract)

This extends `specs/003-visualization-studio/contracts/visualization-module.md`. Everything there still holds.

## Module export: optional `sweep`

```js
export default {
  // ...existing fields...
  sweep: {
    kind: "continuous",              // or "run"
    periodMs: 40000,                 // continuous: one full cycle at 1× sweep speed
    minIntervalMs: 0,                // optional: throttle applied changes
    holdMs: 1500,                    // run: keep a finished run on screen this long
    targets: [
      { key: "cRe", mode: "wave", min: -0.8, max: 0.4 },
      { key: "cIm", mode: "wave", min: -0.6, max: 0.6, phase: 0.25 },
    ],
    presetValues: { iterations: 600 }, // optional extra values for the generated preset
    presetView: { cx: -0.743643887, cy: 0.131825904, zoom: 1 }, // optional
  },
};
```

Field rules are in `data-model.md` → SweepDeclaration and SweepTarget.

Modules that already ship their own sweep preset (id `sweep`, today only Times-table) may omit `sweep`. The shell then adds nothing.

## Instance: optional `isDone()`

```js
isDone() // → boolean: the current run has finished and the picture is complete
```

It is required when `sweep.kind === "run"`. It must be cheap; it is called once per frame. It must become false again after `update()` restarts the run.

## Instance: optional `isBusy()`

`isBusy() → boolean`: true while a redraw started by `update` hasn't produced its final picture, including a scheduled pass that hasn't started yet. Required for modules whose redraw can take longer than one frame. It turns false once the final picture is drawn, and after the work is cancelled or the instance destroyed. The driver applies nothing while it is true.

## Instance: `update(config, changedKeys, meta)` while sweeping

The sweep driver calls `update` like a knob change would, with `changedKeys` listing only the swept keys (or `["view"]` for a zoom target) and `meta = { sweep: true }`. Modules MUST:

- not reseed their random generator on these updates (the picture changes only because of the swept setting);
- not clear the canvas to a blank frame before the new picture is ready (FR-012). Drawing the old picture until the new one is complete is fine;
- implement `isBusy()` for work that takes longer than one frame (see above).

User pan and zoom during a zoom sweep still go through `ctx.setView`; the driver reads the result from the config and continues from there. It patches only `zoom`, never the pan centre.

## Shell responsibilities

| Responsibility | Where |
|---|---|
| Append `sweep` / `sweepSpeed` knobs and the "Animated sweep" preset | `core/sweep.js` → `withSweep(module)`, applied in the catalog loader (`catalog.js`) |
| Never call `step`/`render` per frame for still modules; their loop only drives the sweep | `Viewer.jsx` |
| Mark the swept knobs ("⟳ sweeping", `aria-describedby`) and a zoom sweep (badge on the canvas) | `KnobPanel.jsx`, `Viewer.jsx` |
| Create the play loop for still modules that have `sweep` | `Viewer.jsx` |
| Show the playback bar while `values.sweep` is on | `Viewer.jsx` |
| Tick the driver once per frame while playing and `values.sweep` | `Viewer.jsx` + `createSweepDriver` |
| Skip ticks while `instance.isBusy()` is true | driver |
| Offer "Record video" while sweeping | `Viewer.jsx` → `ShareMenu recordable` |
| Accept an optional `view` on presets | `core/knobs.js` `applyPreset`, `Viewer.onPreset` |

## Persistence

No format changes. `sweep` and `sweepSpeed` are knob values, so they travel in:
- share links (`v` diff, only when not default)
- saved records
- export files (`formatVersion` stays 1)

Payloads made before this feature open with the sweep off.

## Contract tests (`modules.contract.test.js` additions)

1. Every catalog entry, after `withSweep`, has a preset with id `sweep` named "Animated sweep".
2. Every `sweep.targets[].key` names an existing knob. Its type matches its mode (`steps` for choice/text). `min`/`max`/`list` values validate against the knob.
3. `kind: "run"` modules return a boolean from `instance.isDone()`.
4. For each module with `sweep`: create with the sweep preset, then run 200 driver ticks with fake time.
   - It never throws.
   - Every `update` call's `changedKeys` is a subset of the swept keys (or `["view"]`).
   - All written values pass `validateValue`.
