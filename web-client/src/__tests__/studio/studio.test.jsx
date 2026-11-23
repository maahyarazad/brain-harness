import { render, screen, waitFor, within, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../Root.jsx";
import { installCanvasStub } from "./canvasStub.js";
import { stubReducedMotion, installMediaRecorder, removeMediaRecorder, FakeMediaRecorder } from "./browserStubs.js";
import { listSaved } from "../../studio/core/storage.js";

vi.mock("../../api.js", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  getCapabilities: vi.fn().mockResolvedValue({ tools: [], prompts: [] }),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

installCanvasStub();

beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
});
afterEach(() => vi.restoreAllMocks());

async function openStudio(path = "/studio") {
  window.history.replaceState(null, "", path);
  render(<Root />);
  const user = userEvent.setup();
  return user;
}

async function openViz(id, heading) {
  const user = await openStudio(`/studio/${id}`);
  await screen.findByRole("heading", { name: heading, level: 2 });
  await screen.findByRole("heading", { name: "Settings" });
  return user;
}

// ---- US1: catalog and viewer ----

test("the catalog lists 23 visualizations in 5 categories", async () => {
  await openStudio();
  for (const name of ["Number patterns", "Fractals", "Simulation and emergence", "Geometry and dynamics", "Algorithm visualizations"]) {
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
  }
  const cards = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/studio/"));
  expect(cards).toHaveLength(23);
});

test("search filters by name and summary", async () => {
  const user = await openStudio();
  await user.type(await screen.findByPlaceholderText("Search visualizations"), "spiral");
  const cards = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/studio/"));
  expect(cards.length).toBeGreaterThan(0);
  cards.forEach((c) => expect(c.textContent.toLowerCase()).toContain("spiral"));
  expect(screen.getByRole("link", { name: /Ulam spiral/ })).toBeInTheDocument();
});

test("clicking a card opens the viewer with its explanation", async () => {
  const user = await openStudio();
  await user.click(await screen.findByRole("link", { name: /Phyllotaxis/ }));
  expect(await screen.findByRole("heading", { name: "Phyllotaxis", level: 2 })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Phyllotaxis/ })).toBeInTheDocument();
  expect(screen.getByText(/golden angle/)).toBeInTheDocument();
  expect(window.location.pathname).toBe("/studio/phyllotaxis");
});

test("leaving a visualization destroys its instance", async () => {
  const mod = (await import("../../studio/visualizations/phyllotaxis/index.js")).default;
  const destroy = vi.fn();
  const orig = mod.create;
  vi.spyOn(mod, "create").mockImplementation((...args) => {
    const inst = orig(...args);
    return { ...inst, destroy: () => (destroy(), inst.destroy()) };
  });
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "← Catalog" }));
  await screen.findByRole("heading", { name: "Fractals" });
  expect(destroy).toHaveBeenCalled();
});

// ---- US2: knobs, presets, playback ----

test("every visible knob has a labelled control", async () => {
  await openViz("phyllotaxis", "Phyllotaxis");
  for (const label of ["Angle (°)", "Points", "Spacing", "Dot size", "Palette"]) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
});

test("out-of-range input is clamped with a note", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const box = screen.getByLabelText("Points value");
  await user.clear(box);
  await user.type(box, "999999{Enter}");
  expect(box).toHaveValue("20000");
  expect(screen.getByText("Max is 20000")).toBeInTheDocument();
});

test("knob changes reach the instance", async () => {
  const mod = (await import("../../studio/visualizations/phyllotaxis/index.js")).default;
  const updates = [];
  const orig = mod.create;
  vi.spyOn(mod, "create").mockImplementation((...args) => {
    const inst = orig(...args);
    return { ...inst, update: (c, keys) => (updates.push([c.values.angle, keys]), inst.update(c, keys)) };
  });
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const box = screen.getByLabelText("Angle (°) value");
  await user.clear(box);
  await user.type(box, "137.6{Enter}");
  await waitFor(() => expect(updates).toContainEqual([137.6, ["angle"]]));
});

test("an invalid rule shows an inline error and is not applied", async () => {
  const user = await openViz("l-system", "L-system");
  const rules = screen.getByLabelText("Rules (one per line)");
  await user.clear(rules);
  await user.type(rules, "F=F[[");
  expect(screen.getByRole("alert")).toHaveTextContent(/brackets/);
  expect(rules).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Apply rules" })).toBeDisabled();
});

test("presets set values and Reset restores defaults", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const preset = screen.getByRole("button", { name: "137.6° (broken)" });
  await user.click(preset);
  expect(preset).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Angle (°) value")).toHaveValue("137.6");
  await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
  expect(screen.getByLabelText("Angle (°) value")).toHaveValue("137.508");
  expect(preset).toHaveAttribute("aria-pressed", "false");
});

test("playback controls play, pause and step", async () => {
  const user = await openViz("sorting", "Sorting algorithms");
  const play = await screen.findByRole("button", { name: "Pause" });
  expect(play).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Step" })).toBeDisabled();
  await user.click(play);
  expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Step" }));
  expect(await screen.findByText("comparisons")).toBeInTheDocument();
});

