// T7 (specs/005 contracts/render-audit.md): each interface part that can receive unchanged props from a
// parent that redraws is memoized, and skips the redraw (FR-027). Each is mounted on its own, its parent is
// redrawn with equal props, and its function must not run again. A part that is not memoized cannot even
// be instrumented, so this fails loudly.
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RangeKnob from "../../../studio/components/knobs/RangeKnob.jsx";
import ChoiceKnob from "../../../studio/components/knobs/ChoiceKnob.jsx";
import ToggleKnob from "../../../studio/components/knobs/ToggleKnob.jsx";
import TextKnob from "../../../studio/components/knobs/TextKnob.jsx";
import PaletteKnob from "../../../studio/components/knobs/PaletteKnob.jsx";
import SeedKnob from "../../../studio/components/knobs/SeedKnob.jsx";
import KnobPanel from "../../../studio/components/KnobPanel.jsx";
import PresetMenu from "../../../studio/components/PresetMenu.jsx";
import PlaybackBar from "../../../studio/components/PlaybackBar.jsx";
import HowItWorks from "../../../studio/components/HowItWorks.jsx";
import ActionBar from "../../../studio/components/ActionBar.jsx";
import CatalogCard from "../../../studio/components/CatalogCard.jsx";
import StatsReadout from "../../../studio/components/StatsReadout.jsx";
import { createStatsStore } from "../../../studio/core/statsStore.js";
import Header from "../../../components/Header.jsx";
import CapabilityPanel, { CapabilityList } from "../../../components/CapabilityPanel.jsx";
import ExchangeList, { Exchange, InputBubble } from "../../../components/ExchangeList.jsx";
import ToolCallCard from "../../../components/ToolCallCard.jsx";
import { CATALOG } from "../../../studio/catalog.js";
import { instrument } from "../../helpers/renderProbe.jsx";

vi.mock("../../../api.js", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  getCapabilities: vi.fn().mockResolvedValue({ tools: [], prompts: [] }),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

const noop = () => {};
const RANGE = { key: "r", label: "R", type: "range", min: 0, max: 10, step: 1, default: 5 };
const CHOICE = { key: "c", label: "C", type: "choice", default: "x", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] };
const MODULE = {
  id: "m", name: "M", howItWorks: "text", animated: true, interactive: false, random: false,
  knobs: [RANGE, CHOICE], presets: [],
};
const EXCHANGE = { id: "e1", kind: "chat", source: "text", input: "hello", toolCalls: [], output: "hi", status: "done", error: null, renderedPrompt: null };
const CALL = { id: "t1", name: "tool", input: { a: 1 }, output: "ok", isError: false };
const STORE = createStatsStore();
STORE.set({ steps: 1 });

// name → [component, props]. The props object is created once, so a parent redraw hands the same values again.
const CASES = [
  ["RangeKnob", RangeKnob, { knob: RANGE, value: 5, onChange: noop }],
  ["ChoiceKnob", ChoiceKnob, { knob: CHOICE, value: "x", onChange: noop }],
  ["ToggleKnob", ToggleKnob, { knob: { key: "t", label: "T", type: "toggle", default: false }, value: false, onChange: noop }],
  ["TextKnob", TextKnob, { knob: { key: "w", label: "W", type: "text", default: "hi", maxLength: 5 }, value: "hi", onChange: noop }],
  ["PaletteKnob", PaletteKnob, { knob: { key: "p", label: "P", type: "palette", default: "viridis" }, value: "viridis", onChange: noop }],
  ["SeedKnob", SeedKnob, { seed: 1, onChange: noop, onRandomize: noop }],
  ["KnobPanel", KnobPanel, { module: MODULE, values: { r: 5, c: "x" }, onChange: noop, onReset: noop }],
  ["PresetMenu", PresetMenu, { presets: [{ id: "p", name: "P", values: {} }], activeId: null, onApply: noop }],
  ["PlaybackBar", PlaybackBar, { playing: true, speed: 1, onPlay: noop, onPause: noop, onStep: noop, onSpeed: noop, onReset: noop }],
  ["HowItWorks", HowItWorks, { text: "how it works" }],
  ["ActionBar", ActionBar, { actions: [{ id: "a", label: "A", title: "a" }], onAction: noop }],
  ["StatsReadout", StatsReadout, { store: STORE }],
  ["CatalogCard", CatalogCard, { entry: CATALOG[0], onOpen: noop }],
  ["Header", Header, { online: true, canClear: false, onClear: noop }],
  ["CapabilityPanel", CapabilityPanel, { onRun: noop, disabled: false }],
  ["CapabilityList", CapabilityList, { items: [], selected: null, onSelect: noop }],
  ["ExchangeList", ExchangeList, { exchanges: [EXCHANGE] }],
  ["Exchange", Exchange, { exchange: EXCHANGE }],
  ["InputBubble", InputBubble, { exchange: EXCHANGE }],
  ["ToolCallCard", ToolCallCard, { call: CALL }],
];

function Parent({ Component, props }) {
  const [n, setN] = useState(0);
  return (
    <div>
      <button onClick={() => setN((v) => v + 1)}>redraw the parent {n}</button>
      <Component {...props} />
    </div>
  );
}

describe.each(CASES)("%s", (_name, Component, props) => {
  test("is memoized and skips a redraw when its parent redraws with the same props", () => {
    const probe = instrument(Component);
    render(<Parent Component={Component} props={props} />);
    expect(probe.count()).toBe(1);
    probe.reset();
    const again = screen.getByRole("button", { name: /redraw the parent/ });
    fireEvent.click(again);
    fireEvent.click(again);
    fireEvent.click(again);
    expect(screen.getByRole("button", { name: "redraw the parent 3" })).toBeInTheDocument(); // the parent did redraw
    expect(probe.count()).toBe(0);
    probe.restore();
  });
});
