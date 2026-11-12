# Research: Studio Home Page, Animated Sweeps, Back from My Visualizations

The spec and its clarifications leave nothing open. This file records the design decisions made while reading the current code (`web-client/src/Root.jsx`, `studio/StudioPage.jsx`, `studio/components/Viewer.jsx`, `studio/core/{knobs,loop,shareLink,exportFile,storage}.js` and the 23 modules).

## R1 — Routing: root redirects, Playground at /playground, lazy

**Decision**: `Root.jsx` reads the path:

| Path | Result |
|---|---|
| `/` | `history.replaceState` to `/studio` (keeping any `?query`), then show the studio |
| `/studio`, `/studio/...` | the studio, unchanged |
| `/playground` | the Playground (`App`), loaded with `React.lazy` |
| anything else | `replaceState` to `/studio`, show the catalog |

The top nav (`.topnav`, two section links) is removed. `App` becomes a lazy import, so the studio's bundle and network activity never include the Playground (FR-006). The two sections are no longer both kept mounted, because there is no in-app way to switch between them. The document title is "Visualization Studio · Brain Harness" on studio pages and "Brain Harness" on /playground.

**Rationale**: `replaceState` adds no history entry (FR-001), so Back from the catalog leaves the site instead of bouncing. A single catalog address keeps share links uniform. nginx already falls back to `index.html` for any path (`deploy/nginx-brain-harness.conf`: `try_files $uri $uri/ /index.html`), so `/playground` needs no server change.

**Alternatives**:
- Server-side 301 from `/` to `/studio`: needs an nginx change and a deploy, and the Vite dev server would behave differently.
- Rendering the catalog at `/` as well: rejected in clarification.
- Keeping `App` statically imported and hidden: it would still mount and contact the server, which violates FR-006.

## R2 — Back control on "My visualizations"

**Decision**: When `view=mine`, `StudioPage` renders a toolbar row above `MyVisualizations`, built like the viewer toolbar (`.viewer-toolbar`). It contains a "← Catalog" link-styled anchor with `href="/studio"` that calls `navigate("/studio")` on a plain click, and a heading "My visualizations". The anchor has the accessible name "Back to catalog".

**Rationale**: An anchor with a real `href` works by keyboard, middle-click and screen reader, and it pushes a normal history entry (spec scenario 5). It always goes to `/studio`, never `history.back()`, so it works when the page was opened directly (FR-008).

**Alternatives**: `history.back()` was rejected because it fails on a direct open. A `<button>` was rejected because it can't be opened in a new tab and is inconsistent with the header link.

## R3 — Where sweep settings live: two shell-added knobs

**Decision**: Modules declare `sweep` (see contracts/visualization-module.md). A shell helper `withSweep(module)` (new `studio/core/sweep.js`), applied once in the catalog loader (`catalog.js`) so the Viewer, file import and share links all validate against the same knobs, appends two ordinary knobs to the module's `knobs` and one preset to its `presets`:

- `sweep` — toggle "Animated sweep", default `false`.
- `sweepSpeed` — range "Sweep speed", 0.1–4 (×), step 0.1, default 1, shown only `when: v.sweep`.
- Preset `{ id: "sweep", name: "Animated sweep", values: { ...module.sweep.presetValues, sweep: true } }`, added only if the module has no preset with id `sweep`.

**Rationale**: Sweep state then lives in `config.values`, which every existing path already handles:
- Save, share links and export persist it (FR-015) with no format-version change.
- Validation clamps it.
- Older payloads lack the keys and get the defaults (`sweep: false`) silently, because `validateConfig` fills missing keys without a notice (FR-016).
- The knob panel shows it for free (FR-013).

**Alternatives**: A separate `config.sweep` object would need changes to the share, storage and export formats, a version bump and a migration. Per-module hand-written knobs would mean 23 copies of the same code.

**Times-table**: it keeps its own `animate`/`rate` knobs and its `sweep` preset unchanged (FR-017), and declares no `sweep`. `withSweep` leaves modules without a `sweep` declaration untouched. The module-contract test accepts either a `sweep` declaration or an existing `sweep` preset, so all 23 visualizations list "Animated sweep" (FR-010).

## R4 — The sweep driver runs in the shell, not in modules

