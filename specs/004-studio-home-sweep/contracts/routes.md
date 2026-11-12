# Contract: Site routes and studio navigation

This replaces the "Sections" part of the 003 navigation. Studio URL formats (`specs/003-visualization-studio/contracts/persistence-formats.md` §1) are unchanged.

## Paths

| Path | Renders | URL after load | Notes |
|---|---|---|---|
| `/` | Studio catalog | `/studio` + original query, via `replaceState` | no extra history entry |
| `/studio` | Catalog | unchanged | `?q=` / `?category=` filters as before |
| `/studio?view=mine` | My visualizations, with a back link | unchanged | |
| `/studio/<vizId>` | Viewer | unchanged | `?c=` share payload as before |
| `/studio/saved/<id>` | Saved viewer | unchanged | |
| `/playground` | Playground (`App`) | unchanged | lazy-loaded; never linked from the UI |
| any other path | Studio catalog | `/studio` via `replaceState` | |

## Page chrome

- There is no section switcher (`nav.topnav` is removed). The studio header stays as it is.
- The document title is "Visualization Studio · Brain Harness" on studio paths and "Brain Harness" on `/playground`.
- No element on any studio page has the text "Playground" or links to `/playground`.

## Back link on My visualizations

```html
<div class="viewer-toolbar">
  <a class="btn" href="/studio" aria-label="Back to catalog">← Catalog</a>
  <h2>My visualizations</h2>
</div>
```

- A plain left click calls `navigate("/studio")`, which pushes a history entry. Modified clicks (ctrl, meta, shift, middle) are left to the browser.
- It is shown in both the empty state and the list state.

## Loading

- Studio paths MUST NOT import or mount the Playground module. Its chunk is requested only on `/playground`.
- `/playground` MUST NOT import the studio chunk.
