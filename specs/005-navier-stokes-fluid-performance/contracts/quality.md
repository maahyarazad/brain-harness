# Contract: Quality control and Auto adaptation

Implements FR-020 to FR-024 (research R6). Files: `core/quality.js` (knob, descriptor, effective level), `core/qualityGovernor.js` (Auto), changes to `catalog.js` (`withQuality`), `core/loop.js` (frame timestamp, idle) and `Viewer.jsx`.

## The knob (added by `withQuality`)

```js
{ key: "quality", label: "Quality", type: "choice", group: "Performance",
  default: module.animated ? "auto" : "medium",
  options: module.animated
    ? [{ value: "auto", label: "Auto" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]
    : [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] }
```

- Added to every module that declares `quality`, after the module's own knobs and the sweep knobs. `withQuality` is idempotent, like `withSweep`, and is applied in `catalog.js`'s `e()` so the viewer, file import and share links all validate against one knob list.
- It is an ordinary knob value. Share links store it only when it differs from the default; old links, saved items and exports that lack it decode to the default (Auto for animated, Medium for static). No format version changes.
- `isSweepKey` does not include it, and it is never a sweep target.
- A preset does not set it, and applying a preset keeps the visitor's current quality. Today `applyPreset` rebuilds the values from the defaults, which would reset it, so the Viewer's preset handler copies the current `quality` into the new configuration. "Reset to defaults" does reset it.

## The descriptor

```js
quality: {
  scale:  { low: 0.5, medium: 1, high: 1 },     // optional; factors in (0, 1]
  levers: { low: {...}, medium: {...}, high: {...} },  // optional; module-specific
}
```

| Rule | Value |
|---|---|
| Effective level | the chosen level; for `auto`, the governor's level (`low` or `medium`) |
| `scale` | The shell multiplies `scale[level]` into the canvas pixel size after its own caps (`canvasSize()`), with a floor of 160 px per side, then calls `resize`. CSS size and pointer mapping are unchanged. |
| `levers` | Read by the module in `create` (initial level) and `setQuality` (later changes). The module treats `medium` as exactly today's behavior (FR-021). |
| Declaring it | Only modules that pass the 20% gate below keep their descriptor (FR-020). |

## The 20% gate

For each module, the bench page (`/studio/__bench`, research R10) measures cost per frame (animated) or time to a finished picture (static) at Low and at High with the candidate descriptor. If Low is not at least 20% cheaper than High, the descriptor is removed and the module shows no Quality control. The measurement and the decision are recorded in `measurements.md`.

**Final decisions (from the bench; see `measurements.md`).** The rule is the spec's 20% on either the real-GPU run or the weak-device stand-in, plus a noise floor of 1 ms of work per frame (animated) or 5 ms to a finished picture (static). The fluid keeps its Quality choice by requirement (FR-008).

| Module | Group | Kept? | Descriptor |
|---|---|---|---|
| Fluid simulation | animated | yes (FR-008) | `levers`: `sim` and `dye` grid sizes (research R3) |
| Mandelbrot set | static | yes | `scale` 0.5 / 1 / 1 |
| Julia set | static | yes | `scale` 0.5 / 1 / 1 |
| Chaos game | static | yes | `scale` 0.5 / 1 / 1 |
| Barnsley fern | static | yes | `scale` 0.5 / 1 / 1 |
| Diffusion-limited aggregation | static | yes | `levers.particles`: low 0.25, medium 1, high 1 (a multiplier of the Particles setting) |
| The other 18 existing visualizations | | **no** | none: Low was not at least 20% cheaper than High above the noise floor |

At Medium every lever equals today's value, so a static module at its default Medium draws exactly today's picture (FR-021, SC-011).

## The governor (`core/qualityGovernor.js`)

```js
createQualityGovernor({ onLevel, onNotice, start = "medium" })
  .frame(timestamp)   // call once per animation frame with the rAF timestamp
  .level()            // "low" | "medium"
  .reset()            // new instance, resume, or after a manual choice
```

- Pure: no timers, no DOM. Time comes only from the `timestamp` passed to `frame()`, so tests drive it with a fake clock. A gap of more than 1 s between frames is treated as a pause or hidden tab, not as slowness.
- Parameters and transitions: `data-model.md` → GovernorState. Starting values: 1 s windows; two windows slower than 36 ms to step down; ignore 1 s after a step; 8 s at 20 ms or faster and 20 s since the last step down to step up (never above Medium); 60 s step-up lock after a step up is followed by a step down within 10 s.
- `onLevel(level, { reason })` fires only on a change. The shell then applies `scale`, calls `setQuality(level, { automatic: true })` and shows the notice.
- Notices (non-blocking, the existing notice area):
  - down: "Lowered quality to keep this smooth."
  - up: "Back to full quality."
  - at Low and still slow, once per session: "This device is too slow to keep this smooth, even at the lowest quality."
- When the visitor picks Low, Medium or High, the governor is stopped and nothing adapts. Picking Auto again calls `reset()` and starts from Medium.
- No frames arrive while paused, hidden or in reduced-motion pause, so the governor does nothing then.

## Loop changes (`core/loop.js`)

- `tick(ts)` passes the rAF timestamp to `onFrame(ts)` (today `onFrame()` takes none; existing callers ignore extra arguments).
- `isIdle` option: `createLoop({ ..., isIdle })`. When it returns true after a tick, the loop does not request the next frame. `wake()` requests one if the loop is playing and none is pending. The shell calls `wake()` on `update`, `pointer`, `action`, `reset` and `resize` (module-additions.md, "Idle loop").
- Development only (`import.meta.env.DEV`): `?load=<ms>` makes each frame busy-wait that long, so Auto can be exercised on a fast machine. It is compiled out of production builds.
- Unit tests: `loop.test.js` gains idle and wake cases; `qualityGovernor.test.js` drives a fake clock through step-down, settle, step-up, anti-flicker and the Low-still-slow notice.

## Where it shows

`KnobPanel` shows the Quality choice in a "Performance" fieldset after the module's own settings. Label and options are identical in every module (Story 4 scenario 1). While a quality change is applied the picture is not cleared (edge case "Quality changed mid-run").
