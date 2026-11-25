# Render audit: every interface component and shared hook

Written for FR-027 and SC-017 (format: `contracts/render-audit.md`). One row per component under `web-client/src`, outside `__tests__`, and one per shared hook.

**How redraws are counted.** `web-client/src/__tests__/helpers/renderProbe.jsx` wraps the function a memoized component was made from and counts how often it actually runs, after `React.memo` has had its say. React's `<Profiler>` cannot do this: it fires whenever its parent redraws, even when a memoized child inside it bails out. A component that is not memoized cannot be instrumented, so a missing `memo` fails a test instead of passing for the wrong reason.

**Decision key.** `memo + stable props` means the component is memoized **and** its parent was changed so the props it receives keep their identity; a `memo` on a child whose parent hands it a new function on every render does nothing. `store subscription` means per-frame data moved out of React state into an external store the component subscribes to.

| File · component | Redraws today (before) | Decision | Derived values | Handlers | Reason (if `none`) | Test |
|---|---|---|---|---|---|---|
| `studio/components/Viewer.jsx` · `Viewer` | On every animated frame: `ctx.reportStats` called `setStats`, so the viewer and all its children redrew up to 60 times a second | store subscription (stats); stable handlers | `sweepingKeys`, `sweepable`, the seed control element, `onRecordStart` in `useMemo` | `scheduleUpdate`, `onKnobChange`, `restartWith`, `onReset`, `onPreset`, `onAction`, `onRestartInstance`, `onSeed`, `onRandomSeed`, `onPlay`, `onPause`, `onStep`, `onSpeed`, `onToggleSweep` in `useCallback` over refs | | T1, T2 |
| `studio/components/StatsReadout.jsx` · `StatsReadout` | (new) | store subscription + `memo` | | | | T2, T7 |
| `studio/components/KnobPanel.jsx` · `KnobPanel` | Rebuilt `visible` and `groups` every render; `onChange={(v) => onChange(k.key, v)}` made a new function per knob per render; `new Set()` default props | memo + stable props | visible knobs and groups in `useMemo` | passes `onChange` straight through | | T1, T7 |
| `studio/components/knobs/RangeKnob.jsx` · `RangeKnob` | Every viewer redraw | memo + stable props | | calls `onChange(knob.key, value)` | | T1, T7 |
| `studio/components/knobs/ChoiceKnob.jsx` · `ChoiceKnob` | same | memo + stable props | | same | | T1, T7 |
| `studio/components/knobs/ToggleKnob.jsx` · `ToggleKnob` | same | memo + stable props | | same | | T1, T7 |
| `studio/components/knobs/TextKnob.jsx` · `TextKnob` | same | memo + stable props | | same | | T1, T7 |
| `studio/components/knobs/PaletteKnob.jsx` · `PaletteKnob` | same | memo + stable props | | same | | T1, T7 |
| `studio/components/knobs/SeedKnob.jsx` · `SeedKnob` | same | memo | | its element is built once in `Viewer` (`useMemo`), so `KnobPanel`'s `children` prop is stable | | T7 |
| `studio/components/PresetMenu.jsx` · `PresetMenu` | Every viewer redraw | memo + stable props | | `onApply` is `onPreset` | | T1, T7 |
| `studio/components/PlaybackBar.jsx` · `PlaybackBar` | Every viewer redraw (the inline arrows below were new on every render) | memo + stable props | | `onPlay`, `onPause`, `onStep`, `onSpeed`, `onReset` | | T1, T7 |
| `studio/components/HowItWorks.jsx` · `HowItWorks` | Every viewer redraw | memo | | | | T1, T7 |
| `studio/components/ActionBar.jsx` · `ActionBar` | (new) | memo + stable props | | `onAction` | | T7 |
| `studio/components/ShareMenu.jsx` · `ShareMenu` | Every viewer redraw | memo | | `onRecordStart` is a `useMemo`d function | It still redraws when `config` changes (it encodes the link from it); that is by design | T7 (structure) |
| `studio/components/SaveDialog.jsx` · `SaveDialog` | Only mounted while open | none | | | Mounted only while the dialog is open; its props change with the viewer's `config` and a redraw while open is the intended behaviour | |
| `studio/components/CatalogGrid.jsx` · `CatalogGrid` | Every page redraw; the filter and the per-category grouping were recomputed and every card rebuilt | memo | filtered list and category groups in `useMemo` on `[query, category]` | | | T3, T4 |
| `studio/components/CatalogCard.jsx` · `CatalogCard` | (extracted from `CatalogGrid`, where it was inline markup) | memo + stable props | | `onOpen` is the page's stable `openViz` | | T3, T4, T7 |
| `studio/components/MyVisualizations.jsx` · `MyVisualizations` | Every page redraw, and every row redrew on each keystroke of a rename | none for the list itself; rows memoized | | rename, duplicate, export and delete handlers in `useCallback`; the draft name is read from a ref | The list container owns the editing state and legitimately redraws when it changes | |
| `studio/components/MyVisualizations.jsx` · `SavedRow` | (extracted) every row redrew whenever any row was being renamed | memo + stable props | | stable handlers | | |
| `studio/components/MyVisualizations.jsx` · `ConfirmDialog` | Mounted only while open | none | | | Mounted only while a delete is being confirmed | |
| `studio/StudioPage.jsx` · `StudioPage` | Re-parsed the route and search params and rebuilt the header on each redraw; inline handlers for every child | useMemo only | route and `URLSearchParams` in `useMemo` | `setFilter`, `onQuery`, `onCategory`, `openViz`, `openSaved`, `goCatalog`, `onMotionChange`, `onSavedFromViz`, `onSavedFromSaved` in `useCallback` | It redraws only on navigation or a preference change; its job is to pick the page | T3, T4 |
| `studio/StudioPage.jsx` · `StudioHeader` | (extracted) rebuilt with the page | memo + stable props | | `navigate`, `onMotionChange` | | |
| `Root.jsx` · `Root` | On navigation only; `nav` was already memoized | none | `nav` already in `useMemo` | `navigate` already in `useCallback` | Already optimized; redraws only when the location changes | |
| `main.jsx` | Mounts once | none | | | Not a component that redraws | |
| `studio/dev/BenchPage.jsx`, `studio/dev/ThumbnailStudio.jsx` | Development pages, not in production builds | none | | | Development-only pages | |
| `App.jsx` · `App` (Playground) | Every keystroke redrew the header, the tools panel, the whole conversation and every message | useMemo + stable handlers | `micButton` and `meta` in `useMemo` | `onTranscript`, `handleDraftChange`, `handleSend`, `toggleMic`, `handleClear`, `handleReadAloud` in `useCallback` | | T5, T6 |
| `components/Header.jsx` · `Header` | Every keystroke | memo + stable props | | `onClear` is `handleClear` | | T5, T7 |
| `components/CapabilityPanel.jsx` · `CapabilityPanel` | Every keystroke | memo + stable props | | `onRun` is the conversation's `runCapability`, which changes only when `pending` does | | T5, T7 |
| `components/CapabilityPanel.jsx` · `CapabilityList` | With its panel | memo | | | | T7 |
| `components/ExchangeList.jsx` · `ExchangeList` | Every keystroke | memo | | | | T5, T7 |
| `components/ExchangeList.jsx` · `Exchange` | Every keystroke, for every message | memo | | | | T5, T6, T7 |
| `components/ExchangeList.jsx` · `InputBubble` | Every keystroke | memo | | | | T7 |
| `components/ToolCallCard.jsx` · `ToolCallCard` | Every keystroke | memo | | | | T5, T6, T7 |
| `components/Composer.jsx` · `Composer` | Every keystroke | none | | | Its `value` changes on every keystroke by design, so memoizing it could never skip a redraw | |
| `components/SchemaForm.jsx` · `SchemaForm` | Mounted only while a tool is selected; keyed per tool | none | | | Local form state redraws it on each edit by design; its parent no longer redraws on typing in the message box | |

## Shared hooks

| Hook | Finding | Change |
|---|---|---|
| `hooks/useConversation.js` | Returned a new object every render, but its handlers were already `useCallback`s and `updateExchange` replaces only the changed exchange, so older messages keep their identity | Returned object in `useMemo` |
| `hooks/useSpeechOutput.js` | New object every render; `speak` and `stop` already stable | Returned object in `useMemo` |
| `hooks/useSpeechInput.js` | New object every render; `start` and `stop` already stable | Returned object in `useMemo` |
| `hooks/useServerStatus.js` | Polled every 10 s and always set a new state object, so the whole page redrew every poll even when nothing changed | The state is kept when `online` is unchanged (`checkedAt` is now "when the status last changed"; nothing read it) |

## Known limits

- `Viewer` itself is not memoized: its parent redraws only on navigation, and a `Viewer` is remounted (by `key`) when the visualization changes, so there is nothing for `memo` to skip.
- The audit lists components that **can** receive unchanged props from a redrawing parent (clarification 3). It does not claim that every redraw in the app is gone: `Composer`, `SaveDialog` and `SchemaForm` redraw because their own props or state change, which is correct.
- The slider-while-animating frame-rate check (SC-009) is a measurement in `measurements.md`, not a unit test.
