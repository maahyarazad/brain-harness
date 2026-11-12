# Adding a visualization to the studio

Each visualization in the Visualization Studio (`/studio`) is one folder under
`web-client/src/studio/visualizations/`. The full contract is in
[`specs/003-visualization-studio/contracts/visualization-module.md`](../specs/003-visualization-studio/contracts/visualization-module.md);
this is the short version.

## 1. Write the math in `kernel.js`

Plain functions, no DOM. This is what the tests check.

```js
// web-client/src/studio/visualizations/spiral/kernel.js
export function spiralPoints(count, turns) { /* … */ }
```

If it needs randomness, take an `rng` argument (a function returning [0, 1)); never call `Math.random`.

## 2. Describe the module in `index.js`

```js
import { spiralPoints } from "./kernel.js";
import { staticInstance, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "spiral",                 // must match the catalog entry; used in URLs and saved data
  name: "Spiral",
  howItWorks: "One or two plain-language paragraphs shown next to the canvas.",
  animated: false,              // true → also implement step(), render(), reset()
  random: false,                // true → the studio shows a seed box; use cfg.seed / ctx.rng
  interactive: false,           // true → implement pointer(event)
  knobs: [
    { key: "count", label: "Points", type: "range", min: 10, max: 5000, step: 1, default: 500 },
    paletteKnob("palette", "viridis"),
  ],
  presets: [{ id: "dense", name: "Dense", values: { count: 5000 } }],
  create(canvas, config, ctx) {
    return staticInstance(canvas, config, ctx, (g, cfg) => {
      clear(g, BG);
      // draw spiralPoints(cfg.values.count, …) with ctx.color(cfg.values.palette, t)
    });
  },
};
```

Knob types: `range`, `choice`, `toggle`, `text`, `palette` (see `data-model.md`). Mark knobs that
restart heavy work with `live: false` so they apply on release.

Long drawing work should be a generator (`function*`) that `yield`s progress; `staticInstance`
runs it in small slices so the page never freezes. Very heavy pure computations can run in a Web
Worker: register the kernel with `registerKernel(name, fn)`, add it to `workers/kernels.js`, and call
`ctx.runKernel(name, args)`.

### Interaction

Interactive modules (`interactive: true`) get `pointer(event)` calls with positions in canvas
device pixels. Besides `down`/`move`/`up`/`leave`/`dblclick`/`key`, the studio sends:

- `wheel` with `deltaY` already converted to pixels, and `ctrlKey: true` for a trackpad pinch in
  Chrome/Firefox (zoom faster then).
- `pinch` with `scale` (ratio since the previous pinch event, > 1 zooms in) around `x`,`y`, for
  two-finger touch and Safari trackpad pinch. Pinch events arrive in bursts: update the view on
  each one but redraw at most once per animation frame.
- `up` with `cancelDrag: true` when a second finger goes down: drop the drag without applying it.

For pan/zoom modules, never paint partial results onto the visible canvas: on each input, draw the
last finished picture scaled and shifted to the new view, and swap in each finished pass (a quick
low-resolution one, then full resolution once the input settles) with a single draw. Otherwise the
picture tears into old and new strips while the user zooms, and in recorded videos. See
`visualizations/mandelbrot/escapeView.js` and research.md
[R14](../specs/003-visualization-studio/research.md).

Declare `defaultView` (as Mandelbrot and Julia do) to get on-screen Zoom in, Zoom out and Reset
view buttons; + and − arrive as `key` events. Animated or interactive modules also get a Record
video button; nothing is needed in the module for that.

See [`contracts/visualization-module.md`](../specs/003-visualization-studio/contracts/visualization-module.md).

### Animated sweep

Every visualization has an "Animated sweep" preset that slowly moves one or two settings so the
picture morphs. Declare which ones with `sweep`; the studio adds the preset, an "Animated sweep"
toggle and a "Sweep speed" knob, and does the animating:

```js
sweep: {
  periodMs: 30000,                       // one full cycle at 1× sweep speed
  targets: [
    { key: "angle", mode: "wave", min: 15, max: 35 },   // eases back and forth
    { key: "spread", mode: "wave", min: 0, max: 1, phase: 0.25 },
  ],
  presetValues: { points: 150000 },      // optional extra values for the preset
},
```

- Modes: `wave` (continuous settings), `wrap` (angles that go round), `log` (zoom levels and
  log-scale counts), `steps` with a `list` (choices, rule numbers, text rules).
- `minIntervalMs` throttles changes for slow redraws. `{ view: "zoom" }` sweeps the zoom of a
  `defaultView` module, with `presetView` for where to zoom.
- For visualizations that finish a run (sorting, maze), use `kind: "run"` and implement
  `isDone()` on the instance: the next value is applied after each run ends and has been on
  screen for `holdMs` (1.5 s by default).
- The studio calls `update(config, changedKeys, { sweep: true })`. On those updates, keep the
  old picture until the new one is complete, then swap it in with one draw (`staticInstance`
  does this for you), and don't reseed the random generator.
- If a redraw can take longer than a frame, implement `isBusy()`: the sweep waits until it
  returns false, so each step is finished before the next.

`sweep.contract.test.js` checks every declaration and that a sweep step never shows a blank or
half-drawn picture. See [`contracts/sweep.md`](../specs/004-studio-home-sweep/contracts/sweep.md).

### Catalog picture

Each catalog card shows a sample picture of its visualization:
`web-client/public/thumbs/<id>.webp` (320 × 240, at most 30 KB). Say how to make it with
`thumbnail` in `index.js`. Every field is optional:

```js
thumbnail: { presetId: "plant", values: { depth: 5 }, steps: 400 },
```

- `presetId` and `values` set the knobs, and `view` sets the view for pan/zoom modules.
- `steps` is how far an animated module runs before the snapshot. `"done"` runs until
  `isDone()`.
- `quality` lowers the WebP quality for noisy pictures that would go over 30 KB.

To make or refresh pictures, run `npm run dev`, open
`http://localhost:5173/studio/__thumbnails`, check the pictures, and press **Save** (one) or
**Save all**. The dev server writes the files; commit them. `thumbnailFiles.test.js` fails until a
new visualization has its picture. The page and the writer exist only in `npm run dev`.

## 3. Add it to the catalog

Add one line to `web-client/src/studio/catalog.js` with the id, name, category, a glyph for the
card, a one-line summary, and `load: () => import("./visualizations/spiral/index.js")`. Then
generate its catalog picture (see "Catalog picture" above).

## 4. Test it

Add `web-client/src/__tests__/studio/kernels/spiral.test.js` with a few known answers. The
contract tests (`modules.contract.test.js`, `sweep.contract.test.js`) and the save/replay test pick the new module up
automatically from the catalog. Then run:

```bash
cd web-client && npm test
```
