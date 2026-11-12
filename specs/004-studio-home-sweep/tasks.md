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

