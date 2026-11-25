# Contract: The Fluid simulation module

Folder `web-client/src/studio/visualizations/fluid/`: `index.js` (the module export and `create`), `gpu.js` (the GPU instance), `shaders.js` (GLSL ES 1.00 sources as strings), `kernel.js` (pure helpers, no DOM, no GL). Knob ranges and defaults are in `data-model.md` → FluidSettings. Algorithm, formats and resolutions are in `research.md` → R3.

## Catalog entry (`catalog.js`)

```js
e("fluid-simulation", "Fluid simulation", "simulation", "≋",
  "Drag to stir colored ink through a fluid. A simplified Navier–Stokes simulation that runs on your graphics card.",
  () => import("./visualizations/fluid/index.js"))
```

The summary contains "fluid" and "Navier–Stokes", so the catalog search finds it (FR-001). The card picture is `public/thumbs/fluid-simulation.webp` (research R9). The entry is added at the end of the "Simulation and emergence" group.

## Module export

```js
export default {
  id: "fluid-simulation", name: "Fluid simulation",
  howItWorks: "…",            // see below
  animated: true, random: true, interactive: true, multiTouch: true,
  stepsPerFrame: 1,
  knobs: [ /* data-model.md FluidSettings, quality last, in group "Performance" */ ],
  presets: [ lingeringInk, quickSplashes, turbulent ],   // research R13; "Animated sweep" is added by withSweep
  actions: [ { id: "burst", label: "Burst", title: "Add several splashes (B)", key: "b" },
             { id: "clear", label: "Clear", title: "Empty the picture (C)", key: "c" } ],
  sweep: { periodMs: 40000, targets: [
    { key: "curl", mode: "wave", min: 5, max: 45 },
    { key: "velocityDissipation", mode: "wave", min: 0.05, max: 2, phase: 0.25 } ] },
  thumbnail: { presetId: "turbulent", steps: 240 },
  quality: { levers: { low: { sim: 64, dye: 256 }, medium: { sim: 128, dye: 512 }, high: { sim: 256, dye: 1024 } } },
  create(canvas, config, ctx) { … },
};
```

## `create`

1. `gpu = openGpu(canvas, { need: ["halfFloatTarget"], ctx })`.
2. If `null`: `ctx.showMessage({ text: UNSUPPORTED_TEXT })` and return the no-op instance (module-additions.md). `UNSUPPORTED_TEXT` is the sentence in research R12. Nothing else runs.
3. Otherwise build the targets for the effective quality level and the canvas aspect, draw the opening scene (below), and return the GPU instance.

## One step (`step()`), in this order

| # | Pass | Skipped when |
|---|---|---|
| 1 | Apply queued splats (pointer, Burst, opening) | none queued |
| 2 | Curl | `curl` is 0 |
| 3 | Vorticity confinement | `curl` is 0 |
| 4 | Divergence | never |
| 5 | Scale pressure by `pressure` | never |
| 6 | Jacobi pressure solve, `pressureIterations` draws | never |
| 7 | Subtract the pressure gradient from the velocity | never |
| 8 | Advect velocity, divided by `1 + velocityDissipation × dt` | never |
| 9 | Advect dye, divided by `1 + densityDissipation × dt` | never |

`dt` is the constant 1/60. `render()` runs the display pass only. Both are safe when the context is lost (they do nothing).

## Opening scene, Burst and Clear

- **Opening scene** (`create`, `reset`): `kernel.initialSplats(createRng(config.seed), 5)`: five splats at seed-chosen positions, directions and palette colors, queued and applied during the first steps. Positions are on distinct cells of a 4 × 2 grid (jittered inside the cell) so no two splashes overlap, and each splash carries `gain` 8 so the first picture is bright. It uses a **fresh generator built from the seed**, not `ctx.rng`, because `reset()` does not recreate the context and `ctx.rng` would have moved on. So Reset, and opening twice with the same seed, always give the same scene (FR-005, FR-007).
- **Burst** (`action("burst")`, key `B`): `kernel.burstSplats(ctx.rng, 7)`: seven new splats, each with its own position, direction and color, from the running `ctx.rng`, so a given seed gives the same sequence of Bursts. If paused, applies them and renders one frame.
- **Clear** (`action("clear")`, key `C`): clears velocity, dye, pressure, divergence and curl. Settings do not change.
- **Reset** (the shell's `R` and Restart button): `reset()` → clear, then the opening scene again.

## Pointer input (`multiTouch`)

| Event | Behavior |
|---|---|
| `down` | Begin a stroke for `pointerId`: color from `strokeCount`, then `strokeCount += 1`. Remember the point. |
| `move` (with a stroke) | Queue a splat at the point with `dx, dy` from the last point. Points outside the picture are clipped; a stroke that leaves resumes cleanly if the pointer returns while still pressed. |
| `up`, `leave` | End the stroke for `pointerId`. |
| `up` with no `move` since `down` | One small splat (radius × 0.6) with a small fixed upward push (a tap). |
| `key` `b`, `c` | Compared case-insensitively (Shift gives `B`). Return `true` after doing the action. Other keys: return `false`, so the shell's Space, `.` and `R` still work. |

Move events without a pressed button make no splats. Pointers beyond the shell's limit of ten never arrive.

## `howItWorks` (written fresh; must cover FR-012)

In plain words, no code, about 150 words. It must say, in this order: the picture is a fluid with colored ink; the push from a drag; the ink and the motion are carried along by the flow; pressure keeps the fluid from piling up or leaving gaps and "Pressure iterations" trades evenness for work; Curl keeps small swirls alive; **velocity dissipation slows the motion over time and density dissipation fades the ink**, with the effect of low values (lingering trails) and high values (quick bursts that vanish); that Burst adds splashes and Clear empties the picture; that Quality changes the detail.

## Stats

`ctx.reportStats({ steps })` once per `render()`; it goes to the stats store, so it redraws only the readout (research R8).

## Resize and quality

- `resize(w, h)`: set the viewport; if the aspect changed, rebuild the grids with `resize(..., { keep: true })` (FR-019).
- `setQuality(level)`: rebuild the grids at the level's `sim` and `dye` sizes with `keep: true`; no blank frame (edge case "Quality changed mid-run").

## Tests that cover it

| Test | Project | Proves |
|---|---|---|
| `kernel.test.js`: `simSize`, `initialSplats`, `burstSplats`, `dissipationDivisor`, `levelValues` | jsdom | Same seed gives the same splats; sizes by level; divisor formula |
| `modules.contract.test.js` | jsdom | The module and its no-op instance meet the contract; the presets validate; the sweep and thumbnail recipes are valid |
| `fluid.module.test.js` | jsdom | With no WebGL the message is shown, settings and the catalog keep working |
| `fluid.gpu.test.js` | GPU | Stability at the extremes (SC-006); dissipation ratios (SC-005); Curl and Pressure iterations effects; Burst, Clear, Reset; resize keeps content; quality change keeps content; lost-context recovery; open and leave 30 times (SC-007); capture is not blank |
