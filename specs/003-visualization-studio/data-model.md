# Data Model: Visualization Studio

All data lives in the browser. There is no server-side data. Shapes are described as plain JavaScript objects.

## CatalogEntry

Static metadata for one built-in visualization. Defined in `studio/catalog.js` so the catalog can render without loading every module.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique, kebab-case, stable forever (used in URLs and saved data), e.g. `times-table` |
| `name` | string | Display name |
| `category` | enum | `number-patterns` · `fractals` · `simulation` · `geometry-dynamics` · `algorithms` |
| `summary` | string | One line, ≤ 120 characters |
| `glyph` | string | Symbol shown on the catalog card's category-colored tile (stands in for a preview image) |
| `load` | () → Promise<VisualizationModule> | Lazy `import()` of the module |

The 23 ids: `collatz-coral`, `ulam-spiral`, `recaman`, `times-table`, `pascal-mod`, `mandelbrot`, `julia`, `chaos-game`, `l-system`, `barnsley-fern`, `game-of-life`, `elementary-ca`, `gray-scott`, `boids`, `langtons-ant`, `dla`, `lorenz`, `double-pendulum`, `voronoi`, `fourier-epicycles`, `phyllotaxis`, `sorting`, `maze`.

## KnobDefinition

One setting a module exposes. The knob panel is generated from these.

| Field | Type | Rules |
|---|---|---|
| `key` | string | Unique within the module; becomes a key in `Configuration.values` |
| `label` | string | Visible label |
| `type` | enum | `range` · `choice` · `toggle` · `text` · `palette` · `seed` |
| `default` | any | Must itself be valid for the knob |
| `min`, `max`, `step` | number | `range` only; `min < max`, `step > 0` |
| `scale` | `linear` \| `log` | `range` only; default `linear` (log for zoom, counts) |
| `options` | `{value, label}[]` | `choice` only; ≥ 2 options |
| `pattern`, `maxLength` | RegExp, number | `text` only (e.g. Langton rule `^[LR]{2,12}$`) |
| `parse` | (text) → {ok, value \| error} | `text` only, optional; for structured text like L-system rules |
| `help` | string | Optional tooltip text |
| `group` | string | Optional section heading in the panel |
| `when` | (values) → boolean | Optional; hide the knob unless true (e.g. heuristic only when solver is A*) |
| `live` | boolean | Default `true`. `false` means the change applies on release / Enter (for knobs that restart a heavy computation) |

**Validation** (`core/knobs.js`, used for UI input, saved data, links, and imports):
- `range`: non-numbers → default; out of range → clamped; snapped to `step`.
- `choice`: unknown value → default.
- `toggle`: coerced to boolean.
- `text`: fails `pattern`/`parse` → keep previous valid value in the UI; → default when loading.
- `seed`: integer in 0..2³²−1, else default.
- Unknown keys are dropped. Every replaced value is reported as `{key, given, used}` so the UI can list them (FR-022).

## Preset

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique within the module |
| `name` | string | Display name, e.g. "Rule 110" |
| `values` | partial values | Valid against the module's knobs; unspecified keys keep defaults |
| `input` | object | Optional drawn input the preset starts from (e.g. the Gosper glider gun's cells). Applying any preset replaces the current drawn input with this, or clears it |

## Configuration

A full description of what's on screen for one visualization. It is what gets saved, shared, and exported.

| Field | Type | Rules |
|---|---|---|
| `vizId` | string | A `CatalogEntry.id` |
| `values` | `{[knobKey]: any}` | Validated against the module's knobs |
| `seed` | integer | 0..2³²−1; present for random modules |
| `view` | object | Optional; module-defined, e.g. `{cx, cy, zoom}` for fractals, `{yaw, pitch}` for Lorenz. Validated by the module's `validateView` |
| `input` | object | Optional; user-drawn data, module-defined: Voronoi `points`, Fourier `outline`, Life `cells`, maze `walls`/`start`/`end`. Validated by the module's `validateInput` |
| `presetId` | string \| null | The preset last applied, cleared when a knob changes |

**Equality**: two configurations with the same fields must produce the same picture (same final frame for static modules; same initial state and same state after k steps for animated ones).

## SavedVisualization

A configuration the user saved under a name.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Random id (`crypto.randomUUID()`) |
| `name` | string | 1–80 characters, trimmed; duplicates allowed |
| `config` | Configuration | As above |
| `thumbnail` | string | JPEG data URL, 160×120 |
| `createdAt`, `updatedAt` | ISO 8601 string | `updatedAt ≥ createdAt` |
| `formatVersion` | integer | `1` |

**Operations**: create (Save), overwrite (Save on an opened item → updates `config`, `thumbnail`, `updatedAt`), rename, duplicate (new `id`, name "… copy"), delete (after confirmation), export, import (gets a new `id`).

## Viewer state (in memory only)

```text
          select entry / open saved / open link
idle ─────────────────────────────────────────▶ loading
                                                  │ module loaded
                                                  ▼
          ┌──────────── knob change ─────── computing ──(progress)──┐
          │                                  │ done                  │ cancel on change / leave
          │                                  ▼                       │
          └─────────────────────────────── ready ◀───────────────────┘
                                             │ (animated only)
                                   play ▲    ▼ pause / tab hidden
                                        playing
leave or switch visualization (any state) ─▶ destroyed (loop stopped, workers terminated)
```

- `computing` shows a progress indicator after 1 s (FR-023).
- Animated modules enter `ready` paused when reduced motion is on, else `playing`.
- `step` is allowed from `ready` (paused).

## StudioPreferences

`localStorage` key `vizstudio.v1.prefs`: `{ reducedMotion: "system" | "on" | "off", lastCategory: string | null }`. Per-browser convenience only.
