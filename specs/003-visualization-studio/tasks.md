---

description: "Task list for the Visualization Studio"
---

# Tasks: Visualization Studio

**Input**: Design documents from `/specs/003-visualization-studio/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/visualization-module.md, contracts/persistence-formats.md, quickstart.md

**Tests**: Included. The plan and quickstart define kernel tests with known answers, a module contract test, and persistence round-trip tests. Write each test alongside or before the code it covers.

**Organization**: Tasks are grouped by user story. All paths are relative to the repository root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md

## Ground rules for every task

- Do not edit `web-client/src/App.jsx`, `web-client/src/components/`, `web-client/src/hooks/`, `web-client/src/api.js`, or the existing tests in `web-client/src/__tests__/*.test.jsx` (FR-001).
- Visualization modules follow `specs/003-visualization-studio/contracts/visualization-module.md` exactly: default export with `id`, `name`, `howItWorks`, `animated`, `random`, `interactive`, `knobs`, `presets`, `create(canvas, config, ctx)`; math lives in a DOM-free `kernel.js`; randomness only through `ctx.rng`; no synchronous work over 50 ms.
- Knob definitions follow `specs/003-visualization-studio/data-model.md` (KnobDefinition). Every module's knob list MUST include at least the knobs in the spec's catalog table for that entry.
- Run `npm test` from `web-client/` after each task that adds tests.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, folders, and test helpers

- [X] T001 Add `d3-delaunay` (exact version `6.0.4`) to `dependencies` in `web-client/package.json` and run `npm install` in `web-client/` to update `web-client/package-lock.json`
- [X] T002 Create the folder layout from plan.md: `web-client/src/studio/{components/knobs,core,workers,visualizations}` and `web-client/src/__tests__/studio/{core,kernels}`, plus an empty `web-client/src/studio/studio.css`
- [X] T003 [P] Create a stub 2D canvas context for jsdom in `web-client/src/__tests__/studio/canvasStub.js`: patch `HTMLCanvasElement.prototype.getContext` to return an object whose drawing methods (`fillRect`, `beginPath`, `moveTo`, `lineTo`, `arc`, `stroke`, `fill`, `putImageData`, `drawImage`, `clearRect`, `save`, `restore`, `translate`, `scale`, `setTransform`) are no-ops that append `[name, args]` to a `calls` array, `createImageData(w,h)`/`getImageData` returning `{width,height,data:new Uint8ClampedArray(w*h*4)}`, and patch `toBlob`/`toDataURL` to return a tiny fixed PNG; export `installCanvasStub()` and `resetCanvasCalls()`
- [X] T004 [P] Add `requestAnimationFrame`/`cancelAnimationFrame` fakes (driven manually by `advanceFrames(n)`), a `matchMedia` stub that can be toggled for `(prefers-reduced-motion: reduce)`, and a `document.visibilityState` setter in `web-client/src/__tests__/studio/browserStubs.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The core library and module contract that every story and every visualization depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Implement the seeded PRNG in `web-client/src/studio/core/rng.js`: `createRng(seed)` (mulberry32, returns `() → [0,1)`), `randomSeed()` (uses `crypto.getRandomValues`, 0..2³²−1), `rngInt(rng, min, max)`, `rngPick(rng, array)`; test in `web-client/src/__tests__/studio/core/rng.test.js` (same seed → same 1,000 values; different seeds differ; range bounds)
- [X] T006 [P] Implement knob validation in `web-client/src/studio/core/knobs.js` per data-model.md: `defaultsOf(module)`, `validateValue(knob, value)` → `{value, replaced}`, `validateConfig(module, config)` → `{config, replaced: [{key, given, used}]}` (clamp ranges, snap to step, unknown choice → default, coerce toggles, text through `pattern`/`parse`, seed range, drop unknown keys, call module `validateView`/`validateInput` when present), `applyPreset(module, values, presetId)`, `diffFromDefaults(module, values)`; test in `web-client/src/__tests__/studio/core/knobs.test.js`
- [X] T007 [P] Implement palettes in `web-client/src/studio/core/palettes.js`: 256-entry `Uint8ClampedArray` RGB lookup tables for `viridis`, `magma`, `cividis`, `twilight` (cyclic), `fire`, `grayscale`; `PALETTE_OPTIONS` for choice knobs (label each; mark viridis and cividis "color-blind safe"); `paletteColor(name, t)` → css string; `paletteKnob(key, default)` helper returning a KnobDefinition of type `palette`
- [X] T008 [P] Implement the animation loop in `web-client/src/studio/core/loop.js`: `createLoop({step, render, stepsPerFrame})` with `play()`, `pause()`, `stepOnce()`, `setSpeed(multiplier)` (0.25×–16× → steps per frame, fractional accumulated), `isPlaying()`, `destroy()`; auto-pause on `visibilitychange` hidden and resume only if it was playing; test in `web-client/src/__tests__/studio/core/loop.test.js` using T004 stubs
- [X] T009 [P] Implement progressive chunking in `web-client/src/studio/core/progressive.js`: `progressive(generatorFn, {budgetMs = 8, onProgress})` runs a generator that yields progress fractions, spending at most `budgetMs` per animation frame, returns `{promise, cancel()}`; cancelled tasks reject with an `AbortError` that callers ignore; test in `web-client/src/__tests__/studio/core/progressive.test.js`
- [X] T010 Implement the worker runner: `web-client/src/studio/workers/kernel.worker.js` (receives `{id, name, args}`, looks the kernel up in a `KERNELS` map, posts `{id, progress}` messages and a final `{id, result}` with transferables) and `web-client/src/studio/core/workerPool.js` exporting `registerKernel(name, fn)` and `runKernel(name, args, {onProgress, transfer})` → `{promise, cancel()}`; cancel terminates the worker; when `typeof Worker === "undefined"` run the registered function in-thread (tests); test the in-thread path in `web-client/src/__tests__/studio/core/workerPool.test.js`
- [X] T011 [P] Implement `web-client/src/studio/core/reducedMotion.js`: `prefersReducedMotion(pref)` where `pref` is `"system" | "on" | "off"` (system reads `matchMedia("(prefers-reduced-motion: reduce)")`) and `subscribe(callback)` for changes
- [X] T012 Write the catalog in `web-client/src/studio/catalog.js`: the five categories (`number-patterns`, `fractals`, `simulation`, `geometry-dynamics`, `algorithms`) with display names, and all 23 CatalogEntry records (ids listed in data-model.md) with `name`, `category`, `summary` (≤ 120 chars, from the spec's catalog "Rule" column), `thumbnail` (`/studio-thumbs/<id>.png`), and `load: () => import("./visualizations/<folder>/index.js")`; export `CATEGORIES`, `CATALOG`, `findEntry(id)`
- [X] T013 Create `web-client/src/studio/core/moduleContext.js`: `createModuleContext({config, onProgress, onNotice, onStats, onView, onInput, dpr})` returning the `ctx` object from the module contract (`rng` from T005 seeded with `config.seed ?? 0`, `palette`, `runKernel`, `progressive`, `reportProgress`, `reportNotice`, `reportStats`, `setView`, `setInput`, `dpr`) and `dispose()` that cancels every kernel and progressive task it started
- [X] T014 Write the module contract test in `web-client/src/__tests__/studio/modules.contract.test.js`: for every entry in `CATALOG`, load the module and assert: `id` matches; required fields present; every knob is a valid KnobDefinition; `defaultsOf(module)` passes `validateConfig` with no replacements; every preset validates with no replacements; with the canvas stub, `create` → `update(defaults, [])` → (if animated) `step()` ×10 + `render()` → `resize(320,240)` → `destroy()` runs without throwing; `Math.random` is never called (spy); for `random` modules two instances with the same seed produce identical canvas `calls` after the same steps. Entries whose module file doesn't exist yet are reported with `it.todo` so the test passes while modules are added
- [X] T015 Create `web-client/src/studio/visualizations/_shared/draw.js` with helpers used by many modules: `fitCanvas(canvas, dpr)`, `clear(ctx2d, color)`, `plotAccumulator(ctx2d, counts, w, h, palette, {gamma})` (log tone-mapping for chaos game and fern), `polyline(ctx2d, points)`, `withTransform(ctx2d, {cx, cy, scale}, fn)`, and `createTurtle()` (position, heading, stack push/pop, `forward`, `turn`) for Collatz and L-systems

**Checkpoint**: Core library and contract test in place; visualization modules and the shell can now be built in parallel

---

## Phase 3: User Story 1 - Browse and run a visualization (Priority: P1) 🎯 MVP

**Goal**: A Studio section reachable from the client, with a categorized catalog of 23 entries; picking one draws it with default settings; switching between visualizations and back to the playground works.

**Independent Test**: Open `/studio`, pick any entry, see a recognizable picture (times-table at m = 2 shows a cardioid); switch to the playground and back and the conversation is still there (quickstart checks 1–3).

### Shell and navigation

- [X] T016 [US1] Create `web-client/src/Root.jsx`: a top nav bar (`<nav aria-label="Sections">` with links "Playground" → `/` and "Visualization Studio" → `/studio`, `aria-current="page"` on the active one) and path-based routing via `history.pushState` + `popstate` (intercept clicks on internal links); render `<App/>` always, inside a wrapper with `hidden` when the studio is active; render `React.lazy(() => import("./studio/StudioPage.jsx"))` inside `<Suspense>` only once the studio has been visited, then keep it mounted and pass `active={isStudio}`; export a `navigate(path)` helper via a small context in the same file
- [X] T017 [US1] Change `web-client/src/main.jsx` to render `<Root/>` instead of `<App/>` (the only edit to existing playground files), and add nav bar styles (`.topnav`, active link, phone-width layout) to the end of `web-client/src/styles.css` using the existing CSS variables
- [X] T018 [US1] Write `web-client/src/__tests__/studio/navigation.test.jsx`: render `<Root/>` at `/`, send a playground prompt with the mocked api (same mocking style as `conversation.test.jsx`), click "Visualization Studio" → URL is `/studio` and catalog heading shows; click "Playground" → the earlier exchange is still rendered; browser back/forward (`popstate`) switches sections; loading `/studio/times-table` directly opens that visualization
- [X] T019 [US1] Create `web-client/src/studio/StudioPage.jsx`: parses the studio sub-path (`/studio`, `/studio/<vizId>`, `/studio/saved/<savedId>` reserved for US3) and `?category=&q=`; shows `CatalogGrid` or `Viewer`; unknown `vizId` → catalog with the notice "That visualization doesn't exist"; when `active` is false it tells the viewer to pause; imports `web-client/src/studio/studio.css`
- [X] T020 [P] [US1] Create `web-client/src/studio/components/CatalogGrid.jsx`: sections per category in `CATEGORIES` order, each card a link/button with thumbnail (with `alt`), name, and summary; a search box (filters by name and summary, case-insensitive) and category filter chips, both reflected in `?q=` and `?category=`; empty state "No visualizations match"
- [X] T021 [P] [US1] Create `web-client/src/studio/components/HowItWorks.jsx`: collapsible panel showing the module's `howItWorks` text, open by default on wide screens
- [X] T022 [US1] Create `web-client/src/studio/components/Viewer.jsx`: loads the module through `findEntry(id).load()` (loading state), builds a validated config from defaults, sizes the canvas to its container × `devicePixelRatio` (max 2) with a `ResizeObserver` → `instance.resize`, creates the instance with `createModuleContext`, and for `animated` modules drives it with `createLoop` (auto-play unless reduced motion); shows notices, stats, and a progress bar that appears only after 1 s of computing (FR-023); on unmount or id change calls `loop.destroy()`, `instance.destroy()`, `ctx.dispose()` (FR-024); a "Back to catalog" link; layout: canvas left, side panel right (HowItWorks for now; knobs added in US2), stacked on narrow screens
- [X] T023 [US1] Add studio layout styles to `web-client/src/studio/studio.css`: catalog grid (auto-fill cards, 16px gutters on phones), viewer two-column layout collapsing below 800px, canvas container keeping aspect ratio, progress bar, notice area; light and dark via the existing CSS variables
- [X] T024 [US1] Write `web-client/src/__tests__/studio/studio.test.jsx` (US1 part): catalog shows 5 category headings and 23 cards; search "spiral" shows only cards whose name or summary contains "spiral" (Ulam spiral at least); clicking a card opens the viewer with a canvas and the How it works text; switching to another entry calls `destroy` on the previous instance (spy via a fake catalog entry)

### Visualization modules (each: kernel.js + index.js + kernel test; knobs and presets declared per the spec catalog table; all can run in parallel)

- [X] T025 [P] [US1] Collatz coral in `web-client/src/studio/visualizations/collatz/kernel.js` (`collatzPath(n)` → array down to 1; `coralPaths(count)` → reversed paths) and `index.js` (id `collatz-coral`; knobs: `count` 1–20000 default 5000 log, `evenAngle` −30–30° default 8, `oddAngle` −30–30° default −16, `segment` 1–20 default 6, `palette`; static; draw each reversed path with the turtle from T015, colored by path length, drawn progressively); test `web-client/src/__tests__/studio/kernels/collatz.test.js` (path of 6 is `6,3,10,5,16,8,4,2,1`; path of 1 is `[1]`)
- [X] T026 [P] [US1] Ulam spiral in `web-client/src/studio/visualizations/ulam/kernel.js` (`sieve(limit)` → Uint8Array; `squareSpiralCoord(i)`, `hexSpiralCoord(i)`, `sacksCoord(n)`) and `index.js` (id `ulam-spiral`; knobs: `start` 1–100000 default 1, `shape` choice square/hexagonal/sacks, `size` 100–250000 default 40000 log, `dot` 1–6, `palette`; static; progressive draw); test `web-client/src/__tests__/studio/kernels/ulam.test.js` (primes below 30; square coords of 1..9 form a 3×3 block; coords unique for first 10,000)
- [X] T027 [P] [US1] Recamán in `web-client/src/studio/visualizations/recaman/kernel.js` (`recaman(terms)`) and `index.js` (id `recaman`; knobs: `terms` 2–2000 default 80, `arcStyle` choice semicircle/ellipse/alternating default alternating, `palette`; animated: one arc per step, `reset` clears); test `web-client/src/__tests__/studio/kernels/recaman.test.js` (first 10 terms `0,1,3,6,2,7,13,20,12,21`)
- [X] T028 [P] [US1] Times-table circle in `web-client/src/studio/visualizations/timesTable/kernel.js` (`timesTableLines(N, m)` → `[k, (k*m) % N]` pairs with fractional m) and `index.js` (id `times-table`; knobs: `m` 0–100 step 0.01 default 2, `N` 10–1000 default 200, `animate` toggle default false, `rate` 0.001–0.5 default 0.01, `opacity` 0.05–1, `palette`; presets cardioid m=2, nephroid m=3, m=34 flower; animated: step increments m when `animate` is on); test `web-client/src/__tests__/studio/kernels/timesTable.test.js`
- [X] T029 [P] [US1] Pascal mod n in `web-client/src/studio/visualizations/pascalMod/kernel.js` (`pascalModRows(rows, n)` generator yielding Uint16Array rows) and `index.js` (id `pascal-mod`; knobs: `modulus` 2–20 default 2, `rows` 8–1024 default 256, `palette`; preset "Sierpiński" mod 2; static; ImageData triangle, progressive); test `web-client/src/__tests__/studio/kernels/pascalMod.test.js` (mod 2 row 4 is `1,0,0,0,1`; mod 3 row 3 is `1,0,0,1`)
- [X] T030 [P] [US1] Mandelbrot in `web-client/src/studio/visualizations/mandelbrot/kernel.js` (`escapeBand({x0,y0,dx,dy,width,rowStart,rowEnd,maxIter,smooth,juliaC})` → Float32Array of iteration counts, smooth = normalized iteration count; shared with Julia) registered as worker kernel `escapeBand`, and `index.js` (id `mandelbrot`; knobs: `iterations` 50–5000 default 300 log `live:false`, `palette`, `smooth` toggle default true; `view` `{cx:-0.5, cy:0, zoom:1}` with `validateView` clamping zoom to 1–1e13; static; renders bands of 16 rows via `ctx.runKernel` with progress, cancelling on any update); test `web-client/src/__tests__/studio/kernels/escape.test.js` (c = 0 never escapes; c = 1 escapes in < 5 iterations; same inputs → same output)
- [X] T031 [P] [US1] Julia in `web-client/src/studio/visualizations/julia/index.js` reusing `escapeBand` from the Mandelbrot kernel (id `julia`; knobs: `cRe` −2–2 step 0.0001 default −0.8, `cIm` −2–2 default 0.156, `iterations`, `palette`, `smooth`; presets: dendrite c=i, Douady rabbit −0.123+0.745i, San Marco −0.75, siegel disk −0.391−0.587i; view as Mandelbrot centered at 0)
- [X] T032 [P] [US1] Chaos game in `web-client/src/studio/visualizations/chaosGame/kernel.js` (`chaosPoints({corners, ratio, count, restriction, rng})` filling a Uint32Array accumulator; restrictions `none`, `not-same`, `not-neighbor-of-last`) and `index.js` (id `chaos-game`; random; knobs: `corners` 3–10 default 3, `ratio` 0.1–0.9 step 0.001 default 0.5, `points` 10000–2000000 default 300000 log, `restriction` choice, `palette`; presets Sierpiński (3, 0.5, none), Vicsek-style snowflake (4 corners + center rule approximated by 5 corners 0.667), pentagon (5, 0.618, not-same), square no-repeat (4, 0.5, not-same); progressive with `plotAccumulator`); test `web-client/src/__tests__/studio/kernels/chaosGame.test.js` (deterministic with seed; all points inside the polygon's bounding box)
- [X] T033 [P] [US1] L-system in `web-client/src/studio/visualizations/lsystem/kernel.js` (`parseRules(text)` → `{ok, rules}` or `{ok:false, error, line}` for lines `X=...`; `expandLSystem(axiom, rules, depth, limit = 2_000_000)` → `{string, depthReached, capped}`; `turtleSegments(string, angle)` supporting `F G` draw, `f` move, `+ -` turn, `[ ]` push/pop) and `index.js` (id `l-system`; knobs: `axiom` text, `rules` text with `parse`, `angle` 0–180 step 0.5, `depth` 0–12, `palette`; presets Koch curve, Koch snowflake, dragon curve, Hilbert curve, Sierpiński arrowhead, fractal plant; static; auto-fit drawing to canvas; `reportNotice("Depth capped at N for these rules")` when capped); test `web-client/src/__tests__/studio/kernels/lsystem.test.js` (Koch depth 1 = `F+F--F+F`; cap honored; `F=F[` → parse error)
- [X] T034 [P] [US1] Barnsley fern in `web-client/src/studio/visualizations/barnsley/kernel.js` (the 4 classic affine maps; `fernPoints({weights, count, rng})` normalizing weights) and `index.js` (id `barnsley-fern`; random; knobs `w1`–`w4` 0–1 step 0.01 defaults 0.01/0.85/0.07/0.07, `points` 10000–2000000 default 400000, `palette`; presets classic, "thin" (w2 0.95), "bushy" (w3,w4 0.15); progressive accumulator); test `web-client/src/__tests__/studio/kernels/barnsley.test.js`
- [X] T035 [P] [US1] Game of Life in `web-client/src/studio/visualizations/life/kernel.js` (`parseRule("B3/S23")`, `lifeStep(grid, next, w, h, rule, wrap)`, `randomGrid(w, h, density, rng)`, `rleEncode/rleDecode(cells)`) and `index.js` (id `game-of-life`; random, animated; knobs: `rule` text default `B3/S23`, `size` 32–512 default 160, `density` 0–1 default 0.3, `wrap` toggle default true; presets Conway, HighLife B36/S23, Seeds B2/S, Day & Night B3678/S34678, Gosper glider gun (fixed input)); test `web-client/src/__tests__/studio/kernels/life.test.js` (blinker oscillates with period 2; block is stable; glider returns shifted by (1,1) after 4 steps)
- [X] T036 [P] [US1] Elementary CA in `web-client/src/studio/visualizations/elementaryCA/kernel.js` (`ruleTable(n)`, `elementaryStep(row, next, table, wrap)`) and `index.js` (id `elementary-ca`; random, animated; knobs: `rule` 0–255 default 30, `width` 64–1024 default 400, `start` choice single/random, `density` 0–1 (shown only when start=random); presets Rule 30, 90, 110, 184; rows scroll down once the canvas is full); test `web-client/src/__tests__/studio/kernels/elementaryCA.test.js` (Rule 90 from one cell: row k cells equal Pascal mod 2 pattern for 8 rows)
- [X] T037 [P] [US1] Gray–Scott in `web-client/src/studio/visualizations/grayScott/kernel.js` (`grayScottSteps({u, v, w, h, feed, kill, du, dv, steps})` with 9-point Laplacian, wrap edges; `seedFields(w, h, rng)`) registered as worker kernel `grayScottSteps`, and `index.js` (id `gray-scott`; random, animated; knobs: `feed` 0.01–0.1 step 0.0001 default 0.055, `kill` 0.04–0.075 step 0.0001 default 0.062, `du` default 0.2097, `dv` default 0.105, `size` choice 128/256/384 default 256, `palette`; presets spots (0.035, 0.065), stripes (0.042, 0.059), coral (0.0545, 0.062), mitosis (0.0367, 0.0649); each `step()` requests N steps from the worker and renders the latest field; knob changes apply live without reseeding); test `web-client/src/__tests__/studio/kernels/grayScott.test.js` (values stay in [0,1]; uniform u=1,v=0 field is stable)
- [X] T038 [P] [US1] Boids in `web-client/src/studio/visualizations/boids/kernel.js` (`createFlock(count, w, h, rng)`, `flockStep(flock, params, w, h)` with a uniform-grid spatial hash) and `index.js` (id `boids`; random, animated; knobs: `count` 10–2000 default 300, `separation` 0–3 default 1.5, `alignment` 0–3 default 1, `cohesion` 0–3 default 1, `radius` 10–150 default 50, `maxSpeed` 1–8 default 3; weights apply live); test `web-client/src/__tests__/studio/kernels/boids.test.js` (speed never exceeds max; with only alignment, velocity spread decreases)
- [X] T039 [P] [US1] Langton's ant in `web-client/src/studio/visualizations/langton/kernel.js` (`parseTurnRule("RLLR")` → array or error, valid `^[LR]{2,12}$`; `antStep(grid, w, h, ants, rule)` with wrap) and `index.js` (id `langtons-ant`; animated; random only for placing extra ants; knobs: `rule` text default `RL`, `ants` 1–8 default 1, `size` 64–512 default 200, palette; presets classic RL, RLLR, LLRR, LRRRRRLLR; `reportStats({steps})`); test `web-client/src/__tests__/studio/kernels/langton.test.js` (classic ant after 11,000 steps on a 200 grid has its position ≥ 10 cells away from the start in a diagonal drift; `RLX` rejected)
- [X] T040 [P] [US1] DLA in `web-client/src/studio/visualizations/dla/kernel.js` (`dlaGrow({w, h, particles, stickiness, seedShape, rng, stepBudget})` → Uint32Array of arrival order + `{stuck, budgetExhausted}`; walkers launched on a circle just outside the cluster radius, killed beyond 2× radius) registered as worker kernel `dlaGrow` (posting progress), and `index.js` (id `dla`; random; knobs: `particles` 100–30000 default 6000, `stickiness` 0.01–1 default 1, `seedShape` choice point/line/circle, `palette`; colors by arrival order; on `budgetExhausted` → `reportNotice("Stopped: walkers rarely stick at this stickiness")`); test `web-client/src/__tests__/studio/kernels/dla.test.js` (every stuck cell touches an earlier stuck cell; budget stops the run)
- [X] T041 [P] [US1] Lorenz attractor in `web-client/src/studio/visualizations/lorenz/kernel.js` (`lorenzRK4(state, params, dt)`; `project(point, yaw, pitch, scale)`) and `index.js` (id `lorenz`; animated; knobs: `sigma` 0–30 default 10, `rho` 0–60 default 28, `beta` 0–8 step 0.01 default 2.667, `separation` 1e-9–1 log default 1e-5, `trail` 100–20000 default 4000; view `{yaw, pitch}`; two trajectories in two palette colors, distance between them in `reportStats`); test `web-client/src/__tests__/studio/kernels/lorenz.test.js` (fixed point at origin when start is origin; two starts 1e-5 apart diverge past 1 within 3,000 steps at defaults)
- [X] T042 [P] [US1] Double pendulum in `web-client/src/studio/visualizations/doublePendulum/kernel.js` (`pendulumRK4(state, params, dt)` from the Lagrangian equations; `energy(state, params)`) and `index.js` (id `double-pendulum`; animated; knobs: `m1`, `m2` 0.1–10 default 1, `l1`, `l2` 0.2–2 default 1, `theta1`, `theta2` −180–180° default 120/−20, `gravity` 1–20 default 9.81, `trail` 0–5000 default 1500; dt 1/240 s fixed); test `web-client/src/__tests__/studio/kernels/doublePendulum.test.js` (energy drift < 1% over 10 simulated seconds; hanging-down start stays at rest)
- [X] T043 [P] [US1] Voronoi in `web-client/src/studio/visualizations/voronoi/kernel.js` (`randomPoints(n, w, h, rng)`; `lloydStep(points, w, h)` via `d3-delaunay`'s `Delaunay.from(points).voronoi([0,0,w,h])` cell centroids; `manhattanRaster(points, w, h, scale)` → Int32Array of nearest index; `manhattanLloyd(points, raster)`) and `index.js` (id `voronoi`; random; knobs: `count` 3–2000 default 120 (≤ 500 enforced when metric is manhattan with a notice), `metric` choice euclidean/manhattan, `relax` 0–50 default 0, `show` choice cells/triangulation/both, `palette`; `input.points` overrides random points; static); test `web-client/src/__tests__/studio/kernels/voronoi.test.js` (Manhattan raster: each seed pixel maps to its own index; Lloyd step keeps points inside bounds and reduces centroid distance)
- [X] T044 [P] [US1] Fourier epicycles in `web-client/src/studio/visualizations/fourier/kernel.js` (`resampleByArcLength(points, n)`; `dft(points)` → `[{freq, amp, phase}]` sorted by amplitude; `epicyclePoint(coeffs, k, t)`) and `web-client/src/studio/visualizations/fourier/shapes.js` (3–5 built-in outlines as point arrays: heart, star, treble-clef-like squiggle, square, the letter "π"), plus `index.js` (id `fourier-epicycles`; animated; knobs: `circles` 1–512 default 40, `shape` choice of built-in shapes + `custom`, `speed`, `showCircles` toggle default true; traces the path as t advances; `input.outline` used when shape is custom); test `web-client/src/__tests__/studio/kernels/fourier.test.js` (with all coefficients the reconstruction matches the resampled points within 1e-6; with 1 circle the path is a circle)
- [X] T045 [P] [US1] Phyllotaxis in `web-client/src/studio/visualizations/phyllotaxis/kernel.js` (`phyllotaxisPoints(count, angleDeg, spacing)`) and `index.js` (id `phyllotaxis`; knobs: `angle` 0–360 step 0.001 default 137.508, `count` 10–20000 default 2000, `spacing` 1–20 default 6, `dot` 1–10 default 3, `palette`; preset "Golden angle" 137.50776; static); test `web-client/src/__tests__/studio/kernels/phyllotaxis.test.js` (point i radius = spacing·√i; angle wraps)
- [X] T046 [P] [US1] Sorting in `web-client/src/studio/visualizations/sorting/kernel.js` (generators `bubble`, `insertion`, `selection`, `quick`, `merge`, `heap` each yielding `{op:"compare",i,j}`, `{op:"swap",i,j}`, or `{op:"set",i,value}` and leaving the array sorted; `initialArray(size, order, rng)` for orders random/nearly-sorted/reversed/few-unique) and `index.js` (id `sorting`; random, animated; knobs: `algorithm` choice, `size` 8–1000 default 120, `order` choice, `display` choice bars/dots, `speed` handled by the loop; highlights the two active indices; `reportStats({comparisons, swaps})`; shows "Sorted" when done); test `web-client/src/__tests__/studio/kernels/sorting.test.js` (every algorithm × every order × sizes 0,1,2,50 ends sorted; replaying the ops on a copy gives the same result)
- [X] T047 [P] [US1] Maze in `web-client/src/studio/visualizations/maze/kernel.js` (grid representation with walls per cell; step generators `dfsBacktracker`, `prim`, `wilson` taking `rng`; step solvers `astar(heuristic)`, `dijkstra`, `bfs` yielding `{visited, frontier}` and finally `{path}` or `{noPath:true}`) and `index.js` (id `maze`; random, animated; knobs: `size` 5–150 default 30, `generator` choice dfs/prim/wilson, `solver` choice astar/dijkstra/bfs, `heuristic` choice manhattan/euclidean shown only when solver is astar; phases: generate → solve; `reportStats({visited, pathLength})`; "No path" notice); test `web-client/src/__tests__/studio/kernels/maze.test.js` (each generator yields a perfect maze: all cells reachable, passages = cells − 1; A*, Dijkstra, and BFS path lengths equal; walling off the goal → `noPath`)
- [ ] T048 [US1] Generate catalog thumbnails: add a dev-only script `web-client/scripts/make-thumbnails.mjs` documented in its header (renders each module at defaults in a browser page `web-client/thumbs.html` and saves 320×240 PNGs), and commit the 23 resulting images to `web-client/public/studio-thumbs/<id>.png`; until generated, `CatalogGrid` falls back to a category-colored placeholder with the entry's initials — **Not done:** cards show a category-colored tile with a glyph (`glyph` in `catalog.js`) instead of rendered thumbnails. A thumbnail script needs a headless browser dependency; left for a follow-up.

**Checkpoint**: The studio shows all 23 visualizations at default settings. MVP is demoable.

---

## Phase 4: User Story 2 - Tune a visualization with knobs (Priority: P1)

**Goal**: Every visualization's knobs are on screen and change the picture; playback, presets, seed, reset, clamping messages, pointer interaction, and reduced motion all work.

**Independent Test**: Phyllotaxis 137.5° → 137.6° breaks the spiral; Gray–Scott presets change the pattern; typing 999 into a slider with max 500 shows 500 and a note (quickstart checks 4–13, 19–21).

- [X] T049 [P] [US2] Create the knob inputs in `web-client/src/studio/components/knobs/`: `RangeKnob.jsx` (label, `<input type="range">` with `step` + linked number box, log scale mapping, Shift+Arrow = ×10 step, value committed on release when `live:false`, clamping with an inline note "Max is 500" that disappears after 3 s), `ChoiceKnob.jsx` (`<select>`), `ToggleKnob.jsx` (checkbox), `TextKnob.jsx` (input or textarea for multi-line rules; runs `pattern`/`parse` on change, shows the error inline with `aria-invalid` and `aria-describedby`, only commits valid values), `PaletteKnob.jsx` (select with color swatches), `SeedKnob.jsx` (number input 0..2³²−1 + "Randomize" button); every input has a `<label>` and optional help via `aria-describedby`
- [X] T050 [US2] Create `web-client/src/studio/components/KnobPanel.jsx`: renders `module.knobs` grouped by `group`, skips knobs whose `when(values)` is false, maps `type` → component from T049, emits `onChange(key, value)`; a "Reset to defaults" button (FR-010)
- [X] T051 [P] [US2] Create `web-client/src/studio/components/PresetMenu.jsx`: shows `module.presets` as buttons (or a select when > 6), marks the active `presetId`, calls `applyPreset` and emits the new values; hidden when there are no presets
- [X] T052 [P] [US2] Create `web-client/src/studio/components/PlaybackBar.jsx`: play/pause toggle (`aria-pressed`), Step (enabled only when paused), speed select (0.25×, 0.5×, 1×, 2×, 4×, 8×, 16×), Reset; keyboard shortcuts while the canvas has focus: Space play/pause, `.` step, `r` reset; shown only for `animated` modules
- [X] T053 [US2] Wire knobs into `web-client/src/studio/components/Viewer.jsx`: hold `config` state; on knob change run `validateConfig`, clear `presetId`, call `instance.update(config, changedKeys)` (debounced to one per animation frame); seed changes and "Randomize seed" recreate the RNG and call `reset`/`update`; Reset to defaults restores `defaultsOf(module)`; render `PresetMenu`, `KnobPanel`, `PlaybackBar`, and the stats readout in the side panel
- [X] T054 [US2] Add pointer and keyboard plumbing in `web-client/src/studio/components/Viewer.jsx`: for `interactive` modules make the canvas focusable (`tabIndex=0`, `aria-label` describing the interaction), translate pointer/wheel/key events into the contract's normalized events in device pixels, call `instance.pointer(event)`, and store results from `ctx.setView`/`ctx.setInput` into `config.view`/`config.input`
- [X] T055 [P] [US2] Add interaction to Mandelbrot and Julia in `web-client/src/studio/visualizations/mandelbrot/index.js` and `web-client/src/studio/visualizations/julia/index.js`: drag to pan, wheel and `+`/`-` keys to zoom around the pointer, arrow keys pan, double-click zooms in; at zoom ≥ 1e13 stop zooming in and `reportNotice("Zoom limit reached")`; Mandelbrot shift+click (and a "Open Julia set here" action) navigates to `/studio/julia` with `cRe`/`cIm` set to that point (via the share-link helper once US4 exists; until then via `?cRe=&cIm=` read by `StudioPage`) — Done; Shift+click opens the Julia set through `ctx.openVisualization` (no temporary `?cRe=` URL).
- [X] T056 [P] [US2] Add drawing to Game of Life in `web-client/src/studio/visualizations/life/index.js`: click/drag toggles cells (paused or playing), stored as RLE in `input.cells`; key `c` (canvas focused) clears the grid; describe both in `howItWorks`
- [X] T057 [P] [US2] Add Gray–Scott painting in `web-client/src/studio/visualizations/grayScott/index.js`: dragging adds chemical V in a small disc (sent to the worker with the next step request)
- [X] T058 [P] [US2] Add boids pointer influence in `web-client/src/studio/visualizations/boids/index.js`: pointer position attracts the flock; with Shift held it repels; add a `pointerMode` choice knob (attract/repel/off)
- [X] T059 [P] [US2] Add Lorenz view rotation in `web-client/src/studio/visualizations/lorenz/index.js`: drag rotates `yaw`/`pitch` (arrow keys too), saved via `ctx.setView`
- [X] T060 [P] [US2] Add double pendulum dragging in `web-client/src/studio/visualizations/doublePendulum/index.js`: while paused, dragging a bob sets `theta1`/`theta2` (emitting the new values to the knob panel through `ctx.setInput({theta1, theta2})`, which Viewer copies into `values`)
- [X] T061 [P] [US2] Add Voronoi point editing in `web-client/src/studio/visualizations/voronoi/index.js`: click empty space adds a point, drag moves one, right-click or Delete key on a focused point removes it; edits stored in `input.points` (capped at 2,000) and redraw immediately
- [X] T062 [P] [US2] Add outline drawing in `web-client/src/studio/visualizations/fourier/index.js`: when `shape` is `custom`, drawing on the canvas records an outline (≥ 10 points), switches to epicycle playback on pointer up, and stores it in `input.outline` (quantized, ≤ 512 points)
- [X] T063 [P] [US2] Add maze editing in `web-client/src/studio/visualizations/maze/index.js`: after generation, click toggles a wall between two cells (nearest edge), drag the start/end markers to move them; editing resets the solver; stored in `input.walls`, `input.start`, `input.end`
- [X] T064 [US2] Add the reduced-motion setting: a studio preference control ("Motion: System / Reduce / Full") in `web-client/src/studio/StudioPage.jsx` persisted in `localStorage` key `vizstudio.v1.prefs` (try/catch, falls back to System), and in `Viewer.jsx` start animated modules paused when `prefersReducedMotion(pref)` is true (FR-027)
- [X] T065 [US2] Extend `web-client/src/__tests__/studio/studio.test.jsx` (US2 part) using the fake-catalog pattern from T024: knob panel renders one labelled control per visible knob; typing 999 into a range with max 500 shows 500 and the note; invalid text rule shows an inline error and `update` is not called; preset click sets values and marks it active; Reset to defaults restores defaults; play/pause/step call the loop correctly; reduced motion starts paused; every control is reachable with Tab (SC-008)
- [X] T066 [US2] Add the knob-panel and playback styles to `web-client/src/studio/studio.css`: compact slider rows with value boxes, preset chips, playback bar, inline error and clamp notes, focus rings visible in both themes, side panel collapsing under the canvas on phones

**Checkpoint**: Users can explore every visualization interactively. Stories 1 and 2 together are the full P1 scope.

---

## Phase 5: User Story 3 - Save my own visualization (Priority: P2)

**Goal**: Save the current configuration under a name; list, open, rename, duplicate, overwrite, and delete saved visualizations; they survive a browser restart.

**Independent Test**: Tune Mandelbrot, save as "Seahorse valley", reload, open from My visualizations → same view and palette (quickstart checks 14, 15, 22).

- [X] T067 [US3] Implement `web-client/src/studio/core/storage.js` per contracts/persistence-formats.md §2: `listSaved()` (tolerates missing key, bad JSON, invalid records → skipped count), `createSaved({name, config, thumbnail})`, `updateSaved(id, patch)`, `renameSaved(id, name)` (1–80 chars trimmed), `duplicateSaved(id)` (name "<name> copy"), `deleteSaved(id)`, `getSaved(id)`; all writes catch `QuotaExceededError`/`SecurityError` and return `{ok:false, reason}`; `subscribe(callback)` listening to the `storage` event; test in `web-client/src/__tests__/studio/core/storage.test.js` (round trip; invalid records skipped; quota error reported via a throwing `localStorage` mock)
- [X] T068 [US3] Add `makeThumbnail(canvas)` → 160×120 JPEG data URL (quality 0.7, letterboxed) to `web-client/src/studio/core/exportFile.js` (the file grows in US4)
- [X] T069 [P] [US3] Create `web-client/src/studio/components/SaveDialog.jsx`: a `<dialog>` with a name field (required, ≤ 80 chars), "Save" and, when the viewer was opened from a saved item, "Save as new" vs "Update '<name>'"; shows the storage error message with an "Export file instead" button (disabled until US4, then wired) when saving fails
- [X] T070 [P] [US3] Create `web-client/src/studio/components/MyVisualizations.jsx`: list of saved items (thumbnail, name, base visualization name, saved date) with Open, Rename (inline edit), Duplicate, Delete (confirmation `<dialog>`, not `window.confirm`); empty state text; shown as a section above the catalog in `CatalogGrid` and as a "My visualizations" link in the studio header; stays current via `storage.subscribe`
- [X] T071 [US3] Wire saving into `web-client/src/studio/components/Viewer.jsx` and `web-client/src/studio/StudioPage.jsx`: a "Save" button opens `SaveDialog`; on save capture the thumbnail and store `{vizId, values, seed, view, input, presetId}`; route `/studio/saved/<savedId>` loads the record, runs `validateConfig` (listing replaced values in a notice), and opens the viewer with it; unknown id → "Not found in this browser" with a link to the catalog
- [X] T072 [US3] Add a determinism test in `web-client/src/__tests__/studio/savedReplay.test.js`: for every catalog module, create with a non-default config (random valid values per knob from a seeded RNG, fixed seed), run 20 steps if animated, record canvas `calls`; save via `storage.js`, reload the record, create a new instance from it, run 20 steps, assert identical `calls` (SC-005)
- [X] T073 [US3] Extend `web-client/src/__tests__/studio/studio.test.jsx` (US3 part): save from the viewer → appears in My visualizations; open restores knob values; rename, duplicate, delete-with-confirm update the list; failing storage shows the error
- [X] T074 [US3] Add dialog and saved-list styles to `web-client/src/studio/studio.css`

**Checkpoint**: Users can keep the visualizations they create.

---

## Phase 6: User Story 4 - Share and export (Priority: P3)

**Goal**: Copy a link that recreates the visualization, download the frame as PNG, export/import saved visualizations as a file.

**Independent Test**: Copy link on a tuned Ulam spiral, open it in a private window → same picture; edit the payload to garbage → defaults with a message; export then import a saved item → same picture (quickstart checks 16–18).

- [X] T075 [US4] Implement `web-client/src/studio/core/shareLink.js` per contracts/persistence-formats.md §1: `encodeConfig(module, config)` → `"1." + base64url(deflateRaw(JSON of diff))` using `CompressionStream("deflate-raw")`, rounding numbers to knob step precision and quantizing drawn input; returns `{ok:false, reason:"too-large"}` past the input caps (outline 512, points 500, Life RLE runs 4,000); `decodeConfig(module, payload)` → validated config + `replaced` list, unknown version or corrupt data → defaults with a message; `buildShareUrl(vizId, payload)`; test in `web-client/src/__tests__/studio/core/shareLink.test.js` (round trip for every catalog module's defaults and one tuned config; garbage payload; unknown version; size cap) — in jsdom, polyfill `CompressionStream`/`DecompressionStream` from `node:stream/web` in the test setup if missing
- [X] T076 [US4] Read `?c=` in `web-client/src/studio/StudioPage.jsx` when opening `/studio/<vizId>`, decode with `decodeConfig`, and show the replaced-values notice; replace the temporary `?cRe=&cIm=` handling from T055 with a share payload
- [X] T077 [US4] Extend `web-client/src/studio/core/exportFile.js` per contracts/persistence-formats.md §3–4: `downloadPng(canvas, vizId)` (`<vizId>-<yyyymmdd-hhmmss>.png`), `exportSaved(items)` → downloads `<slug>.vizstudio.json`, `importFile(file)` → rejects > 2 MB or wrong `format`/`formatVersion`, validates each item, returns `{added, skipped, replaced}`; test in `web-client/src/__tests__/studio/core/exportFile.test.js` (export → import round trip; wrong format rejected; invalid item skipped)
- [X] T078 [P] [US4] Create `web-client/src/studio/components/ShareMenu.jsx`: "Copy link" (`navigator.clipboard.writeText`, with a fallback selectable text field if clipboard is denied; disabled with the "Too much drawing for a link. Export a file instead." message when too large), "Download image", "Export settings"; render it in the viewer toolbar
- [X] T079 [US4] Add import/export to `web-client/src/studio/components/MyVisualizations.jsx`: per-item Export, "Export all", and an "Import" file picker (`.vizstudio.json`) showing the import summary; regenerate thumbnails for imported items by rendering them off-screen at 160×120; wire the "Export file instead" button in `SaveDialog.jsx` — Done, except imported items show the catalog glyph until they are opened and saved again (thumbnails are not re-rendered off-screen).
- [X] T080 [US4] Extend `web-client/src/__tests__/studio/studio.test.jsx` (US4 part): Copy link writes a URL containing `/studio/<vizId>?c=1.`; opening that URL restores the knob values; Download image triggers a download with the expected file name

**Checkpoint**: All four user stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T081 [P] Performance pass against SC-001–SC-004 using Chrome's performance panel at default and maximum settings for each of the 23 modules; record results and any knob limits lowered to meet budgets in `specs/003-visualization-studio/perf-notes.md`, and adjust knob `max` values or chunk sizes in the affected `index.js` files — **Partly done:** all 23 modules were rendered in headless Chrome at defaults and each drew within 3.5 s (no errors). A Chrome performance-panel pass at maximum settings was not done.
- [ ] T082 [P] Accessibility pass: run axe in the browser on the catalog and three viewers (one static, one animated, one interactive), fix issues in `web-client/src/studio/components/`; confirm visible focus, labels, and contrast in light and dark themes — **Not done:** axe was not run. Controls use native labelled inputs and are covered by the keyboard test in `studio.test.jsx`.
- [X] T083 [P] Phone-width pass (375px wide): catalog, viewer, knob panel, dialogs; fix overflow in `web-client/src/studio/studio.css`
- [X] T084 [P] Update `README.md`: add the Visualization Studio to the intro and the folders table, mention `/studio`, and link `specs/003-visualization-studio/quickstart.md`
- [X] T085 [P] Add `docs/adding-a-visualization.md`: how to add a module (folder, kernel + test, knobs, presets, register in `catalog.js`, thumbnail), linking `specs/003-visualization-studio/contracts/visualization-module.md`
- [ ] T086 Run `npm test` and `npm run build` in `web-client/`, confirm all playground tests pass unchanged (SC-007) and that studio code is in separate lazy chunks (check the build output), then walk through every manual check in `specs/003-visualization-studio/quickstart.md` and note results — **Partly done:** `npm test` (299 tests) and `npm run build` pass; studio code is in lazy chunks. The manual quickstart walkthrough was not done.

---

## Implementation notes

- Analysis findings C1, C2, I1, I2 and A1 were fixed while building: Ulam spiral hover readout, Lorenz start-point knobs (`x0`, `y0`, `z0`), presets may carry `input`, modules can call `ctx.setValues`, and the chaos game has a "Center is a target too" toggle for the Vicsek preset.
- Reaction–diffusion, Mandelbrot/Julia and DLA run their kernels in a Web Worker pool (`core/workerPool.js`), falling back to in-thread in tests.

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup; blocks all stories
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after US1's shell (T016–T022); module interaction tasks T055–T063 each need their module from T025–T047
- **US3 (Phase 5)**: after US1's shell (T019, T022). Independent of US2 (saves whatever config the viewer holds; with only US1 that is defaults plus view)
- **US4 (Phase 6)**: after US1's shell; T079 needs US3's `MyVisualizations.jsx`; the rest is independent of US2/US3
- **Polish (Phase 7)**: after the stories you intend to ship

### Within phases

- T005–T011 are independent of each other; T012 needs nothing but can't be tested until modules exist; T013 needs T005, T007, T009, T010; T014 needs T006, T012, T013, T003; T015 is independent
- T016 → T017 → T018; T019 → T022; T020, T021 independent; T024 after T020–T022
- T025–T047 are independent of each other and of the shell (they only need Phase 2); T031 needs T030's kernel
- T049 → T050 → T053; T054 before T055–T063
- T067 → T071; T075 → T076, T078

### Story completion order

```text
Setup → Foundational → US1 (MVP) → US2 ─┐
                              │         ├→ Polish
                              ├→ US3 ───┤
                              └→ US4 ───┘   (T079 waits for US3)
```

## Parallel Execution Examples

**Phase 2**:
```text
T005 rng.js · T006 knobs.js · T007 palettes.js · T008 loop.js · T009 progressive.js · T011 reducedMotion.js · T015 draw.js
```

**US1**: once T022 is done, all 23 module tasks can run side by side, e.g. one agent per category:
```text
Number patterns: T025 T026 T027 T028 T029
Fractals:        T030 T031 T032 T033 T034
Simulation:      T035 T036 T037 T038 T039 T040
Geometry:        T041 T042 T043 T044 T045
Algorithms:      T046 T047
```
(The shell tasks T016–T024 can run alongside the module tasks.)

**US2**: T049, T051, T052 together; then after T054, T055–T063 together (one per module).

**US3/US4**: T069 and T070 together; T077 and T078 together.

## Implementation Strategy

### MVP first

1. Phase 1 + Phase 2.
2. US1 shell (T016–T024) plus a first slice of modules, e.g. times-table, phyllotaxis, Mandelbrot, Game of Life, sorting (T028, T045, T030, T035, T046). Demo.
3. Remaining US1 modules.

### Incremental delivery

1. US1 → demo: catalog and all pictures at defaults.
2. US2 → demo: knobs, presets, playback, interaction (the full P1 experience).
3. US3 → saving.
4. US4 → sharing and export.
5. Polish.

Each story leaves the playground untouched and `npm test` green.
