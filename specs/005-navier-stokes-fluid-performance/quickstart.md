# Quickstart: validating the fluid simulation, the performance layer and the leaner interface

## Prerequisites

```bash
cd web-client
npm ci
npx playwright install chromium     # once, for the GPU test project
npm run dev                         # http://localhost:5173
```

No MCP server or API key is needed. The Playground part of check 26 runs against `/playground`, whose message box works without the server (sending a message does not need to succeed to see what redraws).

## Automated

```bash
cd web-client
npm test                  # jsdom suite: unchanged speed, no browser needed; includes new unit, contract and redraw-count tests
npm run test:gpu          # headless Chromium, real shaders on software rendering (contracts/gpu-tests.md)
npm run test:all          # both
npm run build
```

All must pass. `npm test` alone is what `npm test` ran before this feature, plus the new jsdom tests; today's tests are unchanged.

If `npm run test:gpu` cannot get WebGL2 in GitHub Actions (research R7), the result is recorded here and the job is reported as "not run" rather than passing silently:

| Date | Where | Result |
|---|---|---|
| 2026-11-24 | developer machine (macOS arm64, Playwright Chromium 159 headless shell, build 1255) | **Pass.** `npm run test:gpu`: 3 tests. WebGL2 context, `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, WebGL1 with half-float targets, and an exact float32 round-trip all work with the four software-GL flags. |
| _pending_ | GitHub Actions `ubuntu-latest` | **Not run.** Needs a push and a manual run of `.github/workflows/gpu-tests.yml` (workflow_dispatch). Until then the GPU tests gate only developer machines. If the runner cannot give WebGL2, apply the fallback in research R7: report the GPU job as "not run" and keep `npm test` as the deploy gate. Never treat a skipped GPU project as a pass. |

## Development pages

| Page | Use |
|---|---|
| `http://localhost:5173/studio/__bench` | Measures frame time and time to picture for every visualization and level; "Save as table" produces rows for `measurements.md` |
| `http://localhost:5173/studio/__thumbnails` | Makes `public/thumbs/fluid-simulation.webp` (use "Save" on its card) |
| `…/studio/<id>?gpu=off` | Forces the processor path for any module |
| `…/studio/<id>?load=40` | Dev only: busy-waits 40 ms per frame so Auto has to step down on a fast machine |

## Manual checks

"Reference laptop" and "reference phone" are defined in the spec's Assumptions.

| # | Do | Expect | Covers |
|---|---|---|---|
| 1 | Open `/studio`, choose the "Simulation and emergence" filter; separately, search `fluid` and `Navier` | A "Fluid simulation" card with a picture and the summary, in both cases | US1 s1, FR-001 |
| 2 | Open it | At least three coloured swirls already moving, within 3 s | US1 s2, SC-001 |
| 3 | Drag across the picture slowly, then quickly | Ink follows the drag; the quick drag pushes harder | US1 s3, FR-003 |
| 4 | On a touch screen (or Chrome device emulation), drag with two and three fingers | Each finger stirs on its own; no zoom; no errors | US1 s4 |
| 5 | Click once without moving | One small splash | FR-003 |
| 6 | Press Burst (button, then `B`); press Clear (button, then `C`); press `R` | At least five new splashes; empty picture; the same opening scene as step 2 | US1 s5–s7 |
| 7 | Space, `.`, speed | Pause freezes and keeps the picture; Step advances one tick; speed works | US1 s8, FR-007 |
| 8 | Read "How it works" | It covers the points in `contracts/fluid-simulation.md` and says velocity dissipation slows the motion and density dissipation fades the ink | US1 s9, FR-012 |
| 9 | Settings panel | The seven starting values from data-model.md, plus Quality, Palette and Seed | US2 s1, FR-008 |
| 10 | Make the same stroke with Velocity dissipation at 0, 0.2 and 4; then Density dissipation at 0.1, 1 and 4 | Motion lingers longest at 0 and is gone almost at once at 4; same for the ink | US2 s2–s4, SC-005 |
| 11 | Curl 0 against 50; Pressure iterations 4 against 60 | More small swirls at 50; at 4 the fluid visibly bunches or leaves gaps | US2 s6, s7 |
| 12 | Apply each preset; apply Animated sweep | Three clearly different characters; the sweep moves Curl and Velocity dissipation by itself | US2 s8, FR-013 |
| 13 | Set every setting to its minimum, then to its maximum, and stir for a minute each | No flashing, no white-out, no freeze, no blank picture | US2 s9, SC-006 |
| 14 | Switch Quality Low / Medium / High while running | Detail changes, the picture is never cleared | US3 s1, edge "Quality changed mid-run" |
| 15 | Open `/studio/fluid-simulation?load=40` | A notice "Lowered quality to keep this smooth."; at 4 s the pace is back to 30 fps or more | US4 s3, SC-010 |
| 16 | Open `/studio/fluid-simulation?gpu=off` | A plain message about graphics acceleration; the back control and other visualizations work | US3 s4, FR-016 |
| 17 | In the console, get the canvas and call `getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()` | Restarts with a notice, or shows the message with a "Restart" button | US3 s5, FR-017 |
| 18 | Resize the window, rotate a phone, enter and leave full screen | The fluid keeps flowing with its ink | US3 s7, FR-019 |
| 19 | Open and leave the fluid and one moved module 30 times | They keep starting; the studio's speed is unchanged | US3 s6, SC-007 |
| 20 | Open an older share link and an older saved item (made before this feature) for two animated and two static visualizations | Same settings; Quality shows Auto (animated) or Medium (static); static pictures are identical to before | US4 s5, SC-011 |
| 21 | Open Mandelbrot at Low, Medium, High | No Auto choice; Medium looks the same as before; Low draws faster | US4 s1, s4 |
| 22 | Open each of the 12 moved visualizations at the same settings and seed as in the baseline screenshots | Same look; every control from US5 s2 still works | US5 s1, s2 |
| 23 | Open each of the 12 with `?gpu=off` | Works as before; no error | US5 s4, FR-034 |
| 24 | Save, share, export a picture and record a video from the fluid and from two moved modules | Files are not blank; links reopen the same settings | FR-014 |
| 25 | Turn on reduced motion (system or the studio's Motion setting) | The animated visualizations start paused | US3 s8, FR-015 |
| 26 | With the React DevTools "Highlight updates" option on, drag a slider during an animation; type in the catalog search; type in the Playground box | Only the slider and the picture update; unchanged cards and messages do not flash | US6 s1–s5 |

## Measuring

1. **Before any code change**, on the reference laptop and phone, run the bench page and save the table as the `baseline` rows in `measurements.md` (FR-026). Also save one screenshot per visualization at default settings and seed for check 22.
2. After each story, repeat and add rows for the same visualizations and levels.
3. A figure that could not be taken (for example no phone available) is written as "not measured", never estimated.

## Done when

- `npm test`, `npm run test:gpu` (or its recorded CI fallback) and `npm run build` pass.
- Checks 1–26 pass on the reference laptop; checks 4, 15 and 19 also on the reference phone.
- `measurements.md` has baseline and after rows for every visualization and level it offers, showing SC-003, SC-008, SC-010, SC-013, SC-014 and SC-015 met, or the exact figure and the reason where not.
- `render-audit.md` covers every component and hook (SC-017), and the redraw-count tests T1 to T7 pass (SC-012).
