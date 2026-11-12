# Implementation Plan: Studio as the Home Page, Animated Sweeps Everywhere, and a Way Back from My Visualizations

**Branch**: `004-studio-home-sweep` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-studio-home-sweep/spec.md`

## Summary

The site opens on the Visualization Studio:
- `/` is replaced with `/studio`.
- The section switcher is removed.
- The Playground becomes a lazy chunk reachable only at the unlinked `/playground`. Its code and tests are kept.

"My visualizations" gets a "← Catalog" back link like the viewer's.

Every visualization gets an "Animated sweep" preset through one shared mechanism:
- Modules declare which settings to sweep.
- The shell adds two ordinary knobs (`sweep`, `sweepSpeed`) and the preset, so sweeps persist through share, save and export with no format change.
- A driver in the Viewer moves the swept values each frame. It uses smooth cosine, wrap, log or step mappings, waits for heavy renders to finish, and for visualizations that finish a run, waits for the run to end before starting the next.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules) and JSX; Node.js 22.9+ for tooling (unchanged)

**Primary Dependencies**: React 18.3 and Vite 8 (existing). No new dependencies.

**Storage**: unchanged. Sweep state is ordinary knob values in the existing share-link, `localStorage` and export formats, with no version bump (research R3).

**Testing**: Vitest + jsdom + Testing Library (existing). New pure unit tests for the sweep driver with injected time; extended module contract tests; route and navigation UI tests.

**Target Platform**: Current desktop and mobile browsers. Static hosting through the existing nginx `try_files … /index.html` fallback, which already serves `/playground`, so there is no server or deploy change.

**Project Type**: Web application, frontend only (`web-client/`)

**Performance Goals**:
- Sweeps change the picture visibly at least every 5 s with no blank frames (SC-004).
- Pause takes effect within 250 ms (SC-005).
- Heavy modules (Mandelbrot, Julia, DLA, chaos game, Barnsley) apply the next value only after the current picture is finished.

**Constraints**:
- Studio pages must not load the Playground (FR-006).
- Old links and saved files are unchanged (FR-004, FR-016).
- Times-table's sweep keeps its current look (FR-017).
- Reduced-motion, hidden-tab and play/pause rules apply to sweeps (FR-014).

**Scale/Scope**: 1 new core module (`core/sweep.js`, about 200 lines), changes to `Root.jsx`, `StudioPage.jsx`, `Viewer.jsx`, `knobs.js`, and a `sweep` declaration (about 5–15 lines) in 22 modules, plus `isDone()` in 4. About 1,000–1,500 changed lines including tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template: it defines no principles, gates or constraints, so there is nothing to violate.

The project conventions from 003 still apply and are followed:
- Tests accompany each change, including the module contract tests.
- No new dependencies.
- The studio works without the server.
- The Playground's behaviour and tests are unchanged.

**Result**: PASS (pre-research). **Re-check after design**: PASS. The design adds no dependencies, no format versions and no server changes.

## Project Structure

### Documentation (this feature)

```text
specs/004-studio-home-sweep/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R9
├── data-model.md        # Phase 1: SweepDeclaration, SweepTarget, sweep knobs, driver state, routes
├── quickstart.md        # Phase 1: automated and manual validation
├── contracts/
│   ├── sweep.md         # module/instance additions and the shell's duties
│   └── routes.md        # paths, chrome, back link, loading rules
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web-client/src/
├── Root.jsx                          # routes: / → /studio, /playground (lazy App), no topnav
├── App.jsx                           # Playground — unchanged
├── styles.css                        # drop .topnav rules
└── studio/
    ├── StudioPage.jsx                # back link toolbar for view=mine
    ├── core/
    │   ├── sweep.js                  # NEW: withSweep(), mappings, createSweepDriver()
    │   └── knobs.js                  # applyPreset returns preset.view
    ├── components/
    │   └── Viewer.jsx                # loop for sweepable modules, driver tick, playback bar, recordable
    └── visualizations/<22 modules>/index.js   # `sweep` declarations; isDone() in sorting, maze, langton, elementaryCA

web-client/src/__tests__/
├── studio/core/sweep.test.js         # NEW: mappings, inverse, gating, run/hold, pause
├── studio/modules.contract.test.js   # sweep declarations + 200-tick runtime check
├── studio/navigation.test.jsx        # routes, no Playground link, back link
└── studio/studio.test.jsx            # sweep preset UI, share round-trip, old payload
```

**Structure Decision**: The existing single frontend project, `web-client/`. All new logic goes into one new studio core file. Module changes are declarative, apart from the four `isDone()` methods.

## Complexity Tracking

No constitution violations to justify.
