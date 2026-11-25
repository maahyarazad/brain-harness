# Contract: The shared GPU toolkit

Location: `web-client/src/studio/visualizations/_shared/gpu/` (`context.js`, `program.js`, `targets.js`, `draw.js`, `palette.js`, and `index.js`, which holds `openGpu` and the `Gpu` object). It is imported only by modules' `gpu.js` files, so it loads with the module that uses it. It has no dependencies and no DOM access beyond the canvas it is given and one scratch canvas for probing.

## Selecting a path

```js
import { openGpu } from "../_shared/gpu/index.js";

create(canvas, config, ctx) {
  const gpu = openGpu(canvas, { need: ["floatTarget"], ctx });
  return gpu ? createGpuInstance(canvas, gpu, config, ctx) : createProcessorInstance(canvas, config, ctx);
}
```

`openGpu(canvas, { need = [], ctx, onUnrecovered, unrecoveredMs = 3000 })` → `Gpu | null`.

| Step | Rule |
|---|---|
| Mode | Returns `null` when `?gpu=off` is in the page address, when `globalThis.__VIZ_GPU__ === "off"`, or when `ctx.gpuForced === "off"` |
| Probe | `probeGpu({ need })` on a scratch canvas, cached per page. `null` if no context, or a needed capability is missing. The context it gets back must be a **real** WebGL context (it has `getExtension`, `createShader` and a string `getParameter(VERSION)`): the project's test canvas stub answers `getContext("webgl2")` with a fake 2D object, which must not count. The scratch context is released with `WEBGL_lose_context` once read |
| Context | `canvas.getContext("webgl2", opts)`, else `"webgl"`, with `opts = { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" }`. `null` if both fail |

The canvas keeps the context type it was given. A module that gets `null` must not have touched the canvas, and then calls `canvas.getContext("2d")` as before.

## The `Gpu` object

| Member | Purpose |
|---|---|
| `gl`, `version` (1 or 2), `caps` | The context and its `GpuCapabilities` (data-model.md) |
| `program(name, fragmentSource, { vertex?, attributes? })` | Compiles and links once per name; cached. Default vertex shader is a full-screen triangle with `vUv`. A compile or link error throws `Error` with the log and the numbered source lines |
| `target({ w, h, format, filter, wrap, data, keepData })` | A texture with a framebuffer. `format` is `"rgba8"`, `"rgba16f"` or `"rgba32f"`; the one- and two-channel names (`"r8"`, `"rg16f"`, `"rg32f"` …) are accepted as aliases and **mapped to RGBA**, because RGBA is renderable on far more devices. Throws a readable error for a float format the device cannot render to. `data` seeds the first build; with `keepData` it is uploaded again after a context restore |
| `pair(opts)` | Two targets with `read`, `write` and `swap()` |
| `draw(program, uniforms, target \| null, { viewport, clear, blend, instanced })` | One pass. `target` `null` draws to the canvas. A target passed as a uniform is bound to the next texture unit. `blend` is `"alpha"` or `"add"`. With `instanced: { vertexCount, instanceCount, mode, attributes: [{ buffer, size, divisor }] }` it draws instanced geometry instead of the full-screen triangle (WebGL 1 uses `ANGLE_instanced_arrays`); attributes bind to locations 0, 1, 2… in the order the program's `attributes` option lists them |
| `buffer(typedArray, { dynamic })` | A vertex buffer with `update(data, byteOffset)` and `dispose()`; rebuilt after a restore from the latest data |
| `upload(target, typedArray, region?)` | `texSubImage2D` of a whole target or a region `{ x, y, w, h }` |
| `readback(target, out, region?)` | `readPixels`; `target` may be `{ w, h, fbo: null }` to read the canvas. Half-float targets can be read on WebGL 2 only |
| `resize(targetOrPair, w, h, { keep })` | New size; with `keep`, the old content is resampled into the new target (FR-019); without it the content is cleared |
| `finish()` | Waits until everything queued has run (used by the bench page to time real cost) |
| `paletteTexture(lut)` | The 256-entry `ctx.palette(name)` lookup as a 256 × 1 `rgba8` texture; cached per name |
| `onLost(cb)`, `onRestored(cb)`, `isLost()` | Context events; see below |
| `dispose()` | Deletes every program, target and buffer, then `WEBGL_lose_context.loseContext()` |

## Context loss

- On `webglcontextlost` the toolkit calls `preventDefault()`, sets `isLost()`, and calls `onLost` callbacks. `draw`, `upload` and `readback` become no-ops while lost.
- On `webglcontextrestored` it recreates programs and targets lazily on first use, then calls `onRestored` callbacks. The module re-initializes from its opening scene and calls `ctx.reportNotice("The graphics card was reset, so the picture restarted.")`.
- If no restore comes within `unrecoveredMs` (3 s), the toolkit calls the `onUnrecovered` option if given, otherwise `ctx.requestRestart({ forceProcessor: true })`, which is right for a moved module. The fluid passes `onUnrecovered` and calls `ctx.showMessage` with a "Restart" action (FR-017). A restore in time cancels it.

## Shader dialect (GLSL ES 1.00 for both context types)

- No `#version` line. `precision highp float;` in every fragment shader (`mediump` only where a module documents why).
- `texture2D`, `varying`, `gl_FragColor`. No `texelFetch`, no integer textures, no `for` loops with a non-constant bound.
- Sample cell grids at texel centres with `NEAREST` filtering; compute wrap by hand with `fract`, since `REPEAT` is not allowed on non-power-of-two textures in WebGL1.
- A fragment shader that filters half floats begins `#ifdef MANUAL_FILTER` and does a four-tap bilinear read when `caps.linearHalf` is false; the toolkit adds the `#define` when needed.
- Uniform names are `uCamelCase`, varyings `vCamelCase`.
- Shader sources live in the module's own `shaders.js` as template strings. They are plain data and can be unit-tested in jsdom for the presence of required uniforms.

## What jsdom sees

`openGpu` in jsdom (no WebGL) returns `null` without throwing, so every moved module takes its processor path and every existing test is unaffected. The `gpuMode` and `probe` logic is unit-tested there with a stubbed `document.createElement("canvas")`.