test("with reduced motion, animations start paused", async () => {
  stubReducedMotion(true);
  await openViz("sorting", "Sorting algorithms");
  expect(await screen.findByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
});

test("random visualizations have a seed with a randomize button", async () => {
  const user = await openViz("chaos-game", "Chaos game");
  const seed = screen.getByLabelText("Random seed");
  expect(seed).toHaveValue("1");
  await user.click(screen.getByRole("button", { name: "Randomize" }));
  await waitFor(() => expect(seed).not.toHaveValue("1"));
});

test("controls can be reached with the keyboard", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const reached = new Set();
  for (let i = 0; i < 40; i++) {
    await user.tab();
    reached.add(document.activeElement);
  }
  expect(reached).toContain(screen.getByLabelText("Angle (°)"));
  expect(reached).toContain(screen.getByLabelText("Palette"));
  expect(reached).toContain(screen.getByRole("button", { name: "Save" }));
});

// ---- US3: saving ----

test("save, reopen, rename, duplicate and delete", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const box = screen.getByLabelText("Angle (°) value");
  await user.clear(box);
  await user.type(box, "90{Enter}");
  await user.click(screen.getByRole("button", { name: "Save" }));
  const name = screen.getByLabelText("Name");
  await user.clear(name);
  await user.type(name, "Four arms");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(window.location.pathname).toMatch(/^\/studio\/saved\//));
  expect(await screen.findByRole("heading", { name: /Four arms/, level: 2 })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Angle (°) value")).toHaveValue("90"));
  expect(listSaved().items[0].config.values.angle).toBe(90);

  await user.click(screen.getByRole("button", { name: "← Catalog" }));
  const mine = await screen.findByRole("region", { name: "My visualizations" });
  expect(within(mine).getByRole("button", { name: "Four arms" })).toBeInTheDocument();

  await user.click(within(mine).getByRole("button", { name: "Duplicate" }));
  expect(await within(mine).findByRole("button", { name: "Four arms copy" })).toBeInTheDocument();

  await user.click(within(mine).getAllByRole("button", { name: "Rename" })[0]);
  const input = within(mine).getByLabelText("New name");
  await user.clear(input);
  await user.type(input, "Cross{Enter}");
  expect(await within(mine).findByRole("button", { name: "Cross" })).toBeInTheDocument();

  await user.click(within(mine).getAllByRole("button", { name: "Delete" })[0]);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(listSaved().items).toHaveLength(1));
});

test("a storage failure is shown in the save dialog", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
  });
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/storage for this site is full/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export file instead" })).toBeInTheDocument();
});

// ---- US4: share and export ----

test("copy link encodes the settings, and the link restores them", async () => {
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  const writeText = vi.spyOn(navigator.clipboard, "writeText");
  const box = screen.getByLabelText("Spacing value");
  await user.clear(box);
  await user.type(box, "12{Enter}");
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  const url = new URL(writeText.mock.calls[0][0]);
  expect(url.pathname).toBe("/studio/phyllotaxis");
  expect(url.searchParams.get("c")).toMatch(/^1\./);

  const { unmount } = { unmount: () => document.body.replaceChildren() };
  unmount();
  window.history.replaceState(null, "", url.pathname + url.search);
  render(<Root />);
  await waitFor(() => expect(screen.getByLabelText("Spacing value")).toHaveValue("12"));
});

test("download image saves a PNG with a dated name", async () => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  const names = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    names.push(this.download);
  });
  const user = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Download image" }));
  await waitFor(() => expect(names[0]).toMatch(/^phyllotaxis-\d{8}-\d{6}\.png$/));
  await user.click(screen.getByRole("button", { name: "Export settings" }));
  expect(names[1]).toBe("phyllotaxis.vizstudio.json");
});

// ---- US5: zoom on any device ----

async function spyOnPointer(path) {
  const mod = (await import(path)).default;
  const events = [];
  const orig = mod.create;
  vi.spyOn(mod, "create").mockImplementation((...args) => {
    const inst = orig(...args);
    return { ...inst, pointer: (ev) => (events.push(ev), inst.pointer(ev)) };
  });
  return events;
}

test("two pointers moving apart send a pinch that zooms in", async () => {
  const events = await spyOnPointer("../../studio/visualizations/mandelbrot/index.js");
  await openViz("mandelbrot", "Mandelbrot set");
  const canvas = screen.getByRole("img", { name: /Mandelbrot/ });
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 120, clientY: 100 });
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 160, clientY: 100 });
  fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 160, clientY: 100 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
  // First finger starts a drag, the second cancels it, movement pinches, and
  // only the last finger's release reaches the module (the drag is already gone).
  expect(events.map((e) => e.type + (e.cancelDrag ? ":cancel" : ""))).toEqual(["down", "up:cancel", "pinch", "up"]);
  expect(events.find((e) => e.type === "pinch").scale).toBeCloseTo(3, 5); // 20 px apart → 60 px apart
});

