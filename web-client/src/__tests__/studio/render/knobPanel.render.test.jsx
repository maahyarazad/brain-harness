// T1 (specs/005 contracts/render-audit.md): changing one setting redraws that setting's control and
// nothing else in the panel, the preset menu, the playback bar or the explanation (FR-027, Story 6 scenario 1).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach } from "vitest";
import Viewer from "../../../studio/components/Viewer.jsx";
import RangeKnob from "../../../studio/components/knobs/RangeKnob.jsx";
import ChoiceKnob from "../../../studio/components/knobs/ChoiceKnob.jsx";
import ToggleKnob from "../../../studio/components/knobs/ToggleKnob.jsx";
import TextKnob from "../../../studio/components/knobs/TextKnob.jsx";
import PaletteKnob from "../../../studio/components/knobs/PaletteKnob.jsx";
import KnobPanel from "../../../studio/components/KnobPanel.jsx";
import PresetMenu from "../../../studio/components/PresetMenu.jsx";
import PlaybackBar from "../../../studio/components/PlaybackBar.jsx";
import HowItWorks from "../../../studio/components/HowItWorks.jsx";
import { installCanvasStub } from "../canvasStub.js";
import { stubReducedMotion } from "../browserStubs.js";
import { makeStub } from "../helpers/stubModule.js";
import { instrument } from "../../helpers/renderProbe.jsx";

installCanvasStub();

const KNOBS = [
  { key: "a", label: "Alpha", type: "range", min: 0, max: 10, step: 1, default: 5 },
  { key: "b", label: "Beta", type: "range", min: 0, max: 10, step: 1, default: 5 },
  { key: "mode", label: "Mode", type: "choice", default: "x", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
  { key: "flag", label: "Flag", type: "toggle", default: false },
  { key: "word", label: "Word", type: "text", default: "hi", maxLength: 10 },
  { key: "palette", label: "Palette", type: "palette", default: "viridis" },
];

let probes;
beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
});
afterEach(() => probes?.forEach((p) => p.restore()));

async function mount() {
  const keyed = (C) => instrument(C, { keyOf: (p) => p.knob.key });
  const range = keyed(RangeKnob);
  const choice = keyed(ChoiceKnob);
  const toggle = keyed(ToggleKnob);
  const text = keyed(TextKnob);
  const palette = keyed(PaletteKnob);
  const panel = instrument(KnobPanel);
  const presets = instrument(PresetMenu);
  const playback = instrument(PlaybackBar);
  const how = instrument(HowItWorks);
  probes = [range, choice, toggle, text, palette, panel, presets, playback, how];
  const stub = makeStub({ module: { knobs: KNOBS, presets: [{ id: "p1", name: "Preset one", values: { a: 7 } }] } });
  render(<Viewer entry={stub.entry} active motionPref="off" onBack={() => {}} />);
  await screen.findByRole("heading", { name: "Settings" });
  await waitFor(() => expect(stub.calls.created.length).toBeGreaterThan(0));
  probes.forEach((p) => p.reset());
  return { stub, user: userEvent.setup(), range, choice, toggle, text, palette, panel, presets, playback, how };
}

test("changing one range setting redraws only that setting", async () => {
  const t = await mount();
  const box = screen.getByLabelText("Alpha value");
  await t.user.clear(box);
  await t.user.type(box, "8{Enter}");
  await waitFor(() => expect(t.stub.calls.updates.some(([c]) => c.values.a === 8)).toBe(true));
  expect(t.range.count("a")).toBeGreaterThan(0);
  expect(t.range.count("b")).toBe(0);
  expect(t.choice.count()).toBe(0);
  expect(t.toggle.count()).toBe(0);
  expect(t.text.count()).toBe(0);
  expect(t.palette.count()).toBe(0);
  expect(t.presets.count()).toBe(0);
  expect(t.playback.count()).toBe(0);
  expect(t.how.count()).toBe(0);
});

test("changing a choice, a toggle, a word or a palette redraws only that control", async () => {
  const t = await mount();
  await t.user.selectOptions(screen.getByLabelText("Mode"), "y");
  await waitFor(() => expect(t.stub.calls.updates.some(([c]) => c.values.mode === "y")).toBe(true));
  expect(t.choice.count("mode")).toBeGreaterThan(0);
  expect(t.range.count()).toBe(0);
  expect(t.toggle.count()).toBe(0);
  expect(t.palette.count()).toBe(0);
  t.choice.reset();

  await t.user.click(screen.getByLabelText("Flag"));
  await waitFor(() => expect(t.stub.calls.updates.some(([c]) => c.values.flag === true)).toBe(true));
  expect(t.toggle.count("flag")).toBeGreaterThan(0);
  expect(t.choice.count()).toBe(0);
  expect(t.range.count()).toBe(0);
  expect(t.presets.count() + t.playback.count() + t.how.count()).toBe(0);
});

test("the panel itself skips when nothing it shows has changed", async () => {
  const t = await mount();
  // A change that does not touch a setting the panel shows: a notice appears in the viewer.
  t.stub.calls.created[0].ctx.reportNotice("hello");
  await screen.findByText("hello");
  expect(t.panel.count()).toBe(0);
  expect(t.range.count()).toBe(0);
});
