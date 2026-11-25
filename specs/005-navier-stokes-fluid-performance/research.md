# Research: Navier–Stokes Fluid Simulation, Shared Performance Layer, Leaner Interface

The spec and its four clarifications leave nothing open. This file records the design decisions made while reading the current code (`web-client/src/studio/**`, `web-client/src/App.jsx` and its components, `vite.config.js`, `.github/workflows/`) and while checking what the test tools can do on this machine.

Two things were measured rather than assumed:

- **R7** records a probe of headless Chromium (build 151, via `playwright-core`). Result: WebGL2 works with software rendering and without any flag, `EXT_color_buffer_float` is present, and a 32-bit float render target round-trips exactly (0.1234567 in, 0.12345670163631439 out). It has not yet been run on GitHub's runner. That is the first task.
- **R8** lists the redraw sources found by reading `Viewer.jsx`, `KnobPanel.jsx`, `CatalogGrid.jsx` and `App.jsx`.

## R1 — Graphics API and shader dialect

**Decision**: WebGL2 where available, WebGL1 as the "simpler path" on older hardware. All shaders are written in GLSL ES 1.00 (`texture2D`, `varying`, no `#version` line), which both context types accept. No graphics library is added; a small shared toolkit (R2) wraps the few calls needed.

Capabilities are read once, at probe time, and every module states what it needs:

| Capability | WebGL2 | WebGL1 |
|---|---|---|
| 8-bit render target (cell grids, palettes) | core | core |
| Half-float render target (fluid) | `EXT_color_buffer_half_float` (or `EXT_color_buffer_float`) | `OES_texture_half_float` + `EXT_color_buffer_half_float` |
| Float32 render target (Reaction–diffusion) | `EXT_color_buffer_float` | `OES_texture_float` + `WEBGL_color_buffer_float` |
| Linear filtering of half floats | core | `OES_texture_half_float_linear`, else a manual 4-tap bilinear in the shader |

**Rationale**:
- The request names WebGL shaders. WebGL2 is available in all current browsers, and WebGL1 covers the "older hardware" case in the spec (FR-016, Story 3 scenario 3). The reference page makes the same choice (WebGL2 first, WebGL1 with half-float extensions as the fallback).
- GLSL ES 1.00 compiles on both, so there is one set of shader sources, not two.
- Loops in GLSL ES 1.00 need constant bounds, which is fine here: Jacobi iterations are issued as separate draw calls, and Boids uses a constant maximum with an early `break`.

**Alternatives**:
- WebGPU: not available everywhere yet, and it would need a second path anyway.
- `regl`, `twgl`, `three`: new runtime dependencies for a few hundred lines of plumbing, and a larger bundle for a studio that loads each module lazily.
- Separate GLSL 300 es sources for WebGL2: two copies to keep in step for no gain.

## R2 — The shared GPU toolkit and how a module picks its path

**Decision**: A new folder `visualizations/_shared/gpu/` holds the plumbing: `context.js` (probe, `openGpu`, loss handling, release), `program.js` (compile, link, cache, readable errors), `targets.js` (textures, framebuffers, ping-pong pairs, readback, resize-with-copy), `draw.js` (full-screen triangle, instanced helpers) and `palette.js` (the 256-entry palette as a texture).

The key fact: **a canvas keeps the first context type it is given.** After `getContext("webgl2")`, `getContext("2d")` returns `null`, and the reverse. So a module cannot "try the GPU, then fall back to 2D" on the same canvas. The path is chosen first, on a throwaway canvas:

```text
openGpu(canvas, { need })        // in module.create()
  1. mode = gpuMode()            // "off" if ?gpu=off or the test override is set
  2. caps = probe(need)          // cached; made on an off-screen scratch canvas
  3. if mode is "off" or !caps.ok → return null (module uses its processor path)
  4. gl = canvas.getContext("webgl2" | "webgl", { preserveDrawingBuffer: true, antialias: false, alpha: false, powerPreference: "high-performance" })
  5. if gl is null → return null
```

A module's `create` is then `openGpu(...) ? createGpuInstance(...) : createProcessorInstance(...)`. The processor path is the module's existing `create`, kept as it is.

