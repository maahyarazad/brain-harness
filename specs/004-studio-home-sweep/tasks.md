---

description: "Task list for Studio as the Home Page, Animated Sweeps Everywhere, and a Way Back from My Visualizations"
---

# Tasks: Studio as the Home Page, Animated Sweeps Everywhere, and a Way Back from My Visualizations

**Input**: Design documents from `specs/004-studio-home-sweep/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R9), data-model.md, contracts/sweep.md, contracts/routes.md, quickstart.md

**Tests**: Included. The plan (research R9) and the project's convention from 003 call for tests with each change. Test tasks come before the implementation tasks they cover.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = studio home page, US2 = back from My visualizations, US3 = Animated sweep
- All paths are relative to the repository root. App code is in `web-client/src/`, tests in `web-client/src/__tests__/`.

---

## Phase 1: Setup

**Purpose**: Confirm the baseline before changing anything.

- [X] T001 Run `npx vitest run` and `npm run build` in `web-client/` and note the passing test count. The Playground tests must stay green throughout (SC-007).

---

## Phase 2: Foundational

**Purpose**: Nothing blocks all three stories. US1 and US2 touch only routing and page chrome. US3's shared mechanism is built inside its own phase. This phase is intentionally empty.

**Checkpoint**: Setup done, so user stories can start in parallel.

---

## Phase 3: User Story 1 - The site opens on the Visualization Studio (Priority: P1) 🎯 MVP

**Goal**:
- `/` lands on the studio catalog, with the address replaced by `/studio`.
- The section switcher and every Playground link are gone.
- The Playground stays in the code and opens only at the unlinked `/playground`, loaded lazily (research R1, contracts/routes.md).

**Independent Test**: In a fresh window, open `/`: the catalog shows at `/studio`, there is no "Playground" text anywhere, and the Network tab shows no Playground chunk and no `/api` or `/mcp` requests. `/playground` still works.

### Tests for User Story 1

- [X] T002 [US1] Rewrite the section tests in `web-client/src/__tests__/studio/navigation.test.jsx` for the new routes, replacing the tests that click the "Playground" section link:
  - `/` renders the catalog and `window.location.pathname` becomes `/studio`, via `replaceState`, with the original query kept and `history.length` unchanged.
  - `/playground` renders the Playground (mock `App.jsx` with `vi.mock` so no server calls are made).
  - `/garbage` renders the catalog at `/studio`.
  - No element with the text "Playground" and no link to `/playground` exists on `/studio`, `/studio/<vizId>` or `/studio?view=mine`.
  - `document.title` is "Visualization Studio · Brain Harness" on studio paths and "Brain Harness" on `/playground`.
- [X] T003 [P] [US1] In `web-client/src/__tests__/studio/navigation.test.jsx`, add a test that rendering `Root` at `/studio` never calls the mocked `App` module's factory (the lazy import is not triggered) (FR-006).
- [X] T004 [P] [US1] (No change was needed: its tests already start at `/studio` paths.) Update `web-client/src/__tests__/studio/studio.test.jsx` (it renders `<Root />` at lines ~27 and ~238) so its setup no longer relies on the topnav or on `App` being mounted. Start at `/studio` paths directly and mock `../../App.jsx` if it is still imported.

### Implementation for User Story 1

- [X] T005 [US1] Rewrite routing in `web-client/src/Root.jsx` (contracts/routes.md):
  - Replace the static `import App` with `const App = lazy(() => import("./App.jsx"))`.
  - On mount and on every location change, map `/` and any path that is neither `/studio…` nor `/playground` to `/studio` + search, with `window.history.replaceState`, and update the `loc` state.
  - Render `<Suspense><App/></Suspense>` only when `path === "/playground"`, otherwise the studio (`StudioPage active`).
  - Delete the `<nav className="topnav">` block and the `onLink` helper.
  - Drop the always-mounted `hidden` wrappers and the `studioVisited` state.
  - Set the document title per contracts/routes.md.
  - Keep `NavContext`, `useNav` and `navigate` exported unchanged.
- [X] T006 [P] [US1] Remove the now-unused `.topnav` rules from `web-client/src/styles.css`. Check with `grep -rn topnav web-client/src` that nothing else uses them.
- [X] T007 [US1] Run the tests from T002–T004 and the full suite. Fix any test that still expects the Playground at `/` or the section links. The App-level Playground tests in `web-client/src/__tests__/` must pass unchanged.

**Checkpoint**: The site opens on the studio and the Playground is reachable only at `/playground`. US1 can ship on its own.

---

## Phase 4: User Story 2 - Get back from "My visualizations" (Priority: P1)

**Goal**: "My visualizations" (`/studio?view=mine`) shows a "← Catalog" back link (accessible name "Back to catalog") in a toolbar like the viewer's. It always goes to `/studio` (research R2).

**Independent Test**: Open `/studio?view=mine` directly, Tab to the back link, press Enter, and the catalog shows. Press browser Back and you return to My visualizations.

### Tests for User Story 2

- [X] T008 [P] [US2] In `web-client/src/__tests__/studio/navigation.test.jsx`, add tests:
  - On `/studio?view=mine`, a link named "Back to catalog" with `href="/studio"` is shown in both the empty state and with one saved record (seed `localStorage` through `studio/core/storage.js`).
  - Clicking it shows the catalog and pushes a history entry, so `history.back()` returns to `?view=mine`.
  - It is reachable with `userEvent.tab()` and activates on Enter.
  - A ctrl or meta click is not intercepted (`navigate` is not called).

### Implementation for User Story 2

- [X] T009 [US2] In `web-client/src/studio/StudioPage.jsx`, when `view === "mine"`, render above `<MyVisualizations … showEmpty />` a toolbar per contracts/routes.md: `<div className="viewer-toolbar">`, an `<a className="btn" href="/studio" aria-label="Back to catalog">← Catalog</a>` whose onClick ignores modified or non-left clicks and otherwise calls `e.preventDefault(); navigate("/studio")`, and `<h2>My visualizations</h2>`. If `MyVisualizations` already renders its own "My visualizations" heading in `showEmpty` mode (check `web-client/src/studio/components/MyVisualizations.jsx`), don't duplicate it; keep a single heading.
- [X] T010 [US2] Run T008 and check at phone width (390 px) in the dev server that the toolbar doesn't overflow. Adjust `web-client/src/studio/studio.css` only if needed.

**Checkpoint**: My visualizations has a working way back. US2 is shippable.

---

## Phase 5: User Story 3 - An "Animated sweep" preset on every visualization (Priority: P2)

**Goal**: All 23 visualizations list "Animated sweep". Picking it slowly moves chosen settings (smooth, busy-aware, run-aware), with the slider moving, a Sweep speed knob, play/pause, reduced-motion handling, and persistence through share, save and export (research R3–R8, contracts/sweep.md).

**Independent Test**: For any visualization, pick "Animated sweep" and watch 30 s. The picture and the swept slider change smoothly. Pause stops it. A share link of it reopens sweeping at the same speed. An old link opens with no sweep.

### Tests for User Story 3 (write first, see them fail)

- [X] T011 [P] [US3] Create `web-client/src/__tests__/studio/core/sweep.test.js` (pure, injected `now`):
  - `valueAt` for `wave`, `wrap`, `log` and `steps` at t = 0, 0.25, 0.5, 0.75 and 0.999, including the `phase` offset.
  - `phaseOf` inverts each mode (round-trip within one step), keeping the direction for `wave`/`log`.
  - Results are snapped with `snapToStep` and clamped to the knob's limits.
  - `withSweep(module)` appends the `sweep` toggle and the `sweepSpeed` range (0.1–4, step 0.1, default 1, `when: v.sweep`) and the preset `{id:"sweep", name:"Animated sweep"}` with `presetValues` and `presetView`. It leaves a module without `sweep` untouched and does not add a second preset if one with id `sweep` exists. It is idempotent.
  - `createSweepDriver`:
    - The phase advances by `dt × playbackSpeed × sweepSpeed / periodMs`.
    - It applies nothing while `isBusy()` is true.
    - It respects `minIntervalMs`.
    - `kind:"run"` waits for `isDone()` to hold true for `holdMs`, then applies the next `steps` value; it resets when `isDone()` turns false.
    - When the config value differs from the driver's last written value, it re-derives the phase and continues from there.
    - A gap while paused (no ticks) does not jump the phase on resume (dt is capped, for example at 100 ms).
    - A `{view:"zoom"}` target writes `view.zoom` and reports changed keys `["view"]`.
- [X] T012 [P] [US3] Extend `web-client/src/__tests__/studio/core/knobs.test.js`: `applyPreset` returns `view` when the preset has one and `null`/absent otherwise.
- [X] T013 [P] [US3] (Written as a new file, `web-client/src/__tests__/studio/sweep.contract.test.js`, which also checks for blank/half-drawn frames and `isBusy`.) Extend `web-client/src/__tests__/studio/modules.contract.test.js` per contracts/sweep.md "Contract tests":
  1. After `withSweep`, every catalog entry has a preset with id `sweep` named "Animated sweep".
  2. Every `sweep.targets[].key` exists. Its mode matches the knob type (`steps` for choice/text). `min`/`max`/`list` values pass `validateValue` unchanged. `log` targets have `min > 0`. `{view:"zoom"}` only appears on modules with `defaultView`.
  3. `kind:"run"` modules' instances return a boolean from `isDone()`.
  4. For each module with `sweep`:
     - Create it with the sweep preset's config.
     - Drive 200 ticks of `createSweepDriver` with fake time (16 ms steps, also calling `instance.step()` for animated modules, capped at the existing light test values used for dla and collatz-coral).
     - Assert: no throw; every `update` call's changed keys are a subset of the swept keys (or `["view"]`); every written value validates.
     - Keep the whole file under the 5 s per-test timeout.
- [X] T014 [P] [US3] (Written as `web-client/src/__tests__/studio/sweep.ui.test.jsx`, plus an export → import round-trip and the sweeping badge.) Add to `web-client/src/__tests__/studio/studio.test.jsx` (Viewer-level, fake rAF from `browserStubs.js`):
  - Picking "Animated sweep" on Phyllotaxis (normally still) shows the "Animated sweep" toggle checked, the "Sweep speed" knob, and the playback bar; after advancing frames, the "Divergence angle" slider value changes; pausing stops further changes.
  - "Record video" is offered while sweeping (with `installMediaRecorder`).
  - With Motion set to "Reduce", picking the preset starts paused.
  - A share link built while sweeping decodes (via `decodeConfig`) with `sweep: true` and the same `sweepSpeed`.
  - A share payload made without the sweep keys opens with `sweep: false` and no notice.
  - The Times-table "Animated sweep" preset still sets `animate: true, rate: 0.005` and does not get the shell's `sweep` knob.

### Implementation for User Story 3 — shared mechanism

- [X] T015 [US3] Create `web-client/src/studio/core/sweep.js` (research R3–R5, data-model.md), exporting:
  - `SWEEP_KNOBS`: the two knob definitions.
  - `withSweep(module)`: returns a new module object with the knobs and the generated preset appended. It is idempotent (marks the result) and leaves modules without `sweep` unchanged.
  - `valueAt(target, t, knob)` and `phaseOf(target, value, knob, dir)`: the mappings, with snapping and clamping via `snapToStep` from `core/knobs.js`.
  - `createSweepDriver({ module, getConfig, apply, isBusy, isDone, getPlaybackSpeed, now = performance.now })` returning `{ tick(), reset() }`.
    - `tick()` returns nothing. It calls `apply(partialValues, changedKeys, viewPatch?)` at most once per call.
    - It caps `dt` at 100 ms.
    - It tracks `lastWritten`, `lastApplyAt` and `doneSince` per data-model.md "Sweep driver state".
  Make T011 pass.
- [X] T016 [US3] In `web-client/src/studio/core/knobs.js` `applyPreset`, also return `view: preset.view ?? null`. Make T012 pass.
- [X] T017 [US3] Wire the driver into `web-client/src/studio/components/Viewer.jsx`:
  - (a) Wrap the loaded module: `const m = withSweep((await entry.load()).default)`, in the load effect, before `decodeConfig`/`validateConfig`, so the sweep knobs validate.
  - (b) In `createInstance`, create the loop when `m.animated || m.sweep`. Its `step` calls `instRef.current?.step?.()` only if `m.animated`. Its per-frame callback also calls `sweepRef.current?.tick()` when `configRef.current.values.sweep` is true; extend `createLoop` in `web-client/src/studio/core/loop.js` with an optional `onFrame` callback, called once per tick before `render`.
  - (c) Create the driver with:
    - `getConfig: () => configRef.current`
    - `isBusy`: a ref set by `onProgress` (true while 0 ≤ p < 1, false at p ≥ 1)
    - `isDone: () => instRef.current?.isDone?.() ?? false`
    - `getPlaybackSpeed: () => speedRef.current`
    - `apply`: build the next config (values merged, `view` patched if given, `presetId` kept as-is so the preset chip stays active), `setConfig`, then `scheduleUpdate` for each changed key.
  - (d) Only modules with `animated: false` and `sweep` start the loop (respecting reduced motion) when `values.sweep` turns on, and pause it when it turns off. `onKnobChange("sweep", …)` handles this.
  - (e) Show `PlaybackBar` when `module.animated || config.values.sweep`.
  - (f) In `onPreset`, use `p.view ?? defaultView`.
  - (g) Pass `recordable={module.animated || module.interactive || Boolean(config.values.sweep)}` to `ShareMenu`.
  - (h) Reset the driver on `restartWith`/`createInstance`.
  - (i) Make T014 pass.

- [X] T017a [US3] No blank frames and no guessing at "busy" (research R4, R10; added after /speckit-analyze findings C1, C2, I1, U1–U3):
  - `withSweep` is applied in `web-client/src/studio/catalog.js`, so file import and share links validate against the sweep knobs.
  - Still modules' loops never call `step`/`render`.
  - `update(c, keys, { sweep: true })`: off-screen redraw in `web-client/src/studio/visualizations/_shared/instance.js`; the old cluster is kept in `dla/index.js`; `sweepStep()` (no blurry pass) in `mandelbrot/escapeView.js`.
  - `isBusy()` in those three, passed through by `voronoi/index.js`.
  - The "⟳ sweeping" badge in `KnobPanel.jsx` (plus `describedBy` on the Range/Choice/Text knobs), and "⟳ sweeping zoom" on the canvas.

### Implementation for User Story 3 — per-module declarations (research R8)

Each task adds a `sweep` declaration to the listed `index.js` files. Check every key against that module's `knobs` first; T013 enforces it. Tune `periodMs` and ranges so the change is visible at least every 5 s (SC-004). All of these can run in parallel once T015 exists.

- [X] T018 [P] [US3] Number-pattern modules:
  - `web-client/src/studio/visualizations/ulam/index.js`: `start` 1→5000, `log`, 30 s
  - `web-client/src/studio/visualizations/recaman/index.js`: `terms` 20→600, `log`, 30 s
  - `web-client/src/studio/visualizations/pascalMod/index.js`: `modulus` `steps` [2…12], `minIntervalMs` 1500
  - `web-client/src/studio/visualizations/collatz/index.js`: `evenAngle` 4→14 `wave`, `oddAngle` −20→−8 `wave`, phase 0.25, 25 s
  - `web-client/src/studio/visualizations/phyllotaxis/index.js`: `angle` 137.0→138.0 `wave`, 40 s
- [X] T019 [P] [US3] Fractal modules:
  - `web-client/src/studio/visualizations/mandelbrot/index.js`: `{view:"zoom"}` 1→1e4 `log`, 60 s, `presetView` seahorse `{cx:-0.743643887, cy:0.131825904, zoom:1}`, `presetValues {iterations:600}`
  - `web-client/src/studio/visualizations/julia/index.js`: `cRe` −0.8→0.4 `wave`, `cIm` −0.6→0.6 `wave`, phase 0.25, 40 s
  - `web-client/src/studio/visualizations/chaosGame/index.js`: `ratio` 0.4→0.7 `wave`, 30 s
  - `web-client/src/studio/visualizations/lsystem/index.js`: `angle` 15→35 `wave`, 20 s
  - `web-client/src/studio/visualizations/barnsley/index.js`: two weight keys `wave`, 30 s, `minIntervalMs` 500

  Check that `escapeView` `update(c, ["view"])` with only a zoom change keeps the no-tearing path (scaled preview first) and that its progress reports reach 1 when the full pass ends, so busy gating releases.
- [X] T020 [P] [US3] Simulation modules:
  - `web-client/src/studio/visualizations/life/index.js`: `rule` `steps` over its presets' rules, `minIntervalMs` 8000
  - `web-client/src/studio/visualizations/grayScott/index.js`: `feed` 0.03→0.06 `wave`, `kill` 0.058→0.064 `wave`, 120 s
  - `web-client/src/studio/visualizations/dla/index.js`: `stickiness` 0.1→1 `wave`, 60 s, `minIntervalMs` 2000
  - `web-client/src/studio/visualizations/boids/index.js`: two rule weights `wave`, phase 0.5, 30 s
- [X] T021 [P] [US3] Geometry and dynamics modules:
  - `web-client/src/studio/visualizations/doublePendulum/index.js`: `gravity` 4→16 `wave`, 30 s
  - `web-client/src/studio/visualizations/lorenz/index.js`: `rho` 14→40 `wave`, 40 s
  - `web-client/src/studio/visualizations/fourier/index.js`: `circles` 2→120 `log`, 30 s
  - `web-client/src/studio/visualizations/voronoi/index.js`: `relax` 0→20 `wave`, 20 s

  If `dla`'s `stickiness` or another swept knob is `live: false`, confirm the module's `update` still redraws for it without a blank frame, or pick another key.
- [X] T022 [P] [US3] Modules whose runs finish (`kind:"run"`, `holdMs` 1500, plus an `isDone()` instance method built from existing state):
  - `web-client/src/studio/visualizations/sorting/index.js`: `algorithm` `steps` over all options; `isDone` returns `done`.
  - `web-client/src/studio/visualizations/maze/index.js`: `generator` `steps` over all options; `isDone` returns `phase === "done"`.
  - `web-client/src/studio/visualizations/langton/index.js`: `rule` `steps` [RL, RLR, LLRR, RLLR, LRRRRRLLR]; `isDone` is true when the step limit is reached or the ant leaves the grid.
  - `web-client/src/studio/visualizations/elementaryCA/index.js`: `rule` `steps` [30, 90, 110, 184, 54, 150, 73]; `isDone` is true once the last row is drawn.

  Confirm each module's `update` restarts the run for these keys without reseeding.
- [X] T023 [US3] Leave `web-client/src/studio/visualizations/timesTable/index.js` unchanged (FR-017). Make T013 and T014 pass for all 23 modules.

**Checkpoint**: All 23 visualizations sweep, and the sweep persists. US3 is shippable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Update `docs/adding-a-visualization.md` with a "Sweep" section covering:
  - the `sweep` declaration fields and modes
  - when to use `kind:"run"` and `isDone()`
  - the rule that sweep `update`s must not reseed or blank the canvas
  - a link to `specs/004-studio-home-sweep/contracts/sweep.md`
- [X] T025 [P] Update `README.md`:
  - Line 5: the studio is now the home page at `/` (redirecting to `/studio`).
  - Line 34: `npm run dev  # open http://localhost:5173 (studio); playground: /playground`.
  - Mention that the playground is unlinked and opens at `/playground`.
  - Mention the new Animated sweep presets in the studio paragraph.
