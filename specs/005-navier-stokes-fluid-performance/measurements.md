# Measurements: Fluid Simulation, Performance Layer, Leaner Interface

Rules (research R10, FR-026): a figure that was not taken is written **"not measured"**, never estimated. Baseline rows are taken before any behavior change.

## Code baseline (T001, 2026-11-24, before any change)

| Item | Value |
|---|---|
| `npx vitest run` in `web-client/` | 51 test files, **675 tests passed** |
| `npm run build` in `web-client/` | OK; `dist/` 828 KB, 31 assets; `StudioPage` chunk 60.88 kB (20.92 kB gzip); main `index` chunk 144.37 kB (47.32 kB gzip) |

Every later checkpoint must show at least this test count (SC-012).

## Success-criteria summary (T118, 2026-11-25)

Device unless stated: the development machine (Apple M2, macOS, Chrome 159 headless on the real GPU; "software" means Chrome's software renderer, a stand-in for a very weak GPU). **The reference phone was never available, so every phone target is "not measured".** A figure not taken is written as such.

| SC | Target | Result | Where |
|---|---|---|---|
| SC-001 | Catalog to moving fluid in under 5 s | **Not measured** as a timed trial. The path (filter, search, open the card) works in the real-browser checks 1 to 3 and the picture moves on its first frame. | quickstart checks, US2/US3 |
| SC-002 | A first-time visitor can drag and see a response within 10 s | **Not measured** (no timed trial with a new visitor was run). | |
| SC-003 | Fluid at least 50 fps on the laptop; 30 fps at Low on the phone | **Laptop: met, 60.0 fps** (vsync-bound; 3.1 ms of work per frame at Medium). **Phone: not measured.** | Fluid section below |
| SC-004 | Fluid reacts within 100 ms of the pointer | **Not measured** with an input-to-photon rig. The splash is drawn on the next frame, at most 16.7 ms later at 60 Hz. | |
| SC-005 | 3x longer motion and 3x longer dye at the lowest dissipation than at the highest | **Met in the automated check** (`fluid.gpu.test.js`: the lowest is at least 3 times the highest for both). The exact ratios were not recorded. | tests |
| SC-006 | Stable at every extreme for a minute | **Met in the automated check**: every setting at its minimum, and at its maximum, for 3,600 steps (one minute at 60 a second) with strokes and Bursts, fields finite and bounded and not blank; each single setting at either extreme is covered by the same test file. Wall-clock time of a minute on a real screen was not run. | tests |
| SC-007 | 30 open/leave cycles; pace within 10% afterwards | **Cycles: met** for the fluid and all 12 ported modules (every one passes 30 in a row and then draws). **Pace within 10%: not measured.** | tests |
| SC-008 | Low at least 30% cheaper than Medium wherever a Quality choice exists | **Mixed.** Fluid: **8% on the real GPU (not met)**, 38% under software rendering (met). Julia 63% (met) and Barnsley fern 50% (met) on the real GPU; Mandelbrot 0% on the real GPU but 56% on the weak stand-in; Chaos game 23% on the real GPU and 1% on the stand-in (not met). Diffusion-limited aggregation's lever was added after the measurement and **not re-measured**. | gate table below |
| SC-009 | Dragging a slider costs at most 10% of the frame rate | **Met: 1.0% (fluid), 1.1% (Game of Life), 1.5% (Boids)**, vsync-bound at 60 fps. Not repeated under load or on the phone. | Interface redraws below |
| SC-010 | On the phone, every animated visualization reaches 30 fps within 3 s on Auto, or says why | **Not measured** (no phone). Only the fluid has Auto; the 12 ported ones have no Quality choice, because none passed the gate. | |
| SC-011 | Unchanged default pictures, unchanged old links, the 12 animated ones meeting FR-035 | **Met in the automated checks**: the 11 existing static pictures hash-identical at Medium (`baseline.gpu.test.js`), old links decode to the default Quality (`quality.catalog.test.js`), and all 12 animated ones pass their exactness or similarity tests. "At Auto on a device that keeps up" does not arise (no ported one has Auto). | tests |
| SC-012 | Redraw counts clean; every earlier test still passes | **Met**: 959 jsdom tests pass (baseline 675), and the redraw-count tests pass. Re-checked on the last run; three timing-dependent tests failed under heavy machine load on earlier runs and pass alone. | tests |
| SC-013 | Paused, finished or hidden uses under 1% of a core | **Frame requests: 0 in 2 s** for a finished sort and for a paused Game of Life (a running one makes 60 a second). **CPU use was not profiled**, so the 1% figure is not measured. | idle section below |
| SC-014 | Each of the 12 at Medium at least as smooth as today, on laptop and phone | **Not measured** with the bench page (T094 not run). On the laptop every one holds 60 fps in the browser checks, and so did the old paths. **Phone: not measured.** | |
| SC-015 | Life, Reaction–diffusion, Boids, Elementary CA at 30 fps or better at 2x the default size or count | **Boids: measured, 60 fps at 2,000 boids (6.7 times the default 300), on both the GPU and processor paths.** The other three: **not measured.** | |
| SC-016 | Six rule-based ones identical to today's, 5 seeds, 1,000+ steps | **Met in the automated checks**: Life 1,000 steps x 5 seeds x every preset; Elementary CA a full screen and 150 rows more x 5 seeds x every preset; Langton 3,000 steps x 5 seeds x every preset; Sorting every algorithm to the end x 5 seeds; Maze every generator and solver to the end x 5 seeds; Recamán 2 to 2,000 terms. | tests |
| SC-017 | The interface audit covers every component, and a reason for each left alone | **Written** (`render-audit.md`); the claim of full coverage is the file's own and was not independently checked. | |


## Baseline performance (T009, taken 2026-11-24 before any behavior change)

**What was measured, and what was not.**

| Reference device (spec Assumptions) | Status |
|---|---|
| Reference laptop | **Measured on the development machine**: an Apple M2 Mac, Playwright Chromium 159 in new headless mode on the real GPU (`ANGLE Metal Renderer: Apple M2`). It is a fast integrated-graphics laptop, faster than the "mid-range" laptop the spec describes. |
| Reference phone | **Not measured.** No phone was available. The second table is a stand-in only: the same machine with Chrome's CPU throttle at 6×. It is **not** a phone and must not be read as one. In practice the throttle changed work per frame by about 1.2× for most modules, so it is weak evidence. |

**How to read the columns.** "Frame ms" is the gap between animation frames (what a visitor sees); "Work ms/frame" is the time spent in `step()` + `render()` (plus a GPU sync for GPU instances), which is the figure the 20% quality gate (FR-020) compares; "Time to picture" is for static modules; "Longest single call" is the 50 ms rule (FR-025).

**Findings from the baseline**

1. On this machine all 12 animated modules are **vsync-bound at 60 fps** and use between **0.08 and 1.92 ms of work per frame**. Frame rate cannot tell a cheap module from an expensive one here, so the gate and SC-014 must use work per frame. It also means this machine **cannot show the benefit** this feature is for (SC-003, SC-010, SC-014, SC-015): those need a weaker device.
2. Longest single call is at most 24.4 ms on the unthrottled run (L-system), so FR-025 holds today. Under the 6× throttle two calls exceeded 50 ms: **L-system 71.3 ms** and **Fourier epicycles 69.4 ms**. They are the first to watch when Quality levels are added.
3. Static modules draw in 3 to 106 ms, except diffusion-limited aggregation at about 1.3 s. That one is already progressive and is the best candidate for a Quality lever.
4. Pre-change pixel hashes for all 23 visualizations are recorded in `web-client/src/__tests__/gpu/baseline.hashes.json` and checked by `baseline.gpu.test.js`. This is the automated form of "baseline screenshots" and guards SC-011.

### Unthrottled (development machine)

| Visualization | Level | Path | Device | Frame ms (mean) | Frame ms (p95) | fps | Work ms/frame (mean) | Work ms/frame (p95) | Time to picture ms | Longest single call ms | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| collatz-coral | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 73 | 9.8 | baseline |
| ulam-spiral | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 4 | 3.5 | baseline |
| recaman | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.8 | 60.0 | 0.15 | 0.30 | not measured | 0.4 | baseline |
| times-table | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 0.40 | 0.80 | not measured | 1.6 | baseline |
| pascal-mod | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 3 | 3.3 | baseline |
| mandelbrot | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 106 | 5.7 | baseline |
| julia | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 52 | 0.2 | baseline |
| chaos-game | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 26 | 8.2 | baseline |
| l-system | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 25 | 24.4 | baseline |
| barnsley-fern | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 43 | 8.8 | baseline |
| game-of-life | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 1.16 | 4.30 | not measured | 4.6 | baseline |
| elementary-ca | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 1.92 | 3.20 | not measured | 6.5 | baseline |
| gray-scott | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 0.08 | 0.20 | not measured | 1.5 | baseline |
| boids | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.8 | 60.0 | 0.97 | 1.80 | not measured | 8.6 | baseline |
| langtons-ant | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 0.58 | 1.00 | not measured | 2.2 | baseline |
| dla | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 1343 | 0.4 | baseline |
| lorenz | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 0.26 | 0.40 | not measured | 0.7 | baseline |
| double-pendulum | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 1.01 | 2.40 | not measured | 2.5 | baseline |
| voronoi | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 4 | 4.2 | baseline |
| fourier-epicycles | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 0.27 | 0.60 | not measured | 11.9 | baseline |
| phyllotaxis | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | not measured | not measured | not measured | not measured | not measured | 3 | 2.8 | baseline |
| sorting | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.8 | 60.0 | 0.32 | 0.50 | not measured | 1.0 | baseline |
| maze | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.8 | 60.0 | 0.27 | 0.60 | not measured | 1.8 | baseline |

### 6× CPU throttle (phone stand-in, not a phone)

| Visualization | Level | Path | Device | Frame ms (mean) | Frame ms (p95) | fps | Work ms/frame (mean) | Work ms/frame (p95) | Time to picture ms | Longest single call ms | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| collatz-coral | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 297 | 17.3 | baseline |
| ulam-spiral | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 18 | 11.3 | baseline |
| recaman | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.8 | 60.0 | 0.15 | 0.60 | not measured | 1.8 | baseline |
| times-table | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 0.39 | 1.20 | not measured | 3.4 | baseline |
| pascal-mod | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 14 | 8.9 | baseline |
| mandelbrot | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 164 | 13.1 | baseline |
| julia | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 87 | 0.8 | baseline |
| chaos-game | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 180 | 9.6 | baseline |
| l-system | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 75 | 71.3 ⚠ over 50 ms | baseline |
| barnsley-fern | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 168 | 10.8 | baseline |
| game-of-life | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 1.42 | 4.70 | not measured | 8.1 | baseline |
| elementary-ca | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 3.77 | 4.60 | not measured | 13.2 | baseline |
| gray-scott | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 0.28 | 1.10 | not measured | 5.8 | baseline |
| boids | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.8 | 60.0 | 1.78 | 2.70 | not measured | 8.0 | baseline |
| langtons-ant | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 1.08 | 1.80 | not measured | 8.8 | baseline |
| dla | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 1372 | 7.9 | baseline |
| lorenz | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 0.19 | 0.70 | not measured | 2.1 | baseline |
| double-pendulum | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.8 | 16.8 | 59.5 | 1.86 | 3.60 | not measured | 6.6 | baseline |
| voronoi | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 23 | 23.0 | baseline |
| fourier-epicycles | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.7 | 60.0 | 0.27 | 0.90 | not measured | 69.4 ⚠ over 50 ms | baseline |
| phyllotaxis | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | not measured | not measured | not measured | not measured | not measured | 19 | 19.4 | baseline |
| sorting | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.8 | 60.0 | 0.65 | 1.80 | not measured | 5.8 | baseline |
| maze | default | processor | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, 6x CPU throttle (phone proxy, not a real phone) | 16.7 | 16.8 | 60.0 | 0.83 | 2.00 | not measured | 18.1 | baseline |

## Fluid simulation (US3, 2026-11-24)

**SC-003, SC-004 and the Quality levels.** Work per frame includes a GPU sync (`finish()`), so it is the real cost of the frame and not just how fast commands were queued.

### Real GPU (development machine)

| Visualization | Level | Path | Device | Frame ms (mean) | Frame ms (p95) | fps | Work ms/frame (mean) | Work ms/frame (p95) | Time to picture ms | Longest single call ms | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fluid-simulation | low | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 2.95 | 4.20 | not measured | 28.8 | US3 |
| fluid-simulation | medium | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.7 | 60.0 | 3.09 | 4.20 | not measured | 15.4 | US3 |
| fluid-simulation | high | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0 | 16.7 | 16.8 | 60.0 | 3.54 | 4.90 | not measured | 18.2 | US3 |

### Software rendering (a stand-in for a very weak GPU, not a real one)

| Visualization | Level | Path | Device | Frame ms (mean) | Frame ms (p95) | fps | Work ms/frame (mean) | Work ms/frame (p95) | Time to picture ms | Longest single call ms | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fluid-simulation | low | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, SOFTWARE rendering (stand-in for a very weak GPU, not a real one) | 16.7 | 16.8 | 60.0 | 8.68 | 13.60 | not measured | 665.1 ⚠ over 50 ms | US3 |
| fluid-simulation | medium | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, SOFTWARE rendering (stand-in for a very weak GPU, not a real one) | 17.4 | 16.8 | 57.6 | 15.10 | 19.70 | not measured | 358.5 ⚠ over 50 ms | US3 |
| fluid-simulation | high | gpu | dev machine (Apple M2, macOS), headless Chrome 159.0.0.0, SOFTWARE rendering (stand-in for a very weak GPU, not a real one) | 40.7 | 83.3 | 24.6 | 40.54 | 80.80 | not measured | 385.4 ⚠ over 50 ms | US3 |

**Findings**

1. **SC-003 (50 fps or more at Auto on the reference laptop): met on the development machine** (60.0 fps, vsync-bound, 3.1 ms of work per frame at Medium). **The reference phone was not measured**, so the 30 fps at Low target on a phone is *not measured*.
2. **The Quality levels do their job where it matters.** On the fast GPU, Low is only about 17% cheaper than High (2.95 vs 3.54 ms), because the fixed cost of about 60 draw calls dominates. Under software rendering, which makes pixels expensive, Low costs 8.7 ms, Medium 15.1 ms and High 40.5 ms: **Low is 79% cheaper than High, and High falls to 24.6 fps while Low holds 60.** That is the case Auto exists for.
3. **Risk against FR-025 (no call over 50 ms): holds on the M2 (longest 28.8 ms), not shown to hold on weak devices.** Under software rendering the longest call is 360 to 665 ms; it is the first call, where all shaders are compiled and linked synchronously. A slow mobile GPU compiles shaders more slowly than the M2 and could exceed 50 ms. A fix would be to compile one program per frame after `create()` (or use `KHR_parallel_shader_compile`), at the cost of a short delay before the fluid starts. Not done; recorded as a follow-up.
4. **SC-004 (the fluid reacts within 100 ms of the pointer):** the splash is queued by the pointer event and drawn on the next animation frame (at most 16.7 ms later at 60 Hz). Not measured with an input-to-photon rig.

**Checks run in a real browser on the GPU (Playwright, headless Chromium 159 on the Apple M2):** quickstart checks 1–3, 5–9, 12–14, 16–19 and 25 all pass with no page errors. Not run: check 4 (real multi-finger touch), check 15 (Auto stepping down under `?load=40`, which belongs to US4), and the SC-002 timed trial with a new visitor.

## Quality levels across the catalog: the 20% gate (US4, 2026-11-24)

**Protocol (after a first, noisy attempt).** The bench page was changed to throw away a warm-up run and report the median of 5 runs (static) or 3 runs (animated) per level, because the first level measured was being charged for compiling code and starting workers. Each of the 24 visualizations was given a candidate descriptor (`scale` 0.5 / 1 / 1) and measured at Low, Medium and High on two setups:

- **Real GPU**: the development machine (Apple M2), headless Chrome 159.
- **Weak stand-in**: software rendering plus a 4× CPU throttle. **Not a real weak device**; it is the weakest thing available here.

**The rule applied** is the spec's (FR-020: Low at least 20% cheaper than High), on either setup, with one addition: **a noise floor of 1 ms of work per frame, or 5 ms to a finished picture**. Without it, "Fourier epicycles: 22% cheaper" would have kept a Quality control that saves 0.06 ms per frame, which is exactly the "control that does nothing" Story 4 scenario 2 forbids. The fluid keeps its Quality choice regardless, because FR-008 names it.

| Visualization | Real GPU: Low / Medium / High → Low is cheaper by | Weak stand-in | Decision |
|---|---|---|---|
| collatz-coral | 64 / 34 / 46 ms to picture → -39% | 199 / 186 / 185 ms to picture → -8% | drop |
| ulam-spiral | 1 / 1 / 1 ms to picture → 0% | 4 / 5 / 4 ms to picture → 0% | drop |
| recaman | 0.09 / 0.09 / 0.07 ms/frame → -29% | 0.07 / 0.07 / 0.07 ms/frame → 0% | drop |
| times-table | 0.18 / 0.15 / 0.18 ms/frame → 0% | 0.31 / 0.24 / 0.25 ms/frame → -24% | drop |
| pascal-mod | 3 / 1 / 1 ms to picture → -200% | 5 / 5 / 5 ms to picture → 0% | drop |
| mandelbrot | 18 / 18 / 18 ms to picture → 0% | 19 / 43 / 44 ms to picture → 57% | KEEP (scale) |
| julia | 18 / 49 / 46 ms to picture → 61% | 18 / 64 / 60 ms to picture → 70% | KEEP (scale) |
| chaos-game | 17 / 22 / 30 ms to picture → 43% | 66 / 67 / 67 ms to picture → 1% | KEEP (scale) |
| l-system | 2 / 1 / 1 ms to picture → -100% | 5 / 5 / 5 ms to picture → 0% | drop |
| barnsley-fern | 19 / 38 / 32 ms to picture → 41% | 87 / 100 / 102 ms to picture → 15% | KEEP (scale) |
| game-of-life | 0.41 / 0.34 / 0.32 ms/frame → -28% | 0.88 / 0.9 / 1.12 ms/frame → 21% | drop — +21% on the stand-in but −28% on the real GPU: contradictory, noise |
| elementary-ca | 0.69 / 0.8 / 0.69 ms/frame → 0% | 2.69 / 2.49 / 2.44 ms/frame → -10% | drop |
| gray-scott | 0.07 / 0.04 / 0.03 ms/frame → -133% | 0.09 / 0.05 / 0.06 ms/frame → -50% | drop |
| boids | 1.04 / 1.14 / 1.15 ms/frame → 10% | 1 / 1 / 1 ms/frame → 0% | drop |
| langtons-ant | 0.83 / 0.83 / 0.83 ms/frame → 0% | 0.56 / 0.54 / 0.51 ms/frame → -10% | drop |
| dla | 2151 / 2021 / 2035 ms to picture → -6% | 2274 / 2174 / 2171 ms to picture → -5% | KEEP (particles lever, added after this run) |
| fluid-simulation | 3.63 / 3.96 / 4.03 ms/frame → 10% | 8.77 / 14.25 / 39.28 ms/frame → 78% | KEEP (required by FR-008) |
| lorenz | 0.18 / 0.18 / 0.18 ms/frame → 0% | 0.08 / 0.08 / 0.08 ms/frame → 0% | drop |
| double-pendulum | 0.82 / 0.65 / 0.73 ms/frame → -12% | 0.71 / 0.7 / 0.72 ms/frame → 1% | drop |
| voronoi | 1 / 0 / 0 ms to picture → 0% | 3 / 3 / 2 ms to picture → -50% | drop |
| fourier-epicycles | 0.21 / 0.25 / 0.27 ms/frame → 22% | 0.12 / 0.15 / 0.13 ms/frame → 8% | drop — 22% of 0.27 ms: a 0.06 ms saving is noise, below the floor |
| phyllotaxis | 1 / 1 / 1 ms to picture → 0% | 3 / 4 / 3 ms to picture → 0% | drop |
| sorting | 0.22 / 0.25 / 0.2 ms/frame → -10% | 0.15 / 0.13 / 0.12 ms/frame → -25% | drop |
| maze | 0.33 / 0.23 / 0.24 ms/frame → -38% | 0.21 / 0.22 / 0.22 ms/frame → 5% | drop |

**Result: 5 of the 23 existing visualizations keep a Quality choice**: Mandelbrot, Julia set, Chaos game and Barnsley fern (resolution scale), and Diffusion-limited aggregation (a particle-count lever: its cost is the number of walkers, which a resolution scale cannot change). The other 18 show no control. **The fluid simulation also keeps it (by requirement).** Because the Auto level is offered only to animated modules that keep a descriptor, **Auto exists today only on the fluid simulation**; no existing animated visualization qualified. That is the outcome FR-020 intends ("no control that does nothing"), but it means Story 4's "Auto for the 12 animated ones" is not delivered by this step for those that failed the gate, and the GPU ports (US5) are where they could earn a lever.

**Caveat.** On this fast machine almost every visualization draws in a few milliseconds, so most differences are below the measurement noise. A descriptor that fails the gate here might pass on a slow phone. The reference phone was not measured; re-running the bench there is the way to revisit the 18 that were dropped.

### Finished and paused runs (FR-024, SC-013), real browser

| Check | Result |
|---|---|
| A finished sort asks for animation frames | **0 in 2 s** (a running sort: 61 per second) |
| A paused Game of Life asks for animation frames | **0 in 2 s** |
| A setting change, a pointer event, an action, Restart or switching a sweep on wakes an idle loop | woke (10 frames in 0.6 s after a setting change, before the short run finished again); covered by unit tests |
| A loop driving a sweep never idles | covered by a Viewer test (a sweep needs the frames to start its next run) |

SC-013 asks for under 1% of one core on the reference laptop; "0 animation frames" is far under that, but CPU use was not measured with a profiler.

## Interface redraws (US6, 2026-11-24)

**SC-009: dragging a slider during an animation costs at most 10% of the frame rate.** Measured in the real browser on the real GPU, dragging a range slider back and forth for 3 s with the animation running:

| Visualization | Slider | At rest | While dragging | Drop |
|---|---|---|---|---|
| Fluid simulation | Curl | 60.1 fps | 59.4 fps | 1.0% |
| Game of Life | Grid width | 60.2 fps | 59.4 fps | 1.1% |
| Boids | Boids | 60.2 fps | 59.3 fps | 1.5% |

All pass (limit 10%). The machine is vsync-bound at 60 fps, so this is a genuine result but not a stress test; it was not repeated with `?load=` or on the reference phone.

**Redraw counts (SC-012, FR-031).** `src/__tests__/studio/render/*.render.test.jsx` count how often each part's function actually runs. They pass, and the knob tests fail when the original bug (an inline `onChange` that changes identity on every render) is put back. They cannot detect `Viewer`'s own function re-running, only that no child redraws as a result (see `render-audit.md`, "Known limits").