**One instance per canvas**: because a GPU instance gives its context back when destroyed (below), a canvas cannot start a second GPU instance. The Viewer therefore mounts a fresh `<canvas>` whenever it recreates a GPU instance (a preset, "Reset to defaults", a new seed), not only after `requestRestart`. A real-browser check caught this: the unit tests had no GPU context to trip over.

**Context loss**: the toolkit listens for `webglcontextlost` (calling `preventDefault()` so the browser may restore it) and `webglcontextrestored`.
- On restore, the instance rebuilds its GPU resources and restarts from the opening scene with a short notice (FR-034 allows this).
- If the context is not restored within 3 s, the instance calls `ctx.requestRestart()`. The Viewer then mounts a fresh `<canvas>` (React `key`) and creates the instance again with the GPU forced off, so the 12 existing visualizations carry on through the processor path. The fluid has no processor path and shows its message with a "Restart" button (FR-017).

**Release**: `destroy()` deletes every GPU object and calls `WEBGL_lose_context.loseContext()`. Browsers cap live contexts (commonly 8 to 16) and silently lose the oldest, so releasing on leave is what makes "open and leave 30 times" safe (FR-018, FR-036, SC-007).

**Capture**: contexts use `preserveDrawingBuffer: true`. `makeThumbnail`, `renderThumbnail`, `downloadPng` and `canvas.captureStream` all read the canvas after an `await`, when an unpreserved WebGL buffer would already be cleared. The cost is small at this scale.

**Dev switch**: `?gpu=off` in the studio address forces every module onto its processor path. It exists for QA and for the "graphics acceleration unavailable" checks in Story 5. jsdom has no WebGL, so existing tests take the processor path with no change, which is why today's tests stay valid.

**Alternatives**:
- Probe by creating the real context and discarding the canvas: wastes one of the limited contexts and leaves the canvas locked.
- Keep both a 2D and a WebGL canvas stacked: doubles memory and breaks capture.

## R3 — The fluid simulation: algorithm, formats and the settings' meaning

**Decision**: Stable-fluids solver ("simplified Navier–Stokes", as the reference page calls it), one fixed step of 1/60 s per `step()`, entirely in fragment shaders over ping-pong textures:

| Pass | Reads | Writes | Notes |
|---|---|---|---|
| splat | velocity or dye, point, color, radius | same, ping-pong | Gaussian falloff; radius is corrected for aspect ratio; velocity gets `force × drag delta`, clamped |
| curl | velocity | curl | central differences |
| vorticity | velocity, curl | velocity | confinement force scaled by **Curl**, with the added speed clamped |
| divergence | velocity | divergence | walls reflect velocity (no flow through the edge) |
| pressure warm start | pressure | pressure | multiply the previous pressure by **Pressure** (0.80) |
| pressure solve | pressure, divergence | pressure | **Pressure iterations** draws of the Jacobi step (20) |
| gradient subtract | pressure, velocity | velocity | makes the flow divergence-free (incompressible) |
| advect velocity | velocity | velocity | semi-Lagrangian; divided by `1 + velocityDissipation × dt` |
| advect dye | velocity, dye | dye | same, with `densityDissipation`; dye clamped to a safe maximum |
| display | dye | canvas | tone-limited so a long stroke saturates to a clean color, never to a flashing white-out |

The two dissipation settings are rates: each step, the field is divided by `1 + rate × dt`. At the default velocity rate of 0.20 the motion has an e-folding time of about 5 s; at the default density rate of 1.00 the dye fades with an e-folding time of about 1 s. Rate 0 would never fade, and rate 4 is gone in about a quarter of a second. The ink's lowest setting is **0.1** and not 0, because with no fading the ink only accumulates and heavy stirring ends as a solid wash (measured in the GPU tests). This is the "velocity dissipation slows the motion over time / density dissipation fades the dye" behavior the spec asks for (FR-009, SC-005).

**Formats**: velocity and dye are half-float (RG16F / RGBA16F on WebGL2; RGBA half-float on WebGL1). Pressure, divergence and curl are single-channel half-float where the context allows, else RGBA. Half float is enough here: the reference solver uses it, and the values are bounded by the clamps above.

**Resolution by quality** (starting values, set by measurement in the bench page, R10). The numbers are the short side of the grid; the long side follows the canvas aspect:

| Quality | Simulation grid | Dye grid |
|---|---|---|
| Low | 64 | 256 |
| Medium | 128 | 512 |
| High | 256 | 1024 |

