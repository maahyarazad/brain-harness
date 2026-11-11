# Research: Visualization Studio

All Technical Context items were resolved; no NEEDS CLARIFICATION remain.

## R1. Where the studio lives and how it's reached

- **Decision**: Add the studio to the existing `web-client`. A new `Root.jsx` renders a small top nav ("Playground", "Visualization Studio") and picks the section from `location.pathname` (`/` → playground, `/studio/...` → studio) using the History API. Both sections stay mounted once visited; the inactive one is hidden with the `hidden` attribute. The studio is loaded with `React.lazy`.
- **Rationale**: Meets FR-001/FR-002 (own address, playground unchanged) and Story 1 scenario 4 (conversation survives switching) without touching `App.jsx`. Existing tests render `<App/>` directly, so they keep passing. nginx already falls back to `index.html` for unknown paths, and Vite dev does too.
- **Alternatives considered**: `react-router` (a dependency for two routes); hash routing (works, but uglier links and clashes with share-link fragments); a separate Vite app (duplicates build and deploy for no gain); unmount-on-switch (loses the playground conversation).

## R2. Rendering technology

- **Decision**: Canvas 2D for every visualization, using `ImageData` for per-pixel ones (fractals, Pascal, Gray–Scott, Voronoi Manhattan, Life). The canvas is sized to CSS size × `devicePixelRatio` (capped at 2). Lorenz uses a hand-written rotation + perspective projection, no 3-D library.
- **Rationale**: One drawing model for all modules, PNG download via `canvas.toBlob`, works everywhere. All required visuals are 2-D or simple projected 3-D lines.
- **Alternatives considered**: WebGL (faster Gray–Scott and Mandelbrot, but a second rendering path, harder to test, and only float32 precision, which would make deep zoom worse); SVG (too slow for tens of thousands of points); three.js for Lorenz (large dependency for one view).

## R3. Keeping the page responsive (SC-004)

- **Decision**: Three tools, chosen per module:
  1. **Web Workers** for heavy pure kernels: Mandelbrot/Julia (render in row bands, posted back progressively), Gray–Scott (simulation steps in the worker, frames transferred as `ImageBitmap`/`ArrayBuffer`), DLA (walker simulation).
  2. **Progressive chunking** on the main thread for medium work (Ulam at max size, Pascal at max rows, L-system drawing, chaos game and Barnsley point plotting): work is split into slices of ≤ 8 ms per animation frame, with progress reported and cancellation on any knob change.
  3. **Fixed per-frame step budgets** for animations (sorting, maze, Life, Langton, boids, pendulum, Lorenz, Fourier).
- **Rationale**: The worker list is the set that can't meet SC-004 otherwise; everything else is simpler on the main thread.
- **Testing**: `workerPool.js` has an in-thread mode used when `Worker` is undefined (jsdom), so the same kernels run in tests.
- **Alternatives considered**: Workers everywhere (more message plumbing for cheap modules); OffscreenCanvas (Safari support has been patchy for 2D contexts in workers; kept as a later optimization).

## R4. Determinism and seeds (FR-011, FR-019)

- **Decision**: `mulberry32` seeded PRNG passed to modules as `ctx.rng`; seeds are 32-bit unsigned integers shown in the UI. `Math.random` is banned in modules (checked by the contract test with a spy). Simulations use a fixed timestep (pendulum: RK4 at dt = 1/240 s; Lorenz: RK4 at dt = 0.005), decoupled from frame rate, so the same seed and step count give the same state.
- **Rationale**: Saved visualizations and share links must reproduce the same picture across reloads and machines.
- **Alternatives considered**: `crypto.getRandomValues` (not seedable); variable timestep (results depend on frame rate).

## R5. Mandelbrot/Julia precision and coloring

- **Decision**: float64 arithmetic; smooth (normalized iteration count) coloring when enabled; maximum zoom ≈ 1e13 (pixel spacing near float64 epsilon × |center|). Past the limit, zoom-in is disabled and a "zoom limit reached" note is shown (spec edge case). Iteration limit range 50–5,000.
- **Rationale**: Perturbation theory / arbitrary precision would allow deeper zooms but is a large project, out of proportion for this feature.
- **Alternatives considered**: perturbation with a reference orbit (deferred); BigInt fixed-point (orders of magnitude slower).

## R6. L-system safety

- **Decision**: Expand iteratively and stop when the string would exceed 2,000,000 symbols; the depth slider's effective maximum is reported ("depth capped at 7 for these rules"). Rules are parsed from lines like `F=F+F-F`; parse errors are shown inline and the last valid drawing stays.
- **Rationale**: Covers the spec edge case without arbitrary per-preset limits.

## R7. Voronoi / Delaunay

- **Decision**: Use `d3-delaunay` (6.x, ESM, ~10 KB min+gz, no transitive deps) for Euclidean Delaunay, Voronoi cell polygons, and Lloyd relaxation (move points to cell centroids). For the Manhattan metric, rasterize on a downsampled grid (brute force nearest seed per pixel, in chunks; ≤ 500 points), and relax with pixel centroids.
- **Rationale**: Robust on degenerate input from user clicks, fast enough for interactive dragging of 2,000 points. Manhattan Voronoi has no polygon form in that library, and rasterizing is simple.
- **Alternatives considered**: hand-written Bowyer–Watson (robustness risk); raster for both metrics (no triangulation lines, blurrier edges).

