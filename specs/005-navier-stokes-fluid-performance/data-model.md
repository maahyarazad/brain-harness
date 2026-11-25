# Data Model: Fluid Simulation, Performance Layer, Leaner Interface

The feature adds **no stored entities and no format versions**. The only new stored value is the `quality` knob, an ordinary entry in `Configuration.values` (see `specs/003-visualization-studio/data-model.md`). Share links store only differences from the defaults and fill the rest from the knobs' defaults when decoding, so an old link, saved item or export that lacks `quality` opens with the module's default.

| Item | Where it lives | Stored? |
|---|---|---|
| `quality` | `Configuration.values.quality` | Yes, like any knob; share link, `localStorage`, `.vizstudio.json` unchanged in format |
| Fluid dye and motion | GPU textures | No (spec edge case "Saved and shared fluid") |
| Governor state, GPU capabilities, stats | memory | No |
| Measurements, render audit | `specs/005-.../measurements.md`, `render-audit.md` | Documents, not app data |

## FluidSettings (the new module's knobs)

All are live: a change applies on the next step and keeps the dye and motion (FR-010). Ranges are chosen so that every value in them is stable (FR-008, FR-011); SC-006 tests the extremes, and a range is narrowed if one proves unstable.

| Key | Label | Type | Min | Max | Step | Default | Meaning |
|---|---|---|---|---|---|---|---|
| `pressureIterations` | Pressure iterations | range | 4 | 60 | 1 | **20** | Jacobi passes per step. More: the fluid stays evenly spread, at more cost per frame. |
| `pressure` | Pressure | range | 0 | 1 | 0.01 | **0.80** | How much of the last step's pressure is kept as the starting guess. |
| `curl` | Curl | range | 0 | 50 | 1 | **30** | Strength of the vorticity confinement that keeps small swirls. |
| `splatRadius` | Splat radius | range | 0.05 | 1 | 0.01 | **0.25** | Size of a splash, as a percentage of the picture's height (widened on wide pictures so a splash stays round). |
| `splatForce` | Splat force | range | 500 | 12000 | 100 | **6000** | How hard a drag pushes. |
| `velocityDissipation` | Velocity dissipation | range | 0 | 4 | 0.01 | **0.20** | Rate at which the motion dies down. |
| `densityDissipation` | Density dissipation | range | **0.1** | 4 | 0.01 | **1.00** | Rate at which the dye fades. The lowest value still fades (about 10 s): at 0 the ink only ever builds up, and heavy stirring ends as a near-solid wash (measured: mean brightness 0.77, contrast 0.03 after 25 s). |
| `palette` | Palette | palette | | | | `magma` | Where splash colors come from (sampled between 0.25 and 0.95 of the palette). |
| `quality` | Quality | choice | | | | `auto` | `auto`, `low`, `medium`, `high` (group "Performance"). |
| seed | Seed | the shell's seed knob (`random: true`) | | | | 1 | Opening scene and Burst sequence. |

Module flags: `animated: true`, `random: true`, `interactive: true`, `multiTouch: true`, `stepsPerFrame: 1`. Actions: `burst` ("Burst", key `B`) and `clear` ("Clear", key `C`).

## FluidState (runtime only)

| Field | Notes |
|---|---|
| `velocity`, `dye`, `pressure` | Ping-pong texture pairs |
| `divergence`, `curl` | Single textures |
| `simSize`, `dyeSize` | `{ w, h }` from the quality level and the canvas aspect (research R3) |
| `strokeCount` | Counter used to pick the next stroke color |
| `pending` | Splats queued by pointer, Burst or the opening scene, applied at the next step |
| `steps` | Count of `step()` calls, reported as a stat |