**Decision**: A `createSweepDriver({ module, getConfig, apply, isBusy, isDone, now })` in `core/sweep.js`. The Viewer calls `driver.tick()` once per animation frame while the loop plays and `values.sweep` is on. Each tick:

1. If `instance.isBusy?.()` is true, it does nothing. Progress reports can't be used for this: Mandelbrot/Julia report no progress during the 150 ms settle delay before the sharp pass, and a cancelled pass never reports 1. Modules whose redraw can take longer than a frame implement `isBusy()`: `escapeView` (a pass or the settle timer is pending), `staticInstance` (the generator is running), DLA (the kernel is running). Time spent busy is not caught up afterwards, so slow modules sweep more slowly instead of jumping.
2. If the time since the last applied change is below the declaration's `minIntervalMs`, it does nothing.
3. For `mode: "run"` declarations, it waits until `instance.isDone()` is true and has stayed true for `holdMs` (default 1500 ms), so the finished picture stays visible.
4. It computes the next values of the swept targets from the driver's phase (R5) and calls `apply(partialValues)`. That goes through the same path as a knob change: `setConfig`, then `instance.update(config, changedKeys)`. The sliders move (FR-013) and modules redraw incrementally exactly as when the user drags.

The phase advances by `elapsed × speed × sweepSpeed / periodMs`. Here `elapsed` is real time and `speed` is the playback bar's speed, so pausing freezes the sweep and play resumes it (FR-014).

**Loop for still modules**: today `createLoop` is only created for `module.animated`. The Viewer creates it when `module.animated || module.sweep` is true. For still modules `step` and `render` do nothing (they have no per-frame drawing, and the Mandelbrot/Julia instances have no `render`); the loop only drives the sweep and plays only while `values.sweep` is on. The playback bar shows while `values.sweep` is on, without Restart for still modules. The existing rules then apply unchanged: start paused under reduced motion, pause when hidden, pause when the studio is hidden.

**Recording**: `recordable` becomes `module.animated || module.interactive || values.sweep` (FR-019).

**Rationale**: One implementation and one set of tests covers 22 modules. Modules don't need to know about sweeping, because they already handle `update` for every live knob. Waiting for "not busy" removes the risk of piling up Mandelbrot or DLA work.

**Alternatives**:
- Each module animating its own knob, as Times-table does: 22 copies, and the sliders wouldn't move unless every module reported values back.
- Driving the sweep with `setInterval`: not tied to play/pause or the hidden-tab rules.

## R5 — Smooth motion: the phase-to-value mapping

**Decision**: Each sweep target has a `mode`:

| Mode | Value at phase t ∈ [0,1) | Used for |
|---|---|---|
| `wave` | `min + (max−min) · (1 − cos 2πt)/2`; the optional `phase` offset shifts t | Continuous settings. Eases at both ends, so there is no jump (FR-012). |
| `wrap` | `min + (max−min)·t` | Circular settings (angles) |
| `steps` | `list[floor(t·len)]` | Discrete settings (rule numbers, algorithm names, turn rules), mostly with `mode: "run"` declarations |
| `log` | as `wave`, interpolated on log(value) | Zoom levels and log-scale counts |

Results are snapped with `snapToStep` and clamped to the knob's limits, so values always validate.

**User drags a swept knob (spec scenario 6)**: when `apply` sees that the config value differs from the last value the driver wrote, the driver re-derives the phase from the new value. For `wave` and `log` it inverts the cosine and keeps the current direction. For `wrap` it inverts the linear mapping. For `steps` it uses the nearest index. The sweep then continues from the user's value.

