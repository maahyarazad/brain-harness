# Quickstart: validating Studio Home, Animated Sweeps and the My visualizations back link

## Prerequisites

```bash
cd web-client
npm ci
npm run dev          # http://localhost:5173
```

No MCP server or API key is needed for any check below except 3.

## Automated

```bash
cd web-client
npx vitest run                 # whole suite, including the Playground tests (SC-007)
npx vitest run src/__tests__/studio/core/sweep.test.js
npx vitest run src/__tests__/studio/modules.contract.test.js   # sweep declarations (contracts/sweep.md)
npx vitest run src/__tests__/studio/navigation.test.jsx        # routes (contracts/routes.md)
npm run build
```

All tests pass and the build succeeds.

## Manual checks

| # | Do | Expect | Covers |
|---|---|---|---|
| 1 | Open `http://localhost:5173/` in a fresh window | Studio catalog; address bar shows `/studio`; browser Back leaves the site | US1, FR-001 |
| 2 | Look over the catalog, a visualization, and My visualizations | No "Playground" text or link anywhere; no section switcher | FR-002, FR-005 |
| 3 | Open `/playground` | Playground works as before (with server and key if you use them) | FR-003 |
| 4 | In DevTools → Network, reload `/studio` | No Playground chunk is requested, and no `/api` or `/mcp` request is made | FR-006 |
| 5 | Open an old share link `/studio/julia?c=…` and a saved visualization | Same picture as before; sweep off | FR-004, FR-016 |
| 6 | Open `/garbage` | Catalog at `/studio` | Edge case |
| 7 | Click "My visualizations", then "← Catalog" | Catalog; browser Back returns to My visualizations | US2 |
| 8 | Type `/studio?view=mine` directly, then press Tab until the back link is focused and press Enter | Catalog | FR-008, FR-009 |
| 9 | For each of the 23 visualizations: pick "Animated sweep", watch 30 s | Picture changes at least every 5 s, with no jump and no blank frame; the swept slider moves; Sweep speed is visible | US3, SC-004 |
| 10 | During a sweep: pause, wait, play | It stops within ¼ s and resumes from the same point | FR-014, SC-005 |
| 11 | During a sweep, drag the swept slider | The sweep continues from where you dropped it | Scenario 6 |
| 12 | Set Motion to "Reduce", pick "Animated sweep" | Starts paused; Play starts it | Scenario 7 |
| 13 | Mandelbrot sweep | Smooth zoom into Seahorse Valley; each step sharpens before the next; page stays responsive | Scenario 9 |
| 14 | Sorting / Maze / Langton / 1-D CA sweep | Each run finishes, stays about 1.5 s, then the next algorithm, generator or rule starts | FR-020 |
| 15 | Sweep running → Share link → open it in a new tab; same with Save and Export/Import | Same sweep at the same speed | FR-015, SC-006 |
| 16 | Phyllotaxis (normally still) with the sweep on | "Record video" is offered and records the sweep | FR-019 |
| 17 | Times-table "Animated sweep" | Same as before | FR-017 |
| 18 | Open the catalog; DevTools → Network | 23 `/thumbs/*.webp` requests (lazy), total ≤ 500 KB; no visualization chunks | US4, FR-023, FR-026 |
| 19 | Look at every card | Each shows its own visualization's picture; card sizes match the glyph-only layout | FR-022, FR-024 |
| 20 | Block `/thumbs/*` in DevTools and reload | Cards show their symbol on the gradient, no broken-image icons | FR-024 |
| 21 | `npm run dev`, open `/studio/__thumbnails`, press "Save all" | All 23 files rewritten in `web-client/public/thumbs/` within 2 minutes | FR-027, SC-009 |
| 22 | `npm run build`, then `grep -r __thumbnails dist/` | No match: the generator isn't shipped | FR-027 |

