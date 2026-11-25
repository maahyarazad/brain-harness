# Contract: The GPU test project

Implements the checks behind FR-035, SC-005, SC-006, SC-007, SC-016 (research R7). It runs the real shaders in headless Chromium with software rendering.

## Setup

- New dev dependencies in `web-client/package.json`: `@vitest/browser-playwright` at **5.0.5** (an exact match for the installed `vitest`) and `playwright`. Nothing is added to `dependencies`.
- `vitest.gpu.config.js`: the browser project. Shape (confirm option names against the installed Vitest 5 when writing it):

```js
test: {
  include: ["src/__tests__/gpu/**/*.gpu.test.js"],
  testTimeout: 60000,
  browser: {
    enabled: true, headless: true,
    provider: playwright({ launchOptions: { args: [
      "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist" ] } }),
    instances: [{ browser: "chromium" }],
  },
}
```

- `vite.config.js` (jsdom project) adds `test.exclude: [..., "**/*.gpu.test.js"]`, so `npm test` is unchanged and needs no browser.
- Scripts: `npm run test:gpu` runs the browser project; `npm run test:all` runs both. `npx playwright install chromium` is documented in `quickstart.md`.
- **Task 1 of the implementation** runs `probe.gpu.test.js` on the developer machine and in the GitHub Actions job. If the runner cannot provide WebGL2, the fallback in research R7 applies and `quickstart.md` records it.

## Helpers (`src/__tests__/gpu/gpuHarness.js`)

| Helper | Purpose |
|---|---|
| `makeCanvas(w, h)` | A real canvas in the test page |
| `runGpu(module, config, { steps })` | `module.create` with the GPU path, `steps` calls to `step()`, then `render()`; returns `{ inst, canvas, handle }` |
| `runProcessor(module, config, { steps })` | The same with `ctx.gpuForced = "off"` |
| `readState(inst)` | Test-only hook each GPU instance exposes (`inst.__debug.readState()`), returning its cell, field or buffer state as a typed array |
| `imageDiff(canvasA, canvasB, { w: 80, h: 60 })` | Shrinks both and returns the mean absolute channel difference out of 255 |
| `lose(canvas)` / `restore(canvas)` | `WEBGL_lose_context` helpers |

`inst.__debug` exists only when `import.meta.env.MODE !== "production"`, and is dropped from builds.

## Test files

| File | Checks | Pass rule |
|---|---|---|
| `probe.gpu.test.js` | `probeGpu` reports WebGL2 and the float and half-float capabilities; `?gpu=off` and `ctx.gpuForced` return `null`; `requestRestart({ forceProcessor })` path | as stated |
| `exactness.life.gpu.test.js`, `.elementaryCA.`, `.langton.`, `.recaman.`, `.sorting.`, `.maze.` | **Oracle = the existing kernel.** Same settings and seed through the kernel and the GPU instance; state compared after every step | Identical state for every shipped preset, at least 5 seeds, 1,000 steps or to the end of the run (SC-016) |
| `similar.grayScott.gpu.test.js`, `.boids.` | State compared over the first 5 steps from the same start; picture compared with `imageDiff` after 200 steps | state within 1e-3 mean and 1e-2 max (starting tolerance); picture difference at most 12 |
| `similar.lorenz.gpu.test.js`, `.doublePendulum.`, `.fourier.`, `.timesTable.` | GPU picture against the processor picture at the default settings and seed, same step count (short for the chaotic two) | picture difference at most 12 |
| `fluid.gpu.test.js` | See the table in `contracts/fluid-simulation.md`; stability at the extremes read back from the textures (finite, bounded, not all zero after strokes); `velocityDissipation` 0 against 4 and `densityDissipation` 0 against 4 decay ratios (SC-005); Curl and Pressure iterations effects; Burst, Clear, Reset; resize and quality changes keep content | as in the spec |
| `lifecycle.gpu.test.js`, `lifecycle.ports.gpu.test.js` | Open and destroy each GPU module 30 times in a row, then confirm a fresh `getContext` still succeeds and the first draw is correct (SC-007, FR-036); lost-context then restored: the instance restarts from its opening scene and reports the notice; lost and not restored: `requestRestart` is called | as stated |
| `capture.gpu.test.js`, `capture.ports.gpu.test.js` | `toBlob("image/png")`, `captureStream`, `makeThumbnail` and `renderThumbnail` after an `await` return a non-blank picture for one GPU module of each kind (fluid, Life, Lorenz) | non-blank |

### The final figures (2026-11-25): what the tests enforce

Measured, not guessed. "Real" means the figure the passing code measured; the limit is what the test accepts.

| Group | Check | Limit in the test | What it measured |
|---|---|---|---|
| Rule-based six | State after every step against the kernel | identical | identical; Game of Life, Elementary CA, Langton, Sorting, Maze compare the kernel's own arrays, Recamán its layout |
| Reaction–diffusion | 5 steps (40 iterations) against `grayScottSteps` | mean < 1e-3, max < 1e-2 | passed for all five presets (the exact figures are not recorded; the test fails above the limits) |
| Reaction–diffusion, Boids, Lorenz, Double pendulum, Fourier, Times-table | `imageDiff` (80 x 60, mean absolute channel difference out of 255) against the processor path | at most 12 | passed for every preset; the limit is generous because most of these pictures are dark |
| Boids | first-step velocity and position against `flockStep` | < 1e-4 | passed for every preset, 10 to 2,000 boids and the extremes of every rule once the shader used the kernel's own neighbor lookup (see research R5) |
| Boids | 5 steps | < 1e-3 | passed |
| Boids | alignment order parameter after 200 steps | within 0.1 | passed |
| Lorenz | amount of bluish and reddish ink, against the processor | within 0.7 to 1.4 | passed; brightness of the ink within 5% (the real ratio measured 0.999) |
| Lorenz, Double pendulum, Times-table, Fourier, Recamán | ink (lit pixels) against the processor | within 0.85 to 1.18 | passed; brightness within 0.85 to 1.18 (Fourier, Times-table), 0.85 to 1.15 (Recamán) |
| Every port | a margin of the canvas is the studio background | exactly (15, 15, 18) | passed |
| Every port | open and leave 30 times, then a fresh context and a non-blank first frame | as stated | passed |
| Every port | lost and not restored: `requestRestart({ forceProcessor: true })` after 3 s, not before | as stated | passed |

The `imageDiff` limit of 12 was not tightened: the figures above use finer checks (ink, colour, shape, position) that would fail well before it does.

## What the GPU project does not do

It does not measure speed: software rendering is far slower than a real graphics card, and frame times from it would be meaningless. Speed is measured in the bench page on the reference devices (research R10).
