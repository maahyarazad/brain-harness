# Contract: Interface redraw audit and redraw-count tests

Implements FR-027 to FR-031 and SC-012, SC-017 (research R8). The audit is written during implementation as `specs/005-navier-stokes-fluid-performance/render-audit.md`.

## The audit file

One table row per component (including internal components such as `InputBubble`, `Exchange`, `CapabilityList`), covering every `.jsx` file under `web-client/src` outside `__tests__`, and one row per shared hook. Columns:

| Column | Content |
|---|---|
| File and component | `studio/components/knobs/RangeKnob.jsx` · `RangeKnob` |
| Redraws today | The cause, from research R8 (for example "Viewer stats update, up to 60 per second") |
| Decision | `memo`, `memo + stable props`, `store subscription`, `useMemo only`, or `none` |
| Derived values | What was wrapped in `useMemo`, and what it depends on |
| Handlers | What was wrapped in `useCallback`, and what it depends on |
| Reason | Required when the decision is `none` or `useMemo only` (for example "value changes on every keystroke by design") |
| Test | The redraw-count test that covers it, or "n/a" with the reason |

Rules:
- A component is memoized if it can receive unchanged props from a parent that redraws (clarification 3). A component that redraws only together with its parent gets `none` with that as the reason.
- `memo` is never added with a custom comparator to hide an unstable prop. The unstable prop is fixed in the parent.
- A change must not show stale information. If a prop a component displays changes, the component redraws (spec edge case "Interface changes that alter behavior").
- Hooks: `useConversation`, `useSpeechInput`, `useSpeechOutput`, `useServerStatus` return objects whose handler members keep their identity between renders; the audit records which already do.

## Known starting points (from reading the code)

| Component | Expected decision |
|---|---|
| `Viewer` | stats moved to a store; handlers via `useCallback` reading `configRef`; sets and arrays memoized |
| `StatsReadout` (new) | `store subscription` |
| `KnobPanel` | `memo + stable props`; groups via `useMemo`; `onChange` passed straight through |
| `RangeKnob`, `ChoiceKnob`, `ToggleKnob`, `TextKnob`, `PaletteKnob`, `SeedKnob` | `memo`; call `onChange(knob.key, value)` |
| `PresetMenu`, `PlaybackBar`, `HowItWorks`, `ShareMenu` | `memo` |
| `CatalogGrid` | filtered list and category groups via `useMemo`; cards extracted |
| `CatalogCard` (new) | `memo` |
| `MyVisualizations` rows | `memo` per row |
| `StudioPage` | route and header via `useMemo` / `useCallback` |
| `App` (Playground) | handlers via `useCallback`; `micButton` and `meta` via `useMemo` |
| `Header`, `CapabilityPanel`, `ExchangeList`, `Exchange`, `InputBubble`, `ToolCallCard`, `CapabilityList` | `memo` |
| `Composer`, `SaveDialog` | expected `none`: their props change with each keystroke or they are mounted only while open |

## Redraw-count tests (FR-031)

Helper: `src/__tests__/helpers/renderProbe.jsx`.
- `probe(modulePath, exportName?)` for `vi.mock` returns a memoized counting wrapper around the real component and exposes `counts` by a key the test chooses (for example the knob's `key`). It proves **the parent passes stable props**.
- `<Isolated>` mounts one real component inside a `React.Profiler` and re-renders its parent with unrelated state, returning the profiler's commit count. It proves **the component skips redraws with unchanged props**.

| # | Interaction | Expected count |
|---|---|---|
| T1 | Change one knob in `KnobPanel` (Viewer mounted with a stub module) | the changed knob: 1; every other knob, `PresetMenu`, `PlaybackBar`, `HowItWorks`: 0 |
| T2 | 60 `reportStats` updates while playing | `StatsReadout`: 60 or fewer; `Viewer`, `KnobPanel`, `PlaybackBar`: 0 |
| T3 | Type 5 characters in the catalog search | cards that stay visible: 0 each; cards that become hidden unmount |
| T4 | Switch the category filter | cards visible both before and after: 0 |
| T5 | Type 5 characters in the Playground composer | `Header`, `CapabilityPanel`, `ExchangeList`, each `Exchange` and `ToolCallCard`: 0 |
| T6 | A new message arrives | previous `Exchange` components: 0; the new one: 1 |
| T7 | Isolated: each memoized component with unchanged props | profiler commits after a parent re-render: 0 |

Existing tests for these components keep passing unchanged (FR-030, SC-012). The slider-while-animating frame-rate check (SC-009) is a measurement in the bench page, not a unit test.
