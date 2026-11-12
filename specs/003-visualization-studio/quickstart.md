# Quickstart: Visualization Studio

How to run the studio and check it works. The design is in [plan.md](plan.md), the module contract in [contracts/visualization-module.md](contracts/visualization-module.md), and the saved/shared formats in [contracts/persistence-formats.md](contracts/persistence-formats.md).

## Run

```bash
cd web-client
npm install          # picks up d3-delaunay
npm run dev          # http://localhost:5173
```

The studio doesn't need the server. Start `server/` too (see the root README) only to check the playground alongside it.

## Automated checks

```bash
cd web-client
npm test
```

Expected:
- All existing playground tests pass unchanged (SC-007).
- `__tests__/studio/modules.contract.test.js` passes for all 23 catalog entries: defaults validate, presets validate, `create` → `update` → `destroy` runs on a stub canvas, no use of `Math.random`, same seed gives the same output.
- Kernel tests pass, including these known answers:
  - Recamán first terms `0, 1, 3, 6, 2, 7, 13, 20, 12, 21`
  - Collatz path of 6: `6, 3, 10, 5, 16, 8, 4, 2, 1`
  - Pascal mod 2, row 4: `1, 0, 0, 0, 1`
  - Rule 90 from a single cell gives the Sierpiński pattern for 8 rows
  - Koch curve depth 1: `F+F--F+F` for axiom `F`, rule `F=F+F--F+F`
  - Every sort algorithm sorts random, reversed, nearly sorted, and few-unique arrays
  - Every maze generator produces a perfect maze (all cells reachable, cells − 1 passages)
  - A* and Dijkstra find paths of equal, shortest length; BFS matches on unweighted grids
- Persistence tests pass: share-link round trip, invalid payload falls back with a replaced-values list, storage quota error is reported, export → import round trip.

```bash
npm run build        # production build succeeds; studio code is in separate lazy chunks
```

## Manual checks

Run these in Chrome and in one of Firefox or Safari, plus one phone-width window.

| # | Do | Expect | Covers |
|---|---|---|---|
| 1 | Open `/`, start a conversation, click "Visualization Studio", then "Playground" | Conversation is still there; the address changes between `/` and `/studio` | FR-001, FR-002, Story 1.4 |
| 2 | Stop the server, reload `/studio` | Studio works fully | FR-003 |
| 3 | Open each of the 23 entries | Each shows a recognizable picture within 2 s | SC-001 |
| 4 | Times-table circle at m = 2, then m = 3 | Cardioid, then nephroid; turning on "animate m" sweeps smoothly | Story 2 |
| 5 | Phyllotaxis: 137.5° → 137.6° | Spiral visibly breaks into arms | Story 2 |
| 6 | Gray–Scott presets spots → stripes → coral | Pattern type changes; page stays responsive | Story 2, SC-004 |
| 7 | Mandelbrot: zoom in with the wheel until the limit | Smooth progressive redraw; "zoom limit reached" appears instead of blocky pixels | Edge cases |
| 8 | L-system plant, depth slider to max | Depth stops at a cap with a notice; type `F=F[` in rules | Inline error, last drawing kept |
| 9 | Langton's ant, rule `RL`, speed max | Highway appears after ~10,000 steps; step counter shows it | Story 2 |
| 10 | Sorting: quick sort, 200 bars | Comparisons and swaps counted; pause/step/reset work | FR-009 |
| 11 | Maze: Wilson's + A*, then draw a wall to block the path and solve again | "No path" message | Edge cases |
| 12 | Type 999 into a slider whose max is 500 | Value becomes 500 with a note | FR-013 |
| 13 | Same seed twice on chaos game and DLA | Identical pictures | FR-011 |
| 14 | Tune Mandelbrot, save as "Seahorse valley", restart the browser, open it from My visualizations | Same view and palette | Story 3, SC-005 |
| 15 | Rename, duplicate, delete (confirm) a saved item | List updates | FR-017 |
| 16 | Copy link on a tuned Ulam spiral, open in a private window | Same picture | FR-020 |
| 17 | Edit the `c=` value in a link to garbage | Defaults load with a message | FR-022 |
| 18 | Download PNG; export and re-import a saved item | Image matches canvas; imported item matches | FR-021, FR-022 |
| 19 | Use only the keyboard: Tab through knobs, change values with arrows, play/pause | Everything reachable and labelled | FR-025, SC-008 |
| 20 | Turn on the OS reduced-motion setting, open boids | Starts paused | FR-027 |
| 21 | Start boids, switch to another tab for 10 s, come back; then switch visualization | Paused while hidden; processor use drops when you leave the visualization | FR-024 |
| 22 | Private window with storage blocked: try to save | Clear message, export offered | Edge cases |
| 23 | Pinch-zoom Mandelbrot on a phone (or DevTools touch emulation) | Zooms around the fingers; the page does not scroll or zoom | FR-028 |
| 24 | Trackpad pinch on Mandelbrot in Safari and in Chrome | Zooms at a speed similar to the mouse wheel | FR-028 |
| 25 | Zoom in, Zoom out, Reset view buttons on Mandelbrot and Julia (mouse and keyboard) | Zooms around the center; Reset returns to the default view | FR-028 |
| 26 | Record 5 s of boids, stop, play the downloaded file | File plays; named `boids-<yyyymmdd-hhmmss>.mp4` or `.webm` | FR-029 |
| 27 | Record a 5 s pinch or wheel zoom on Julia, then step through it frame by frame (`ffmpeg -i <file> -vf fps=10 frame-%03d.png`) | No frame shows a horizontal seam between two views; the picture goes from blurry to sharp in one step after the gesture stops | FR-030, SC-009 |
