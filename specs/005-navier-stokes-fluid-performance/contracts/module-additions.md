# Contract: Additions to the Visualization Module contract

This extends `specs/003-visualization-studio/contracts/visualization-module.md` (and `specs/004-studio-home-sweep/contracts/sweep.md`). Everything there still holds. **All additions are optional**: a module that uses none of them behaves as before, so the 11 static modules and any module not yet moved keep working unchanged.

`modules.contract.test.js` checks every catalog entry against these rules in addition to the old ones.

## Module export: new optional fields

```js
export default {
  // ...existing fields...
  multiTouch: true,                       // interactive modules: each pointer is its own stroke (no pinch)
  actions: [                              // extra buttons beside the playback bar
    { id: "burst", label: "Burst", title: "Add several splashes (B)", key: "b" },
    { id: "clear", label: "Clear", title: "Empty the picture (C)",    key: "c" },
  ],
  quality: {                              // see contracts/quality.md
    scale:  { low: 0.5, medium: 1, high: 1 },
    levers: { low: {}, medium: {}, high: {} },
  },
};
```

| Field | Rules |
|---|---|
| `multiTouch` | Requires `interactive: true`. The shell then sends every pointer's `down`, `move` and `up` with `pointerId` set, up to 10 pointers at once, and never sends `pinch` or `cancelDrag`. Extra pointers beyond 10 are ignored. A module without `defaultView` is unaffected by the shell's wheel and gesture handling. |
| `actions` | 1–4 entries. `id` is unique within the module. Each is shown as a button with `label` and `title`, after the playback bar, reachable by keyboard and touch. `key` (optional, a single character) is passed to the module as a `key` pointer event; the module returns `true` to mark it handled. `key` must not be `" "`, `"."` or `"r"`/`"R"` (the shell's own). Requires `animated: true` or `interactive: true`. |
| `quality` | Optional. See `contracts/quality.md`. Adds a `quality` knob through `withQuality()` in `catalog.js`. |

## Instance: new optional methods

| Method | Contract |
|---|---|
| `action(id)` | Required if `actions` is declared. Performs the action. Must be safe while paused (a Burst while paused adds the splashes and renders one frame). |
| `setQuality(level, { automatic })` | `level` is `"low"`, `"medium"` or `"high"`. Apply the module's levers without recreating the instance and without a blank frame. `automatic` is true when the governor, not the visitor, changed it. **Required for an animated module that declares `quality.levers`** (Auto changes the level without calling `update`). A static module may omit it: its levers are read when `update(config, ["quality"])` redraws it. |
| `isIdle()` | Returns true when nothing will change until the next input (a finished sort or maze, a cellular automaton with a full screen). Cheap; called once per frame. While true, the loop stops requesting frames and starts again on `update`, `pointer`, `action`, `reset` or `resize` (FR-024). |

### Instance: new optional properties

| Property | Contract |
|---|---|
| `unsupported: true` | The module could not start (the fluid without graphics acceleration). It has already called `ctx.showMessage`. The shell then hides the Save and Share buttons, the playback bar, the actions, the presets and the settings, and keeps the explanation and the back control. The instance still implements every required method as a no-op. |
| `path: "gpu" \| "processor"` | Which path the instance took. Read by the bench page for the "Path" column; absent means `"processor"`. |
| `__debug` | Test-only hooks, present only when `import.meta.env.MODE !== "production"`: `readState()` returns the instance's cell, field or buffer state as a typed array; `finish()` waits for queued GPU work. |

For `multiTouch` modules the `pointer(event)` event carries `pointerId`, and `up` also arrives for `leave` of that pointer. The `cancelDrag` flag is never set.

## ctx: new members

| Member | Purpose |
|---|---|
| `showMessage({ text, actionLabel?, onAction? })` | Shows a plain-language message over the canvas with `role="status"`; with `actionLabel`, a button that calls `onAction`. Used for "needs graphics acceleration" and "restart after a lost context" (FR-016, FR-017). The back control and the other page parts stay usable. |
| `clearMessage()` | Removes it. |
| `requestRestart({ forceProcessor })` | Asks the shell to mount a new canvas and call `create` again. With `forceProcessor: true`, `openGpu` returns `null` for this instance, so a moved module takes its processor path (FR-034). |
| `gpuForced` | `"off"` when the processor path is forced (by `?gpu=off` or `requestRestart`), else `"auto"`. Read by `openGpu`; modules do not use it directly. |

`ctx.reportStats` now writes to a store, not to Viewer state (research R8). Behavior for modules is unchanged.

## Shell duties (new)

1. **Canvas mount.** The `<canvas>` element has a `key` the shell can change, so `requestRestart` gets a fresh canvas.
2. **Quality.** `withQuality` adds the knob. The shell computes the effective level (the chosen level, or the governor's for `auto`), multiplies `quality.scale[level]` into the canvas pixel size (calling `resize`), and calls `setQuality` when the level changes while running. For modules that did not declare `levers`, a change goes through `update(config, ["quality"])`.
3. **Governor.** Created for animated modules whose `quality` knob is `auto`; fed from the loop's per-frame callback with the frame timestamp; reports notices through the same non-blocking notice area as other notices.
4. **Idle loop.** The loop stops scheduling frames while `isIdle()` is true, and the shell wakes it on the events above. `Play`/`Pause` state shown to the visitor does not change.
5. **Messages.** `showMessage` overlay on the canvas wrap (`role="status"`, with the optional action button); the settings, playback, actions, presets, Save and Share are hidden for an instance with `unsupported: true`. A message's action may share a label with a playback button ("Restart"); the overlay's button is inside the status region.

## Guarantees modules give the shell (new)

- **Same shape either way.** The processor path and the GPU path of a moved module expose the same instance methods. A module that cannot start at all (the fluid without a GPU) returns an instance whose `update`, `resize`, `step`, `render`, `reset`, `action`, `pointer` and `destroy` are no-ops, so the shell and the contract test never branch on it.
- **Release.** `destroy()` deletes every GPU object and releases the context (`contracts/gpu-toolkit.md`).
- **No wall-clock in the simulation.** `step()` advances exactly one fixed step; it never reads the time (spec edge case "Tab hidden").
- **Seeds.** Everything random in a GPU instance (starting scene, Burst) is drawn on the CPU, from `ctx.rng` or from `createRng(config.seed)`, never from the shader or `Math.random`. A scene that must come back identically on `reset()` uses a fresh `createRng(config.seed)`, because `reset()` does not recreate `ctx` and `ctx.rng` keeps advancing.
- **Quality at Medium is today.** `setQuality("medium")` returns a moved module to exactly its old behavior (FR-021).
