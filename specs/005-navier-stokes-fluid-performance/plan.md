# Implementation Plan: Navier–Stokes Fluid Simulation, a Shared Performance Layer, and a Leaner Interface

**Branch**: `005-navier-stokes-fluid-performance` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-navier-stokes-fluid-performance/spec.md`

## Summary

Three pieces of work on the Visualization Studio (`web-client/`), built on a shared base:

1. **A new "Fluid simulation" visualization** (Stories 1 to 3). A stable-fluids solver written as WebGL fragment shaders: splat, curl, vorticity confinement, divergence, Jacobi pressure solve, gradient subtract, and semi-Lagrangian advection of velocity and dye, with the two dissipation rates that make motion die down and ink fade. It joins "Simulation and emergence" and uses the reference page's seven settings and starting values, plus Quality, palette and seed. It needs a few additions to the module contract: Burst and Clear buttons, independent multi-touch, an on-canvas message, and a way to restart on a fresh canvas.
2. **A performance layer for the other visualizations** (Stories 4 and 5).
   - *Quality*: one `quality` knob, added to every module that declares what Low, Medium and High mean. It is an ordinary knob value, so share links, saved items and exports need no format change. It shows only where measurement says it matters (Low at least 20% cheaper than High). Animated modules get an Auto level driven by a small, pure, testable governor that never goes above Medium.
   - *GPU*: each of the 12 existing animated visualizations gains a `gpu.js` next to its unchanged processor path, chosen at creation time by `openGpu`. The six rule-based ones must match their existing kernels state for state; the other six must look the same. The step stays on the CPU where the algorithm is sequential, with the reason recorded per module.
3. **A leaner interface** (Story 6). The largest redraw source is found and fixed first: per-frame stats are written to `Viewer` state, so the whole viewer and every knob redraw about 60 times a second. The fix order is: a stats store, stable handlers, memoized derived values, then `React.memo` where it can skip. The result is recorded in a per-component audit and proved with redraw-count tests.

Testing real shaders needs a real WebGL implementation, so a second Vitest project runs in headless Chromium on software rendering. The jsdom suite and `npm test` stay as they are.

Decisions and evidence: [research.md](./research.md).

## Technical Context

**Language/Version**: JavaScript (ES2022 modules) and JSX; GLSL ES 1.00 shaders as template strings; Node.js 22 for tooling (unchanged)

**Primary Dependencies**: React 18.3 and Vite 8 (existing). **No new runtime dependencies** and no graphics library. New dev-only: `@vitest/browser-playwright` 5.0.5 and `playwright`.

**Storage**: unchanged. `quality` is an ordinary knob value in the existing share-link, `localStorage` and export formats, with no version bump (data-model.md). The fluid's dye and motion are not stored.

**Testing**: Vitest 5 + jsdom + Testing Library (existing `npm test`), plus the new `npm run test:gpu` (headless Chromium, software WebGL2; research R7) and redraw-count tests (`contracts/render-audit.md`). Existing tests are untouched and keep passing.

**Target Platform**: Current desktop and mobile browsers. WebGL2 preferred, WebGL1 as the "simpler path", and the processor path (12 modules) or a message (fluid) beyond that. Static hosting through the existing nginx fallback; no server or deploy change except one CI step.

**Project Type**: Web application, frontend only (`web-client/`)

**Performance Goals** (spec SC-003, SC-008, SC-009, SC-010, SC-013 to SC-015):
- Fluid: average 50 fps or more at Auto on the reference laptop; 30 fps or more at Low on the reference phone.
- Every animated visualization on Auto reaches 30 fps within 3 s on the reference phone, or says why not.
- Each moved visualization at Medium is at least as smooth as its baseline; Game of Life, Reaction–diffusion, Boids and Elementary CA run at 30 fps or more at twice their default size or count on High.
- Dragging a slider during an animation costs 10% of the frame rate or less; idle, paused and hidden use under 1% of a core.

**Constraints**:
- Existing pictures at Medium are unchanged: exactly for the 11 static modules; state for state for the six rule-based animated ones; at a glance for the other six (FR-021, FR-035).
- A canvas keeps its first context type, so the GPU or processor path is chosen before the first `getContext` (research R2).
- No `Math.random` in modules; no wall-clock in a simulation step.
- Old share links, saved items and exports open with the same settings (FR-021).
- No synchronous work over 50 ms at any quality level (FR-025).
- Every existing visualization keeps every control it has today (FR-033).

**Scale/Scope**: 1 new module (4 files); 1 GPU toolkit (about 6 files); 12 new `gpu.js` files and a small `index.js` change in each existing animated module; `quality` descriptors in up to 24 modules (kept only where measurement supports them); about 25 component files audited for redraws; 1 new dev page; 1 new Vitest project with about 20 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template (every principle is still a placeholder such as `[PRINCIPLE_1_NAME]`), so it defines no principles, gates or constraints and there is nothing to violate. The conventions of features 003 and 004 are followed:
- Tests accompany each change, including the module contract tests.
- The studio works without the server.
- The Playground's behaviour and tests are unchanged.
- Every dependency added is justified in Complexity Tracking.

**Result**: PASS (pre-research). **Re-check after design**: PASS. The design adds no runtime dependency, no stored-format version and no server change. It does add dev dependencies, two code paths in 12 modules and contract additions; each is listed below with the reason.

## Project Structure

### Documentation (this feature)

```text
specs/005-navier-stokes-fluid-performance/
├── plan.md                       # This file
├── research.md                   # Phase 0: decisions R1–R14, with the measured WebGL probe
├── data-model.md                 # Phase 1: fluid settings, state, splat, quality, governor, capabilities, records
├── quickstart.md                 # Phase 1: automated and manual validation, measuring
├── contracts/
│   ├── module-additions.md       # multiTouch, actions, quality, setQuality, isIdle, ctx.showMessage / requestRestart
│   ├── gpu-toolkit.md            # openGpu, Gpu object, context loss, shader dialect
│   ├── fluid-simulation.md       # the new module: export, step order, input, tests
│   ├── quality.md                # knob, descriptor, 20% gate, governor, loop changes
│   ├── render-audit.md           # audit format and redraw-count tests T1–T7
│   └── gpu-tests.md              # the browser test project and what each file proves
├── checklists/requirements.md    # from /speckit-specify
├── measurements.md               # written during implementation (FR-026)
├── render-audit.md               # written during implementation (FR-027, SC-017)
└── tasks.md                      # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/workflows/gpu-tests.yml               # NEW: pull requests + manual; proves the runner can do WebGL2 (task T005, T006)
.github/workflows/deploy-web-client.yml       # + install Chromium, run npm run test:gpu — added only once gpu-tests.yml is green (task T114)
web-client/
├── package.json                              # + dev deps; scripts test:gpu, test:all
├── vite.config.js                            # exclude *.gpu.test.js from the jsdom project; dev-only bench page
├── vitest.gpu.config.js                      # NEW: browser project
├── public/thumbs/fluid-simulation.webp       # NEW (made with /studio/__thumbnails)
└── src/
    ├── Root.jsx                              # + dev-only /studio/__bench route
    ├── App.jsx                               # useCallback / useMemo (Playground)
    ├── components/                           # memo: Header, CapabilityPanel, ExchangeList (+Exchange, InputBubble), ToolCallCard
    ├── studio/
    │   ├── catalog.js                        # + withQuality in e(); + fluid entry
    │   ├── StudioPage.jsx                    # memoized route and header
    │   ├── core/
    │   │   ├── quality.js                    # NEW: withQuality, levels, effective level
    │   │   ├── qualityGovernor.js            # NEW: Auto adaptation (pure, injected clock)
    │   │   ├── statsStore.js                 # NEW: per-frame stats outside React state
    │   │   ├── loop.js                       # + frame timestamp, isIdle / wake, dev-only ?load
    │   │   └── moduleContext.js              # + showMessage, clearMessage, requestRestart, gpuForced; stats to the store
    │   ├── components/
    │   │   ├── Viewer.jsx                    # stable handlers, stats isolated, actions bar, multiTouch, canvas key, governor, message overlay
    │   │   ├── StatsReadout.jsx              # NEW
    │   │   ├── ActionBar.jsx                 # NEW: module actions as buttons
    │   │   ├── CatalogCard.jsx               # NEW: extracted from CatalogGrid, memoized
    │   │   └── KnobPanel.jsx, knobs/*, PresetMenu, PlaybackBar, HowItWorks, ShareMenu, MyVisualizations   # memo / useMemo / useCallback
    │   ├── dev/BenchPage.jsx                 # NEW: frame-time and time-to-picture measurements
    │   └── visualizations/
    │       ├── _shared/gpu/                  # NEW: context.js, program.js, targets.js, draw.js, palette.js, index.js
    │       ├── fluid/                        # NEW: index.js, gpu.js, shaders.js, kernel.js
    │       └── life/ elementaryCA/ langton/ recaman/ sorting/ maze/ grayScott/ boids/ lorenz/ doublePendulum/ fourier/ timesTable/
    │                                         # each: + gpu.js (and shaders.js where large); index.js picks the path
    └── __tests__/
        ├── helpers/renderProbe.jsx           # NEW
        ├── studio/core/{quality,qualityGovernor,statsStore,loop}.test.js, gpuMode.test.js
        ├── studio/fluid/{kernel,module}.test.js
        ├── studio/render/*.test.jsx          # T1–T7
        ├── studio/modules.contract.test.js   # extended
        └── gpu/                              # NEW: *.gpu.test.js and gpuHarness.js (contracts/gpu-tests.md)
```

**Structure Decision**: Frontend-only web application. All work is inside `web-client/` plus one CI step. Shared GPU plumbing sits beside the existing `_shared/` helpers so it ships with the modules that import it. The processor path of each moved module is left where it is, so nothing is removed and a module's GPU path can ship later without affecting the others.

## Delivery Order

The order for `/speckit-tasks`. The first step must come before any other change, because the spec's baseline is "before any change".

| Step | Content | Stories | Notes |
|---|---|---|---|
| 0 | Bench page; baseline measurements and screenshots on the reference devices | all | Before any other code change (FR-026) |
| 1 | GPU test project; run the probe on the developer machine and in CI | all | Gate: decides the CI fallback (research R7) |
| 2 | Module-contract additions in the shell (actions, multiTouch, message, restart, idle, canvas key); GPU toolkit; `withQuality`, governor, loop timestamp | all | The base; each part has jsdom tests |
| 3 | Fluid simulation | 1, 2, 3 | The MVP. Ships without Steps 4 to 6 |
| 4 | `quality` descriptors, measurement and the 20% gate for all modules; Auto for the 13 animated | 4 | Needs Step 2 |
| 5 | GPU ports, one module at a time, each with its GPU test and measurement. Order by gain and risk: Game of Life, Reaction–diffusion, Boids, Elementary CA, Langton's ant, Lorenz, Double pendulum, Fourier, Times-table, Recamán, Sorting, Maze | 5 | Independent of each other; each can ship alone |
| 6 | Interface redraws: stats store, stable handlers, derived values, `memo`; audit; redraw-count tests | 6 | Touches `Viewer.jsx`, so do it after the Viewer changes in Step 2 and keep each port's `Viewer` edits out of it |
| 7 | Thumbnail for the fluid; final measurements; quickstart pass; CI | all | |

Steps 3, 5 and 6 are independent of one another once Step 2 is done.

## Complexity Tracking

Nothing violates a principle (there are none), but these additions carry cost and are listed so they are chosen deliberately:

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Dev dependencies `@vitest/browser-playwright` and `playwright` | SC-016 and FR-035 require automated proof that shaders match the existing kernels; that needs a real WebGL2 implementation | jsdom stubs cannot execute shaders; `headless-gl` is WebGL1 only and cannot test the float-target paths (research R7) |
| Two code paths in each of the 12 moved modules | FR-034: a device without graphics acceleration must lose nothing | A GPU-only module would stop working where WebGL is missing or lost |
| Contract additions (`actions`, `multiTouch`, `showMessage`, `requestRestart`, `isIdle`, `setQuality`) | Burst and Clear buttons, independent fingers, the unsupported message and restart, finished-run idling, live quality | Encoding these as knobs gives no buttons or touch handling; a module cannot restart its own canvas |
| A stats store and `StatsReadout` | The largest redraw source is per-frame stats in `Viewer` state (research R8) | `memo` on children does nothing while the parent redraws 60 times a second |
| Canvas `key` and restart in the Viewer | A canvas cannot change context type (research R2) | Reusing the canvas after a GPU failure leaves it unusable for 2D |