**Stability** (FR-011, SC-006): the added speed from splats and vorticity is clamped; the velocity magnitude is clamped after the gradient step; dye is clamped; and the step is fixed, so a long frame never makes a bigger step. A tab returning from the background does not jump forward, because the loop already caps its time step and the simulation never reads wall-clock time (spec edge case "Tab hidden").

**Splashes**: the opening scene and Burst are only a handful of splashes, so each carries a `gain` of 8 times the ink of one event of a drag (otherwise the first picture is nearly black), and they are placed on distinct cells of a 4 × 2 grid, jittered inside the cell, so they never pile up and always read as separate splashes.

**Determinism**: the opening scene (positions, directions, colors of at least three splats) comes from a fresh generator built from the seed, so Reset and a second opening give the identical scene, and every Burst comes from the running `ctx.rng`, so the same seed gives the same Burst sequence (FR-005, FR-006, edge case "Same seed, same opening"). Colors are palette samples taken in the range 0.25 to 0.95 so no splat is near-black. A stroke's color comes from a counter (golden-ratio stepping through the palette), not from `Math.random`.

**Resize** (FR-019): when the canvas size or aspect changes, each texture is resampled into the new grid by a copy pass instead of being cleared, so the dye and motion survive.

**No CPU copy of the solver**: the project's rule that math lives in `kernel.js` for unit tests is met by pure helpers (`simSize`, `initialSplats`, `burstSplats`, `dissipationDivisor`, `stepUniforms`, `levelValues`). The solver itself is checked in the GPU test project (R7) by reading textures back. A second CPU implementation would be a second thing to keep in step, and it could not prove what the shaders do.

**Alternatives**:
- A CPU solver as the "simpler path": would need a tiny grid to keep up and would make the "needs graphics acceleration" message in Story 3 scenario 4 untrue.
- Float32 everywhere: twice the memory and bandwidth, and not renderable on some phones.
- Per-pixel arbitrary-precision pressure (multigrid): more shader code for no visible gain at 20 Jacobi iterations.

## R4 — Module contract additions

The fluid and the 12 moves need a few things the contract in `specs/003-visualization-studio/contracts/visualization-module.md` does not have. They are additions only; no existing module has to change to keep working. Details are in `contracts/module-additions.md`.

| Addition | Why |
|---|---|
| `actions: [{ id, label, title, key? }]` and `instance.action(id)` | "Burst" and "Clear" (FR-006). The shell renders them as buttons next to the playback bar. They are reachable by keyboard and touch. Modules may also bind `B` and `C`; Space, `.` and `R` stay with the shell (FR-007). |
| `multiTouch: true` | Today the shell turns two fingers into a pinch and ignores a third (`Viewer.jsx`). The fluid needs each finger to stir on its own (Story 1 scenario 4), so with this flag the shell forwards each pointer's `down`, `move` and `up` with a `pointerId` and never makes a pinch. |
| `ctx.showMessage({ text, actionLabel?, onAction? })`, `ctx.clearMessage()` | The plain-language "needs graphics acceleration" message in place of the picture, and the "Restart" action after a lost context (FR-016, FR-017). Shown as an overlay with `role="status"`. |
| `ctx.requestRestart({ forceProcessor })` | Mount a fresh canvas and create the instance again (R2). |
| `instance.setQuality(level, { automatic })` | The module changes its detail level without being recreated. Optional. |
| `instance.isIdle()` | True when nothing will change until the next input (a finished sort or maze). The loop then stops asking for frames and wakes on update, pointer, key, reset or resize. This is what makes FR-024 and SC-013 true for finished runs. |
| `quality` descriptor on the module | Declares what Low, Medium and High mean (R6). |

## R5 — What moves to the graphics card, per visualization (FR-032)

Every existing animated visualization keeps its current `create` as the **processor path** and gains a `gpu.js` with the GPU instance. `index.js` picks one with `openGpu`. A module can ship its GPU path later without affecting the others, because the processor path stays valid.