- [X] T026 Run `npx vitest run` and `npm run build` in `web-client/`. All tests pass, the test count is at least the T001 baseline plus the new tests, and the build succeeds.
- [X] T027 (Done in headless Chrome 'scratchpad/check.mjs' against `vite`:
  - Checks 1–8 passed.
  - Check 9: all 23 sweeps change the picture at least every 3.7 s with no errors. The only blank frames are DLA's first cluster after picking the preset, and the empty start of each new run for the 1-D automaton and Langton's ant, both expected.
  - Check 13: the Mandelbrot zoom was screenshotted at 1×, 13× and 203×, sharp each time.
  - Not done by hand: 10–12 and 14–17, which are covered by `sweep.ui.test.jsx`, `sweep.contract.test.js` and `core/sweep.test.js`. No real phone was used; 390 px phone-width layout was checked.)
  Run the manual checks 1–17 in `specs/004-studio-home-sweep/quickstart.md` in Chrome against `npm run dev`. Mark which ones were verified in this file, and record any sweep range or period tuned during the run in research.md R8.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → everything.
- **US1 (T002–T007)**, **US2 (T008–T010)** and **US3 (T011–T023)** are independent of each other. They share `navigation.test.jsx` (US1 and US2) and `studio.test.jsx` (US1 and US3), so edits to those files run in sequence, not in parallel.
- **Polish (T024–T027)** comes after the stories it documents or validates.

