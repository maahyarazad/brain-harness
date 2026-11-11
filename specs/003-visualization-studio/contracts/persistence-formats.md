# Contract: Persistence Formats

Three external formats carry a [Configuration](../data-model.md#configuration): the share link, browser storage, and the export file. All three are versioned, and all three go through the same validation on load (`core/knobs.js` + module `validateView`/`validateInput`), so bad data falls back to defaults with a list of replaced values (FR-022).

## 1. Studio URLs

| URL | Shows |
|---|---|
| `/` | Playground (unchanged) |
| `/studio` | Catalog |
| `/studio?category=<category>&q=<text>` | Catalog filtered |
| `/studio/<vizId>` | Visualization with defaults |
| `/studio/<vizId>?c=<payload>` | Visualization with a shared configuration |
| `/studio/saved/<savedId>` | A saved visualization from this browser's storage |

Unknown `vizId` → catalog with the message "That visualization doesn't exist". Unknown `savedId` → "Not found in this browser" with a link to the catalog.

### Payload

```text
payload = "1." + base64url( deflateRaw( utf8( JSON.stringify(diff) ) ) )
diff    = { v?: {changed knob values}, s?: seed, w?: view, i?: input, p?: presetId }
```

- Only knob values that differ from defaults are included.
- Numbers are rounded to the knob's `step` precision; drawn input is quantized to 1/1000 of the canvas size.
- Drawn input caps: Fourier outline ≤ 512 points, Voronoi ≤ 500 points, Life cells run-length encoded ≤ 4,000 runs. Above a cap, "Copy link" is disabled with the message "Too much drawing for a link. Export a file instead."
- Payloads with an unknown version prefix are ignored (defaults, with a message).

## 2. Browser storage

| Key | Value |
|---|---|
| `vizstudio.v1.saved` | `SavedVisualization[]` as JSON (see data model) |
| `vizstudio.v1.prefs` | `StudioPreferences` as JSON |

- Reads tolerate a missing key, invalid JSON, or invalid records (skipped, and a message says how many).
- Writes catch `QuotaExceededError` and storage being unavailable; the UI says saving failed and offers "Export file".
- Writes from another tab are picked up through the `storage` event so My visualizations stays current.

## 3. Export file

File name: `<saved name, slugified>.vizstudio.json`

```json
{
  "format": "vizstudio",
  "formatVersion": 1,
  "exportedAt": "2026-11-11T10:00:00.000Z",
  "items": [
    {
      "name": "Seahorse valley",
      "config": {
        "vizId": "mandelbrot",
        "values": { "iterations": 1200, "palette": "twilight", "smooth": true },
        "seed": 0,
        "view": { "cx": -0.7453, "cy": 0.1127, "zoom": 650 },
        "input": null,
        "presetId": null
      }
    }
  ]
}
```

- Import accepts files up to 2 MB with `format === "vizstudio"` and a known `formatVersion`.
- Each item is validated; valid items are added as new saved visualizations with fresh ids and regenerated thumbnails.
- The import summary lists items added, items skipped, and values replaced.

## 4. Image download

`canvas.toBlob("image/png")` of the current frame at the canvas's device-pixel size, named `<vizId>-<yyyymmdd-hhmmss>.png`.
