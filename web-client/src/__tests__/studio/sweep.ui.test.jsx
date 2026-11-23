// The "Animated sweep" preset in the viewer (US3).
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../Root.jsx";
import { findEntry } from "../../studio/catalog.js";
import { encodeConfig, decodeConfig } from "../../studio/core/shareLink.js";
import { buildExport, parseImport } from "../../studio/core/exportFile.js";
import { applyPreset, defaultsOf } from "../../studio/core/knobs.js";
import { installCanvasStub, calls, resetCanvasCalls } from "./canvasStub.js";
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


// ---- Choosing which settings are swept (US5) ----

/** Like frames(), but lets the picture finish drawing between frames (Collatz redraws asynchronously). */
async function settledFrames(n) {
  for (let i = 0; i < n; i++) {
    frames(1);
    await act(async () => new Promise((r) => setTimeout(r, 4)));
  }
}

const even = () => screen.getByLabelText("Even-step angle (°) value");
const odd = () => screen.getByLabelText("Odd-step angle (°) value");
const sweepBox = (label) => screen.getByRole("checkbox", { name: `Sweep ${label}` });

function type(input, text) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

/**
 * Collatz with a light picture (20 numbers) and the sweep on. The sweep is switched on with its
 * tick box, not the "Animated sweep" preset, because the preset would put Numbers back to 5000.
 */
async function openCollatzSweeping() {
  const user = await openViz("collatz-coral", "Collatz coral");
  type(screen.getByLabelText("Numbers value"), "20");
  await settledFrames(3); // the knob change is applied on an animation frame
  await user.click(screen.getByRole("checkbox", { name: "Animated sweep" }));
  return user;
}

test("each swept setting gets a tick box, and nothing else does", async () => {
  const user = await openViz("collatz-coral", "Collatz coral");
  expect(screen.queryByRole("checkbox", { name: /^Sweep / })).toBeNull(); // sweep off: no boxes
  type(screen.getByLabelText("Numbers value"), "20"); // few numbers keep the redraws cheap
  await settledFrames(3);
  await user.click(screen.getByRole("checkbox", { name: "Animated sweep" }));
  expect(sweepBox("Even-step angle (°)")).toBeChecked();
  expect(sweepBox("Odd-step angle (°)")).toBeChecked();
  expect(screen.getAllByRole("checkbox", { name: /^Sweep / })).toHaveLength(2); // not "Numbers", and no hidden knob rows
  expect(screen.getAllByText("⟳ sweeping")).toHaveLength(2);
  expect(screen.getByRole("slider", { name: "Even-step angle (°)" })).toHaveAccessibleDescription(/sweeping/);
});

test("unticking a setting takes it out of the sweep and lets the user edit it", async () => {
  const user = await openCollatzSweeping();
  await user.click(sweepBox("Odd-step angle (°)"));
  expect(sweepBox("Odd-step angle (°)")).not.toBeChecked();
  expect(screen.getByRole("slider", { name: "Odd-step angle (°)" })).not.toHaveAccessibleDescription(/sweeping/);
  expect(screen.getByRole("slider", { name: "Even-step angle (°)" })).toHaveAccessibleDescription(/sweeping/);

  const oddStart = odd().value;
  const evenStart = even().value;
  await settledFrames(40);
  expect(odd().value).toBe(oddStart);
  expect(even().value).not.toBe(evenStart);

  type(odd(), "-12"); // inside the sweep's range for this setting (-20 to -8)
  await settledFrames(40);
  expect(odd().value).toBe("-12");
});

test("ticking it again puts it back, continuing from where it is", async () => {
  const user = await openCollatzSweeping();
  await user.click(sweepBox("Odd-step angle (°)"));
  type(odd(), "-12"); // inside the sweep's range for this setting (-20 to -8)
  await settledFrames(10);
  await user.click(sweepBox("Odd-step angle (°)"));
  expect(sweepBox("Odd-step angle (°)")).toBeChecked();
  await settledFrames(1);
  expect(Math.abs(Number(odd().value) + 12)).toBeLessThan(1.5); // no jump
  await settledFrames(40);
  expect(odd().value).not.toBe("-12");
});