Lifecycle: `Unsupported` (no GPU: message shown, nothing else runs) · `Running` ⇄ `Paused` (the shell's loop) · `ContextLost` → `Running` (restored, opening scene, notice) or → `Restarting` (new canvas) · `Destroyed` (every GPU object deleted, context released).

## Splat

| Field | Type | Rules |
|---|---|---|
| `x`, `y` | number | 0 to 1 across the picture; clipped at the edges |
| `dx`, `dy` | number | The drag's movement since the last event, as a fraction of the picture; 0 for a tap |
| `color` | `[r, g, b]` | From the palette; for a stroke, from `strokeCount` |
| `source` | `"pointer"` \| `"opening"` \| `"burst"` | Opening and Burst values come from `ctx.rng` only |
| `pointerId` | number \| absent | Pointer splats only; one active stroke per id |

A tap with no movement makes one small splat (radius × 0.6) with a small fixed upward push. It does not use `ctx.rng`, so a tap never changes the Burst sequence.

## QualityLevel and QualityDescriptor

`quality` takes one of `auto`, `low`, `medium`, `high`. `auto` exists only for animated modules (the 12 existing ones and the fluid). Static modules offer `low`, `medium` and `high` and default to `medium`.

The **effective level** is the chosen level, or for `auto` the governor's current level (`low`, `medium` or `high`, starting at `medium`).

```js
quality: {
  scale:  { low: 0.5, medium: 1, high: 1 },          // optional: drawing-resolution factor the shell applies
  levers: { low: {…}, medium: {…}, high: {…} },      // optional: module-specific values per level
}
```

Rules:
- A module is shown the control only if it declares a descriptor, and keeps it only if the bench measurements show Low costing at least 20% less than High (FR-020).
- At `medium`, a module behaves exactly as it does today (FR-021).
- `scale` factors are in (0, 1]; the shell multiplies them into the canvas pixel size. The CSS size and the pointer mapping do not change.

## GpuCapabilities (from the probe)

| Field | Type | Notes |
|---|---|---|
| `ok` | boolean | A context could be made and the module's `need` is met |
| `version` | `2` \| `1` | Preferred 2 |
| `floatTarget` | boolean | Renderable float32 textures |
| `halfFloatTarget` | boolean | Renderable half-float textures |
| `linearHalf` | boolean | Hardware linear filtering of half floats; if false, shaders filter by hand |
| `maxTexture` | number | Clamp for the dye grid |
| `renderer` | string | Recorded in measurements, never used for decisions |

`need` is a list of capability names (`"halfFloatTarget"`, `"floatTarget"`). The result of a probe is cached for the page.

## GovernorState

| Field | Initial | Meaning |
|---|---|---|
| `level` | `medium` | Current effective level for Auto: `low` or `medium` only. `high` is reachable only by choosing it |
| `windowStart`, `windowFrames` | now, 0 | The 1 s measuring window |
| `slowWindows` | 0 | Consecutive windows slower than 36 ms per frame |
| `fastSince` | null | Start of a run at 20 ms per frame or faster |
| `lastDownAt` | null | Time of the last step down |
| `lastUpAt` | null | Time of the last step up |
| `upLockedUntil` | 0 | Anti-flicker lock |
| `settleUntil` | 0 | Frames ignored while a new level settles |

Transitions (all times from an injected clock, so tests need no real waiting):

```text
medium ──2 slow windows──▶ low
high   ──2 slow windows──▶ medium
low    ──8 s fast, ≥20 s since last down──▶ medium
medium ──(no step up: Auto never goes above medium, so a capable device shows today's picture, FR-021)
any    ──step up then step down within 10 s──▶ upLockedUntil = now + 60 s
low    ──still slow──▶ notice "too slow even at the lowest quality" (once)
```

Pause, a hidden tab or reduced-motion start produce no frames, so the state does not change.

## PerformanceMeasurement (a row in `measurements.md`)

| Field | Notes |
|---|---|
| `visualization` | catalog id |
| `level` | `low`, `medium`, `high`, or `auto` |
| `path` | `processor` or `gpu` |
| `device` | `reference laptop`, `reference phone`, or a named other device |
| `meanMs`, `p95Ms`, `fps` | animated modules, over a fixed number of frames |
| `timeToPictureMs` | static modules |
| `phase` | `baseline` (before any change) or the story after which it was taken |
| `date`, `commit` | when and what was measured |

## RenderAuditEntry (a row in `render-audit.md`)

| Field | Notes |
|---|---|
| `file`, `component` | e.g. `studio/components/knobs/RangeKnob.jsx`, `RangeKnob` |
| `redrawsWhen` | What makes it redraw today (for example "Viewer stats update, 60 per second") |
| `decision` | `memo`, `memo + stable props`, `store subscription`, or `none` |
| `derivedValues` | Values memoized in it, if any |
| `handlers` | Handlers stabilized, if any |
| `reason` | Required when `decision` is `none` |
| `test` | The redraw-count test that covers it, if any |
