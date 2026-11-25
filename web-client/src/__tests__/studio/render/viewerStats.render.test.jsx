// T2: per-frame counters redraw only the readout, not the viewer's controls (research R8, the largest source of redraws).
import { render, screen, act, waitFor } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import Viewer from "../../../studio/components/Viewer.jsx";
import KnobPanel from "../../../studio/components/KnobPanel.jsx";
import PlaybackBar from "../../../studio/components/PlaybackBar.jsx";
import HowItWorks from "../../../studio/components/HowItWorks.jsx";
import PresetMenu from "../../../studio/components/PresetMenu.jsx";
import RangeKnob from "../../../studio/components/knobs/RangeKnob.jsx";
import StatsReadout from "../../../studio/components/StatsReadout.jsx";
import { installCanvasStub } from "../canvasStub.js";
import { stubReducedMotion } from "../browserStubs.js";
import { makeStub } from "../helpers/stubModule.js";
import { instrument } from "../../helpers/renderProbe.jsx";

installCanvasStub();

/** Lets everything the viewer does just after it mounts finish, so a count starts from a quiet page (slower machines settle later). */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

let probes = [];
beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
});
afterEach(() => probes.forEach((p) => p.restore()));

test("60 stats updates while playing redraw only the readout", async () => {
  const readout = instrument(StatsReadout);
  const panel = instrument(KnobPanel);
  const playback = instrument(PlaybackBar);
  const how = instrument(HowItWorks);
  const presets = instrument(PresetMenu);
  const knobs = instrument(RangeKnob);
  probes = [readout, panel, playback, how, presets, knobs];
  const stub = makeStub();
  render(<Viewer entry={stub.entry} active motionPref="off" onBack={() => {}} />);
  await screen.findByRole("heading", { name: "Settings" });
  const ctx = stub.calls.created[0].ctx;
  await settle();
  probes.forEach((p) => p.reset());

  act(() => {
    for (let i = 1; i <= 60; i++) ctx.reportStats({ generation: i });
  });

  expect(await screen.findByText("60")).toBeInTheDocument(); // the readout shows the latest value
  expect(screen.getByText("generation")).toBeInTheDocument();
  expect(readout.count()).toBeGreaterThan(0);
  expect(readout.count()).toBeLessThanOrEqual(60);
  expect(panel.count()).toBe(0);
  expect(knobs.count()).toBe(0);
  expect(playback.count()).toBe(0);
  expect(how.count()).toBe(0);
  expect(presets.count()).toBe(0);
});

test("an unchanged report redraws nothing at all", async () => {
  const readout = instrument(StatsReadout);
  probes = [readout];
  const stub = makeStub();
  render(<Viewer entry={stub.entry} active motionPref="off" onBack={() => {}} />);
  await screen.findByRole("heading", { name: "Settings" });
  const ctx = stub.calls.created[0].ctx;
  act(() => ctx.reportStats({ steps: 5 }));
  await settle();
  readout.reset();
  act(() => {
    for (let i = 0; i < 20; i++) ctx.reportStats({ steps: 5 }); // the same numbers, as a module reports every frame
  });
  expect(readout.count()).toBe(0);
});

test("the readout is gone when a new instance starts, and shows the new counters", async () => {
  const stub = makeStub();
  render(<Viewer entry={stub.entry} active motionPref="off" onBack={() => {}} />);
  await screen.findByRole("heading", { name: "Settings" });
  act(() => stub.calls.created[0].ctx.reportStats({ comparisons: 12 }));
  expect(await screen.findByText("comparisons")).toBeInTheDocument();
  act(() => stub.calls.created[0].ctx.requestRestart({}));
  // The heading is on screen the whole time, so wait for what the test is about: the second instance.
  await waitFor(() => expect(stub.calls.created.length).toBe(2));
  expect(screen.queryByText("comparisons")).toBeNull();
  act(() => stub.calls.created[1].ctx.reportStats({ swaps: 3 }));
  expect(await screen.findByText("swaps")).toBeInTheDocument();
});
