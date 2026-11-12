# Implementation Plan: Visualization Studio

**Branch**: `003-visualization-studio` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-visualization-studio/spec.md`

## Summary

Add a Visualization Studio to the existing `web-client` (Vite + React) next to the Brain Harness playground. The studio is a catalog of 23 generative and algorithmic visualizations. Each one is a self-contained module with a declared list of knobs, presets, and a small lifecycle (create, update, step, resize, destroy) drawing to a 2D canvas. A shared shell renders the catalog, the knob panel (generated from knob definitions), playback controls, save/load, and share/export.

Heavy pure computations (Mandelbrot/Julia rows, Gray–Scott, DLA) run in Web Workers so the page stays responsive. Randomness uses a seeded generator so the same configuration reproduces the same picture. Saved visualizations live in `localStorage`. Share links carry a compressed configuration in the URL.

The playground stays untouched: `App.jsx` and its tests do not change. A new root component adds a top navigation bar and keeps both sections mounted, showing one at a time, so a conversation in progress survives a trip to the studio. The studio is lazy-loaded, and each visualization is loaded on demand, so the playground's initial download barely grows.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), JSX; Node.js 22.9+ for tooling (same as the existing client)

**Primary Dependencies**: React 18.3 (existing), Vite 8 (existing); one new runtime dependency: `d3-delaunay` 6.x for Voronoi/Delaunay (see research R7). Everything else (PRNG, routing, compression, solvers, simulations) is written in-house or uses browser built-ins.

**Storage**: Browser `localStorage` for saved visualizations and studio preferences; URL for share links; downloaded files for export (PNG image, `.vizstudio.json` settings)

**Testing**: Vitest 5 + jsdom + Testing Library (existing). Pure algorithm kernels are unit-tested without a canvas; studio UI tested with a stub 2D context; Workers bypassed in tests through an in-thread runner.

**Target Platform**: Current Chrome, Edge, Firefox, Safari on desktop and mobile; served as static files by the existing nginx config (its `try_files … /index.html` fallback already supports the `/studio` paths)

**Project Type**: Web application, frontend only. No server changes.

**Performance Goals**: default-settings first picture < 2 s (SC-001); static redraw < 0.5 s after a knob change (SC-002); animations ≥ 30 fps at defaults (SC-003); no main-thread task > 200 ms at maximum settings (SC-004)

**Constraints**: works offline from the server (FR-003); no change to playground behavior or tests (FR-001); keyboard-accessible controls (FR-025); reduced-motion aware (FR-027); share links under ~2,000 characters for typical configurations

**Scale/Scope**: 23 visualization modules, ~10 shared studio components, 1 new dependency; roughly 5–7k lines of new client code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template, so it defines no principles or gates. The plan follows the conventions the repo already uses instead:

| Repo convention | How this plan follows it | Status |
|---|---|---|
| Keep the API key on the server; the browser never calls Claude directly | The studio makes no network calls at all | Pass |
| One small file per unit (`server/src/mcp/tools/` has one file per tool) | One folder per visualization under `studio/visualizations/` | Pass |
| Tests run without external services (`npm test` uses fakes) | Kernels are pure; canvas and Worker are stubbed | Pass |
| Few dependencies (client has only React at runtime) | Adds one small, widely used dependency, justified in research R7 | Pass (justified) |

**Post-design re-check**: Passes. The design adds no server endpoints, no new services, and keeps the playground's files untouched apart from `main.jsx` (which mounts the new root).

## Project Structure

### Documentation (this feature)

```text
specs/003-visualization-studio/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── visualization-module.md   # What every visualization module exports
│   └── persistence-formats.md    # Share link, saved-visualization storage, export file
└── tasks.md             # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
web-client/
├── index.html
├── package.json                    # + d3-delaunay
└── src/
    ├── main.jsx                    # now renders <Root/> instead of <App/>
    ├── Root.jsx                    # NEW: top nav, path routing, keeps both sections mounted
    ├── App.jsx                     # UNCHANGED playground
    ├── components/ hooks/ api.js   # UNCHANGED playground code
    ├── styles.css                  # + nav styles only
    ├── studio/
    │   ├── StudioPage.jsx          # lazy entry: catalog ↔ viewer, reads route
    │   ├── studio.css
    │   ├── catalog.js              # metadata for all 23 entries + lazy import() per module
    │   ├── components/
    │   │   ├── CatalogGrid.jsx     # search, category filter, thumbnails
    │   │   ├── Viewer.jsx          # canvas host, module lifecycle, resize, visibility
    │   │   ├── KnobPanel.jsx       # renders knob definitions → inputs
    │   │   ├── knobs/              # RangeKnob, ChoiceKnob, ToggleKnob, TextKnob, PaletteKnob, PointKnob
    │   │   ├── PlaybackBar.jsx     # play/pause/step/speed/reset
    │   │   ├── PresetMenu.jsx
    │   │   ├── HowItWorks.jsx
    │   │   ├── MyVisualizations.jsx
    │   │   ├── SaveDialog.jsx
    │   │   └── ShareMenu.jsx       # copy link, download PNG, export/import JSON
    │   ├── core/
    │   │   ├── knobs.js            # validate/clamp configs against knob definitions
    │   │   ├── rng.js              # seeded PRNG (mulberry32) + seed helpers
    │   │   ├── palettes.js         # named palettes incl. color-blind-safe ones
    │   │   ├── loop.js             # rAF loop, fixed timestep, speed, pause on hidden tab
    │   │   ├── workerPool.js       # run a kernel in a Worker, in-thread fallback for tests
    │   │   ├── progressive.js      # chunked rendering with progress + cancellation
    │   │   ├── shareLink.js        # encode/decode config ↔ URL (CompressionStream)
    │   │   ├── storage.js          # saved visualizations in localStorage
    │   │   ├── exportFile.js       # .vizstudio.json import/export, PNG download
    │   │   └── reducedMotion.js
    │   ├── workers/
    │   │   └── kernel.worker.js    # generic worker: imports a kernel by name, runs it
    │   └── visualizations/
    │       ├── collatz/            # index.js (module) + kernel.js (pure math)
    │       ├── ulam/  recaman/  timesTable/  pascalMod/
    │       ├── mandelbrot/  julia/  chaosGame/  lsystem/  barnsley/
    │       ├── life/  elementaryCA/  grayScott/  boids/  langton/  dla/
    │       ├── lorenz/  doublePendulum/  voronoi/  fourier/  phyllotaxis/
    │       └── sorting/  maze/
    └── __tests__/
        ├── (existing playground tests, unchanged)
        └── studio/
            ├── kernels/            # one test file per kernel (math correctness)
            ├── core/               # knobs, rng, shareLink, storage, exportFile
            ├── modules.contract.test.js   # every catalog module satisfies the module contract
            ├── navigation.test.jsx        # playground ↔ studio, conversation survives
            └── studio.test.jsx            # catalog, knobs, presets, save/open, keyboard
```

**Structure Decision**: Everything lives in the existing `web-client` project under a new `src/studio/` folder. The playground's files stay where they are; only `main.jsx` changes, to render `Root.jsx`. Each visualization is a folder with a pure `kernel.js` (tested directly) and an `index.js` that implements the module contract in [contracts/visualization-module.md](contracts/visualization-module.md).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New runtime dependency `d3-delaunay` | Robust Delaunay triangulation and Voronoi cells for up to a few thousand points, with Lloyd relaxation | A hand-written Bowyer–Watson is easy to get subtly wrong on degenerate input (collinear and duplicate points from user clicks) and is slower |
| Web Workers | SC-004 (no freeze at maximum settings) for Mandelbrot, Gray–Scott, DLA | Chunking on the main thread alone can't keep Gray–Scott at 30 fps on large grids while the UI stays responsive |