### Within each story

- **US1**: T002–T004 (tests) → T005 → T006 → T007
- **US2**: T008 → T009 → T010
- **US3**:
  1. T011–T014 (tests, in parallel)
  2. T015 → T016 → T017
  3. T018–T022 (in parallel)
  4. T023

### User story completion order

US1 (P1, MVP) → US2 (P1) → US3 (P2). US2 can also be done before US1, or alongside it, because the two only share a test file.

---

## Parallel Examples

### User Story 1

```text
T003 (navigation.test.jsx – lazy-load test)  ‖  T004 (studio.test.jsx)  ‖  T006 (styles.css)
```

### User Story 3

```text
Tests:        T011 (core/sweep.test.js) ‖ T012 (knobs test) ‖ T013 (modules.contract.test.js) ‖ T014 (studio.test.jsx)
Declarations: T018 (number patterns) ‖ T019 (fractals) ‖ T020 (simulations) ‖ T021 (geometry/dynamics) ‖ T022 (finite runs)
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001 baseline.
2. T002–T007, then stop and validate quickstart checks 1–6.
3. Deploy or demo: the site now opens on the studio.

### Incremental delivery

1. US1 → studio home page (MVP).
2. US2 → back link (a small change; it can go out with US1).
3. US3 → the shared sweep mechanism (T015–T017) shown on one module first (Phyllotaxis via T018), then the remaining declarations in parallel batches T018–T022.
4. Polish → docs, README, full manual pass.

---

## Notes

- [P] tasks touch different files and have no unfinished dependencies.
- Commit after each story's checkpoint.
- Don't change the share link, storage or export format versions. Sweep state is ordinary knob values (research R3).
- Keep the Playground's code (`web-client/src/App.jsx`, `components/`, `hooks/`, `api.js`) and its tests untouched.

---

## Phase 7: User Story 4 - Catalog cards show a picture of each visualization (Priority: P3)

**Goal**: Each of the 23 catalog cards shows a 320×240 WebP sample picture made by that visualization (research R11, contracts/thumbnail.md). The pictures are ready-made files, so opening the catalog runs no visualization. A development-only page regenerates them.

**Independent Test**: Open `/studio`. All 23 cards show their own picture, there are no visualization chunks in the Network tab, the pictures total ≤ 500 KB, and with `/studio/thumbs/*` blocked the cards show their symbols as before.

### Tests for User Story 4

- [X] T028 [P] [US4] Create `web-client/src/__tests__/studio/thumbnailFiles.test.js` (Node `fs`, no DOM). For every `CATALOG` id:
  - `web-client/public/studio/thumbs/<id>.webp` exists.
  - It starts with `RIFF` and has `WEBP` at byte 8.
  - Its VP8/VP8L/VP8X header gives 320 × 240.
  - It is ≤ 30 KB.

  The total of all files is ≤ 500 KB, and the folder has no files for ids not in the catalog. Resolve the folder with `new URL("../../../public/studio/thumbs/", import.meta.url)` (FR-022, FR-026, FR-027).
- [X] T029 [P] [US4] Add to `web-client/src/__tests__/studio/studio.test.jsx` (catalog section):
  - Every card's `.card-thumb` contains an `<img>` with `src="/studio/thumbs/<id>.webp"`, `alt=""`, `width="320"`, `height="240"`, `loading="lazy"` and `decoding="async"`, plus the glyph in a `.card-glyph` span.
  - Each card link's accessible name is still the card name and summary (`getByRole("link", { name: /Times-table circle/ })`).
  - Firing `error` on an image removes or hides it, and the glyph stays visible.
  - Rendering the catalog calls no `entry.load()`: spy on the `CATALOG` entries' `load` (FR-023, FR-024, FR-025).
- [X] T030 [P] [US4] Extend `web-client/src/__tests__/studio/modules.contract.test.js` with "the thumbnail recipe is valid":
  - If `module.thumbnail` exists, its `presetId` (if any) is in `module.presets`.
  - Defaults + preset + `values` pass `validateConfig` with `replaced: []`.
  - `view` passes `module.validateView` unchanged.
  - `steps` is an integer 0–20000, and only on `animated` modules.
- [X] T031 [P] [US4] Create `web-client/src/__tests__/studio/core/thumbnail.test.js` for `renderThumbnail` with the canvas stub:
  - With phyllotaxis and `{ values: { angle: 137.6 } }`, it resolves to a 320×240 canvas whose log starts with a full-size `fillRect` (background) followed by one `drawImage` from a canvas.
  - With sorting and `{ steps: 50 }`, it calls `step` 50 times (spy on the instance via a wrapped module).
  - It destroys the instance (spy `destroy`) and disposes the context.
  - It rejects when the recipe's preset doesn't exist.

### Implementation for User Story 4

- [X] T032 [US4] Create `web-client/src/studio/core/thumbnail.js` exporting:
  - `THUMB_W = 320`, `THUMB_H = 240`.
  - `thumbnailConfig(module)`: defaults → `applyPreset(module, recipe.presetId)` values/input/view → `recipe.values` → `recipe.view`, then `validateConfig`. It throws if the preset is missing.
  - `renderThumbnail(module, { w, h } = {})`, per contracts/thumbnail.md steps 1–5:
    - Use `createModuleContext({ seed: cfg.seed, dpr: 1 })`.
    - Run steps in batches of 200 with `await new Promise((r) => setTimeout(r, 0))` between batches.
    - Wait for `ctx.idle()`, then poll `inst.isBusy?.()` every 50 ms with a 20 s limit.
    - Fit and centre the result onto a background-filled canvas.
    - Destroy the instance and dispose the context in a `finally` block.
  - `thumbnailBlob(canvas)`: `canvas.toBlob(resolve, "image/webp", 0.8)` as a promise.

  Make T031 pass.
- [X] T033 [US4] Add the dev-only writer plugin to `web-client/vite.config.js`:
  - `thumbnailWriter()` with `apply: "serve"`.
  - `configureServer(server)` adds middleware for `PUT /__thumbs/:id.webp`.
  - Validate the id with `/^[a-z0-9-]+$/` and against the ids parsed from `src/studio/catalog.js`: read the file and match `e\("([a-z0-9-]+)"`, so the config doesn't import app code.
  - Read the body with a 200 KB cap and check the RIFF/WEBP signature.
  - `fs.mkdir` with `recursive`, then write `public/studio/thumbs/<id>.webp`.
  - Reply 204, or 400/413 with a message.

  Add it to `plugins: [react(), thumbnailWriter()]`.
- [X] T034 [US4] Create the generator page `web-client/src/studio/dev/ThumbnailStudio.jsx`:
  - It lists all `CATALOG` entries in a grid. For each, it loads the module, calls `renderThumbnail`, and shows the result as an `<img>` from the WebP blob with its size in KB.
  - Each card has a "Save" button that does `fetch("/__thumbs/<id>.webp", { method: "PUT", body: blob })` and shows "saved" or the error.
  - A "Render all" / "Save all" toolbar runs entries one at a time and shows progress ("12 / 23") and the total size.
  - A note at the top says it's a development tool and where the files go.
- [X] T035 [US4] Route the generator in `web-client/src/Root.jsx`, development only:
  - `const ThumbnailStudio = import.meta.env.DEV ? lazy(() => import("./studio/dev/ThumbnailStudio.jsx")) : null;`
  - When `ThumbnailStudio && loc.path === "/studio/__thumbnails"`, render it inside `<Suspense>` instead of `StudioPage`.

  In production `/studio/__thumbnails` falls through to the studio, which shows "That visualization doesn't exist", and the generator code is tree-shaken out. Add a navigation test that `/studio/__thumbnails` renders the generator heading when `import.meta.env.DEV` is true (Vitest runs in dev mode), with `ThumbnailStudio` mocked.
- [X] T036 [P] [US4] Thumbnail recipes for the number-pattern modules. Each `thumbnail` field goes next to `sweep`, chosen to show the visualization at its most recognizable:
  - `web-client/src/studio/visualizations/collatz/index.js`: defaults.
  - `web-client/src/studio/visualizations/ulam/index.js`: `{ values: { size: 40000, dot: 1 } }`.
  - `web-client/src/studio/visualizations/recaman/index.js`: `{ values: { terms: 120 }, steps: 400 }`. Check that the arcs are complete; if the module animates growth, use enough steps.
  - `web-client/src/studio/visualizations/timesTable/index.js`: `{ values: { m: 2, N: 300 } }`, a cardioid.
  - `web-client/src/studio/visualizations/pascalMod/index.js`: `{ values: { modulus: 2, rows: 256 } }`, Sierpiński.
- [X] T037 [P] [US4] Thumbnail recipes for the fractal modules:
  - `web-client/src/studio/visualizations/mandelbrot/index.js`: defaults (the whole set).
  - `web-client/src/studio/visualizations/julia/index.js`: defaults (spiral).
  - `web-client/src/studio/visualizations/chaosGame/index.js`: `{ presetId: "sierpinski", values: { points: 300000 } }`.
  - `web-client/src/studio/visualizations/lsystem/index.js`: `{ presetId: "plant" }`.
  - `web-client/src/studio/visualizations/barnsley/index.js`: `{ presetId: "classic" }`.
- [X] T038 [P] [US4] Thumbnail recipes for the simulation modules:
  - `web-client/src/studio/visualizations/life/index.js`: `{ steps: 120 }`. Remember `stepsPerFrame` is 0.25; the recipe counts `step()` calls.
  - `web-client/src/studio/visualizations/elementaryCA/index.js`: `{ values: { rule: 30 }, steps: <rows to fill the screen> }`. Use `isDone()` from 004: steps until done, capped at 2000.
  - `web-client/src/studio/visualizations/grayScott/index.js`: a preset that forms clear patterns (for example `coral`), with `steps: 4000`.
  - `web-client/src/studio/visualizations/boids/index.js`: `{ steps: 300 }`.
  - `web-client/src/studio/visualizations/langton/index.js`: `{ steps: 11000 }` (the RL highway).
  - `web-client/src/studio/visualizations/dla/index.js`: `{ presetId: "frost" }`.
- [X] T039 [P] [US4] Thumbnail recipes for the geometry/dynamics and algorithm modules:
  - `web-client/src/studio/visualizations/lorenz/index.js`: `{ steps: 3000 }`, a full butterfly trail.
  - `web-client/src/studio/visualizations/doublePendulum/index.js`: `{ steps: 2400 }`, a visible trail.
  - `web-client/src/studio/visualizations/voronoi/index.js`: `{ values: { relax: 3 } }`.
  - `web-client/src/studio/visualizations/fourier/index.js`: `{ steps: <one full drawing cycle> }`, so the outline is complete.
  - `web-client/src/studio/visualizations/phyllotaxis/index.js`: defaults.
  - `web-client/src/studio/visualizations/sorting/index.js`: `{ values: { size: 80 }, steps: <about half of the run> }`, so the picture shows a sort in progress.
  - `web-client/src/studio/visualizations/maze/index.js`: `{ steps: <until isDone()> }`, a finished maze with its path.

  `renderThumbnail` should support `steps: "done"`, meaning step until `isDone()` with a 20000 cap. Add that to `core/thumbnail.js`, `contracts/thumbnail.md` and T030's check.
- [X] T040 [US4] Show the pictures on the cards:
  - In `web-client/src/studio/components/CatalogGrid.jsx`, inside `.card-thumb` (still `aria-hidden="true"`), render `<span className="card-glyph">{e.glyph}</span>` and `<img src={`/studio/thumbs/${e.id}.webp`} alt="" width={320} height={240} loading="lazy" decoding="async" onError={(ev) => (ev.currentTarget.hidden = true)} />`.
  - In `web-client/src/studio/studio.css`, make `.card-thumb` `position: relative; overflow: hidden`. Make `.card-thumb img` `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: inherit`. Keep the gradient background and glyph underneath.

  Make T029 pass.
- [X] T041 [US4] (Done. Regenerating all 23 takes about 11 s. Pictures tuned after review:
  - Lorenz: 12,000 steps and a 12,000-point trail.
  - Reaction–diffusion: the "maze" preset at 1,500 steps. `renderThumbnail` now waits for `ctx.idle()` after each step, because this module drops steps while its worker is behind.
  - Langton's ant: grid 72, so the highway is visible.
  - Ulam: defaults.
  - Elementary CA: width 200 and WebP quality 0.55, since rule 30's noise was 33 KB at 0.8; a recipe `quality` field was added for this.

  Total size is 242 KB.) Generate the pictures:
  - Run `npm run dev` in `web-client/`, open `http://localhost:5173/studio/__thumbnails`, and press "Save all".
  - Look at every picture. If one doesn't show its visualization well (blank, too dark, mid-transition), adjust that module's recipe and save it again.
  - Confirm all 23 files are in `web-client/public/studio/thumbs/` and T028 passes. If a file is over 30 KB, lower that module's detail or the WebP quality for it, and note it in research.md R11.

**Checkpoint**: The catalog shows real pictures and is still free of visualization code. US4 is shippable.

---

## Phase 8: Polish for User Story 4

- [X] T042 [P] Update `docs/adding-a-visualization.md`:
  - A "Catalog picture" section: the `thumbnail` recipe fields, how to regenerate (`npm run dev` → `/studio/__thumbnails` → Save), and that `thumbnailFiles.test.js` fails until the new picture is committed.
  - In "3. Add it to the catalog", mention the picture file.
- [X] T043 [P] Update `README.md`'s studio paragraph to mention that catalog cards show sample pictures, and add `/studio/__thumbnails` (dev only) next to the dev-server instructions.
- [X] T044 (Done. Under a full parallel run some tests timed out at random, so the suite now allows 15 s per test (`vite.config.js`) and 5 s for `findBy`/`waitFor` (`src/__tests__/setup.js`). The replay test uses a lighter Collatz count. Four runs in a row then passed: 529 tests. `dist/studio/thumbs/` has 23 files, and the generator isn't in `dist/`.) Run `npx vitest run` (three times, because of the load-sensitive tests) and `npm run build` in `web-client/`. Confirm:
  - `dist/studio/thumbs/` has 23 files.
  - `grep -r "__thumbnails\|ThumbnailStudio" dist/` finds nothing.
  - `grep -r "__thumbs" dist/` finds nothing.
- [X] T045 (Done in headless Chrome:
  - Checks 18–20: in both the production preview and `npm run dev`, the catalog requests 23 pictures (242 KB), all load at 320 px, and no visualization chunk loads. With `/studio/thumbs/*` blocked, all 23 cards show their symbol and no image.
  - Check 21: "Save all" took about 11 s.
  - Check 22: `grep` finds no generator code in `dist/`.
  - The dev writer rejects unknown ids, path tricks, non-WebP bodies (400) and bodies over 200 KB (413).) Run quickstart checks 18–22 in Chrome against `npm run dev` (and check 18 against `npm run preview`, which serves the production build). Record the results here.

---

## Dependencies for User Story 4

- **US4** depends only on the existing catalog. It uses `isDone()` (T022) and `isBusy()` (T017a) from US3, both already done.
- **Order:**
  1. T028–T031 (tests, in parallel)
  2. T032 → T033 → T034 → T035
  3. T036–T039 (recipes, in parallel)
  4. T040
  5. T041 (needs T032–T040)
  6. T042–T045
- T040 can be done right after the tests, because cards fall back to the glyph until the files exist.

### Parallel example (User Story 4)

```text
Tests:   T028 (thumbnailFiles.test.js) ‖ T029 (studio.test.jsx) ‖ T030 (modules.contract.test.js) ‖ T031 (core/thumbnail.test.js)
Recipes: T036 (number patterns) ‖ T037 (fractals) ‖ T038 (simulations) ‖ T039 (geometry + algorithms)
```

### Strategy

To get pictures on screen soonest:
1. Build T032–T035.
2. Generate the pictures with default recipes (T041).
3. Wire the cards (T040).
4. Improve the recipes (T036–T039) and regenerate.

---

## Follow-up (after US4): app name, logo and link previews

Done outside the task list, at the user's request:
- **App name:** "Visualization Playground by Maahyar Azad" (`web-client/src/site.js`) in the header, the tab titles, `index.html` and the import messages.
- **Logo:** `web-client/public/logo.png`, a 192 px square cut from the Julia set's catalog picture, used for the favicon and in the header.
- **Link previews:** `web-client/build/openGraph.js` writes Open Graph and Twitter Card tags into `dist/index.html`, plus `dist/og/studio.html` and `dist/og/studio/<id>.html` per visualization. nginx serves them with `try_files $uri /og$uri.html $uri/ /index.html`.
- **Pictures moved:** from `/studio/thumbs/` to `/thumbs/`. A `dist/studio/` folder made nginx's `$uri/` rule answer `/studio` with a 301 to `/studio/`, which then gave a 403 because that folder had no `index.html`.
- **Checked with nginx 1.27 in Docker:** with the new rule, `/studio/julia` returns 200 with the Julia preview. With the old rule, every page returns 200 with the site preview.


---

## Phase 9: User Story 5 - Choose which settings the sweep moves (Priority: P2)

**Goal**: While "Animated sweep" is on, every setting the sweep moves shows a checkbox. Unticking it takes that setting out of the sweep: it keeps its current value, becomes an ordinary setting the user can edit, and the other swept settings keep moving. Ticking it again puts it back in the sweep, continuing from its current value. This also covers the zoom of a zoom sweep (Mandelbrot, Julia).

**Independent Test**: Open `/studio/collatz-coral` and click "Animated sweep". "Even-step angle (°)" and "Odd-step angle (°)" are each marked "⟳ sweeping" with a checkbox ticked. Untick "Odd-step angle (°)": it stops moving, its slider can be dragged and keeps the value, "Even-step angle (°)" keeps moving. Tick it again: it moves again from where it is. Untick both: nothing moves and a hint says "Tick at least one setting to sweep." Reload from a share link, a saved copy or an export file: the choices are the same.

**How the choice is stored** (decided here, so every task agrees):
- For every sweep target, `withSweep()` adds one **hidden toggle knob** named `sweepOn_<target key>` (for a zoom target `sweepOn_view`), default `true`, with `hidden: true` and `when: (v) => v.sweep`.
- Being ordinary knob values, they travel through share links (only when `false`, so links stay short), saved records and export files with **no format change** (research R3). Payloads made before this story have no such keys, so every swept setting stays on (FR-016 still holds).
- "Reset to defaults" and applying any preset put every setting back on, because both start from the knobs' defaults.
- Only the settings a module already declares in `sweep.targets` can be chosen. Making any other setting sweepable (with a range of the user's choice) is out of scope.

### Tests for User Story 5 (write first, see them fail)

- [X] T046 [P] [US5] Update and extend `web-client/src/__tests__/studio/core/sweep.test.js`:
  - **Existing expectations to change:** line 95 (`m.knobs.map(k => k.key)` becomes `["a", "sweep", "sweepSpeed", "sweepOn_a"]`) and line 125 (`SWEEP_KNOBS` still lists only `sweep` and `sweepSpeed`; the per-target knobs are not in it).
  - **withSweep:** each target gets `{ key: "sweepOn_<key>", type: "toggle", default: true, hidden: true }`, placed after `sweepSpeed`, and a zoom target gets `sweepOn_view`. The input module is not mutated.
  - **Helpers:** `isSweepKey` is true for `sweep`, `sweepSpeed` and any `sweepOn_*`, false otherwise. `activeSweptKeys(module, values)` lists the declared keys whose `sweepOn_*` value isn't `false` (and `view` for zoom), in declaration order; a missing value counts as on. `sweptKeys` is unchanged.
  - **Driver:** with `sweepOn_b: false`, only `a` is written, and `b` is left untouched. With all off, `apply` is never called over 100 ticks. After the user switches `b` back on, `b` resumes from its current value with no jump (first written value within one tick's movement of the current one). `kind: "run"`: the step count and the "user moved it" check use only active targets.
- [X] T047 [P] [US5] Extend `web-client/src/__tests__/studio/sweep.contract.test.js` and `web-client/src/__tests__/studio/modules.contract.test.js`. For every module with `sweep`:
  - Every target has a `sweepOn_*` knob with `type: "toggle"`, `default: true` and `hidden: true`, and `validateConfig(module, sweepConfig(module)).replaced` is still `[]`.
  - With every `sweepOn_*` set to `false`, 50 fake-time driver ticks never call `apply`.
  - With only the first target on, every `changedKeys` is a subset of that target's key.
  - No two knobs share a key, and none of the module's own knob keys starts with `sweepOn_`.
- [X] T048 [P] [US5] Extend `web-client/src/__tests__/studio/sweep.ui.test.jsx` (the file's `openViz`, `frames` and `angle` helpers already exist). Use `collatz-coral` for the scenarios below, and `mandelbrot` for the zoom one:
  - **Checkboxes appear:** after clicking "Animated sweep", `getByRole("checkbox", { name: "Sweep Even-step angle (°)" })` and `…"Sweep Odd-step angle (°)"` exist and are checked. "Numbers" has none. The checkboxes are absent while the sweep is off. The hidden `sweepOn_*` knobs add no extra rows to Settings.
  - **Opt out:** unticking "Sweep Odd-step angle (°)" and then running 40 frames leaves that slider's value unchanged while "Even-step angle (°)" changes. The odd slider has no "sweeping" description any more, and can be changed by the user (`fireEvent.change`) and keeps the new value across further frames.
  - **Opt back in:** re-ticking it makes it move again, starting within one step of its current value.
  - **None selected:** with both unticked, no value changes over 40 frames, the hint "Tick at least one setting to sweep." is shown, and it disappears when one is ticked. The Pause/Play bar is still there.
  - **Zoom (`mandelbrot`):** the canvas badge is a button named "Sweep zoom" with `aria-pressed="true"` (text "⟳ sweeping zoom"). Pressing it sets `aria-pressed="false"`, the text becomes "Sweep zoom", and the picture is no longer redrawn while the hint "Tick at least one setting to sweep." shows (Mandelbrot's zoom is its only swept setting).
  - **Persistence:** a share link, a saved record and an export file made with `sweepOn_oddAngle: false` come back with it still `false`. A config with every setting on adds no `sweepOn_*` key to the share link's `v` diff. A payload without any `sweepOn_*` key opens with all settings on.
  - **Reset:** "Reset to defaults" and applying the "Animated sweep" preset set every setting back on.
- [X] T049 [P] [US5] In `web-client/src/__tests__/studio/savedReplay.test.js` (line 22) also skip hidden knobs when drawing random values (`!x.hidden`), so the randomized configurations keep every sweep selection at its default. Add a short comment saying why.

### Implementation for User Story 5

- [X] T050 [US5] In `web-client/src/studio/core/sweep.js`:
  1. Export `SWEEP_ON_PREFIX = "sweepOn_"`, `sweepOnKey(target)` (`sweepOn_` plus `view` for a zoom target, else the target's `key`) and `isSweepKey(key)` (`sweep`, `sweepSpeed`, or starts with the prefix).
  2. In `withSweep`, append one hidden toggle knob per target after `SWEEP_KNOBS`: `{ key: sweepOnKey(t), label: "Sweep …", type: "toggle", default: true, hidden: true, when: (v) => v.sweep }`.
  3. Export `activeSweptKeys(module, values)`: `sweptKeys(module)` filtered to those whose `values[sweepOnKey]` isn't `false`.
  4. In `createSweepDriver`, work from the **active** targets, read from `getConfig().values` every tick: `write` and the "user moved a swept setting" check skip inactive targets, `stepCount` uses active targets, `syncPhase()` defaults to the first active target, and `tick()` returns right after updating `lastTick` when there are none. `reset()` (called when the sweep itself is switched on) re-syncs the phase from the first active target's current value. Switching a *target* in or out needs no reset: the driver compares the active set on every tick and, for a target that has just come back on, gives it its own phase shift (an `offsets` map) so it continues from its current value while the others are undisturbed.
  5. Keep `SWEEP_KNOBS`, `sweptKeys` and the rest of the exports as they are.
- [X] T051 [US5] In `web-client/src/studio/components/KnobPanel.jsx`:
  - Skip knobs with `hidden` when building groups.
  - Add props `sweepable` (a `Set` of the keys the module's sweep can move, from `sweptKeys(module)`; empty when `values.sweep` is off) and `onToggleSweep(key, on)`. Keep `sweeping` (the keys moving right now, from `activeSweptKeys`).
  - For a knob in `sweepable`, replace the current "⟳ sweeping" pill with `<label className="sweep-toggle"><input type="checkbox" aria-label="Sweep {knob.label}" checked={sweeping.has(key)} onChange=… /><span className="sweep-badge" id="sweep-badge-{key}">⟳ sweeping</span></label>`. When it is unticked, show the plain text "Sweep this setting" in a `sweep-badge sweep-badge-off` pill (no `aria-describedby` on the knob, no `.sweeping` wrapper, so it looks like an ordinary setting).
  - When `sweepable.size > 0` and `sweeping.size === 0`, show `<p className="knob-help" role="status">Tick at least one setting to sweep.</p>` under the "Sweep speed" knob (or at the end of the panel if that knob is hidden).
- [X] T052 [US5] In `web-client/src/studio/components/Viewer.jsx`:
  1. Replace `SHELL_KEYS` (line 18) and its use in `onKnobChange` with `isSweepKey` from `core/sweep.js`, so no `sweepOn_*` change ever reaches the module's `update()`.
  2. A `sweepOn_*` change needs no `reset()` (the driver notices it on its next tick), so it just returns early like `sweepSpeed` does.
  3. Pass `KnobPanel` `sweeping={activeSweptKeys(module, config.values)}` (as a `Set`, empty while the sweep is off), `sweepable={new Set(sweptKeys(module))}` while `config.values.sweep`, and `onToggleSweep={(key, on) => onKnobChange(sweepOnKey({ key }), on)}` (the zoom target's key is `view`).
  4. Turn the canvas badge (lines 499–503) into a `<button type="button" className="sweep-badge sweep-badge-zoom" aria-pressed={zoomOn}>` that calls `onKnobChange("sweepOn_view", !zoomOn)`. Text: "⟳ sweeping zoom" when on, "Sweep zoom" when off. Keep `id="sweep-badge-view"`. Show it whenever the sweep is on and the module sweeps its zoom.
- [X] T053 [P] [US5] In `web-client/src/studio/studio.css`, next to the sweep rules (around line 717):
  - `.sweep-toggle` (inline-flex, gap 6px, cursor pointer, checkbox at least 16px, and 44px tall tap area under `@media (pointer: coarse)`).
  - `.sweep-badge-off`: no animation, muted colours (`var(--muted)` on `var(--surface)` with a border), still at least 4.5:1 contrast.
  - Make `.sweep-badge-zoom` work as a button: `font: inherit`, `cursor: pointer`, a visible `:focus-visible` ring like `.zoom-controls button`, and a "off" look when `aria-pressed="false"`.
  - Check light and dark themes and a 360 px wide viewport.
- [X] T054 [P] [US5] Update the docs (no code):
  - `specs/004-studio-home-sweep/spec.md`: add User Story 5 (the goal and independent test above) and requirements **FR-028** (each setting a sweep moves can be switched out of the sweep and back, including the zoom), **FR-029** (a switched-out setting keeps its value and can be edited freely), **FR-030** (the choice persists through share link, save and export with no format change, and old payloads sweep everything), **FR-031** (with nothing selected the sweep does nothing and says so).
  - `specs/004-studio-home-sweep/contracts/sweep.md`: in "Shell responsibilities" and "Persistence", describe the `sweepOn_<key>` knobs and that the driver ignores switched-off targets.
  - `specs/004-studio-home-sweep/data-model.md`: add the `sweepOn_<key>` rows to "Shell-added knobs".
  - `docs/adding-a-visualization.md` ("Animated sweep", line 81): one sentence that users can switch each declared target on or off, so module authors need to do nothing.

### Checks for User Story 5

- [ ] T055 [US5] Run `npx vitest run` in `web-client/` (T046–T049 now pass; the Mandelbrot, Julia and Times-table sweep tests and the replay test still pass) and `npm run build`. Then in a browser at `/studio/collatz-coral` and `/studio/mandelbrot`, follow the Independent Test above, and confirm that dragging an unticked setting while the sweep runs never makes the picture jump or blank (FR-012). **Status:** the automated part is done (`npx vitest run`: 48 files, 662 tests pass; `npm run build` succeeds). The manual browser check is still to do: the Chrome extension was not connected, so it was not run.

### Dependencies for User Story 5

- T046–T049 (tests, in parallel) → T050 → T051 and T052 (T052 needs T050 and T051's props; do T051 first) → T053 (independent of the code, can run with T051/T052) and T054 (docs, any time after T050).
- T052 edits `Viewer.jsx`, which User Story 6 (T059) also edits. Finish T052 before starting T059.

### Parallel example (User Story 5)

```text
Tests: T046 (core/sweep.test.js) ‖ T047 (sweep.contract + modules.contract) ‖ T048 (sweep.ui.test.jsx) ‖ T049 (savedReplay.test.js)
After T050: T051 (KnobPanel.jsx) ‖ T053 (studio.css) ‖ T054 (docs); then T052 (Viewer.jsx)
```

---

## Phase 10: User Story 6 - View the canvas in full screen (Priority: P3)

**Goal**: Every visualization's canvas has a "Full screen" button. It fills the whole screen with the picture, redrawn at the new size, with the zoom buttons and the sweep badge still on it. Esc, or the button (now "Exit full screen"), returns to the normal page. Browsers that cannot do this don't show the button.

**Independent Test**: Open `/studio/mandelbrot` in desktop Chrome and press "Full screen". The canvas fills the screen and is redrawn sharply. Pan and zoom still land where the pointer is. Press Esc: the page is back as it was, with the same settings. Repeat on `/studio/boids` (animated): the animation keeps running, and Space pauses it.

**Decisions made here**:
- **What goes full screen:** the `.canvas-wrap` element (the canvas plus its zoom buttons and sweep badge), not the whole page. The side panel and playback bar are hidden while in full screen. Space (play/pause) and the module's own keys keep working because the canvas has focus.
- **Size:** in full screen the canvas fills the whole screen (no 4:3 limit). To keep heavy visualizations responsive, the canvas's drawing area is capped at 4 million pixels (the device pixel ratio is lowered to fit); the browser scales it up to the screen.
- **Where there's no support** (for example iPhone Safari, which only allows full screen for video), the button is not shown. The prefixed WebKit API is used where it exists.
- **No keyboard shortcut** is added for entering full screen, because some interactive visualizations use letter keys. Esc leaves it, as in every browser.

### Tests for User Story 6 (write first, see them fail)

- [X] T056 [P] [US6] Create `web-client/src/__tests__/studio/core/fullscreen.test.js` for the new `web-client/src/studio/core/fullscreen.js`. Stub the API on `Element.prototype` and `document` (jsdom has none), restoring it after each test:
  - `fullscreenSupported(el)`: true when `document.fullscreenEnabled` is true and `el.requestFullscreen` exists; true through the `webkit` names when only those exist; false otherwise, and false when `fullscreenEnabled` is false.
  - `enterFullscreen(el)` resolves `{ ok: true }` and calls `requestFullscreen` (or `webkitRequestFullscreen`); it resolves `{ ok: false }` when that rejects or throws, and never rejects itself.
  - `exitFullscreen()` calls `document.exitFullscreen` (or the webkit one), does nothing when nothing is full screen, and never rejects.
  - `isFullscreen(el)` compares `document.fullscreenElement` (or `webkitFullscreenElement`) with `el`.
- [X] T057 [P] [US6] Create `web-client/src/__tests__/studio/fullscreen.test.jsx`, rendering `Root` at `/studio/phyllotaxis` as `studio.test.jsx` does (`installCanvasStub`, `stubReducedMotion`). Stub the Fullscreen API (`document.fullscreenEnabled = true`, `Element.prototype.requestFullscreen` as a mock that sets `document.fullscreenElement` and dispatches `fullscreenchange`, `document.exitFullscreen` likewise) and a global `ResizeObserver` that keeps its callback so the test can fire it:
  - **Button:** a button "Full screen" is shown. Clicking calls `requestFullscreen` once, on the element that contains the canvas (`canvas.closest(".canvas-wrap")`).
  - **State:** after `fullscreenchange` the button is named "Exit full screen" and has `aria-pressed="true"`. Clicking it calls `exitFullscreen`. A `fullscreenchange` with no full-screen element (the user pressed Esc) sets it back to "Full screen".
  - **Inside the full-screen element:** the zoom buttons (use `/studio/mandelbrot`) and the "Sweep zoom" badge (`/studio/mandelbrot` with the sweep on) are descendants of the element passed to `requestFullscreen`.
  - **Resize:** with the container reported as 1920×1080 CSS px and `devicePixelRatio = 2`, firing the observer callback leaves the canvas's drawing area at most 4,000,000 pixels and in the 16:9 ratio, with its CSS size 1920×1080. After leaving full screen, the size returns to the normal 4:3 layout.
  - **Unsupported:** with `document.fullscreenEnabled = false` (and no webkit API) no "Full screen" button is shown.
  - **Failure:** when `requestFullscreen` rejects, the notice "Full screen isn't available here, or the browser blocked it." appears and the button stays "Full screen".
  - **Cleanup:** unmounting the viewer (go back to the catalog) while in full screen calls `exitFullscreen`.
  - **Keys:** with an animated module (`/studio/boids`) in full screen and the canvas focused, pressing Space toggles Play/Pause as it does in the normal page.

### Implementation for User Story 6

- [X] T058 [US6] Create `web-client/src/studio/core/fullscreen.js` exporting `fullscreenSupported(el)`, `enterFullscreen(el)`, `exitFullscreen()` and `isFullscreen(el)` as specified in T056, using the standard API first and the `webkit`-prefixed one as a fallback. No React and no module-level side effects. Also export `FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"]`.
- [X] T059 [US6] In `web-client/src/studio/components/Viewer.jsx` (after T052):
  1. Add `const [fullscreen, setFullscreen] = useState(false)` and an effect that listens to `FULLSCREEN_EVENTS` on `document` and sets it to `isFullscreen(containerRef.current)`. On unmount, if still full screen, call `exitFullscreen()`.
  2. Change `canvasSize(container)` (line 24) so that, when `isFullscreen(container)`, `cssW`/`cssH` are the container's `clientWidth`/`clientHeight` (keep the 240 px minimum, but drop the 4:3 and 72%-of-window limits), and `dpr = min(devicePixelRatio, 2, sqrt(4_000_000 / (cssW × cssH)))` (never above the normal dpr), with `w`/`h` rounded from it. Normal sizing is unchanged. The resize effect (step 3) already reacts to the container's size, so nothing else changes there; make sure its "first observation" skip and `last` key don't suppress the change when full screen starts.
  3. Add the button inside `.canvas-wrap`, only when `ready && fullscreenSupported(containerRef.current)`: `<button type="button" className="fullscreen-btn" aria-pressed={fullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title=…>` with an inline SVG icon (expand / collapse arrows, `aria-hidden`). On click: if in full screen call `exitFullscreen()`; otherwise `enterFullscreen(containerRef.current)`, and on `{ ok: false }` set the notice "Full screen isn't available here, or the browser blocked it.". After entering, call `canvasRef.current?.focus({ preventScroll: true })`.
  4. Leave pointer, wheel and key handling as they are. They already use the canvas's own bounding box, so pan and zoom keep mapping correctly at the new size.
- [X] T060 [P] [US6] In `web-client/src/studio/studio.css`, next to `.zoom-controls` (line 402):
  - `.fullscreen-btn`: bottom-right of `.canvas-wrap` (`position: absolute; right: 8px; bottom: 8px`), the same dark glass look, 36 px square (44 px under `@media (pointer: coarse)`), visible `:focus-visible` ring.
  - `.canvas-wrap:fullscreen, .canvas-wrap:-webkit-full-screen`: `width: 100%; height: 100%; border-radius: 0; display: grid; place-items: center; background: #0f0f12;`, and for the canvas inside `max-width: 100%; max-height: 100%`.
  - Check the progress bar and the sweep badge still sit correctly in full screen, in light and dark themes.
- [X] T061 [P] [US6] Update the docs (no code):
  - `specs/004-studio-home-sweep/spec.md`: add User Story 6 (the goal and independent test above) and requirements **FR-032** (every visualization's canvas has a full-screen control, hidden where the browser can't do it), **FR-033** (full screen fills the screen, redraws at the new size within the 4-million-pixel cap, and keeps the zoom controls, sweep badge and keyboard controls working), **FR-034** (Esc or the control leaves it and restores the page and every setting).
  - `README.md`: add "full screen" to the studio paragraph's list of features.

### Checks for User Story 6

- [ ] T062 [US6] Run `npx vitest run` in `web-client/` (T056–T057 now pass, nothing else regresses) and `npm run build`. Then follow the Independent Test above in desktop Chrome (and Firefox if available), and also check: (a) entering and leaving full screen with an Animated sweep running keeps sweeping and doesn't change any setting, (b) Mandelbrot in full screen on a 4K or retina display finishes its redraw in a reasonable time, (c) on iPhone Safari (or by removing the API in DevTools) no button is shown and nothing breaks. **Status:** the automated part is done (`npx vitest run`: 48 files, 662 tests pass; `npm run build` succeeds). The manual browser check is still to do: the Chrome extension was not connected, so it was not run.

### Dependencies for User Story 6

- T056, T057 (tests, in parallel) → T058 → T059 (needs T058, and T052 from US5 because both edit `Viewer.jsx`) → T060 and T061 (any time after T058; T060 needs the class names from T059) → T062.
- US6 has no other dependency on US5: the full-screen button works with or without the sweep.

### Parallel example (User Story 6)

```text
Tests: T056 (core/fullscreen.test.js) ‖ T057 (fullscreen.test.jsx)
After T059: T060 (studio.css) ‖ T061 (docs)
```

---

## Strategy for User Stories 5 and 6

1. Do US5 first (T046–T055). It's the fix for the settings panel, and US6 needs its `Viewer.jsx` changes finished.
2. Then US6 (T056–T062). The two stories can ship in separate commits or pull requests; nothing in US6 needs US5's behaviour.
3. Only the manual checks (T055, T062) need a real browser. Everything else runs under `npx vitest run`.

---

## Phase 11: User Story 7 - A Tetris loading screen with progress while the site loads (Priority: P2)

**Goal**: When someone opens the site, the page the web server sends shows a centered Tetris animation (never larger than 100 × 100 px) with a percentage under it, until the app's first screen assets have loaded and the app is on screen. Then it fades away.

**Independent Test**: Build (`npm run build`) and serve `web-client/dist/` (`npx vite preview`), open `/studio` with DevTools → Network throttled to "Slow 4G" and the cache disabled. The Tetris animation shows in the middle of the window at 100 px or less, with a percentage that climbs from 0 % to 100 %, then it disappears and the catalog is there. Repeat on `/studio/julia` and `/playground`. With JavaScript's animation unavailable (block `*.lottie`), the percentage still shows.

**Decisions made here** (the request left them open):
- **"Server side"** means *in the HTML the server sends*, not React: the loader lives in `web-client/index.html`, so it shows before any app code has run. Nothing changes in `server/` (the Node API) or in nginx.
- **Library:** the user's snippet offers a CDN script (`@latest`, unpinned, and a third-party request on every visit) or npm. Use npm, pinned: `@lottiefiles/dotlottie-wc` (the `<dotlottie-wc>` web component, which works without React), not `@lottiefiles/dotlottie-react`.
- **The animation file:** move `Tetris Loop.lottie` from the repository root to `web-client/public/tetris-loop.lottie` (no spaces in the URL). It is 1.4 KB.
- **What "all assets" means:** what the first screen needs, listed at build time: the entry script and its imports, the `StudioPage` chunk, the CSS, `logo.png` and the 23 catalog pictures in `public/thumbs/`. It does not include the 23 visualization chunks, which load when one is opened, nor the Playground chunk.
- **Percentage:** bytes received ÷ total bytes of that list (sizes are written into the page at build time), then 100 % is shown once the app has put its first screen in `#root`. The loader fetches the files itself with `fetch` and reads the stream, so they are in the browser cache when the app asks for them.
- **When it goes away:** all listed assets are loaded **and** `#root` contains something other than the Suspense fallback (`.studio-loading`). Watched with a `MutationObserver`, so no app code changes. A 15-second safety limit removes it anyway.
- **In `npm run dev`** there is no list, so the percentage follows the entry script only and the loader goes when the app mounts.
- **Size and place:** the animation box is exactly 100 × 100 px at most (`width: 100px; height: 100px; max-width: 100px; max-height: 100px`), centered both ways with the percentage under it, over a full-window background that follows the light/dark theme.
- **Reduced motion:** with `prefers-reduced-motion: reduce` the animation does not autoplay (it shows its first frame); the percentage still updates.

### Tests for User Story 7 (write first, see them fail)

- [X] T063 [P] [US7] Create `web-client/src/__tests__/boot/progress.test.js` for the new `web-client/src/boot/progress.js`:
  - `createProgress(assets, { fetchFn, onProgress })` with fake `fetch` responses (streams of known chunk sizes) reports a non-decreasing percentage from 0 to 100, based on bytes received ÷ the total of the `size` fields, never above 100, and ends with `{ done: true }` once every asset has finished.
  - A failed asset (rejected fetch or a non-OK status) counts as finished with its full size, so one missing file never leaves the loader stuck below 100 %.
  - An empty or missing list gives `{ percent: 0, done: true }`; a response without a readable body counts as loaded when its promise resolves.
  - `formatPercent(0.4)`-style helper: `formatPercent(p)` returns an integer string from `"0"` to `"100"`.
- [X] T064 [P] [US7] Create `web-client/src/__tests__/boot/loader.test.js` (jsdom) for the new `web-client/src/boot/loader.js`. Put `<div id="boot-loader" role="status" aria-live="polite"><span id="boot-percent"></span></div>` and `<div id="root"></div>` in `document.body`, and stub `fetch`:
  - `startLoader({ assets })` writes the percentage into `#boot-percent` as it grows (for example `"37%"`).
  - It stays visible while `#root` is empty or holds only `<p class="studio-loading">`, even when every asset has loaded; once `#root` holds another element **and** progress is 100 it adds the class `boot-loader--done`, and removes the element after the `transitionend` event (or after 400 ms when the event never comes).
  - After the 15 s limit (fake timers) it is removed even if assets are still loading.
  - With no `#boot-loader` in the page it does nothing and does not throw.
- [X] T065 [P] [US7] Create `web-client/src/__tests__/bootManifest.test.js` (`// @vitest-environment node`, like `openGraph.test.js`) for the new `web-client/build/bootAssets.js`:
  - `collectBootAssets(bundle, { publicFiles })` returns `[{ url, size }]` containing the entry chunk and its static imports, the chunk whose `facadeModuleId` ends in `StudioPage.jsx`, its and the entry's CSS, and the public files given (`/logo.png`, `/thumbs/*.webp`), each URL starting with `/`, sizes in bytes, no duplicates, and no visualization chunk (for example none whose name starts with `mandelbrot`) and no `App` (Playground) chunk.
  - `injectBootAssets(html, assets)` puts `<script>window.__BOOT_ASSETS__=[…]</script>` before the first module script, escaping `<` as `<`, and is a no-op when the list is empty.

### Implementation for User Story 7

- [X] T066 [US7] In `web-client/`: run `npm install --save-exact @lottiefiles/dotlottie-wc` (pinned; commit the `package.json` and `package-lock.json` change). Then check where the player fetches its WebAssembly renderer from at run time: by default it loads from a CDN. Download that `.wasm` file into `web-client/public/dotlottie-player.wasm`, and call the package's `setWasmUrl("/dotlottie-player.wasm")` (see its README) from `web-client/src/boot/loader.js` before the animation starts, so the site loads nothing from a third party. Note the wasm file's size in `research.md` (R12).
- [X] T067 [US7] Move the animation: `mv "Tetris Loop.lottie" web-client/public/tetris-loop.lottie` from the repository root (it is untracked, so no `git mv`).
- [X] T068 [P] [US7] Create `web-client/src/boot/progress.js` as specified in T063: `createProgress`, `formatPercent`. Read each response with `response.body.getReader()` and add `value.length` to the received total as chunks arrive. No DOM access.
- [X] T069 [P] [US7] Create `web-client/build/bootAssets.js` as specified in T065: `collectBootAssets(bundle, { publicFiles })`, `injectBootAssets(html, assets)`, and the Vite plugin `bootAssets()` that, in `transformIndexHtml` with `order: "post"` (so it runs before `build/openGraph.js` copies the page for `/studio` and each visualization), reads `ctx.bundle`, lists `public/logo.png` and `public/thumbs/*.webp` with `fs.statSync(...).size`, and injects the result. During `vite dev` (`ctx.bundle` is undefined) it injects nothing.
- [X] T070 [US7] (Done as two files: `src/boot/loader.js` has `startLoader` with no side effects so it can be tested, and the entry `src/boot/index.js` starts it, sets the wasm URL and creates the `<dotlottie-wc>` element inside `#boot-anim` after that, because an element in the HTML would start loading before `setWasmUrl` runs; `index.html` loads `/src/boot/index.js`.) Create `web-client/src/boot/loader.js` as specified in T064: `startLoader({ assets = window.__BOOT_ASSETS__ ?? [] })`, which uses `createProgress`, updates `#boot-percent`, and removes `#boot-loader` as described. At module level, call `startLoader()` once the DOM is ready, and set up the animation: `import "@lottiefiles/dotlottie-wc"` and `setWasmUrl` (T066). Set `autoplay` unless `matchMedia("(prefers-reduced-motion: reduce)").matches`. If the import or the animation fails, leave the percentage showing and don't throw.
- [X] T071 [US7] In `web-client/index.html`:
  - Inside `<body>`, before `<div id="root">`, add `<div id="boot-loader" role="status" aria-live="polite"><dotlottie-wc src="/tetris-loop.lottie" loop></dotlottie-wc><span id="boot-percent">0%</span></div>` (the `<dotlottie-wc>` element has no `autoplay` attribute here: `loader.js` sets it, see T070).
  - Add an inline `<style>` in `<head>` (so it applies before any CSS file arrives): `#boot-loader` is `position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 1000; background: Canvas; color: CanvasText;` with `dotlottie-wc { width: 100px; height: 100px; max-width: 100px; max-height: 100px; }`, `#boot-percent { font: 14px system-ui, sans-serif; font-variant-numeric: tabular-nums; }`, `.boot-loader--done { opacity: 0; transition: opacity .3s; pointer-events: none; }` and a `@media (prefers-color-scheme: dark)` background that matches the studio's dark theme (read the colours from `web-client/src/studio/studio.css`).
  - Add `<script type="module" src="/src/boot/loader.js"></script>` before the existing `main.jsx` script, so the loader starts first.
- [X] T072 [US7] In `web-client/vite.config.js` add `bootAssets()` to `plugins` (line 64) after `react()` and before `openGraph()`. Check that `build/openGraph.js` keeps the loader markup and the manifest in every page it writes: `dist/index.html`, `dist/og/studio.html` and `dist/og/studio/<id>.html` must all contain `id="boot-loader"` and `__BOOT_ASSETS__`. Add a test for that to `web-client/src/__tests__/openGraph.test.js` (it already builds the pages from `index.html`).
- [X] T073 [P] [US7] Check the nginx config needs no change: `deploy/nginx-brain-harness.conf` serves `/tetris-loop.lottie` and `/dotlottie-player.wasm` as static files. Confirm nginx answers `.wasm` with `application/wasm` (it does with the default `mime.types`; if the server's file is old, add `types { application/wasm wasm; }` to the site config) and document the result in `research.md` (R12). Update the "Check the pages are served" step in `.github/workflows/deploy-web-client.yml` to also `curl -fsS "$PUBLIC_URL/tetris-loop.lottie" -o /dev/null`.
- [X] T074 [P] [US7] Update the docs (no code): `specs/004-studio-home-sweep/spec.md` (add User Story 7 and requirements **FR-035** the page the server sends shows a centered loading animation of at most 100 × 100 px with a percentage until the first screen's assets are loaded and the app is shown, **FR-036** the percentage never goes down, reaches 100 only when loading is finished, and a failed file cannot leave it stuck, **FR-037** nothing is requested from a third-party host, **FR-038** reduced motion stops the animation but not the percentage), `research.md` (R12: the choices above, the wasm file, the 15 s limit), and the `README.md` studio paragraph (one sentence).

### Checks for User Story 7

- [ ] T075 [US7] Run `npx vitest run` in `web-client/` (T063–T065 and the T072 test pass, nothing else regresses; the existing tests need no loader markup because they render `Root` directly) and `npm run build`. Open `dist/index.html` and confirm `__BOOT_ASSETS__` lists the entry chunk, the `StudioPage` chunk, the CSS, the logo and the 23 pictures, and that no `mandelbrot-*.js` is in it. Then do the Independent Test above in Chrome with throttling, and also check: (a) the animation is at most 100 × 100 px and centered at window sizes from 360 px wide to 4K, (b) the percentage never goes down and ends at 100, (c) the Network tab shows no request to `unpkg.com`, `jsdelivr.net` or any host other than your own, (d) blocking `tetris-loop.lottie` still shows the percentage and the app still loads. **Status:** the automated part is done (`npx vitest run`: 51 files, 677 tests pass; `npm run build` succeeds; `dist/index.html`, `dist/og/studio.html` and every `dist/og/studio/<id>.html` have the loader and the list, which holds the entry, `StudioPage`, CSS, logo and 23 pictures and no `mandelbrot-*.js`; `vite preview` serves the `.lottie` and the `.wasm` as `application/wasm`; the bundle's only CDN addresses are the player's unused defaults). The checks in a real browser, (a)–(d) and the throttled run, are still to do: no browser was connected.

### Dependencies for User Story 7

- T063–T065 (tests, in parallel) → T066 and T067 (setup, in parallel) → T068 and T069 (in parallel) → T070 (needs T066, T068) → T071 (needs T070 and T067) → T072 (needs T069, T071) → T073 and T074 (any time after T072) → T075.
- US7 touches only `index.html`, `vite.config.js`, `build/` and the new `src/boot/`, so it is independent of US5 and US6.

### Parallel example (User Story 7)

```text
Tests:  T063 (progress.test.js) ‖ T064 (loader.test.js) ‖ T065 (bootManifest.test.js)
Setup:  T066 (npm install, wasm) ‖ T067 (move the .lottie file)
Code:   T068 (progress.js) ‖ T069 (build/bootAssets.js)
Last:   T073 (nginx/workflow check) ‖ T074 (docs)
```

### Strategy

Ship in one change. If the wasm file turns out too large to be worth self-hosting (T066), the fallback is a CSS-only Tetris-coloured spinner with the same percentage; say so in `research.md` rather than loading from a CDN.