test("line-mode wheel deltas are converted to pixels", async () => {
  const events = await spyOnPointer("../../studio/visualizations/mandelbrot/index.js");
  await openViz("mandelbrot", "Mandelbrot set");
  const canvas = screen.getByRole("img", { name: /Mandelbrot/ });
  fireEvent.wheel(canvas, { deltaY: 3, deltaMode: 1, clientX: 50, clientY: 50 });
  expect(events.find((e) => e.type === "wheel").deltaY).toBe(48);
});

test("zoom buttons show on Mandelbrot and Julia only, and Reset view restores the default", async () => {
  const user = await openViz("mandelbrot", "Mandelbrot set");
  const stat = () => screen.getByText(/×$/).textContent;
  expect(stat()).toBe("1.00×");
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(stat()).toBe("1.50×"));
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  await user.click(screen.getByRole("button", { name: "Zoom out" }));
  await waitFor(() => expect(stat()).toBe("1.50×"));
  await user.click(screen.getByRole("button", { name: "Reset view" }));
  await waitFor(() => expect(stat()).toBe("1.00×"));

  document.body.replaceChildren();
  await openViz("julia", "Julia set");
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();

  document.body.replaceChildren();
  await openViz("ulam-spiral", "Ulam spiral");
  expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
});

// ---- US6: video download ----

function captureDownloads() {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  const names = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    names.push(this.download);
  });
  return names;
}

describe("video download", () => {
  beforeEach(() => installMediaRecorder({ types: ["video/webm;codecs=vp9", "video/webm"] }));
  afterEach(() => removeMediaRecorder());

  test("record, then stop, downloads a dated video and starts playback", async () => {
    stubReducedMotion(true); // starts paused; recording should start it
    const names = captureDownloads();
    const user = await openViz("boids", "Boids");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record video" }));
    const stop = await screen.findByRole("button", { name: /Stop recording · 0:00/ });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(stop);
    await waitFor(() => expect(names[0]).toMatch(/^boids-\d{8}-\d{6}\.webm$/));
    expect(screen.getByRole("button", { name: "Record video" })).toBeInTheDocument();
  });

  test("leaving the visualization while recording cancels without a download", async () => {
    const names = captureDownloads();
    const user = await openViz("boids", "Boids");
    await user.click(screen.getByRole("button", { name: "Record video" }));
    await screen.findByRole("button", { name: /Stop recording/ });
    const recorder = FakeMediaRecorder.instances.at(-1);
    await user.click(screen.getByRole("button", { name: "← Catalog" }));
    await screen.findByRole("heading", { name: "Fractals" });
    expect(recorder.state).toBe("inactive");
    expect(names).toHaveLength(0);
  });

  test("the record button is hidden without browser support or on still pictures", async () => {
    await openViz("phyllotaxis", "Phyllotaxis");
    expect(screen.queryByRole("button", { name: "Record video" })).toBeNull();

    document.body.replaceChildren();
    removeMediaRecorder();
    await openViz("boids", "Boids");
    expect(screen.queryByRole("button", { name: "Record video" })).toBeNull();
  });
});

// ---- US4 (004): catalog pictures ----

test("every card shows its visualization's picture over its symbol", async () => {
  await openStudio("/studio");
  await screen.findByRole("heading", { name: "Number patterns" });
  const link = screen.getByRole("link", { name: /Times-table circle/ });
  // The picture is decorative: the link is still named by its text.
  expect(link).toHaveAccessibleName(/Times-table circle.*Connect point k/);
  const thumb = link.querySelector(".card-thumb");
  expect(thumb).toHaveAttribute("aria-hidden", "true");
  expect(thumb.querySelector(".card-glyph")).toHaveTextContent("◎");
  const img = thumb.querySelector("img");
  expect(img).toHaveAttribute("src", "/thumbs/times-table.webp");
  expect(img).toHaveAttribute("alt", "");
  expect(img).toHaveAttribute("width", "320");
  expect(img).toHaveAttribute("height", "240");
  expect(img).toHaveAttribute("loading", "lazy");
  expect(img).toHaveAttribute("decoding", "async");
  expect(document.querySelectorAll(".card-thumb img")).toHaveLength(23);
});

test("a picture that fails to load leaves the symbol showing", async () => {
  await openStudio("/studio");
  await screen.findByRole("heading", { name: "Number patterns" });
  const thumb = screen.getByRole("link", { name: /Mandelbrot set/ }).querySelector(".card-thumb");
  fireEvent.error(thumb.querySelector("img"));
  expect(thumb.querySelector("img")).not.toBeVisible();
  expect(thumb.querySelector(".card-glyph")).toBeVisible();
});

test("the catalog loads no visualization code", async () => {
  const { CATALOG } = await import("../../studio/catalog.js");
  const spies = CATALOG.map((e) => vi.spyOn(e, "load"));
  await openStudio("/studio");
  await screen.findByRole("heading", { name: "Number patterns" });
  for (const s of spies) expect(s).not.toHaveBeenCalled();
});
