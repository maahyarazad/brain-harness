# Data Model: Studio Home Page, Animated Sweeps, Back from My Visualizations

The feature adds no stored entities and no format versions. Sweep state rides in the existing `Configuration.values` (see `specs/003-visualization-studio/data-model.md`).

## SweepDeclaration (module-level, static)

Declared by a visualization module as `sweep`. It is never stored; it tells the shell how to animate the module.

| Field | Type | Rules |
|---|---|---|
| `targets` | `SweepTarget[]` | 1–3 entries. Each `key` must name a module knob of type `range`, `choice` or `text`, or the target must be `{ view: "zoom" }` (modules with `defaultView` only). |
| `kind` | `"continuous"` \| `"run"` | `"run"` requires the instance to implement `isDone()`. Default `"continuous"`. |
| `periodMs` | number > 0 | Time for one full cycle at sweep speed 1×. Required for `continuous`. |
| `minIntervalMs` | number ≥ 0 | Smallest gap between two applied changes. Default 0 (every frame). |
| `holdMs` | number ≥ 0 | `run` only: how long a finished run stays on screen before the next value. Default 1500. |
| `presetValues` | object | Extra knob values for the generated "Animated sweep" preset (for example `iterations: 600`). |
| `presetView` | object \| absent | View for the generated preset (Mandelbrot seahorse). |

## SweepTarget

| Field | Type | Rules |
|---|---|---|
| `key` *or* `view: "zoom"` | string | See above |
| `mode` | `"wave"` \| `"wrap"` \| `"log"` \| `"steps"` | `steps` is required for `choice`/`text` knobs. `log` requires `min > 0`. |
| `min`, `max` | number | `min < max`, both inside the knob's limits. Not used by `steps`. |
| `list` | array | `steps` only: 2+ values, each valid for the knob |
| `phase` | number in [0,1) | Offset from the shared phase. Default 0. |

## Shell-added knobs (in `Configuration.values`)

| Key | Type | Default | Notes |
|---|---|---|---|
| `sweep` | toggle | `false` | "Animated sweep". Added only to modules with a `SweepDeclaration`. |
| `sweepSpeed` | range 0.1–4, step 0.1 | `1` | "Sweep speed". Visible only while `sweep` is on. |

Because these are ordinary knob values:
- **Share link**: the `v` diff includes them only when they differ from the defaults, so links stay short.
- **Saved records and export files**: they appear in `config.values`.
- **Old payloads**: they lack the keys, so `validateConfig` fills the defaults silently and the sweep is off (FR-016).

## Generated preset

`{ id: "sweep", name: "Animated sweep", values: { ...presetValues, sweep: true }, view?: presetView }`. It is appended to `presets` unless the module already has a preset with id `sweep` (the Times-table case). `Preset` gains an optional `view` field; `applyPreset` returns it and the Viewer uses it instead of `defaultView` when present.

## Sweep driver state (runtime only, per Viewer instance)

| Field | Meaning |
|---|---|
| `t` | Shared phase in [0,1). Advances by `dt × playbackSpeed × sweepSpeed / periodMs`. |
| `dir` | +1 / −1. Used when re-deriving the phase from a user-set value on a `wave`/`log` target. |
| `lastWritten` | Knob values, and for zoom targets `view.zoom`, that the driver last applied. A different value in the config (a knob drag, or a wheel/pinch/button zoom that came back through `onView`) re-derives the phase from that value, keeping the direction. |
| `lastApplyAt` | Time of the last applied change (for `minIntervalMs`) |
| `doneSince` | `run` only: when `isDone()` first became true, or null |

State transitions (run kind):

```text
running ──isDone() true──▶ holding(doneSince=now)
holding ──now−doneSince ≥ holdMs──▶ apply next step value ──▶ running
holding ──isDone() false (user restarted)──▶ running
any ──paused / sweep off / hidden──▶ frozen (no tick); resumes in the same state
```

## Routes (no new data; behaviour only)

| Path | Shows | History |
|---|---|---|
| `/` | studio catalog | replaced with `/studio` (query kept) |
| `/studio…` | unchanged | — |
| `/studio?view=mine` | My visualizations + "← Catalog" back link | link pushes `/studio` |
| `/playground` | Playground (lazy) | — |
| other | studio catalog | replaced with `/studio` |