test("with nothing ticked the sweep does nothing and says so", async () => {
  const user = await openCollatzSweeping();
  expect(screen.queryByText("Tick at least one setting to sweep.")).toBeNull();
  await user.click(sweepBox("Even-step angle (°)"));
  await user.click(sweepBox("Odd-step angle (°)"));
  expect(screen.getByText("Tick at least one setting to sweep.")).toBeInTheDocument();
  const [e, o] = [even().value, odd().value];
  await settledFrames(40);
  expect([even().value, odd().value]).toEqual([e, o]);
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  await user.click(sweepBox("Odd-step angle (°)"));
  expect(screen.queryByText("Tick at least one setting to sweep.")).toBeNull();
});

test("the zoom of a zoom sweep can be switched off on its own", async () => {
  const user = await openViz("mandelbrot", "Mandelbrot set");
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  const zoom = screen.getByRole("button", { name: "Sweep zoom" });
  expect(zoom).toHaveAttribute("aria-pressed", "true");
  expect(zoom).toHaveTextContent("⟳ sweeping zoom");
  await settledFrames(20);

  await user.click(zoom);
  expect(screen.getByRole("button", { name: "Sweep zoom" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("⟳ sweeping zoom")).toBeNull();
  // Let anything already started finish drawing, then check that nothing is redrawn any more.
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
  resetCanvasCalls();
  await settledFrames(20);
  expect(calls).toHaveLength(0);
  expect(screen.getByText("Tick at least one setting to sweep.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Sweep zoom" }));
  expect(screen.getByRole("button", { name: "Sweep zoom" })).toHaveAttribute("aria-pressed", "true");
});

test("the choice is kept by share links, saved copies and export files", async () => {
  const module = (await findEntry("collatz-coral").load()).default;
  const p = applyPreset(module, "sweep");
  const config = { ...defaultsOf(module), values: { ...p.values, sweepOn_oddAngle: false }, presetId: "sweep" };

  const enc = await encodeConfig(module, config);
  const dec = await decodeConfig(module, enc.payload);
  expect(dec.replaced).toEqual([]);
  expect(dec.config.values).toMatchObject({ sweep: true, sweepOn_oddAngle: false, sweepOn_evenAngle: true });

  const text = JSON.stringify(buildExport([{ name: "Half", config }]));
  const r = await parseImport(text, async (id) => (await findEntry(id).load()).default);
  expect(r.replaced).toEqual([]);
  expect(r.items[0].config.values).toMatchObject({ sweepOn_oddAngle: false, sweepOn_evenAngle: true });
});

test("share links only mention a sweep choice when it differs from the default", async () => {
  const module = (await findEntry("collatz-coral").load()).default;
  const p = applyPreset(module, "sweep");
  const all = await encodeConfig(module, { ...defaultsOf(module), values: p.values, presetId: "sweep" });
  expect(JSON.stringify(all)).not.toContain("sweepOn_");
  const one = await encodeConfig(module, { ...defaultsOf(module), values: { ...p.values, sweepOn_evenAngle: false }, presetId: "sweep" });
  expect(one.payload.length).toBeGreaterThan(all.payload.length);
});

test("links made before this choice existed sweep every setting", async () => {
  const module = (await findEntry("collatz-coral").load()).default;
  const p = applyPreset(module, "sweep");
  const old = { ...defaultsOf(module), values: { ...p.values } };
  delete old.values.sweepOn_evenAngle;
  delete old.values.sweepOn_oddAngle;
  const enc = await encodeConfig(module, old);
  const dec = await decodeConfig(module, enc.payload);
  expect(dec.replaced).toEqual([]);
  expect(dec.config.values).toMatchObject({ sweepOn_evenAngle: true, sweepOn_oddAngle: true });
});

test("Reset to defaults and the Animated sweep preset put every setting back in the sweep", async () => {
  const user = await openCollatzSweeping();
  await user.click(sweepBox("Odd-step angle (°)"));
  expect(sweepBox("Odd-step angle (°)")).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Animated sweep" })); // the preset
  expect(sweepBox("Odd-step angle (°)")).toBeChecked();

  await user.click(sweepBox("Odd-step angle (°)"));
  await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
  expect(screen.queryByRole("checkbox", { name: /^Sweep / })).toBeNull(); // sweep is off again
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  expect(sweepBox("Odd-step angle (°)")).toBeChecked();
});