| Visualization | Group | Step on the GPU | Drawing on the GPU | Why this split |
|---|---|---|---|---|
| Game of Life | rule-based, exact | Yes: 8-bit state ping-pong, birth/survive rule as bit masks, wrap as a uniform | Yes: state texture × palette texture | Cells are independent, so this is the textbook parallel case. Sums of 0/1 values are exact in float, so results match the kernel bit for bit. Drawing cells by painting uses `texSubImage2D`; saving the drawing reads the texture back once on release. |
| Elementary cellular automaton | rule-based, exact | Yes: each step renders one new row into a ring texture from the previous row | Yes | All cells of a row are independent. The 8-entry rule table is a uniform. |
| Langton's ant | rule-based, exact | **No**: one or a few ants move one cell at a time | Yes: grid uploaded as an 8-bit texture (only changed rows), ants as points | The step cannot be parallelized. The cost today is the per-frame loop that builds the whole `ImageData`, and that is what moves. |
| Recamán's sequence | rule-based, exact | **No**: each term depends on the previous ones | Yes: arcs generated in the vertex shader from the term list | Sequential by definition (at most 2000 terms). Arc drawing with many `stroke()` calls is the cost. |
| Sorting algorithms | rule-based, exact | **No**: comparison sorts are sequential | Yes: bars as instanced quads from the value array and the highlight state | Each frame today issues up to 1000 `fillRect` calls. |
| Maze generation and pathfinding | rule-based, exact | **No**: DFS, Prim, Wilson, A*, Dijkstra and BFS are sequential | Yes: cells, walls and the path as instanced quads and a line strip | Today it draws every wall segment with its own path calls. |
| Reaction–diffusion | decimal | Yes: two-channel float32 ping-pong, the 8 sub-iterations of one step as 8 draws | Yes | Every cell is independent. Needs a renderable float32 target; if missing, the module uses its processor path (half float is too coarse for the small feed and kill differences). |
| Boids | decimal | Yes: position and velocity textures; each boid scans the others inside a constant-bound loop (count at most 2000) | Yes: instanced triangles | The CPU version uses a spatial hash; on the GPU a direct scan of at most 2000 neighbors per boid is cheap and simpler. Summation order differs, so results match "at a glance", not bit for bit. |
| Lorenz attractor | decimal | **No**: two trajectories, each step depends on the last | Yes: trails in a ring vertex buffer, 3-D projection in the vertex shader | Costs today are long polylines redrawn every frame. |
| Double pendulum | decimal | **No**: one chaotic trajectory | Yes: trail as a line strip, rods and bobs | Same reason. Long runs may drift from today's picture; allowed by the spec's edge case. |
| Fourier epicycles | decimal | **No** (coefficients come from the existing kernel) | Yes: circle chain and trace | Up to the existing number of circles. |
| Times-table circle | decimal | Yes: the vertex shader computes both endpoints of line *i* from *i* and the multiplier | Yes: instanced lines | Up to 1000 lines recomputed every frame today. |

**Exactness, by group** (FR-035, SC-016):
- Rule-based six: the **oracle is the existing kernel** (`lifeStep`, `elementaryStep`, `antStep`, the Recamán, sorting and maze kernels). In the GPU test project, the same settings and seed run through the kernel and through the GPU instance, with the GPU state read back after each step. States must be identical for every shipped preset and at least five seeds over at least 1,000 steps or until the run ends. For the four modules whose step stays on the CPU, this proves the state that is uploaded and drawn is exactly the kernel's.
- Decimal six: the GPU instance and the processor path draw the same state to two canvases. Both are shrunk to 80 × 60 and compared; the mean absolute channel difference must stay under a starting threshold of 12 out of 255, adjusted once real pictures are compared. Boids and Reaction–diffusion also compare state over the first 5 steps from the same start, with a tolerance for float summation order.

### R5 — what was actually built (updated 2026-11-25)

**All twelve are ported.** Each has `gpu.js` (and `shaders.js` where it has its own) next to its unchanged processor path, which `index.js` keeps as `createProcessor`. Rule-based six (state compared with the existing kernel): Game of Life, Elementary cellular automaton, Langton's ant, Recamán's sequence, Sorting algorithms, Maze. Decimal six (picture and state compared within tolerances): Reaction–diffusion, Boids, Lorenz attractor, Double pendulum, Fourier epicycles, Times-table circle. The shared toolkit grew `_shared/gpu/shapes.js` (thick segments with flat, square or round ends, circle outlines, discs, and an optional colour per segment) for the six that draw lines and circles.