## R8. Share links (FR-020)

- **Decision**: URL form `/studio/<vizId>?c=<payload>`. Payload = JSON of only the values that differ from defaults, compressed with `CompressionStream('deflate-raw')` and base64url-encoded. Version-prefixed (`1.`) so the format can change. User-drawn data (Fourier outline, Voronoi points, Life cells) is quantized and capped (≤ 512 outline points, ≤ 500 Voronoi points; Life cells run-length encoded); above the cap, the link falls back to "export a file instead" with a message.
- **Rationale**: Diffing against defaults keeps most links tiny; `CompressionStream` is built into all target browsers.
- **Alternatives considered**: plain query parameters (long, no structure for arrays); `lz-string` (a dependency for what the browser already does).

## R9. Saved visualizations (FR-016–FR-019)

- **Decision**: `localStorage` key `vizstudio.v1.saved` holding an array of saved records (format in [contracts/persistence-formats.md](contracts/persistence-formats.md)); thumbnails stored as 160×120 JPEG data URLs (~5–10 KB each). Writes are wrapped in try/catch; a `QuotaExceededError` or blocked storage shows a message and offers export instead.
- **Rationale**: No accounts and no server per the spec's assumptions; `localStorage` is simple and synchronous. 5 MB fits hundreds of saves.
- **Alternatives considered**: IndexedDB (async, more code, only needed for large data; revisit if users save big drawn inputs).

## R10. Animation loop, hidden tabs, reduced motion

- **Decision**: One shared `requestAnimationFrame` loop (`core/loop.js`) per viewer with a speed multiplier and fixed-step accumulator. It stops on `destroy()` and pauses on `visibilitychange` → hidden (FR-024). When `prefers-reduced-motion: reduce` matches, animated modules start paused, with a studio setting to override (FR-027).

## R11. Knob panel and accessibility

- **Decision**: The knob panel is generated from each module's knob definitions (contract) using native `<input type="range">`, `<select>`, `<input type="checkbox">`, and text inputs, each with a visible `<label>` and an editable number box next to sliders. Arrow keys follow each knob's `step`; Shift+arrow uses ×10. Range sliders for very fine knobs (phyllotaxis angle) pair a slider with a numeric field accepting 0.001° precision.
- **Rationale**: Native controls give keyboard and screen reader support for free (FR-025, SC-008).

## R12. Palettes

- **Decision**: 6 built-in palettes: Viridis, Magma, Cividis (color-blind safe), Twilight (cyclic), Fire, Grayscale. Precomputed 256-entry lookup tables.
- **Rationale**: FR-014 requires ≥ 4 including one color-blind-safe; Viridis and Cividis both qualify.

## R13. Per-visualization algorithm notes

| Module | Approach |
|---|---|
| Collatz coral | For n in 1..N, walk the Collatz path to 1, reverse it, draw a turtle path turning by the even/odd angle; shared prefixes overlap and form branches |
| Ulam | Sieve of Eratosthenes up to start + size; square: spiral coordinates; hexagonal: hex ring coordinates; Sacks: r = √n, θ = 2π√n |
| Recamán | Standard sequence with a `Set` of seen values; semicircle arcs alternating above/below |
| Times table | N points on a circle, line k → (k·m mod N), m is fractional; animation increments m by rate·dt |
| Pascal mod n | Row-by-row with only the previous row, values kept mod n (no big integers needed) |
| Chaos game | Corners on a regular polygon; restriction rules applied to the corner choice; points plotted into an accumulation buffer, then tone-mapped |
| Barnsley | 4 classic affine maps; weights normalized to sum to 1; accumulation buffer |
| Life | Two `Uint8Array` grids; rule parsed from B/S notation; optional wrap |
| Elementary CA | Rule number → 8-entry lookup; rows scroll downward |
| Gray–Scott | Two `Float32Array` fields, 9-point Laplacian, Euler steps in the worker; default grid 256×256 |
| Boids | Uniform grid spatial hash for neighbor queries; up to 2,000 boids |
| Langton | Turn rule string of L/R defines the color count; multiple ants on one grid; step counter |
| DLA | Walkers launched from a circle just outside the cluster radius, killed when far away; stickiness = probability of sticking on contact; step budget |
| Lorenz | RK4; two trajectories with a configurable initial separation; trail as ring buffer; drag to rotate |
| Double pendulum | Lagrangian equations of motion, RK4; trail of the second bob |
| Fourier | Resample outline to N points by arc length, DFT, sort coefficients by amplitude, use the top K as circles |
| Phyllotaxis | Point i at angle i·α, radius c·√i |
| Sorting | Each algorithm is a generator yielding `compare`/`swap`/`set` operations; the viewer applies k ops per frame by speed; counters from ops |
| Maze | Generators (recursive backtracker, randomized Prim's, Wilson's) as step generators; solvers (A*, Dijkstra, BFS) as step generators exposing frontier and visited sets |