**2-D paths** (Julia's c on a circle): two `wave` targets with the same period and a quarter-period `phase` offset trace an ellipse. A circle needs equal ranges.

## R6 — Sweeping the view (Mandelbrot zoom)

**Decision**: A target may be `{ view: "zoom", min, max, mode: "log" }`. The driver writes `config.view = { ...view, zoom }` and calls `instance.update(config, ["view"])`. `escapeView.update()` already accepts a new `view` and redraws through its no-tearing pipeline (scaled preview, then low resolution, then full resolution). The busy check (R4) keeps one zoom step per finished full picture.

Preset views: today `onPreset` always resets `view` to `defaultView`. Presets gain an optional `view` field: `applyPreset` returns it and `onPreset` uses it when present. The Mandelbrot sweep preset uses a view centred on Seahorse Valley (−0.743643887, 0.131825904). Julia sweeps `cRe`/`cIm` instead and keeps the default view.

**Rationale**: A zoom into a classic point is what people expect from a Mandelbrot "animation", and it reuses the smooth renderer built in 003. Iterations stay fixed. At zoom 1e4 the default 300 iterations still give detail; the preset sets 600.

## R7 — "Run" sweeps for visualizations that finish

**Decision**: The module contract gains an optional instance method `isDone() → boolean`. Sorting, Maze, Langton's ant and the elementary CA implement it from state they already track (`done`, `phase === "done"`, the step limit reached, the last row drawn). Their sweep declarations use `mode: "run"`. The driver waits until `isDone()` has been true for `holdMs`, then applies the next `steps` value. The module restarts on its own because those keys already restart a run in `update` (algorithm/size for sorting, size/generator for maze, rule for Langton and the CA). Seeded randomness is unchanged, because `update` doesn't reseed.

**Rationale**: This matches the clarification (start a new run with the next setting after a run finishes) and needs about a line per module.

## R8 — Sweep choice per visualization (as built)

Periods are for 1× sweep speed. "busy-gated" modules implement `isBusy()`.

| Module | Targets | Kind | Period / interval |
|---|---|---|---|
| times-table | (unchanged; own animate/rate) | — | — |
| ulam-spiral | `start` 1→5000 log | continuous | 30 s |
| recaman | `terms` 20→600 log | continuous | 30 s |
| pascal-mod | `modulus` steps 2…12 | continuous | 16.5 s (1.5 s per modulus) |
| collatz-coral | `evenAngle` 4→14 wave, `oddAngle` −20→−8 wave (phase 0.25) | continuous | 25 s |
| phyllotaxis | `angle` 137→138 wave | continuous | 40 s |
| mandelbrot | view zoom 1→1e4 log, Seahorse Valley view, iterations 600 | continuous, busy-gated | 60 s |
| julia | `cRe`, `cIm` ±0.7885 wave (phase 0.25): c goes round \|c\| = 0.7885 | continuous, busy-gated | 40 s |
| chaos-game | `ratio` 0.4→0.7 wave, 150k points | continuous, busy-gated | 30 s |
| l-system | `angle` 15→35 wave | continuous | 20 s |
| barnsley-fern | `w3`, `w4` 0.02→0.15 wave (phase 0.5), 150k points | continuous, busy-gated, `minIntervalMs` 300 | 30 s |
| game-of-life | `rule` steps B3/S23, B36/S23, B3678/S34678 | continuous (simulation keeps running) | 24 s (8 s per rule) |
| elementary-ca | `rule` steps [30, 90, 110, 184, 54, 150, 73] | run (`isDone`: screen full) | hold 1.5 s |
| gray-scott | `feed` 0.03→0.06, `kill` 0.058→0.064 wave (phase 0.25) | continuous | 120 s |
| dla | `stickiness` 0.2→1 wave, 4000 particles | continuous, busy-gated, `minIntervalMs` 2000 | 60 s |
| langtons-ant | `rule` steps [RL, RLR, LLRR, RLLR, LRRRRRLLR] | run (`isDone`: 12,000 steps) | hold 1.5 s |
| boids | `alignment`, `cohesion` 0.2→2 wave (phase 0.5) | continuous | 30 s |
| double-pendulum | `gravity` 4→16 wave | continuous | 30 s |
| lorenz | `rho` 14→40 wave | continuous | 40 s |
| fourier-epicycles | `circles` 2→120 log | continuous | 30 s |
| sorting | `algorithm` steps over all six | run (`isDone`: sorted) | hold 1.5 s |
| maze | `generator` steps dfs, prim, wilson | run (`isDone`: solved) | hold 1.5 s |
| voronoi | `relax` 0→20 wave | continuous | 20 s |

DLA's low end is 0.2, not 0.1: below that, walkers rarely stick and runs stop early. Julia's circle |c| = 0.7885 is the classic morphing path. In Chrome every sweep changed the picture at least every 3.7 s (Barnsley, the slowest).

## R9 — Testing approach

- **Pure unit tests** for `core/sweep.js`:
  - every mapping (`wave`, `wrap`, `steps`, `log`) and its inverse
  - snapping and clamping
  - busy gating, `minIntervalMs`, run/hold
  - continuing after a user change
  - pause freezing
  - all with injected `now()`
- **Contract test** extension: every module has a `sweep` declaration or a `sweep` preset. Each declaration's keys exist and are `range`, `choice` or `text` knobs with values inside their limits. `mode: "run"` modules implement `isDone`.
- **Runtime contract**: each module with a declaration runs 200 driver ticks with fake time, never throws, and calls `update` with only the swept keys.
- **UI tests** (Testing Library):
  - Root: `/` → `/studio`; `/playground` renders the Playground; no "Playground" text or link in the studio; unknown path → catalog.
  - My visualizations: the back link goes to the catalog, including on a direct open.
  - Sweep: picking "Animated sweep" shows the sweep toggle on, the speed knob, and the playback bar; the slider value changes after frames; pause stops it; the share link round-trips `sweep`/`sweepSpeed`; an old payload has no sweep.
- **Existing Playground tests** (App-level) keep passing unchanged. The navigation tests that click the "Playground" section link are rewritten for the new routes.

## R10 — Keeping the old picture on screen during a from-scratch redraw

Chaos game and Barnsley (`staticInstance` generators) and DLA clear the canvas when they start a redraw, which on every sweep step would show a blank or half-drawn frame (FR-012).

**Decision**: the sweep calls `update(config, changedKeys, { sweep: true })`. On those updates:
- `staticInstance` draws into an off-screen canvas and copies the finished picture in one draw.
- DLA keeps the old cluster painted until the new one is grown, and doesn't repeat its "stopped early" notices.
- `escapeView` (Mandelbrot/Julia) draws the last sharp picture mapped onto the new view, then swaps in the new sharp picture, with no blurry preview in between, which would make a sweep flicker.

User knob changes keep today's progressive drawing for quick feedback. `sweep.contract.test.js` splits each still module's drawing log into frames and fails if a sweep step leaves a frame cleared or draws in more than two frames; disabling the off-screen path makes it fail for Chaos game, Barnsley and DLA.

## R11 — Catalog pictures: ready-made images, generated from the real modules

**Decision**: Each card shows `/thumbs/<id>.webp`: a 320×240 WebP image (2× the card's size, about 160 px wide) stored in `web-client/public/thumbs/` and committed to the repository.
- **How they're made:** a development-only page, `/studio/__thumbnails`, renders each module with its `thumbnail` recipe (see contracts/thumbnail.md), using the module's own `create`/`step`. It draws the result off-screen and saves it as WebP at quality 0.8.
- **Saving:** a Vite dev-server plugin (`apply: "serve"`) accepts `PUT /__thumbs/<id>.webp` and writes the file. One click on "Save all" regenerates every picture.
- **Production:** the page is imported behind `import.meta.env.DEV`, so it isn't in the production bundle, and the plugin doesn't exist in production.

**Rationale**:
- Opening the catalog stays as cheap as today: no module chunks, no kernels, no workers (FR-023).
- Some visualizations need a lot of work before they look like themselves: Reaction–diffusion takes thousands of steps, DLA thousands of walkers, and Lorenz and Fourier need a long trail. That is fine once at generation time, but not on every visit.
- The images are the same for every visitor and can be cached for a long time.
- No new dependencies. The browser does the encoding, and the plugin is a few lines in `vite.config.js`.
- nginx's `try_files $uri` serves existing files before the SPA fallback, and Vite serves `public/` before routing, so `/thumbs/*.webp` never reaches the studio's router.

**Alternatives**:
- **Render live in each visitor's browser:** this loads all 23 modules on the home page, costs seconds of CPU on phones, and gives a different picture on every visit for random modules.
- **Render live once and cache in `localStorage`:** the first visit still pays the cost, and it competes with saved visualizations for storage space.
- **A Node script with a canvas library:** that's a native dependency, and it wouldn't run the code exactly as browsers do.
- **Playwright as a dev dependency:** a large download, and it needs a browser installed. The dev page needs neither, since the developer's own browser does the work.

**Fallback**: the `<img>` sits on top of the existing gradient and symbol. Until it loads, or if it fails (`onError` hides it), the card looks as it does today (FR-024). Fixed `width`/`height` and the card's existing `aspect-ratio: 4/3` prevent layout shift.