What the step does where, and where it differs from the table above:

| Visualization | Step | Drawing | Difference from the plan, and why |
|---|---|---|---|
| Game of Life | GPU | GPU | The rule is looked up in a 9 x 1 texture by neighbor count instead of bit masks: the count is a sum of at most eight 0/1 floats, so it is exact. |
| Elementary CA | GPU (one row per draw into a ring) | GPU | The colour of each screen row is computed on the processor with the module's own expression and uploaded as a small texture, so rounding cannot differ. |
| Langton's ant | processor | GPU | Only the rows an ant touched since the last picture are uploaded. Ants are eight uniforms rather than points. |
| Recamán | processor | GPU | Each arc is one instanced quad with its own arc shader (first-order distance to the ellipse), not `shapes.js` segments, because `shapes.js` has no arcs. |
| Sorting | processor | GPU | Bars and dots are drawn in one full-screen pass from a values texture and a colours texture, not as instanced quads. |
| Maze | processor | GPU | Cells are a texture pass; walls, the path and the markers use `shapes.js`. Walls are rebuilt on the processor every frame (up to about 34,000 segments), because the generator changes them. |
| Reaction–diffusion | GPU (float32 ping-pong, 8 draws per step) | GPU | Painting writes the processor's exact 29-cell disc with small uploads instead of a splat pass. Needs float render targets; otherwise the processor path. |
| Boids | GPU (all-pairs scan, loop bounded at 2,048) | GPU (instanced triangles reading the state texture in the vertex shader) | The shader accepts exactly the neighbors the processor's 3 x 3 cell lookup accepts, not every boid within the radius. The kernel's grid is `ceil(width / cell)` cells across, so across the wrapping edge it misses neighbors inside the view radius; a plain scan failed the 1e-4 first-step check. The kernel was not changed. |
| Lorenz | processor | GPU | Trails are 3-D point rings in vertex buffers (each point stored twice so the window is contiguous), projected in the vertex shader. The 85% opacity is mixed into an opaque colour so joints do not double-blend. |
| Double pendulum | processor | GPU | Trail, rods and bobs in four draw calls. |
| Fourier epicycles | processor | GPU | Circle outlines are instanced rings. The hint text is rasterised on a 2D canvas and drawn from a texture. |
| Times-table | processor (the endpoints, from the module's own functions) | GPU | The endpoints are computed on the processor each frame (N <= 1000, no canvas calls) instead of in the vertex shader. That keeps the geometry the formula's by construction. |

**Found along the way.**
- A black-margin bug: every port first cleared to the studio background and then drew a full-screen "clear" pass that wrote black over it. Found by `background.gpu.test.js`; fixed in all ports.
- Lines thinner than a pixel came out 1.5 times too bright, because the edge formula ignored the line's width; the fixed coverage is capped at the line's width, as a canvas does.
- Boids' neighbor grid quirk above.

**Not measured here.** On the development machine (Apple M2, vsync-bound at 60 fps) the GPU and processor paths both hold 60 fps for Boids at 2,000 boids, so no gain shows. The ports are expected to matter on weaker devices, which were not measured (T094).

## R6 — The Quality control and the Auto adaptation

**Decision**:
- **One knob, added by one wrapper.** `catalog.js` already wraps every module with `withSweep`; a sibling `withQuality` adds a `quality` choice knob, in a "Performance" group, to every module that declares a `quality` descriptor. Because it is an ordinary knob value, it travels through share links, saved items and exports with no format change, and old items that lack it open with the knob's default (Auto for animated modules, Medium for static ones). `validateConfig` already fills a missing knob from its default, and `encodeConfig` stores only differences from the defaults (FR-021, Story 4 scenario 5).
- **The descriptor** has two optional parts. `scale` is a drawing-resolution factor per level that the **shell** applies to the canvas, so any module can opt in without code (Low 0.5, Medium 1, High 1). `levers` holds module-level values per level, read in `create` and in `setQuality` (for the fluid: the grids in R3).
- **Which modules show the control** is decided by measurement, not by hand: a module keeps its `quality` descriptor only if the bench page (R10) shows Low costing at least 20% less per frame (or per finished picture) than High (FR-020). Candidate levers per module are listed in `contracts/quality.md`.
- **Auto** exists for the 13 animated modules only. The governor lives in the shell (`core/qualityGovernor.js`), is a pure object with an injected clock, and is driven from the loop's per-frame callback. Starting policy:

| Rule | Value |
|---|---|
| Starting level | Medium |
| Measure | mean frame interval over 1 s windows |
| Step down one level | two windows in a row slower than 36 ms (below about 28 fps) |
| After a step | ignore the next 1 s while the new level settles |
| Step up one level | at least 8 s in a row at 20 ms or faster (about 50 fps), and at least 20 s since the last step down. Auto never goes above Medium (so a capable device shows today's picture, FR-021); High is reachable only by choosing it |
| Anti-flicker | if a step up is followed by a step down within 10 s, no step up for 60 s |
| Notices | "Lowered quality to keep this smooth." and "Back to full quality."; at Low and still slow: "This device is too slow to keep this smooth, even at the lowest quality." |

  A step takes effect without a restart: the shell resizes the canvas if the scale changed and calls `instance.setQuality`. Reduced motion, a hidden tab and Pause stop the loop, so the governor sees no frames and does nothing.
- **Static modules** have no Auto. Choosing Low, Medium or High applies through the existing `update(config, ["quality"])` path and redraws progressively as today.

**Alternatives**:
- Per-module Auto logic: eleven copies of the same timing code.
- A global quality in preferences instead of a per-visualization knob: would not travel with a shared link, and the spec requires it to (Story 4 scenario 6).
- Auto for static modules: they draw once with a progress bar, so there is no frame rate to protect (clarification 4).

## R7 — Testing the GPU code without a physical graphics card

**Decision**: Add a second Vitest project that runs in headless Chromium, next to the existing jsdom suite.
- New dev dependencies: `@vitest/browser-playwright` at **5.0.5** (it must match the installed `vitest` exactly; the package declares `vitest` as an exact peer) and `playwright` (peer, `1.65.1` is current). No runtime dependency is added.
- Config in `vitest.gpu.config.js` and a script `npm run test:gpu`. Files are named `*.gpu.test.js` under `src/__tests__/gpu/`. The main config excludes that pattern, so `npm test` stays fast and runs without a browser, exactly as today.
- Chromium is launched with `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Chromium's documentation says automatic software-GL fallback is being phased out and these flags opt in. Passing them is harmless on builds where the fallback still works.

**Evidence** (probe run during planning, headless Chromium 151 with software rendering, `playwright-core` 1.65.1):

| Check | Without flags | With flags |
|---|---|---|
| WebGL2 context | yes (ANGLE on SwiftShader) | yes |
| `EXT_color_buffer_float` | yes | yes |
| `EXT_color_buffer_half_float` | yes | yes |
| `OES_texture_float_linear` | yes | yes |
| WebGL1 context, `OES_texture_half_float`, `WEBGL_color_buffer_float` | yes | yes |
| Float32 render target round-trip | complete; 0.1234567 → 0.12345670163631439 | same |

The probe could use only a locally cached browser build (1234), not the build Playwright 1.65.1 expects (1255), so the **first implementation task is to run the same probe in the GitHub Actions job** with `npx playwright install --with-deps chromium`. If the runner cannot give WebGL2, the fallback is to run the GPU project on developer machines and in a manually triggered workflow, and to report it as "not run" in CI rather than let a missing GPU silently pass. That decision is recorded in `quickstart.md`.

**CI**: a separate `gpu-tests.yml` (pull requests and manual runs) proves the runner first, because `deploy-web-client.yml` also runs the real deployment steps and must not be used to try this out. Once it is green, `deploy-web-client.yml` gets one step after `npm test`: install Chromium, then `npm run test:gpu`, so a deploy does not go out if the GPU project fails.

**What the GPU project covers**: the exactness and tolerance checks in R5, the fluid's stability and behavior checks (SC-005 and SC-006, by reading velocity and dye back), the capability probe and the "open and leave 30 times" release check (SC-007, FR-018, FR-036), and the lost-context recovery (`WEBGL_lose_context.loseContext()` then `restoreContext()`).

**What stays in jsdom**: pure helpers, the quality governor, `withQuality`, the module contract tests, and the fluid's "no graphics acceleration" message (jsdom has no WebGL, so `openGpu` returns `null`).

**Alternatives**:
- `headless-gl` (`gl` on npm): WebGL1 only, a native build, and not an actual browser, so it cannot test the WebGL2 and float-target paths the fluid uses.
- Playwright without Vitest browser mode: a second runner and a second reporting format.
- Mocking `WebGLRenderingContext`: proves nothing about shaders.

## R8 — Interface redraw optimization: where the redraws come from

Findings from reading the code (all in `web-client/src`):

| # | Source | Effect |
|---|---|---|
| 1 | `ctx.reportStats` calls `setStats` inside `Viewer` on every animated frame (Game of Life reports `generation` each render) | The whole `Viewer` and all its children redraw about 60 times a second while a simulation runs. This is the largest source. |
| 2 | `Viewer` declares `onKnobChange`, `onReset`, `onPreset`, `onSeed` and the playback callbacks as plain functions or inline arrows | New identity on every redraw, so `memo` on a child would never skip. |
| 3 | `KnobPanel` creates `onChange={(v) => onChange(k.key, v)}` per knob, and has default parameters `sweeping = new Set()`, `sweepable = new Set()` | A new function and new sets on every render defeat `memo` on every knob. |
| 4 | `KnobPanel` rebuilds `visible` and `groups` on every render | A derived value that should be memoized. |
| 5 | `CatalogGrid` filters the catalog and builds every card inline | Typing in the search box redraws all 24 cards. |
| 6 | `App` (Playground) holds the draft text and re-renders `Header`, `CapabilityPanel`, `ExchangeList` and every `Exchange` on each keystroke | Typing redraws the whole conversation (Story 6 scenario 4). |
| 7 | `micButton` and `meta` in `App` are JSX created on every render | New element identity on every keystroke. |
| 8 | `StudioPage` re-parses the route and rebuilds `header` on every render | Cheap, but unneeded work. |

**Decision**: fix the causes in order, because wrapping children in `memo` first would change nothing:

1. **Isolate per-frame data.** Add `core/statsStore.js`, a tiny external store, and `StatsReadout.jsx`, which subscribes with `useSyncExternalStore`. `ctx.reportStats` writes to the store, not to `Viewer` state, so a running animation redraws only the readout.
2. **Stabilize identities.** `useCallback` for the `Viewer` handlers, with the config read from a ref (the Viewer already keeps `configRef`); module-level constants for the empty sets; `KnobPanel` passes `onChange` straight through and each knob calls `onChange(knob.key, value)`.
3. **Memoize derived values** with `useMemo`: the knob groups, the visible-knob list, the filtered catalog and its per-category groups, the route, the swept-key sets.
4. **`React.memo`** on every component that can receive unchanged props from a parent that redraws: the six knob components, `PresetMenu`, `PlaybackBar`, `HowItWorks`, `KnobPanel`, a new `CatalogCard` (extracted from `CatalogGrid`), `Exchange`, `InputBubble`, `ToolCallCard`, `CapabilityList`, `Header`, `CapabilityPanel` and `ShareMenu`. The `App` fixes: `useCallback` for `handleDraftChange`, `handleSend`, `toggleMic` and the clear handler, and `useMemo` for `micButton` and `meta`.
5. **Leave alone** (with a recorded reason each, SC-017): components that only ever redraw together with their parent, or whose props change every time they redraw (for example `Composer`, whose `value` changes on each keystroke by design; `SaveDialog` while open).

**How the result is checked** (FR-031): two kinds of test, because each proves a different thing.
- *Does the parent pass stable props?* The knob, preset, playback and card modules are mocked with a counting wrapper (`__tests__/helpers/renderProbe.jsx`) and the real parent is rendered. Changing one setting must leave every other counter unchanged.
- *Does the child skip when its props are unchanged?* Each memoized component is mounted inside a `React.Profiler` in a harness that re-renders with unrelated state. The profiler's commit count must not move.

**Audit** (FR-027, SC-017): `render-audit.md` is produced during implementation, one row per component (file, props that change, decision, reason if skipped), covering about 25 component files plus the hooks `useConversation`, `useSpeechInput`, `useSpeechOutput` and `useServerStatus`, whose returned objects are checked for stable identity. The format is in `contracts/render-audit.md`.

**Alternatives**:
- Wrapping everything in `memo` without fixing the causes: no effect, since props change identity every render.
- `React.memo` with a custom comparator to hide the unstable props: hides the bug and risks stale display, which the spec forbids (edge case "Interface changes that alter behavior").
- A state library: a new dependency for a problem a 20-line store solves.

## R9 — Capture, thumbnails and the catalog card

- Export (`downloadPng`), saving (`makeThumbnail`), video (`captureStream`) and the dev thumbnail page (`renderThumbnail`) read the canvas, in the case of `renderThumbnail` after awaits. `preserveDrawingBuffer: true` (R2) makes all four work unchanged. A GPU test draws once, waits a tick, and checks `toBlob` returns a non-blank image.
- The new `public/thumbs/fluid-simulation.webp` (320 × 240, at most 30 KB, total under 500 KB) is made with the existing dev page at `/studio/__thumbnails`, using the fluid's `thumbnail` recipe (`steps` at about 240 so several swirls are visible).
- The 12 moved modules keep their current thumbnails: their pictures match today's (FR-035), so regenerating them is not required.
- The dev page uses the GPU path in a real browser, which is correct: that is the path visitors get.

## R10 — Measuring (FR-026, SC-003, SC-008, SC-010, SC-014, SC-015)

**Decision**: a development-only page `/studio/__bench` (excluded from production builds the same way `__thumbnails` is). For each visualization and each level it offers, it opens the module on an off-screen canvas at the studio's normal size, runs a fixed number of frames (animated) or draws to completion (static), and records mean frame time, 95th-percentile frame time and, for static ones, time to a finished picture. "Save as table" writes a Markdown row set. Results go to `specs/005-navier-stokes-fluid-performance/measurements.md`: first the **baseline of today's code** on the reference laptop and phone (taken before any change, as the spec's Assumptions require), then after each story.

The phone is measured by opening the dev server over the local network. Where a phone cannot be had, the figure is marked "not measured" rather than estimated.

## R11 — Code splitting and size

The toolkit and every `gpu.js` are imported by their module's `index.js`, and modules are already loaded with `import()` on demand, so nothing is added to the catalog page. The GPU code of one module is loaded only when it is opened. Shaders are template strings inside the module's own files; no new assets and no build plugin.

## R12 — The "no graphics acceleration" message for the fluid

If `openGpu` returns `null` for the fluid, the module calls `ctx.showMessage` with: *"This visualization needs graphics acceleration (WebGL), which isn't available in this browser or on this device. The other visualizations still work."* and leaves the canvas empty. The back control, the other catalog entries and the settings panel keep working; settings are hidden for a module that cannot start. After a lost context that is not restored, the same overlay appears with the action "Restart" (FR-017).

## R13 — Fluid presets, sweep and sample picture

Presets (all values inside the ranges in `data-model.md`): **Lingering ink** (velocity 0.05, density 0.2, curl 20), **Quick splashes** (velocity 1.5, density 2.5, curl 10), **Turbulent** (velocity 0.1, density 0.6, curl 50, force 9000). The generated **Animated sweep** moves Curl and Velocity dissipation (two `wave` targets, `periodMs` 40000) so the effect of both is visible without touching anything. The thumbnail recipe is `{ presetId: "turbulent", steps: 240 }` unless the first rendering looks empty.

## R14 — Risks

| Risk | Effect | Mitigation |
|---|---|---|
| GitHub's runner gives no WebGL2 | The exactness tests cannot gate deploys | First task runs the probe there; fallback in R7 |
| Context loss cannot be reverted to 2D on the same canvas | A restart would leave a dead canvas | `requestRestart` mounts a new canvas (R2) |
| Float32 targets missing (some phones) | Reaction–diffusion cannot run on the GPU | `need: ["floatTarget"]` makes it use the processor path |
| 12 ports in one feature | Long tail, partial delivery | The processor path stays valid, so each port ships on its own; order by gain in `plan.md` |
| Quality control found to be under 20% on many modules | Few modules show the control | Allowed by FR-020; the measurement table records it |
| `memo` added without fixing identities | No effect | R8 order: store, handlers, derived values, then `memo` |
| Auto flickers between levels | Visible pulsing | Anti-flicker rules in R6, tested with a fake clock |
| Browser limits on live contexts | Failures after many opens | Release on leave, 30-open GPU test |
