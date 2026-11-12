// The "Animated sweep" preset in the viewer (US3).
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../Root.jsx";
import { findEntry } from "../../studio/catalog.js";
import { encodeConfig, decodeConfig } from "../../studio/core/shareLink.js";
import { buildExport, parseImport } from "../../studio/core/exportFile.js";
import { applyPreset, defaultsOf } from "../../studio/core/knobs.js";
import { installCanvasStub } from "./canvasStub.js";
import { createFrameDriver, stubReducedMotion, installMediaRecorder, removeMediaRecorder } from "./browserStubs.js";

installCanvasStub();

let driver, origRaf, origCaf, clock, nowSpy;

beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
  driver = createFrameDriver();
  origRaf = globalThis.requestAnimationFrame;
  origCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = driver.raf;
  globalThis.cancelAnimationFrame = driver.caf;
  clock = 1000;
  nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
  nowSpy.mockRestore();
});

/** Advances n animation frames of 50 ms each. */
function frames(n) {
  act(() => {
    for (let i = 0; i < n; i++) {
      clock += 50;
      driver.advanceFrames(1);
    }
  });
}

async function openViz(id, heading) {
  window.history.replaceState(null, "", `/studio/${id}`);
  render(<Root />);
  await screen.findByRole("heading", { name: heading, level: 2 });
  await screen.findByRole("heading", { name: "Settings" });
  return userEvent.setup({ advanceTimers: () => {} });
}

const angle = () => screen.getByLabelText("Angle (°) value");

test("Animated sweep on a still picture: the swept setting moves, and pause stops it", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull(); // still picture: no playback bar
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));

  expect(screen.getByRole("checkbox", { name: "Animated sweep" })).toBeChecked();
  expect(screen.getByLabelText("Sweep speed value")).toHaveValue("1");
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  // Only the swept setting is marked as sweeping.
  expect(screen.getByRole("slider", { name: "Angle (°)" })).toHaveAccessibleDescription(/sweeping/);
  expect(screen.getByRole("slider", { name: "Spacing" })).not.toHaveAccessibleDescription(/sweeping/);

  const start = angle().value;
  frames(40);
  const moved = angle().value;
  expect(moved).not.toBe(start);

  await user.click(screen.getByRole("button", { name: "Pause" }));
  frames(40);
  expect(angle().value).toBe(moved);

  await user.click(screen.getByRole("button", { name: "Play" }));
  frames(40);
  expect(angle().value).not.toBe(moved);
});

test("turning the sweep off stops it and hides the playback bar", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  await user.click(screen.getByRole("checkbox", { name: "Animated sweep" }));
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  expect(screen.queryByLabelText("Sweep speed value")).toBeNull();
  const v = angle().value;
  frames(40);
  expect(angle().value).toBe(v);
});

test("with reduced motion, the sweep preset starts paused", async () => {
  stubReducedMotion(true);
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
  const v = angle().value;
  frames(40);
  expect(angle().value).toBe(v);
});

test("Record video is offered while a still picture is sweeping", async () => {
  installMediaRecorder({ types: ["video/webm"] });
  try {
    const user = await openViz("phyllotaxis", "Phyllotaxis");
    expect(screen.queryByRole("button", { name: "Record video" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Animated sweep" }));
    expect(screen.getByRole("button", { name: "Record video" })).toBeInTheDocument();
  } finally {
    removeMediaRecorder();
  }
});

test("the Mandelbrot sweep zooms without errors and says the zoom is sweeping", async () => {
  const user = await openViz("mandelbrot", "Mandelbrot set");
  // Sweep off: a still module is never re-rendered per frame (it has no render()).
  frames(10);
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  expect(screen.getByText("⟳ sweeping zoom")).toBeInTheDocument();
  frames(20);
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
});

test("Times-table keeps its own sweep preset", async () => {
  const user = await openViz("times-table", "Times-table circle");
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  expect(screen.getByRole("checkbox", { name: "Animate m" })).toBeChecked();
  expect(screen.getByLabelText("Animation rate value")).toHaveValue("0.005");
  expect(screen.queryByRole("checkbox", { name: "Animated sweep" })).toBeNull();
});

// ---- Persistence (FR-015, FR-016) ----

async function sweepingConfig(id) {
  const module = (await findEntry(id).load()).default;
  const p = applyPreset(module, "sweep");
  return { module, config: { ...defaultsOf(module), values: { ...p.values, sweepSpeed: 2.5 }, presetId: "sweep" } };
}

test("a share link keeps the sweep and its speed", async () => {
  const { module, config } = await sweepingConfig("phyllotaxis");
  const enc = await encodeConfig(module, config);
  const dec = await decodeConfig(module, enc.payload);
  expect(dec.replaced).toEqual([]);
  expect(dec.config.values).toMatchObject({ sweep: true, sweepSpeed: 2.5 });
});

test("an export file keeps the sweep through import", async () => {
  const { config } = await sweepingConfig("julia");
  const text = JSON.stringify(buildExport([{ name: "Morph", config }]));
  const r = await parseImport(text, async (id) => (await findEntry(id).load()).default);
  expect(r.replaced).toEqual([]);
  expect(r.items[0].config.values).toMatchObject({ sweep: true, sweepSpeed: 2.5 });
});

test("links made before sweeps existed open with the sweep off and no notice", async () => {
  const module = (await findEntry("phyllotaxis").load()).default;
  const plain = { ...defaultsOf(module), values: { ...defaultsOf(module).values } };
  delete plain.values.sweep;
  delete plain.values.sweepSpeed;
  const enc = await encodeConfig(module, plain);
  const dec = await decodeConfig(module, enc.payload);
  expect(dec.replaced).toEqual([]);
  expect(dec.error).toBeUndefined();
  expect(dec.config.values.sweep).toBe(false);
});
