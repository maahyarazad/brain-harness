# Contract: Catalog thumbnails

## Module export: optional `thumbnail`

How to make the sample picture for the module's catalog card. Every field is optional; with none, the picture is the module's default settings after it has finished drawing.

```js
thumbnail: {
  presetId: "flower",          // start from this preset (must exist)
  values: { N: 300 },          // then these knob values (must validate)
  view: { cx: -0.74, cy: 0.13, zoom: 40 },  // for defaultView modules
  steps: 600,                  // animated modules: steps to run before the snapshot (≤ 20000),
                               // or "done" to step until isDone() (run-kind sweep modules)
  quality: 0.55,               // WebP quality if 0.8 makes the file too big (noisy pictures)
},
```

Pick a moment that shows what the visualization is about: a finished maze with its path, a sort half done, a grown cluster, a full trail.

## Generated files

| Item | Rule |
|---|---|
| Path | `web-client/public/thumbs/<catalog id>.webp`, served at `/thumbs/<id>.webp` |
| Size | 320 × 240 px, WebP, quality 0.8 |
| Weight | ≤ 30 KB each, ≤ 500 KB for all |
| Background | `#0f0f12`, the studio's canvas background; the picture is fitted and centred |

## Generator (development only)

- **Page:** `/studio/__thumbnails`, available only in `npm run dev` (`import.meta.env.DEV`). It renders each module with `renderThumbnail(module, recipe)` from `studio/core/thumbnail.js`, shows the results in a grid, and has "Save all" and per-card "Save" buttons.
- **Writer:** a Vite plugin (`apply: "serve"`) handles `PUT /__thumbs/<id>.webp`.
  - It accepts only ids in the catalog (`/^[a-z0-9-]+$/` and present in `CATALOG`).
  - It accepts only bodies under 200 KB that start with the RIFF/WEBP signature.
  - It writes to `public/thumbs/<id>.webp`.
- **Production:** neither the page nor the plugin is in the production build.

## `renderThumbnail(module, recipe, { w = 320, h = 240 })` → `Promise<HTMLCanvasElement>`

1. Builds the config from defaults, then `presetId`, `values` and `view`, and validates it.
2. Creates the instance on an off-screen canvas of `w × h` with a fresh module context.
3. Runs `steps` steps (animated modules), waiting for `ctx.idle()` after each, since some modules hand steps to a worker and drop them while it's busy. It yields to the browser every 200 steps, then calls `render()`.
4. Waits for `ctx.idle()` and until `isBusy?.()` is false (at most 20 s).
5. Copies the result onto a `w × h` canvas filled with `#0f0f12` (fit and centre), destroys the instance and returns that canvas.

## Card markup

```html
<span class="card-thumb" aria-hidden="true">
  <span class="card-glyph">◎</span>
  <img src="/thumbs/times-table.webp" alt="" width="320" height="240" loading="lazy" decoding="async">
</span>
```

The image covers the glyph when loaded (`object-fit: cover`), and `onError` hides it.
