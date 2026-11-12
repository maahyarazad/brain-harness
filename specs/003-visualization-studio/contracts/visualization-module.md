# Contract: Visualization Module

Every folder in `web-client/src/studio/visualizations/<name>/` has an `index.js` whose default export satisfies this contract. The studio shell talks to modules only through it. `modules.contract.test.js` checks every catalog entry against it.

## Export shape

```js
export default {
  id: "times-table",                // must equal the CatalogEntry id
  name: "Times-table circle",
  howItWorks: "Put N points on a circle …",   // shown next to the canvas (FR-006)
  animated: true,                   // shows the playback bar
  random: false,                    // shows the seed knob
  interactive: false,               // receives pointer events
  knobs: [ /* KnobDefinition[] — see data-model.md */ ],
  presets: [ /* Preset[] */ ],
  stepsPerFrame: 1,                 // optional; number or (values) → number: steps per frame at 1× speed
  defaultView: { cx: 0, cy: 0, zoom: 1 },        // optional; starting view for modules with pan/zoom/rotate
  validateView(view)   { /* → {value, replaced[]} */ },  // optional
  validateInput(input) { /* → {value, replaced[]} */ },  // optional
  create(canvas, config, ctx) { /* → Instance */ },
};
```

## `create(canvas, config, ctx)` → Instance

Called after the canvas is in the page and sized. `config` is already validated.

`ctx` gives the module:

| Member | Purpose |
|---|---|
| `rng` | Seeded PRNG `() → [0,1)` built from `config.seed`. Modules MUST NOT use `Math.random`. |
| `palette(name)` | 256-entry color lookup |
| `runKernel(name, args, {onProgress, transfer})` | Runs a pure kernel in a Worker (in-thread in tests); returns a cancellable promise |
| `progressive(task)` | Runs a chunked main-thread task with progress and cancellation |
| `reportProgress(fraction)` | Shows progress for long computations |
| `reportNotice(text)` | Non-blocking message, e.g. "Depth capped at 7", "Zoom limit reached" |
| `reportStats(obj)` | Live counters, e.g. `{comparisons, swaps}`, `{steps}`, `{pathLength}` |
| `setView(view)` / `setInput(input)` | Module tells the shell the user panned, zoomed, or drew, so it can be saved and shared |
| `setValues(partial)` | Module changed knob values itself (e.g. dragging a pendulum bob sets its start angles); the knob panel shows them |
| `openVisualization(vizId, partialConfig)` | Open another visualization with some settings (Mandelbrot Shift+click → Julia set for that c) |
| `color(palette, t, alpha?)` | CSS color from a palette at t ∈ [0, 1] |
| `idle()` | Resolves when no kernel or progressive task is pending (used by tests) |
| `dpr` | Device pixel ratio in use |

The Instance:

| Method | Required | Contract |
|---|---|---|
| `update(config, changedKeys)` | yes | Apply new settings. May redraw, restart, or adjust live (e.g. boids weights apply without restarting). Must cancel any computation started for the previous config. |
| `step()` | if `animated` | Advance exactly one simulation step (fixed timestep). Called by the shell's loop k times per frame based on speed, and once for "Step". |
| `render()` | if `animated` | Draw the current state. Called once per animation frame. |
| `reset()` | if `animated` | Return to the initial state for the current config and seed. |
| `resize(width, height)` | yes | Canvas size changed (device pixels). Redraw without losing settings or simulation state where possible. |
| `pointer(event)` | if `interactive` | Normalized `{type: "down"\|"move"\|"up"\|"leave"\|"dblclick"\|"wheel"\|"pinch"\|"key", x, y, button, shiftKey, ctrlKey, deltaY, scale, cancelDrag, key}` in canvas device pixels. `wheel`: `deltaY` is normalized to pixels by the shell (`deltaMode` 1 → ×16, 2 → ×canvas height); `ctrlKey` is true for a trackpad pinch in Chrome/Firefox. `pinch`: `scale` is the ratio since the previous pinch event (> 1 zooms in) around `x`,`y` = the midpoint. An `up` with `cancelDrag: true` means a second finger went down: drop any drag without applying it. Return `true` from a `key` event to mark it handled (the shell then skips its own shortcuts). |
| `destroy()` | yes | Stop everything: cancel kernels, terminate workers, release buffers. The shell will not call anything after this. |

## Guarantees the shell gives modules

- `create` is called once per open; `destroy` is always called before the canvas is reused or removed.
- `update` is never called with an invalid config.
- `step`/`render` are never called while paused (except one `step` + `render` for "Step") or while the tab is hidden.
- Pointer events arrive only for `interactive` modules and only while the canvas has focus or the pointer is over it.

## Guarantees modules give the shell

- **Determinism**: same `config` (including seed, view, input) → same output. Static modules that redraw rebuild their random generator from `config.seed` on every redraw, so repeated redraws match. For animated modules, same output after the same number of `step()` calls.
- **Responsiveness**: no synchronous work longer than 50 ms in `create`, `update`, `step`, `render`, or `resize`; anything longer goes through `runKernel` or `progressive`.
- **Defaults**: `create(canvas, defaultsOf(module), ctx)` shows a recognizable picture (SC-001).
- **Presets**: every preset's values pass validation.

## Pure kernels

Each module keeps its math in `kernel.js` as plain functions with no DOM access, e.g. `collatzPath(n)`, `recaman(terms)`, `pascalModRows(rows, n)`, `elementaryStep(row, rule)`, `expandLSystem(axiom, rules, depth, limit)`, `sortSteps(algorithm, array)`, `generateMaze(kind, w, h, rng)`, `solveMaze(kind, grid, start, end, heuristic)`. Kernels that run in a Worker are registered by name in `workers/kernel.worker.js`. Kernels are what the unit tests target.
