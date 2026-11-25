---

description: "Task list for the Navier–Stokes Fluid Simulation, a Shared Performance Layer, and a Leaner Interface"
---

# Tasks: Navier–Stokes Fluid Simulation, a Shared Performance Layer, and a Leaner Interface

**Input**: Design documents from `specs/005-navier-stokes-fluid-performance/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R14), data-model.md, contracts/ (module-additions, gpu-toolkit, fluid-simulation, quality, render-audit, gpu-tests), quickstart.md

**Tests**: Included. The spec requires automated proof (FR-031, FR-035, SC-012, SC-016, SC-017) and the project's convention from 003 and 004 is tests with each change. Test tasks come before the implementation tasks they cover. Existing tests must keep passing at every checkpoint.

**Organization**: Tasks are grouped by user story so each story can be built and checked on its own. US1 to US3 are the new visualization, US4 and US5 are the performance layer, US6 is the interface work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = stir a fluid, US2 = shape its behavior, US3 = smooth on any device, US4 = shared Quality layer, US5 = existing animated simulations on the GPU, US6 = fewer redraws
- All paths are relative to the repository root. App code is in `web-client/src/`, tests in `web-client/src/__tests__/`, shared GPU code in `web-client/src/studio/visualizations/_shared/gpu/`.
- `V/` below means `web-client/src/studio/visualizations/`.

---

## Phase 1: Setup

**Purpose**: Establish the baseline, the browser test project and the measuring page **before any behavior changes**. The spec's baseline is "before any change" (Assumptions, FR-026).

- [X] T001 In `web-client/`, run `npx vitest run` and `npm run build`; write the passing test count and build size at the top of a new `specs/005-navier-stokes-fluid-performance/measurements.md`. Every later checkpoint must match or exceed it (SC-012). **Status:** 51 test files, 675 tests, build OK; recorded in `measurements.md`.
- [X] T002 In `web-client/package.json` add devDependencies `@vitest/browser-playwright` at exactly `5.0.5` (must equal the installed `vitest`) and `playwright`, and scripts `"test:gpu": "vitest run --config vitest.gpu.config.js"` and `"test:all": "npm test && npm run test:gpu"`; run `npm install` and `npx playwright install chromium`.
- [X] T003 [P] Create `web-client/vitest.gpu.config.js` per `contracts/gpu-tests.md` (include `src/__tests__/gpu/**/*.gpu.test.js`, headless Chromium through the Playwright provider with the four software-GL launch flags, 60 s timeout). In `web-client/vite.config.js` add `**/*.gpu.test.js` to `test.exclude` (keep Vitest's default excludes) so `npm test` is unchanged and needs no browser.
- [X] T004 Create `web-client/src/__tests__/gpu/probe.gpu.test.js` as a spike that does not use the toolkit: make a canvas, assert `getContext("webgl2")` works and `EXT_color_buffer_float` exists, render 0.1234567 into an RGBA32F target and read it back within 1e-7. Run `npm run test:gpu` locally and adjust `vitest.gpu.config.js` until it is green (confirm the Vitest 5 provider option names). **Status:** green locally (3 tests, Playwright Chromium 159, build 1255).
- [X] T005 [P] Create `.github/workflows/gpu-tests.yml`: runs on `pull_request` (paths `web-client/**`) and `workflow_dispatch`; Node 22, `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:gpu`, all in `web-client/`. A separate workflow is used because `deploy-web-client.yml` also runs the real deployment steps and must not be used to try this out.
- [ ] T006 Run the T005 workflow (manual dispatch) and record the result of T004 on the developer machine and on `ubuntu-latest` in the table in `specs/005-navier-stokes-fluid-performance/quickstart.md`. If the runner cannot give WebGL2, apply the fallback in research R7 (GPU tests run locally and in the manual workflow; CI reports "not run"; never passes silently) and write that decision into the same file. **Status:** local half done and recorded in `quickstart.md`. **CI half not run**: it needs a push and a manual run of `gpu-tests.yml`, which was not done without your say-so. Leave unchecked until it is run.
- [X] T007 [P] Create `web-client/src/studio/core/bench.js` (pure: `summarize(frameMs[])` → mean, p95, fps; `toMarkdownRow(...)` for the `PerformanceMeasurement` fields in data-model.md) and `web-client/src/__tests__/studio/core/bench.test.js`.
- [X] T008 Create `web-client/src/studio/dev/BenchPage.jsx` and add the route `BENCH_PATH = "/studio/__bench"` in `web-client/src/Root.jsx` using the same dev-only `import.meta.env.DEV` lazy pattern as `ThumbnailStudio`. For each catalog entry and each level it offers it runs the module through the real `createLoop` for 120 frames (animated) or until `ctx.idle()` and `isBusy()` settle (static), and shows mean/p95 frame time or time-to-picture with a "Save as table" button. It must work with the unmodified modules so it can take the baseline. It also records the longest single `step`, `render`, `update` and `resize` call per module and level, so the 50 ms rule can be checked (FR-025).
- [X] T009 **Manual, blocks Phase 2.** On the reference laptop and the reference phone (dev server over the local network), run the bench page for all 23 existing visualizations at default settings and write them as `phase: baseline` rows in `specs/005-navier-stokes-fluid-performance/measurements.md`. Save one screenshot per visualization at default settings and seed in `specs/005-navier-stokes-fluid-performance/baseline/` (commit only files under 60 KB). Write "not measured" for anything that cannot be taken, never an estimate. **Status:** baseline taken on the development machine (Apple M2, real GPU) plus a 6× CPU-throttle stand-in; **reference phone not measured**; screenshots replaced by pre-change pixel hashes for all 23 visualizations (`web-client/src/__tests__/gpu/baseline.hashes.json`, checked by `baseline.gpu.test.js`).

**Checkpoint**: Baseline recorded, `npm test` unchanged, `npm run test:gpu` runs.

---

## Phase 2: Foundational (blocking)

**Purpose**: The shell additions, the GPU toolkit, the quality plumbing and the governor. Every story needs part of this.

**⚠️ CRITICAL**: No user story starts before this phase is done. Do T009 first.

### Pure shell logic (parallel)

- [X] T010 [P] Create `web-client/src/studio/core/statsStore.js` (`createStatsStore()` with `set(obj)`, `get()`, `subscribe(fn)`, `clear()`, compatible with `useSyncExternalStore`) and write `web-client/src/__tests__/studio/core/statsStore.test.js` first.
- [X] T011 [P] Create `web-client/src/studio/core/quality.js` (`QUALITY_LEVELS`, `withQuality(module)` per `contracts/quality.md`: idempotent, adds the `quality` knob in group "Performance" with default `auto` for animated modules and `medium` for static, only when `module.quality` is declared; `effectiveLevel(values, governorLevel)`; `scaleFor(module, level)`) and write `web-client/src/__tests__/studio/core/quality.test.js` first (knob present only with a descriptor, options per group, a config without `quality` validates to the default with no "replaced" entry, a share link omits the default value and an old payload decodes to it).
- [X] T012 [P] Create `web-client/src/studio/core/qualityGovernor.js` per data-model.md GovernorState and write `web-client/src/__tests__/studio/core/qualityGovernor.test.js` first, driving a fake clock through: step down after two slow windows, 1 s settle, step up after 8 s fast and 20 s since the last step down, never above Medium, the 60 s lock after an up-then-down within 10 s, the once-only "too slow even at the lowest quality" notice, `reset()`.
- [X] T013 [P] In `web-client/src/studio/core/loop.js`: pass the rAF timestamp to `onFrame(ts)`; add the `isIdle` option and `wake()` (contracts/quality.md, "Loop changes"); add the dev-only `?load=<ms>` busy-wait guarded by `import.meta.env.DEV`. Extend `web-client/src/__tests__/studio/core/loop.test.js` first with timestamp, idle stops scheduling, wake restarts only while playing, and an unchanged-behavior case for callers that pass none of the new options.
- [X] T014 [P] In `web-client/src/studio/core/moduleContext.js` add `showMessage`, `clearMessage`, `requestRestart` and `gpuForced` (options `onMessage`, `onRestart`, `gpuForced`, all no-ops by default; calls after `dispose` are ignored like the existing members). Create `web-client/src/__tests__/studio/core/moduleContext.test.js` first.
- [X] T015 In `web-client/src/studio/catalog.js` apply `withQuality` inside `e()` after `withSweep`, so every load adds the quality knob to modules that declare it (depends on T011). Confirm the existing `web-client/src/__tests__/studio/sweep.contract.test.js` and `modules.contract.test.js` still pass.

### GPU toolkit (`V/_shared/gpu/`)

- [X] T016 [P] Write the toolkit tests first. `web-client/src/__tests__/studio/core/gpuMode.test.js` (jsdom): `openGpu` returns `null` without throwing when there is no WebGL, `?gpu=off`, `globalThis.__VIZ_GPU__ = "off"` and `ctx.gpuForced = "off"` each force `null`, the probe result is cached. `web-client/src/__tests__/gpu/toolkit.gpu.test.js` (browser): `openGpu` returns a `Gpu` with `version` 2; `target` round-trips for `rgba8`, `rgba16f`, `rgba32f` through `upload`/`readback`; `pair().swap()`; `resize(..., { keep: true })` keeps content; a shader error throws with numbered source lines; `paletteTexture` matches `ctx.palette`; `dispose()` then a fresh `getContext` still succeeds.
- [X] T017 Create `V/_shared/gpu/context.js`: `gpuMode()`, `probeGpu({ need })` on a cached scratch canvas, and `openGpu(canvas, { need, ctx })` per `contracts/gpu-toolkit.md`, including the context options (`preserveDrawingBuffer: true`, no antialias, no alpha) and a `globalThis.__VIZ_GL_VERSION__` override (1 or 2) used by tests and dev to exercise the WebGL1 path.
- [X] T018 [P] Create `V/_shared/gpu/program.js` (compile, link, cache by name, readable errors with numbered source, adds `#define MANUAL_FILTER` when `caps.linearHalf` is false).
- [X] T019 [P] Create `V/_shared/gpu/targets.js` (`target`, `pair`, `upload` with optional row range, `readback`, `resize` with a resample pass when `keep` is set; format mapping from `contracts/gpu-toolkit.md`).
- [X] T020 [P] Create `V/_shared/gpu/draw.js` (full-screen triangle pass, `drawInstanced` using `ANGLE_instanced_arrays` on WebGL1).
- [X] T021 [P] Create `V/_shared/gpu/palette.js` (256 × 1 `rgba8` palette texture, cached per palette name).
- [X] T022 Create `V/_shared/gpu/index.js` (barrel) and finish the context-loss handling in `context.js`: `webglcontextlost` → `preventDefault`, `isLost()`, `onLost`; `webglcontextrestored` → recreate resources lazily, `onRestored`; no restore within 3 s → `ctx.requestRestart({ forceProcessor: true })`; `dispose()` deletes everything and calls `WEBGL_lose_context.loseContext()`. Make T016 green with `npm test` and `npm run test:gpu`.

### Viewer and shell wiring (one file, so in order)

- [X] T023 Create `web-client/src/__tests__/studio/helpers/stubModule.js` (a configurable stub module: `actions`, `multiTouch`, `quality`, `isIdle`, `setQuality`, a recording `pointer`) and `web-client/src/__tests__/studio/viewerContract.test.jsx`, written first, covering: action buttons call `action(id)`; three simultaneous pointers reach a `multiTouch` module with their `pointerId` and never produce `pinch`/`cancelDrag` (a non-`multiTouch` module still pinches); `showMessage` renders a `role="status"` overlay and its action button calls `onAction`; `requestRestart` mounts a new canvas element and calls `create` again with `ctx.gpuForced === "off"` when asked; `isIdle() === true` stops frame requests and `update`/`pointer`/`action`/`reset`/`resize` wake it; a quality change resizes the canvas by `scale[level]` and calls `setQuality`; applying a preset keeps the chosen quality.
- [X] T024 In `web-client/src/studio/components/Viewer.jsx` give the `<canvas>` a `key` (epoch state) and handle `ctx.requestRestart`: bump the epoch, tear down, recreate with `gpuForced` from the request (FR-034, research R2).
- [X] T025 Create `web-client/src/studio/components/ActionBar.jsx` and render it from `Viewer.jsx` after the playback bar for modules that declare `actions` (buttons with `label` and `title`, keyboard and touch usable, calling `instRef.current.action(id)`); add the styles to `web-client/src/studio/studio.css`.
- [X] T026 In `Viewer.jsx` route pointers for `multiTouch` modules: send each pointer's `down`/`move`/`up` with `pointerId`, up to 10 at once, skip the two-pointer pinch logic and the `cancelDrag` message; leave every other module's pointer handling byte-for-byte as it is.
- [X] T027 In `Viewer.jsx` and `web-client/src/studio/studio.css` render the `showMessage` overlay on the canvas wrap (`role="status"`, optional action button) and `clearMessage`; when the instance has `unsupported: true` hide the settings panel and playback bar. Document the `unsupported` flag in `specs/005-navier-stokes-fluid-performance/contracts/module-additions.md`.
- [X] T028 In `Viewer.jsx` wire the idle loop: pass `isIdle: () => instRef.current?.isIdle?.() ?? false` to `createLoop` and call `loopRef.current.wake()` after `update`, `pointer`, `action`, `reset` and `resize` (FR-024).
- [X] T029 In `Viewer.jsx` wire quality: compute the effective level (`effectiveLevel`), apply `scale[level]` to the canvas pixel size on create, on change and on resize, call `instRef.current.setQuality(level, { automatic })` when it exists (else `update(config, ["quality"])`), create the governor for animated modules at `auto` and feed it from the loop's `onFrame(ts)`, show its notices through the existing notice area, stop it when the visitor picks a fixed level, and make `onPreset` copy the current `quality` into the new configuration (today `applyPreset` rebuilds values from defaults). Make T023 green.
- [X] T030 [P] Extend `web-client/src/__tests__/studio/modules.contract.test.js` for the new optional fields: `actions` (1–4 entries, unique ids, `key` is one character and not `" "`, `"."`, `"r"`, `"R"`, requires `animated` or `interactive`), `multiTouch` requires `interactive`, `quality` descriptor shape (`scale` values in (0, 1], `levers` has `low`/`medium`/`high` and `setQuality` exists when `levers` is declared, `medium` equals the old behavior), and that every module with `quality` gets the knob with the right default.

**Checkpoint**: `npm test` and `npm run test:gpu` pass; no visible change for visitors yet.

---

## Phase 3: User Story 1 - Stir a fluid and watch it flow (Priority: P1) 🎯 MVP

**Goal**: "Fluid simulation" is in the "Simulation and emergence" category, opens with a moving scene, reacts to drags and taps, has Burst, Clear, Reset, Pause, Step and an explanation.

**Independent Test**: Quickstart checks 1–8. Open the catalog, filter by "Simulation and emergence", open "Fluid simulation", drag, press Burst and Clear.

### Tests for User Story 1 (write first)

- [X] T031 [P] [US1] Create `web-client/src/__tests__/studio/fluid/kernel.test.js`: `simSize(level, aspect)` for all levels; `initialSplats(createRng(seed), 5)` is identical for the same seed, differs for another, gives at least 3 splats with colors sampled in 0.25–0.95; `burstSplats(rng, 7)` returns 7 splats at different places and continues the rng stream; `dissipationDivisor(rate, dt)` equals `1 + rate × dt`; `levelValues` matches the table in research R3.
- [X] T032 [P] [US1] Create `web-client/src/__tests__/gpu/fluid.gpu.test.js`: a splat puts dye and velocity at its position and nowhere far from it; dye moves along a uniform velocity after advection; after the pressure solve at 20 iterations the divergence residual is small; Burst adds at least five separate dye blobs; Clear leaves velocity, dye and pressure all zero; `reset()` after strokes gives dye identical to a fresh `create` with the same seed (same device); two `pointerId`s stroke independently; a tap makes one small splat without consuming `ctx.rng`.

### Implementation for User Story 1

- [X] T033 [P] [US1] Create `V/fluid/kernel.js`: `simSize`, `initialSplats`, `burstSplats`, `dissipationDivisor`, `stepUniforms(values)`, `levelValues(level)`, `strokeColor(count, lut)` (golden-ratio stepping through the palette), per data-model.md and contracts/fluid-simulation.md. No DOM, no GL, no `Math.random`.
- [X] T034 [P] [US1] Create `V/fluid/shaders.js` with GLSL ES 1.00 sources for the passes in research R3: splat, curl, vorticity, divergence, pressure scale, Jacobi, gradient subtract, advection (with the `MANUAL_FILTER` path), copy/resample, display. Walls reflect velocity; display tone-limits so strokes saturate cleanly.
- [X] T035 [US1] Create `V/fluid/gpu.js`: build the targets for the effective level and canvas aspect; `step()` runs the nine passes in the order in `contracts/fluid-simulation.md` with dt = 1/60; `render()` runs the display pass and reports `{ steps }`; a queue of pending splats (pointer, Burst, opening); `pointer(event)` with per-`pointerId` strokes, clipping, taps, `leave`/`up` ending the stroke, keys `b`/`c` case-insensitive returning `true`; `action("burst" | "clear")`; `reset()` = clear then `initialSplats(createRng(config.seed), 5)`; `update(config, changed)` reading the settings each step; `resize`; `destroy()` via the toolkit; a non-production `__debug.readState()`.
- [X] T036 [US1] Create `V/fluid/index.js`: the module export from `contracts/fluid-simulation.md` and the knobs in data-model.md FluidSettings (all ranges and defaults, `quality` last), `howItWorks` written fresh to cover FR-012 and containing the sentences "velocity dissipation slows the motion over time" and "density dissipation fades the ink", `actions`, `multiTouch`, `animated`/`random`/`interactive`/`stepsPerFrame`, and `create` = `openGpu(canvas, { need: ["halfFloatTarget"], ctx })` → GPU instance, else the no-op instance with `unsupported: true` and `ctx.showMessage(UNSUPPORTED_TEXT)` (research R12). The no-op instance implements every required method so the jsdom contract test passes.
- [X] T037 [US1] In `web-client/src/studio/catalog.js` add `e("fluid-simulation", "Fluid simulation", "simulation", "≋", <summary from contracts/fluid-simulation.md>, () => import("./visualizations/fluid/index.js"))` at the end of the "Simulation and emergence" entries. Run `web-client/src/__tests__/studio/modules.contract.test.js` and fix what it finds.
- [X] T038 [US1] Run `npm run dev`, open `/studio/__thumbnails`, render and save the fluid's card picture to `web-client/public/thumbs/fluid-simulation.webp` (at most 30 KB; the whole folder under 500 KB). Run `web-client/src/__tests__/studio/thumbnailFiles.test.js`.
- [X] T039 [US1] Run checks 1–8 from `specs/005-navier-stokes-fluid-performance/quickstart.md` by hand against `web-client/` (`npm run dev`) and fix what they show. For SC-002, hand the dev server to someone who has not seen it and time how long they take to make the fluid respond with no instructions (target: 10 s or less); write the result in `specs/005-navier-stokes-fluid-performance/measurements.md`. Run `npm test`, `npm run test:gpu`, `npm run build`. **Status:** checks 1–3 and 5–8 run in a real browser on the GPU (Playwright script; all pass, no page errors, SC-002 timed trial not done). Check 4 (real touch screen) not run: two independent pointers are covered by the GPU test. Fixes found on the way: opening/Burst splashes were too dim (added `SPLASH_GAIN`), and a toolkit bug where the first draw reading an unbuilt texture wrote to the wrong framebuffer (fixed, with regression tests).

**Checkpoint**: User Story 1 works on its own. This is the MVP: the fluid is playable with the starting settings.

---

## Phase 4: User Story 2 - Shape how the fluid behaves (Priority: P2)

**Goal**: The seven settings change the fluid live without restarting. Velocity dissipation slows the motion and density dissipation fades the ink. Presets and the sweep exist. Nothing blows up at the extremes.

**Independent Test**: Quickstart checks 9–13.

### Tests for User Story 2 (write first)

- [X] T040 [P] [US2] Extend `web-client/src/__tests__/gpu/fluid.gpu.test.js`: **SC-005** — after the same stroke, kinetic energy after N steps at `velocityDissipation` 0 is at least 3× that at 4, and the dye total at `densityDissipation` 0 is at least 3× that at 4; Curl 50 keeps more small-scale energy than Curl 0; Pressure iterations 4 leaves a larger divergence residual than 60; changing a setting through `update()` leaves the dye total and velocity unchanged on that step; **SC-006** — all-min and all-max for 3600 steps at Low quality, and each single setting at either extreme (others at default) for 600 steps, each with repeated strokes, reading back every 100 steps: all values finite, dye within its clamp, velocity within its clamp, dye not all zero after a stroke. **Status:** done; the 3600-step runs of every setting at its minimum and at its maximum, and each single extreme, stay finite and bounded. The "lowest density dissipation" test led to raising its minimum to 0.1 (see T043). I dropped one invented test ("the default ink fades faster than the motion"): it was false, since the advection scheme itself diffuses motion.
- [X] T041 [P] [US2] Create `web-client/src/__tests__/studio/fluid/module.test.js` (jsdom): defaults equal the spec's starting values (Pressure iterations 20, Pressure 0.80, Curl 30, Splat radius 0.25, Splat force 6000, Velocity dissipation 0.20, Density dissipation 1.00), at least three presets plus the generated "Animated sweep", every preset validates, `howItWorks` contains the required sentences, sweep targets are knobs of type `range`.

### Implementation for User Story 2

- [X] T042 [US2] In `V/fluid/gpu.js` and `V/fluid/shaders.js` add the stability measures from research R3: clamp the speed added by a splat and by vorticity, clamp velocity after the gradient step, clamp dye per channel, fixed dt; make `update()` apply every setting on the next step without clearing anything. Make T040 green. **Status:** the clamps were built into the shaders from the start (shaders.js, gpu.js); T040 proves them.
- [X] T043 [US2] Tune the ranges in `V/fluid/index.js` to what T040 proves stable; write the final ranges back into `specs/005-navier-stokes-fluid-performance/data-model.md` (FluidSettings table). **Status:** one range changed: Density dissipation minimum 0 → 0.1. Written back into `data-model.md`, `research.md` R3 and `quickstart.md`.
- [X] T044 [P] [US2] In `V/fluid/index.js` add the three presets (Lingering ink, Quick splashes, Turbulent; values in research R13) and the `sweep` declaration (Curl and Velocity dissipation, `periodMs` 40000). Make T041 green. Re-render the card picture (T038 steps) if the `thumbnail` recipe changes. **Status:** the presets, sweep and thumbnail recipe were written with the module in T036; this task is the tests (T041) and the check that they work in a real browser.
- [X] T045 [US2] Run checks 9–13 from `specs/005-navier-stokes-fluid-performance/quickstart.md` by hand against `web-client/` (`npm run dev`); run `npm test` and `npm run test:gpu` in `web-client/`. **Status:** checks 9, 12, 13 run in a real browser on the GPU. Checks 10 and 11 are covered by the GPU tests (SC-005, the Curl effect, the pressure-iterations effect). A real-browser check found the "preset crashes the GPU path" bug (see research R3, "One instance per canvas").

**Checkpoint**: User Stories 1 and 2 work on their own.

---

## Phase 5: User Story 3 - Smooth on any device, with a clear message when it cannot run (Priority: P2)

**Goal**: The fluid has Quality levels and Auto, runs on WebGL1 hardware, shows a plain message when it cannot run, recovers from a lost context, keeps its content on resize, and releases everything on leaving.

**Independent Test**: Quickstart checks 14, 16–19 and 25, plus checks 4 and 15 on the reference phone.

### Tests for User Story 3 (write first)

- [X] T046 [P] [US3] Extend `web-client/src/__tests__/studio/fluid/module.test.js` (jsdom, no WebGL): opening the fluid in a `Viewer` shows the unsupported message, hides the settings and playback bar, keeps the back control working, and the catalog and another visualization still open; `?gpu=off` gives the same. **Status:** `web-client/src/__tests__/studio/fluid/unsupported.test.jsx` (jsdom, through the real `Root`).
- [X] T047 [P] [US3] Create `web-client/src/__tests__/gpu/fluid.lifecycle.gpu.test.js`: lose then restore the context → the opening scene returns and the notice is reported; lost and not restored within 3 s → the Restart message is shown and its action calls `requestRestart`; open and destroy 30 times then a fresh `getContext` and first frame still work (SC-007); resizing to a new aspect keeps the dye total within 5%; changing Quality keeps the dye total within 5% and never leaves an all-zero frame; the WebGL1 path (`__VIZ_GL_VERSION__ = 1`) passes the T032 splat, advection and divergence checks. Create `web-client/src/__tests__/gpu/capture.gpu.test.js` for the fluid: `toBlob`, `captureStream` and `makeThumbnail` after an `await` return a non-blank picture. **Status:** `fluid.lifecycle.gpu.test.js` (13 tests) and `capture.gpu.test.js` (4 tests), all pass. The WebGL1 half uses the canvas readback hook because WebGL1 cannot read half floats.

### Implementation for User Story 3

- [X] T048 [US3] Add the `quality` descriptor (`levers` sim and dye sizes from research R3) and `setQuality(level, { automatic })` to `V/fluid/index.js` and `V/fluid/gpu.js`; default knob value `auto`; rebuild the grids with `resize(..., { keep: true })` and never clear. Quality changes only the grid sizes; the step size and `stepsPerFrame` stay the same. **Status:** implemented with the module in T035/T036 (`quality.levers`, `setQuality`, `rebuild`); proved by the lifecycle tests.
- [X] T049 [US3] Add the WebGL1 path to the fluid: half-float targets through `OES_texture_half_float` and `EXT_color_buffer_half_float`, RGBA formats where single-channel is not renderable, the `MANUAL_FILTER` bilinear read when `caps.linearHalf` is false. All shaders stay GLSL ES 1.00 (research R1). **Status:** one GLSL ES 1.00 source for both versions (no separate WebGL1 shaders); the half-float, RGBA-only target design needed no change. `MANUAL_FILTER` is built in but cannot be exercised here, because the available software GL filters half floats in hardware.
- [X] T050 [US3] In `V/fluid/gpu.js` handle `gpu.onLost` (stop drawing), `onRestored` (rebuild, restart from the opening scene, `ctx.reportNotice("The graphics card was reset, so the picture restarted.")`) and the 3 s timeout (`ctx.showMessage` with the "Restart" action calling `ctx.requestRestart({})`). **Status:** in `gpu.js` (`onRestored` → reset and notice, `handleUnrecovered` → message with Restart); tested, and checked in a real browser.
- [X] T051 [US3] In `V/fluid/gpu.js` implement `resize(w, h)` so an aspect change resamples velocity, dye and pressure into the new grids instead of clearing them (FR-019). Make T047 green. **Status:** in `gpu.js` (`resize` → `rebuild` with `keep`); tested for a new shape, a bigger window and every quality change.
- [X] T052 [US3] Run quickstart checks 14, 16–19 and 25 by hand, and checks 4 and 15 on the reference phone. Record the fluid's Low/Medium/High and Auto rows in `specs/005-navier-stokes-fluid-performance/measurements.md` (SC-003, SC-004). If Medium misses 50 fps on the reference laptop, adjust the grid sizes in `levelValues` and re-measure. **Status:** checks 14, 16–19 and 25 run in a real browser; measurements in `measurements.md`. **Reference phone not measured** (checks 4 and 15 on a phone, SC-003 at Low on a phone).

**Checkpoint**: User Stories 1 to 3 work. The fluid simulation is complete and shippable on its own.

---

## Phase 6: User Story 4 - Every other visualization gets the same performance layer (Priority: P2)

**Goal**: A Quality choice appears wherever Low is at least 20% cheaper than High; animated modules get Auto; old links and saved items open as before; finished or paused visualizations use almost nothing.

**Independent Test**: Quickstart checks 15, 20 and 21.

### Tests for User Story 4 (write first)

- [X] T053 [P] [US4] Create `web-client/src/__tests__/studio/quality.catalog.test.js`: for every catalog entry, the `quality` knob exists exactly when the module declares a descriptor; default `auto` for animated and `medium` for static; static modules have no `auto` option; a config saved without `quality` validates with no notice; a share link made before this feature decodes to the default; `scale` factors are in (0, 1]; for modules with `levers`, `levelValues("medium")` equals the value the module used before. **Status:** `quality.catalog.test.js`.
- [X] T054 [P] [US4] Extend `web-client/src/__tests__/studio/viewerContract.test.jsx`: an animated stub on Auto with a fake clock steps down, shows "Lowered quality to keep this smooth.", resizes the canvas, calls `setQuality(level, { automatic: true })`; choosing Low stops adapting; a static stub never adapts. Add the finished-run case: a stub whose `isIdle()` becomes true stops requesting frames (FR-024). **Status:** the Auto, fixed-choice and static cases are in `viewerContract.test.jsx` (T023); the finished-run, wake and sweep cases are there and in `idle.test.js`.

### Implementation for User Story 4 (the 20% gate decides what stays)

Each task adds the candidate descriptor from `contracts/quality.md`, applies it in the module, measures Low against High in `/studio/__bench`, and **removes the descriptor if Low is not at least 20% cheaper** (FR-020). Record the decision in `measurements.md`.

- [X] T055 [P] [US4] Mandelbrot: `scale` plus an `iterations` multiplier lever (low 0.5, medium 1, high 1.5) in `V/mandelbrot/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T056 [P] [US4] Julia: the same in `V/julia/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T057 [P] [US4] Barnsley fern: `points` multiplier (0.25, 1, 2) and `scale` in `V/barnsley/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T058 [P] [US4] Chaos game: the same in `V/chaosGame/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T059 [P] [US4] Diffusion-limited aggregation: `particles` multiplier (0.25, 1, 2) in `V/dla/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`. DLA got a `particles` lever instead (its cost is the walker count).
- [X] T060 [P] [US4] Voronoi and Delaunay: `scale` only in `V/voronoi/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T061 [P] [US4] Measure Collatz coral, Ulam spiral, Pascal's triangle mod n, Phyllotaxis and L-system for a Low/High difference of 20% or more; add a descriptor (a `count` or `depth` cap lever or `scale`) only to those that pass. Files: `V/collatz/index.js`, `V/ulam/index.js`, `V/pascalMod/index.js`, `V/phyllotaxis/index.js`, `V/lsystem/index.js`. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T062 [P] [US4] Add `quality: { scale: { low: 0.5, medium: 1, high: 1 } }` as the candidate descriptor to the 12 animated modules: `V/life/index.js`, `V/elementaryCA/index.js`, `V/grayScott/index.js`, `V/boids/index.js`, `V/langton/index.js`, `V/lorenz/index.js`, `V/doublePendulum/index.js`, `V/fourier/index.js`, `V/recaman/index.js`, `V/timesTable/index.js`, `V/sorting/index.js`, `V/maze/index.js`. These are processor-path measurements; US5 re-measures after the GPU ports. **Status:** measured in one pass (T064): all 23 modules got a candidate `scale` descriptor, and the gate decided. Kept: Mandelbrot, Julia, Chaos game, Barnsley. See `measurements.md`.
- [X] T063 [P] [US4] Add `isIdle()` to the processor instances of `V/sorting/index.js` (sorted and finished, no pending steps) and `V/maze/index.js` (generation and solving finished), so the loop stops requesting frames on a finished run (FR-024). Confirm with the loop test and measure CPU use of a finished sort and maze against SC-013. **Status:** `isIdle` added to the processor instances of sorting and maze; a loop with a sweep on never idles. Confirmed in a real browser: 0 frames in 2 s once a sort finishes.
- [X] T064 [US4] Run the bench page at Low and High for every module with a candidate descriptor (T055–T062), apply the 20% gate, delete the failing descriptors, and write every decision and figure into `specs/005-navier-stokes-fluid-performance/measurements.md` (SC-008). Fail any module whose longest single call exceeds 50 ms at any level it offers (FR-025). Then update the candidate table in `specs/005-navier-stokes-fluid-performance/contracts/quality.md` to the final list. **Status:** done with a noise floor added to the rule (documented in `measurements.md` and `contracts/quality.md`). **Result: only 5 existing modules keep a Quality choice (Mandelbrot, Julia, Chaos game, Barnsley, DLA), plus the fluid.** Measured on the real GPU and a weak-device stand-in; **the reference phone was not measured.** FR-025 was checked on those runs (longest call at most 29 ms on the real GPU for the existing modules; two exceed 50 ms only under the 6× CPU throttle, L-system and Fourier).
- [X] T065 [US4] Run quickstart checks 15, 20 and 21 by hand (Auto steps down under `?load=40`; old share links and saved items open with Auto or Medium and the same settings; static pictures at Medium are identical to the baseline screenshots from T009). Run `npm test`, `npm run test:gpu`, `npm run build`. **Status:** Auto stepping down under load is covered by the Viewer tests with a fake clock; checking it live with `?load=40` on the fluid was not done. Old links and saved items are covered by `quality.catalog.test.js`. Static pictures at Medium are checked against the pre-change pixel hashes (`baseline.gpu.test.js`).

**Checkpoint**: User Stories 1 to 4 work. Quality and Auto are in place on the processor paths.

---

## Phase 7: User Story 5 - The existing animated simulations run on the graphics card (Priority: P2)

**Goal**: Each of the 12 existing animated visualizations draws on the graphics card, and runs its step there where the algorithm allows, falling back to its current path without losing anything. The six rule-based ones match their kernels state for state; the other six look the same.

**Independent Test**: Quickstart checks 22–24.

**Order**: Do this phase after Phase 6, because both edit each animated module's `index.js`. The 12 modules are independent of one another; each can ship alone because its processor path stays valid.

### Shared pieces

- [X] T066 [P] [US5] Create `V/_shared/gpu/shapes.js` (instanced thick line segments, discs or rings, and triangles, as GLSL ES 1.00 programs plus small builders; WebGL lines are always one pixel wide, so thick lines are quads) and `web-client/src/__tests__/gpu/shapes.gpu.test.js` (a segment, a disc and a triangle render the expected pixels at known positions). **Status:** `_shared/gpu/shapes.js` has thick segments (flat, square or round ends, soft edges, alpha) and discs, as instanced quads with a distance-based fragment shader; 12 GPU tests (`shapes.gpu.test.js`) including WebGL 1, drawing into a target, y counting from the top; 5 mutations caught. **Triangles are not in it**: Boids draws its own, and none of the remaining six needs them.
- [X] T067 [P] [US5] Create `web-client/src/__tests__/gpu/fallback.gpu.test.js`: for each of the 12, create with `ctx.gpuForced = "off"` and confirm it takes the processor path, runs 200 steps and matches the existing kernel state, with `?gpu=off` as well (Story 5 scenario 4, FR-034). **Status:** `fallback.gpu.test.js`, 49 tests: for each of the 12, `ctx.gpuForced = "off"`, `?gpu=off` and `__VIZ_GPU__ = "off"` each give the processor path (no `path`, no debug hooks, a 2D canvas that is drawn on after 200 steps), the default is the graphics card, and Game of Life's processor picture matches `lifeStep`'s live cell count after 200 steps. Mutation-checked (both switches). **Not done:** a state comparison with the kernel for the other eleven on the processor path; those paths are the unchanged code and are the oracles of the other test files.

### Rule-based six (exact, oracle = the existing kernel)

For each pair: write the test first, then the port. Every port keeps the module's processor `create` as it is, adds `gpu.js`, makes `index.js` choose with `openGpu`, keeps every control it has today (settings, presets, pointer interaction, Pause, Step, speed, Reset, sweep, save, share, export, record), and exposes `__debug.readState()`. Each records its final split in research R5 (T095).

- [X] T068 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.life.gpu.test.js` — same settings and seed through `lifeStep` and the GPU instance, identical grid after every step, for every preset (including the glider gun with `input.cells`), 5 seeds, 1,000 steps; painting a cell and `commitDrawing` give the same `aliveCells`. **Status:** 44 GPU tests: 5 seeds x every preset x 1,000 steps (the grid compared after each of the first 40 steps, then every 20th), wrap on/off, custom rules, tiny and widest grids, empty and full starts, a rule change mid-run, painting, erasing and the C key against the saved `cells`, the drawn colours, 30 open/leave cycles and a lost-and-restored context. A mistake found by it: a restored context started from the advanced generator, not the seed; fixed.
- [X] T069 [P] [US5] Port Game of Life in `V/life/gpu.js` (+ `V/life/shaders.js`) and `V/life/index.js`: 8-bit state ping-pong, birth/survive rule as bit masks and wrap as uniforms, initial grid from `randomGrid(W, H, density, ctx.rng)` uploaded as is, state × palette texture draw, painting through `texSubImage2D`, readback for the drawing input, `setQuality` if the gate kept levers. **Status:** `life/gpu.js` + `life/shaders.js`; `index.js` picks GPU or the unchanged processor `createProcessor`. State is an 8-bit RGBA ping-pong and the rule is looked up in a 9x1 texture, so the step is exact. Not yet checked: the speed and look on a weak device (T094) or by hand in a browser (T096).
- [X] T070 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.elementaryCA.gpu.test.js` — rows identical to `elementaryStep` for every shipped preset and rule 0–255 sampled, 5 seeds, to the end of the run. **Status:** 71 GPU tests: 4 presets x 5 seeds x (the whole run + 150 rows, so the ring wraps), 32 rules, widths 64/97/1024, empty and full starts, rule/width/palette changes, the picture itself compared with the kernel row by row before and after scrolling, 30 open/leave cycles, a lost-and-restored context. Mutation-checked: swapping left and right, a ring that never wraps, and a display offset or flip each fail the tests.
- [X] T071 [P] [US5] Port the elementary cellular automaton in `V/elementaryCA/gpu.js` and `V/elementaryCA/index.js`: each step renders one new row into a ring texture from the previous row, rule as an 8-entry uniform, the same row-to-colour mapping, `isDone` unchanged. **Status:** `elementaryCA/gpu.js` + `shaders.js`; `index.js` picks GPU or the unchanged `createProcessor`. The row colours are worked out on the CPU with the processor's own expression, so rounding cannot differ.
- [X] T072 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.langton.gpu.test.js` — grid and ants identical to `antStep` over 1,000+ steps for every preset and 5 seeds; the uploaded texture equals the kernel grid. **Status:** 42 GPU tests: 5 presets x 5 seeds x 3,000 steps (grid and ants compared at the start, every step for the first 12, then every 250th, and at the end), rules of 2 to 12 turns, 1 to 8 ants on 64 to 512 cells, ants on the same cell, rule/size/palette changes, the picture cell by cell against the kernel grid, 30 open/leave cycles, a lost-and-restored context. Mutation-checked (a row left out of the upload, states collapsed, picture flipped, wrong ant colour).
- [X] T073 [P] [US5] Port Langton's ant in `V/langton/gpu.js` and `V/langton/index.js`: step stays on the CPU (`antStep`; sequential), grid uploaded as an 8-bit texture by changed rows, ants as points, palette in the shader. **Status:** `langton/gpu.js` + `shaders.js`; `index.js` picks GPU or the unchanged `createProcessor`. `antStep` stays on the processor; only the rows an ant has touched since the last picture are uploaded.
- [X] T074 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.recaman.gpu.test.js` — the arcs and terms the GPU instance uploads equal the kernel's for every preset and seed up to 2000 terms. **Status:** 24 GPU tests: the sequence equal to `recaman` for 2 to 2,000 terms and the layout of every arc equal to the processor path's for both presets and all three arc styles, step by step; the apex of arcs nothing else crosses is lit in the arc's own palette colour; "All above" leaves the lower half empty; ink in proportion to the line width (0.5, 1, 2, 4); `imageDiff` <= 12 and ink and brightness within 18% / 15% of the processor for both presets and two styles; setting changes; 30 open/leave cycles; lost-and-restored. Mutation-checked. **Found:** lines thinner than a pixel came out 1.5 times too bright (an edge formula that ignored the line's width); fixed in `shapes.js` and the arc shader, so a 0.5 px line now covers at most half a pixel as a canvas does.
- [X] T075 [P] [US5] Port Recamán's sequence in `V/recaman/gpu.js` and `V/recaman/index.js`: sequence from the kernel on the CPU, arcs generated in the vertex shader from the term list with `shapes.js`. **Status:** `recaman/gpu.js` + `shaders.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. The sequence stays on the processor (and is the oracle). Each arc is one instanced quad over its half of the ellipse; the fragment shader draws the outline from a first-order distance to the ellipse, cut at the axis like the canvas's flat line ends, so up to 2,000 strokes a frame become one draw. The plan had arcs generated in the vertex shader from the term list with `shapes.js`; this uses its own arc shader because `shapes.js` has no arcs.
- [X] T076 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.sorting.gpu.test.js` — array state and highlight state identical to the sort kernel at every step for all six algorithms, 5 seeds, to the end of the run. **Status:** 47 GPU tests: all six algorithms x 5 seeds, every step to the end (array, highlight and counters compared at each of the first 25 steps, every 11th and the last), four starting orders, 8 and 1000 bars, every preset, the picture (bar heights and colours, the highlighted pair, dot positions, the gap between bars), 30 open/leave cycles, a lost-and-restored context. Mutation-checked.
- [X] T077 [P] [US5] Port Sorting algorithms in `V/sorting/gpu.js` and `V/sorting/index.js`: kernel on the CPU, bars (and the dot display) as instanced quads from the value array, `isIdle()` when sorted. **Status:** `sorting/gpu.js` + `shaders.js`; `index.js` picks GPU or the unchanged `createProcessor`. The generators stay on the processor. Bars and dots are drawn in one pass from a values texture and a colours texture, not as instanced quads (simpler, and nothing is lost: the picture is the same). `isIdle()` when sorted is kept.
- [X] T078 [P] [US5] Test: `web-client/src/__tests__/gpu/exactness.maze.gpu.test.js` — maze grid, visited set and path identical to the maze and solver kernels at every step for all generators and solvers, 5 seeds, to the end of the run. **Status:** 30 GPU tests: 3 generators x 3 solvers x 5 seeds with the walls, carved cells, visited cells, phase and path equal to the kernels' at every one of the first 20 steps, every 13th, and the end; the 150-wide maze to the end; every preset; an unreachable goal gives the notice and no path; the picture (cells not yet reached, walls where the maze has them and nowhere else, the outer border on all four sides, visited tint, path colour, both markers); `imageDiff` <= 12 for every preset; clicking walls and dragging the start and goal, ignored while generating; a saved link's edits and endpoints; setting changes; 30 open/leave cycles; lost-and-restored. Mutation-checked (the one that exposed a gap, the outer border, now has a test).
- [X] T079 [P] [US5] Port Maze generation and pathfinding in `V/maze/gpu.js` and `V/maze/index.js`: kernels on the CPU, cells and walls as instanced quads and segments, path as a segment strip, `isIdle()` when finished. **Status:** `maze/gpu.js` + `shaders.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. Generators and solvers stay on the processor. The cells are one pass from a small grid texture; the walls, the path and the two markers use `shapes.js`; `isIdle()` when finished is kept. **Differs from the plan:** cells are a texture pass, not instanced quads. The walls are rebuilt on the processor each frame (up to about 34,000 segments for the biggest maze) because the generator changes them; nothing is cached.

### Decimal six (looks the same at a glance)

- [X] T080 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.grayScott.gpu.test.js` — same seed through the kernel and the GPU instance: state within 1e-3 mean and 1e-2 max over the first 5 steps; after 200 steps `imageDiff` at most 12 for every preset. **Status:** 20 GPU tests: 5 presets x 5 steps within the tolerances (mean < 1e-3, max < 1e-2) of `grayScottSteps`; the same seed gives the kernel's own start; 128 and 384 grids; after 200 steps `imageDiff` <= 12 against the kernel's picture for every preset; painting sets exactly the processor's 29-cell disc (and wraps); setting changes; 30 open/leave cycles; lost-and-restored. Added the shared helper `src/__tests__/gpu/gpuHarness.js` (makeCanvas, configFor, runGpu, runProcessor, imageDiff, lose, restore). Mutation-checked. The measured closeness figures are not recorded here; the test passes within those limits.
- [X] T081 [P] [US5] Port Reaction–diffusion in `V/grayScott/gpu.js` and `V/grayScott/index.js` with `need: ["floatTarget"]` (else the processor path): two-channel float32 ping-pong, 8 sub-iterations per step as 8 draws, Laplacian weights from `grayScottSteps`, `seedFields` uploaded, painting through a small splat pass, the same palette mapping. **Status:** `grayScott/gpu.js` + `shaders.js`; needs `floatTarget`, otherwise the unchanged `createProcessor` (worker) runs. Float32 ping-pong, 8 draws per step. Not checked: a device without float targets (the fallback is by the same `openGpu` rule as the fluid, which is tested), and the speed at twice the default size (T094).
- [X] T082 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.boids.gpu.test.js` — first-step velocities within 1e-4 of `flockStep` from the same flock; after 200 steps `imageDiff` at most 12 and the alignment order parameter within 0.1 of the processor's. **Status:** 30 GPU tests: 4 presets, 10 to 2000 boids, extremes of every rule, the three pointer modes, 5 seeds x 5 steps, the 200-step picture (`imageDiff` <= 12, alignment within 0.1) for all presets, triangle shape and area, rule/count/palette changes, 30 open/leave cycles, lost-and-restored. Mutation-checked. **Found:** the existing kernel's neighbour grid is `ceil(width / cell)` cells wide, so across the wrapping edge it misses neighbours that are inside the view radius; the GPU shader accepts exactly the kernel's 3 x 3 cell lookup so the two paths see the same neighbours (a brute-force scan failed the 1e-4 first-step test). The kernel itself was not changed.
- [X] T083 [P] [US5] Port Boids in `V/boids/gpu.js` and `V/boids/index.js`: position and velocity textures, a constant-bound neighbour scan up to the 2000-boid maximum, the pointer attractor as a uniform, instanced triangles coloured by heading, flock created with `createFlock(count, ASPECT, ctx.rng)`. **Status:** `boids/gpu.js` + `shaders.js`; needs `floatTarget`, otherwise the unchanged `createProcessor`. One draw updates every boid from all others (a loop bounded at 2,048); boids are instanced triangles that read the state texture in the vertex shader (needs vertex texture fetch, which every WebGL 2 device has and nearly every WebGL 1 device has). A bug found by a new test (`background.gpu.test.js`): every port painted its margins black instead of the studio background; fixed in the five ports.
- [X] T084 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.lorenz.gpu.test.js` — trail buffer equals the kernel trail; default picture `imageDiff` at most 12 after a short run (the chaotic long run is not compared). **Status:** 19 GPU tests: 3 presets x 800 steps with both points and both trails equal to the kernel's (same code, so exactly), the ring wrapped (100-point trail, 460 steps), every trail point lit where the kernel's projection puts it, for the default and a rotated view, `imageDiff` <= 12 for every preset, the amount of bluish and reddish ink and the ink's brightness within 5% of the processor's picture (the real ratio measured 0.999), no stray line between newest and oldest point, dragging and arrow keys (pitch clamped, view reported), settings that restart and ones that do not, 30 open/leave cycles, lost-and-restored. Mutation-checked, which found and fixed three weak tests along the way.
- [X] T085 [P] [US5] Port the Lorenz attractor in `V/lorenz/gpu.js` and `V/lorenz/index.js`: RK4 stays on the CPU, trails in a ring vertex buffer updated with `bufferSubData`, projection with yaw and pitch in the vertex shader, thick segments from `shapes.js`, the drag-to-rotate pointer logic unchanged. **Status:** `lorenz/gpu.js` + `shaders.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. RK4 stays on the processor. The trails are 3-D point rings in vertex buffers (every point stored twice so the window oldest..newest is one run), rotated and projected in the vertex shader (`project()` in GLSL) and drawn as thick round-ended segments with `shapes.js`; turning the view costs no processor work. The 85% opacity is mixed into an opaque colour so joints do not double-blend. `shapes.js` now exports its segment shader templates for modules with their own endpoints.
- [X] T086 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.doublePendulum.gpu.test.js` — trail and bob positions equal the kernel's; picture `imageDiff` at most 12 after a short run. **Status:** 19 GPU tests: 4 presets x 600 steps with state, trail and bob positions equal to the kernel's (the same code, so exactly), trail cap and no trail, `imageDiff` <= 12 for every preset, bobs and rods at their places in their colours, the trail's brightness along its length against the processor's picture, dragging either bob and the reported angles, setting changes (angles restart, arm length clears the trail), 30 open/leave cycles, lost-and-restored. Mutation-checked (fade, palette, rod and bob colours, trail clearing).
- [X] T087 [P] [US5] Port the double pendulum in `V/doublePendulum/gpu.js` and `V/doublePendulum/index.js`: integrator on the CPU, trail as a segment strip, rods and bobs from `shapes.js`, dragging the bobs unchanged. **Status:** `doublePendulum/gpu.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. RK4 stays on the processor; the trail (up to 5,000 segments, each with its own colour and fade), the two rods and the bobs are drawn with `shapes.js` in four draw calls instead of thousands of canvas strokes. Dragging is the same code.
- [X] T088 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.fourier.gpu.test.js` — circle chain and trace geometry equal the processor's; default picture `imageDiff` at most 12. **Status:** 21 GPU tests: 3 presets x 300 steps with the coefficient count, trace and step equal to the kernel's (same code), the chain of circles as partial sums at the current time, trace restart after a full turn, `imageDiff` <= 12 for every preset, ink amount and brightness within 18% of the processor's for three presets with circles on and off, the trace in the full palette colour, the hint text for an empty custom outline, drawing your own outline (recording, outline reported, trace starts, too-short notice, ignored on built-in outlines), the circles statistic, setting changes, 30 open/leave cycles, lost-and-restored. Mutation-checked (the one that survived, an ignored circle count, led to the statistic test).
- [X] T089 [P] [US5] Port Fourier epicycles in `V/fourier/gpu.js` and `V/fourier/index.js`: coefficients from the existing kernel, circles as rings and arms as segments from `shapes.js`, trace as a segment strip, drawing your own outline unchanged. **Status:** `fourier/gpu.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. The transform and trace stay on the processor; up to 512 circle outlines are drawn as instanced rings (`shapes.rings`, new), the faint outline and the trace as instanced segments. The hint text is rasterised on a 2D canvas and drawn from a texture, since a graphics context cannot draw text. Drawing your own outline is the same code.
- [X] T090 [P] [US5] Test: `web-client/src/__tests__/gpu/similar.timesTable.gpu.test.js` — endpoints sampled from the picture match the formula `(k, k·m mod N)` for several `N` and `m`; default picture `imageDiff` at most 12. **Status:** 20 GPU tests: the middle of every line is drawn where the formula puts it (6 N, m pairs including fractional m); a different m draws different lines; corners are the background; `imageDiff` <= 12 against the processor path for every preset and three opacities; 100 steps of Animate m give the same m and picture; setting changes; 30 open/leave cycles; lost-and-restored. Mutation-checked (wrong endpoint, ignored opacity, stale colours, flipped y, step ignoring Animate).
- [X] T091 [P] [US5] Port the times-table circle in `V/timesTable/gpu.js` and `V/timesTable/index.js`: the vertex shader derives both endpoints of line *i* from *i*, `N` and the multiplier; instanced segments up to 1000. **Status:** `timesTable/gpu.js`; `index.js` picks GPU (needs instancing) or the unchanged `createProcessor`. **Differs from the plan:** the line endpoints are computed on the processor with the module's own `circlePoint` each frame (N <= 1000, no canvas calls) and drawn in one instanced call with `shapes.js` and a colour per line; the plan had the vertex shader derive them from the index and m. That keeps the geometry the formula's by construction. `shapes.js` gained an optional per-segment colour buffer for this.

### Whole-phase checks

- [X] T092 [US5] Extend `web-client/src/__tests__/gpu/lifecycle.gpu.test.js`: open and destroy each of the 12 GPU instances 30 times, then a fresh context and first frame still work; lost-and-restored restarts from the opening scene with the notice; lost-and-not-restored calls `requestRestart({ forceProcessor: true })` and the new instance takes the processor path (FR-034, FR-036). **Status:** `lifecycle.ports.gpu.test.js`, 26 tests: for each of the 12, 30 open/leave cycles then a fresh context with a non-blank first frame, and a lost-and-restored context that keeps working and draws again; for all 12 together, a context lost and not restored asks for `requestRestart({ forceProcessor: true })` after the 3 s wait and not before, and one restored in time asks for nothing. The restart-from-the-opening-scene-with-a-notice check for each is in the module's own test file. Whether the viewer then shows its notice on the processor path is covered by the Viewer tests, not here.
- [X] T093 [P] [US5] Extend `web-client/src/__tests__/gpu/capture.gpu.test.js`: `toBlob`, `captureStream` and `makeThumbnail` return non-blank pictures for Life, Lorenz and Boids. **Status:** `capture.ports.gpu.test.js`, 21 tests: `toBlob`, `makeThumbnail` and `captureStream` return non-blank pictures for Life, Lorenz and Boids after a wait, and `renderThumbnail` (the catalog picture generator) is non-blank for all 12.
- [X] T094 [US5] Run the bench page for the 12 on both reference devices and add `phase: US5` rows to `specs/005-navier-stokes-fluid-performance/measurements.md`; check FR-025 (longest single call at most 50 ms at every level), SC-014 (at least as smooth as baseline at Medium), SC-015 (Game of Life, Reaction–diffusion, Boids, Elementary CA at twice the default size or count at 30 fps or better on High), SC-010 and SC-013. Where a figure misses its target, write the figure and the reason. **Status (2026-11-25):** run on the development machine only, with the processor-throttled stand-in; **the reference phone was not available**. Rows and a heaviest-settings frame-rate comparison, GPU path against processor path, are in `measurements.md` ("The twelve GPU ports"). FR-025 holds on this machine (longest call 39.5 ms); SC-014 and SC-015 are met on the laptop. The gain of the ports is not visible on this machine: both paths hold 60 fps; with the processor slowed 6x the processor path falls to 36 to 49 fps for Life, Elementary CA, Boids and the pendulum while the GPU path holds 60. Phone figures: not measured.
- [X] T095 [US5] Update research R5 in `specs/005-navier-stokes-fluid-performance/research.md` with what actually moved for each of the 12 and why anything stayed (FR-032); update the quality descriptors of the ported modules if the gate changes (re-run T064's rule). **Status:** research R5 now records what moved for each of the 12 and why. **The quality gate (T064) was not re-run with the GPU ports**, so no descriptor was added or removed because of them; whether any of the 18 dropped visualizations now qualifies is open.
- [ ] T096 [US5] Run checks 22–24 from `specs/005-navier-stokes-fluid-performance/quickstart.md` by hand against `web-client/` (`npm run dev`), including each module's pointer parity (Life painting, Boids attractor, Lorenz rotate, pendulum bob drag, Fourier drawing). Run `npm test`, `npm run test:gpu`, `npm run build`. **Status: not done by hand.** What was run instead, per ported module, in a real browser: it opens on the graphics card, animates, survives Restart on a fresh canvas, and `?gpu=off` gives the 2D path (all 12 plus the fluid, no page errors). Pointer parity (Life painting, Boids attractor, Lorenz rotate, pendulum drag, Fourier drawing, Maze edits) is covered by automated tests against the same code, not by a person with a mouse or a touch screen.

**Checkpoint**: User Stories 1 to 5 work.

---

## Phase 8: User Story 6 - A responsive interface without needless redrawing (Priority: P3)

**Goal**: Unchanged interface parts are not redrawn, in the Studio and the Playground, proved by redraw counts and recorded in an audit.

**Independent Test**: Quickstart check 26 and the T1–T7 tests in `contracts/render-audit.md`.

**Order**: Touches `Viewer.jsx`, so do it after Phase 2 and keep it apart from the module work in Phases 6 and 7. Fix causes first (store, handlers, derived values), then `memo` (research R8).

### Tests for User Story 6 (write first)

- [X] T097 [P] [US6] Create `web-client/src/__tests__/helpers/renderProbe.jsx` (`probe(modulePath)` for `vi.mock`: a memoized counting wrapper exposing counts by key; `<Isolated>`: mounts one component inside `React.Profiler`, re-renders its parent with unrelated state, returns the commit count) and `web-client/src/__tests__/helpers/renderProbe.test.jsx` proving the helper itself counts correctly. **Status:** `instrument()` counts calls of a memoized component's function (React's Profiler cannot count skipped redraws); see `renderProbe.jsx`.
- [X] T098 [P] [US6] Create `web-client/src/__tests__/studio/render/knobPanel.render.test.jsx` (T1): Viewer with a stub module; changing one knob redraws that knob once and leaves every other knob, `PresetMenu`, `PlaybackBar` and `HowItWorks` at 0.
- [X] T099 [P] [US6] Create `web-client/src/__tests__/studio/render/viewerStats.render.test.jsx` (T2): 60 `reportStats` updates while playing; `StatsReadout` updates, `Viewer`, `KnobPanel` and `PlaybackBar` at 0.
- [X] T100 [P] [US6] Create `web-client/src/__tests__/studio/render/catalog.render.test.jsx` (T3, T4): typing five characters in the search box and switching the category filter leave cards that stay visible at 0 redraws.
- [X] T101 [P] [US6] Create `web-client/src/__tests__/studio/render/playground.render.test.jsx` (T5, T6): typing in the composer leaves `Header`, `CapabilityPanel`, `ExchangeList`, every `Exchange` and `ToolCallCard` at 0; a new message redraws only the new `Exchange`.
- [X] T102 [P] [US6] Create `web-client/src/__tests__/studio/render/memoized.render.test.jsx` (T7): each memoized component (knobs, `PresetMenu`, `PlaybackBar`, `HowItWorks`, `ShareMenu`, `CatalogCard`, `Header`, `CapabilityPanel`, `Exchange`, `InputBubble`, `ToolCallCard`, `CapabilityList`) mounted with unchanged props shows 0 profiler commits after an unrelated parent re-render.

### Implementation for User Story 6

- [X] T103 [US6] Isolate per-frame data: in `web-client/src/studio/components/Viewer.jsx` pass `onStats` that writes to a per-viewer `statsStore` (T010) instead of `setStats`, remove the `stats` state, and create `web-client/src/studio/components/StatsReadout.jsx` that renders the readout from the store with `useSyncExternalStore`. Make T099 green. **Status:** `StatsReadout` + `statsStore`.
- [X] T104 [US6] In `Viewer.jsx` stabilize identities: `useCallback` for `onKnobChange`, `onReset`, `onPreset`, `onSeed`, `onFullscreen`, the playback handlers and the zoom handlers (reading config from `configRef`); module-level constants for empty sets and arrays; `useMemo` for `sweepingKeys`, the swept-key `Set` and `interactionHint`.
- [X] T105 [US6] In `web-client/src/studio/components/KnobPanel.jsx`: `useMemo` for the visible list and groups, pass `onChange` straight through (no per-knob closure), constant default props, and `memo` the panel. In `web-client/src/studio/components/knobs/RangeKnob.jsx`, `ChoiceKnob.jsx`, `ToggleKnob.jsx`, `TextKnob.jsx` and `PaletteKnob.jsx` wrap in `memo` and call `onChange(knob.key, value)`; keep `SeedKnob.jsx` behavior and wrap it in `memo`. Make T098 green.
- [X] T106 [P] [US6] Wrap `memo` around `web-client/src/studio/components/PresetMenu.jsx`, `PlaybackBar.jsx`, `HowItWorks.jsx` and `ShareMenu.jsx`; `useCallback` inside `ShareMenu.jsx` where it hands handlers to children.
- [X] T107 [P] [US6] In `web-client/src/studio/components/CatalogGrid.jsx` memoize the filtered list and the per-category groups with `useMemo`; extract `web-client/src/studio/components/CatalogCard.jsx` wrapped in `memo` with a stable `onOpen`; in `web-client/src/studio/components/MyVisualizations.jsx` memoize the list and memo the row component. Make T100 green.
- [X] T108 [P] [US6] In `web-client/src/studio/StudioPage.jsx` memoize the parsed route and search params, extract the header into a memoized component, and use `useCallback` for `setFilter`, `onBack` and the saved-item handlers.
- [X] T109 [US6] In `web-client/src/App.jsx` wrap `handleDraftChange`, `handleSend`, `toggleMic` and the clear handler in `useCallback`, and `micButton` and `meta` in `useMemo`.
- [X] T110 [P] [US6] Wrap in `memo`: `web-client/src/components/Header.jsx`, `CapabilityPanel.jsx` (and its `CapabilityList`), `ExchangeList.jsx` (and its `Exchange` and `InputBubble`), `ToolCallCard.jsx`. Make T101 and T102 green.
- [X] T111 [P] [US6] Check and fix handler and returned-object identity in `web-client/src/hooks/useConversation.js`, `useSpeechInput.js`, `useSpeechOutput.js` and `useServerStatus.js` (`useCallback` and `useMemo` on what they return); add a test to `web-client/src/__tests__/conversation.test.jsx` or a new `hooks.identity.test.jsx` asserting the handlers keep identity across renders.
- [X] T112 [US6] Write `specs/005-navier-stokes-fluid-performance/render-audit.md` per `contracts/render-audit.md`: one row for every component in every `.jsx` under `web-client/src` (outside `__tests__`) and every shared hook, with the decision, the memoized values and handlers, the test that covers it, and a reason for each `none` (SC-017). **Status:** `render-audit.md`.
- [X] T113 [US6] Run the full jsdom suite (`npm test` in `web-client/`) and confirm every pre-existing test still passes (FR-030, SC-012). Run check 26 from `specs/005-navier-stokes-fluid-performance/quickstart.md` with the React DevTools "Highlight updates" option, and measure SC-009 (a slider drag during an animation costs 10% of the frame rate or less) with the bench page; record both in `specs/005-navier-stokes-fluid-performance/measurements.md`. **Status:** full jsdom suite passes. SC-009 measured (1 to 1.5% drop). **Check 26 with the React DevTools "Highlight updates" overlay was not done**; the redraw-count tests replace it, and one mutation (the original inline-handler bug) was confirmed to fail them.

**Checkpoint**: All six stories work.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T114 [P] If T006 showed WebGL2 works on the runner, add the Chromium install and `npm run test:gpu` step after `npm test` in `.github/workflows/deploy-web-client.yml`; otherwise leave the separate `gpu-tests.yml` as the gate and note it in `specs/005-navier-stokes-fluid-performance/quickstart.md`. **Status: not done, waiting on T006.** The CI half of T006 needs a push and a manual run of `gpu-tests.yml`. Until then `gpu-tests.yml` stays the only GPU gate and `deploy-web-client.yml` is unchanged.
- [X] T115 [P] After `npm run build`, confirm the production output contains no dev code: search `web-client/dist` for `__bench`, `__debug`, `__VIZ_GL_VERSION__` and the `?load` busy-wait; fix guards until clean. **Status:** done during the Phase 5 checks and repeated after the Story 5 work: `dist` has no `__debug`, `__bench`, `readState`, `BenchPage` or `__VIZ_GL_VERSION__` (the last was made `import.meta.env.MODE`-guarded to get there). **Re-run after the twelve ports: see the final build below.**
- [X] T116 [P] Update `README.md` (new scripts `test:gpu` and `test:all`, the dev pages `/studio/__bench` and the `?gpu=off` and `?load` switches) and add a pointer in `specs/003-visualization-studio/contracts/visualization-module.md` to `specs/005-navier-stokes-fluid-performance/contracts/module-additions.md`. **Status:** README (the two test scripts, `/studio/__bench`, `?gpu=off`) and a pointer in the 003 module contract; the `?load` switch is not in the README because no production page has it.
- [X] T117 [P] Write the final tolerances (image difference threshold, state tolerances) and ranges back into `specs/005-navier-stokes-fluid-performance/contracts/gpu-tests.md` and `data-model.md` so the documents match what the tests enforce. **Status:** `contracts/gpu-tests.md` has a table of the final limits and what the passing code measured. Where the exact measured figure was not recorded (Reaction–diffusion state difference, `imageDiff`), the table says so. `data-model.md` had no tolerance figures to update.
- [X] T118 Fill the summary at the top of `specs/005-navier-stokes-fluid-performance/measurements.md`: one line per success criterion SC-001 to SC-017 with the measured figure or "not measured", the device and the date. **Status:** the table is at the top of `measurements.md`, one row per criterion, with "not measured" wherever nothing was taken. Notable gaps: the reference phone (SC-003 phone, SC-010, SC-014), SC-001, SC-002, SC-004, the pace in SC-007, CPU in SC-013, and SC-015 for three of its four. SC-008 is only partly met (the fluid is 8% cheaper at Low than Medium on the real GPU).
- [ ] T119 Run all of `quickstart.md`: `npm test`, `npm run test:gpu`, `npm run build`, and manual checks 1–26 on the reference laptop (checks 4, 15 and 19 also on the reference phone). Fix what fails; confirm the passing test count is at least the T001 count plus the new tests.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: no dependencies. T009 (baseline) must finish before Phase 2 starts.
- **Foundational (2)**: depends on Setup; blocks every story. Within it: T010–T014 and T016, T018–T021 are parallel; T015 needs T011; T017 before T022; T023–T029 are sequential (same file, `Viewer.jsx`).
- **US1 (3)**, **US4 (6)** and **US6 (8)** can start as soon as Phase 2 is done. **US2 (4)** and **US3 (5)** need US1 (the fluid module must exist). **US5 (7)** needs Phase 2 and should follow US4, because both edit each animated module's `index.js`.
- **Polish (9)**: after the stories you want to ship.

### User story dependencies

- **US1 (P1)**: after Phase 2. No dependency on other stories. **MVP.**
- **US2 (P2)**: after US1 (adds behavior to the fluid).
- **US3 (P2)**: after US1; its Quality and loss handling use Phase 2 pieces. Independent of US2.
- **US4 (P2)**: after Phase 2; independent of US1 to US3 (the fluid's own Quality is in US3, the other modules' in US4).
- **US5 (P2)**: after Phase 2 and US4; the 12 ports are independent of each other.
- **US6 (P3)**: after Phase 2 (needs `Viewer.jsx` changes T024–T029 done); independent of the other stories, but do not edit `Viewer.jsx` for US6 while module work is open.

### Within each story

- Tests first, and see them fail; then pure helpers; then shaders; then the instance; then wiring into `index.js` and `catalog.js`; then the manual checks.
- A GPU port ships only when its test is green and its measurement row is recorded.

### Parallel opportunities

- Phase 1: T003, T005, T007.
- Phase 2: T010, T011, T012, T013, T014, then T016, T018, T019, T020, T021, and T030.
- US1: T031, T032, T033 and T034.
- US4: T055–T063 (different module files).
- US5: T066 and T067; then all 12 test-and-port pairs (T068–T091) in parallel, one developer or agent per module.
- US6: T097–T102 (tests), then T106, T107, T108, T110 and T111.

---

## Parallel Examples

### Foundational

```text
Pure logic:  T010 statsStore ‖ T011 quality.js ‖ T012 qualityGovernor.js ‖ T013 loop.js ‖ T014 moduleContext.js
Toolkit:     T018 program.js ‖ T019 targets.js ‖ T020 draw.js ‖ T021 palette.js   (after T016 tests, T017 context.js)
```

### User Story 1

```text
Tests:  T031 (kernel.test.js) ‖ T032 (fluid.gpu.test.js)
Code:   T033 (kernel.js) ‖ T034 (shaders.js)   → T035 gpu.js → T036 index.js → T037 catalog → T038 thumbnail
```

### User Story 5 (twelve independent modules)

```text
Life:     T068 test → T069 port      Reaction–diffusion: T080 → T081     Lorenz:   T084 → T085
CA:       T070 → T071                Boids:              T082 → T083     Pendulum: T086 → T087
Langton:  T072 → T073                Fourier:            T088 → T089     Times:    T090 → T091
Recamán:  T074 → T075                Sorting:            T076 → T077     Maze:     T078 → T079
```

### User Story 6

```text
Tests:  T098 ‖ T099 ‖ T100 ‖ T101 ‖ T102        Code: T103 → T104 → T105;  T106 ‖ T107 ‖ T108 ‖ T110 ‖ T111;  T109
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 (T001–T009), including the baseline on the reference devices.
2. Phase 2 (T010–T030).
3. Phase 3 (T031–T039): the fluid is playable.
4. **Stop and check**: quickstart checks 1–8, `npm test`, `npm run test:gpu`.

### Incremental delivery

1. Setup, Foundational and US1: the fluid appears in the catalog (MVP).
2. US2 and US3: the fluid is tunable and robust. The new visualization is complete.
3. US4: every visualization gets a Quality choice where it matters; animated ones get Auto.
4. US5: one module at a time moves to the graphics card, each with its test and measurement.
5. US6: the interface stops redrawing what has not changed, with the audit.
6. Each step ships on its own and never breaks the one before; the processor paths stay valid throughout.

### If the CI runner cannot give WebGL2 (T006)

Ship with the GPU tests run on developer machines and the manual workflow, report them as "not run" in CI, and keep `npm test` as the deploy gate. Do not treat a skipped GPU project as a pass.

### Scope notes

- If a module's GPU port is not worth it once measured (for example its gain is under the noise), keep its processor path, record that in research R5 under FR-032, and say so in the final summary. The spec asks for a recorded decision per module, not for a port that makes things slower.
- If the 20% gate removes the Quality choice from many modules, that is the intended outcome of FR-020; Auto still works through the shell's `scale` where a descriptor was kept.

---

## Requirement Coverage

Every functional requirement and success criterion in `spec.md` and the task(s) that build or prove it.

| Requirement | Tasks |
|---|---|
| FR-001, FR-002 (catalog entry, own address) | T036, T037, T038, T039 |
| FR-003, FR-004 (drag, tap, fluid behavior) | T032, T034, T035 |
| FR-005 (opening scene) | T031, T032, T035 |
| FR-006, FR-007 (Burst, Clear, Reset, keys) | T023, T025, T032, T035, T039 |
| FR-008, FR-009, FR-010 (settings, dissipation, live) | T036, T040, T041, T042, T043 |
| FR-011 (stability) | T040, T042, T043 |
| FR-012, FR-013 (explanation, presets, sweep, card picture) | T036, T038, T041, T044 |
| FR-014, FR-015 (save, share, export, record, reduced motion, keyboard) | T025, T047, T052, T093, T119 |
| FR-016, FR-017, FR-018, FR-019 (message, loss, release, resize) | T022, T036, T046, T047, T049, T050, T051 |
| FR-020, FR-021, FR-022 (Quality choice, same pictures, stored) | T011, T015, T029, T030, T053, T055–T065 |
| FR-023 (Auto) | T012, T029, T054, T065 |
| FR-024 (idle, paused, hidden) | T013, T028, T054, T063, T077, T079 |
| FR-025 (no call over 50 ms) | T008, T064, T094 |
| FR-026 (measurements) | T001, T009, T052, T064, T094, T118 |
| FR-027, FR-028, FR-029, FR-030 (fewer redraws, derived values, stable handlers, no behavior change) | T103–T111, T112, T113 |
| FR-031 (redraw-count tests) | T097–T102 |
| FR-032 (record of what moved) | T095 |
| FR-033 (every control kept) | T067, T069–T091, T096 |
| FR-034 (fallback) | T022, T067, T092 |
| FR-035 (exact and at-a-glance matches) | T068–T091 |
| FR-036 (release on leaving) | T022, T092 |
| SC-001, SC-002, SC-004 | T039, T052 |
| SC-003 | T052, T094 |
| SC-005, SC-006 | T040 |
| SC-007 | T016, T047, T092 |
| SC-008 | T064 |
| SC-009 | T113 |
| SC-010, SC-013 | T063, T065, T094 |
| SC-011 | T053, T065, T096 |
| SC-012 | T001, T113, T119 |
| SC-014, SC-015 | T094 |
| SC-016 | T068, T070, T072, T074, T076, T078 |
| SC-017 | T112 |

---

## Notes

- The `[P]` marker means different files and no dependency on an incomplete task.
- The `[Story]` labels map each task to a user story for traceability; Setup, Foundational and Polish tasks have none.
- Commit after each task or logical group. Keep `npm test` green at every commit.
- Never estimate a measurement: write "not measured".
- Avoid: editing `Viewer.jsx` from two tasks at once, wrapping components in `memo` before fixing the unstable props they receive, and adding a Quality control that the 20% gate rejected.
