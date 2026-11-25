// What the Viewer owes a module, beyond the old contract (specs/005-.../contracts/module-additions.md,
// contracts/quality.md): actions, independent fingers, messages, restarts, idling, and quality.
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Viewer from "../../studio/components/Viewer.jsx";
import { installCanvasStub } from "./canvasStub.js";
import { stubReducedMotion } from "./browserStubs.js";
import { makeStub, makeFrames } from "./helpers/stubModule.js";

installCanvasStub();

beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ACTIONS = [
  { id: "burst", label: "Burst", title: "Add several splashes (B)", key: "b" },
  { id: "clear", label: "Clear", title: "Empty the picture (C)", key: "c" },
];

async function mount(stub, props = {}) {
  const view = render(<Viewer entry={stub.entry} active motionPref="off" onBack={() => {}} {...props} />);
  await screen.findByText("A stub visualization used by the Viewer contract tests.");
  await waitFor(() => expect(stub.calls.created.length).toBeGreaterThan(0));
  const canvas = () => view.container.querySelector("canvas");
  return { ...view, canvas, user: userEvent.setup() };
}

describe("module actions", () => {
  test("each action is a button that calls the instance, usable by mouse and keyboard", async () => {
    const stub = makeStub({ actions: true, module: { actions: ACTIONS } });
    const { user } = await mount(stub);
    await user.click(screen.getByRole("button", { name: "Burst" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(stub.calls.actions).toEqual(["burst", "clear"]);
    screen.getByRole("button", { name: "Burst" }).focus();
    await user.keyboard("{Enter}");
    expect(stub.calls.actions).toEqual(["burst", "clear", "burst"]);
    expect(screen.getByRole("button", { name: "Burst" })).toHaveAttribute("title", "Add several splashes (B)");
  });

  test("a module without actions gets no action buttons", async () => {
    const stub = makeStub();
    await mount(stub);
    expect(screen.queryByRole("button", { name: "Burst" })).toBeNull();
  });
});

describe("multi-touch", () => {
  const down = (canvas, id, x) => fireEvent.pointerDown(canvas, { pointerId: id, clientX: x, clientY: 10 });
  const move = (canvas, id, x) => fireEvent.pointerMove(canvas, { pointerId: id, clientX: x, clientY: 20 });
  const up = (canvas, id, x) => fireEvent.pointerUp(canvas, { pointerId: id, clientX: x, clientY: 10 });

  test("with multiTouch every finger reaches the module on its own: no pinch, no cancelled drag", async () => {
    const stub = makeStub({ module: { multiTouch: true } });
    const { canvas } = await mount(stub);
    const c = canvas();
    down(c, 1, 10);
    down(c, 2, 50);
    down(c, 3, 90);
    move(c, 2, 60);
    up(c, 2, 60);
    up(c, 1, 10);
    up(c, 3, 90);
    const seen = stub.calls.pointer.map((e) => `${e.type}:${e.pointerId}`);
    expect(seen).toEqual(["down:1", "down:2", "down:3", "move:2", "up:2", "up:1", "up:3"]);
    expect(stub.calls.pointer.some((e) => e.type === "pinch" || e.cancelDrag)).toBe(false);
  });

  test("more than 10 fingers: the extra ones are ignored, not an error", async () => {
    const stub = makeStub({ module: { multiTouch: true } });
    const { canvas } = await mount(stub);
    for (let i = 1; i <= 12; i++) down(canvas(), i, i * 5);
    expect(stub.calls.pointer.filter((e) => e.type === "down")).toHaveLength(10);
  });

  test("without multiTouch the old behaviour stays: a second finger cancels the drag and pinches", async () => {
    const stub = makeStub();
    const { canvas } = await mount(stub);
    const c = canvas();
    down(c, 1, 100);
    down(c, 2, 120);
    move(c, 2, 160);
    up(c, 2, 160);
    up(c, 1, 100);
    expect(stub.calls.pointer.map((e) => e.type + (e.cancelDrag ? ":cancel" : ""))).toEqual(["down", "up:cancel", "pinch", "up"]);
  });
});

describe("messages over the canvas", () => {
  test("showMessage renders a status message with an action button, and clearMessage removes it", async () => {
    const onAction = vi.fn();
    const stub = makeStub({ onCreate: (rec) => rec.ctx.showMessage({ text: "Graphics acceleration is not available.", actionLabel: "Restart", onAction }) });
    const { user } = await mount(stub);
    const message = await screen.findByText("Graphics acceleration is not available.");
    const overlay = message.closest("[role='status']");
    expect(overlay).not.toBeNull();
    // The playback bar has its own "Restart" button, so look inside the message, as a visitor would.
    await user.click(within(overlay).getByRole("button", { name: "Restart" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    act(() => stub.calls.created[0].ctx.clearMessage());
    expect(screen.queryByText("Graphics acceleration is not available.")).toBeNull();
  });

  test("a message without an action has no button", async () => {
    const stub = makeStub({ onCreate: (rec) => rec.ctx.showMessage({ text: "Just so you know." }) });
    await mount(stub);
    const overlay = (await screen.findByText("Just so you know.")).closest("[role='status']");
    expect(within(overlay).queryByRole("button")).toBeNull();
  });

  test("an unsupported module hides its settings and playback, and the back control still works", async () => {
    const onBack = vi.fn();
    const stub = makeStub({ unsupported: true, onCreate: (rec) => rec.ctx.showMessage({ text: "Needs graphics acceleration." }) });
    const { user } = await mount(stub, { onBack });
    await screen.findByText("Needs graphics acceleration.");
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Playback" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Catalog/ }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("restarting on a fresh canvas", () => {
  test("requestRestart mounts a new canvas and creates the instance again; the old one is destroyed", async () => {
    const stub = makeStub();
    const { canvas } = await mount(stub);
    const first = canvas();
    act(() => stub.calls.created[0].ctx.requestRestart({}));
    await waitFor(() => expect(stub.calls.created).toHaveLength(2));
    expect(stub.calls.destroyed).toBe(1);
    expect(stub.calls.created[1].canvas).not.toBe(stub.calls.created[0].canvas);
    expect(canvas()).toBe(stub.calls.created[1].canvas);
    expect(first.isConnected).toBe(false);
    expect(stub.calls.created[1].ctx.gpuForced).toBe("auto");
    expect(stub.calls.created[1].config).toEqual(stub.calls.created[0].config);
  });

  test("forceProcessor makes the new instance's ctx.gpuForced 'off', and it stays that way for this viewer", async () => {
    const stub = makeStub();
    await mount(stub);
    act(() => stub.calls.created[0].ctx.requestRestart({ forceProcessor: true }));
    await waitFor(() => expect(stub.calls.created).toHaveLength(2));
    expect(stub.calls.created[1].ctx.gpuForced).toBe("off");
    act(() => stub.calls.created[1].ctx.requestRestart({}));
    await waitFor(() => expect(stub.calls.created).toHaveLength(3));
    expect(stub.calls.created[2].ctx.gpuForced).toBe("off");
  });

  describe("a GPU instance cannot be recreated on the canvas it used", () => {
    const apply = async (user) => {
      await user.click(screen.getByRole("button", { name: "Preset one" }));
      await waitFor(() => expect(stub.calls.created.length).toBeGreaterThan(1));
    };
    let stub;

    test("applying a preset mounts a fresh canvas first", async () => {
      stub = makeStub({ path: "gpu" });
      const { user, canvas } = await mount(stub);
      const first = canvas();
      await apply(user);
      expect(stub.calls.created[1].canvas).not.toBe(first);
      expect(first.isConnected).toBe(false);
      expect(canvas()).toBe(stub.calls.created[1].canvas);
      expect(stub.calls.created[1].config.values.n).toBe(7);
      expect(stub.calls.destroyed).toBe(1);
    });

    test("so do Reset to defaults and a new seed", async () => {
      stub = makeStub({ path: "gpu", module: { random: true } });
      const { user } = await mount(stub);
      await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
      await waitFor(() => expect(stub.calls.created).toHaveLength(2));
      await user.click(screen.getByRole("button", { name: "Randomize" }));
      await waitFor(() => expect(stub.calls.created).toHaveLength(3));
      const canvases = new Set(stub.calls.created.map((c) => c.canvas));
      expect(canvases.size).toBe(3); // three instances, three canvases
    });

    test("an instance on the processor path keeps its canvas, as before", async () => {
      stub = makeStub();
      const { user, canvas } = await mount(stub);
      const first = canvas();
      await apply(user);
      expect(stub.calls.created[1].canvas).toBe(first);
    });
  });

  test("a restart after the viewer was left does nothing", async () => {
    const stub = makeStub();
    const { unmount } = await mount(stub);
    const ctx = stub.calls.created[0].ctx;
    unmount();
    expect(() => ctx.requestRestart({})).not.toThrow();
    expect(stub.calls.created).toHaveLength(1);
  });
});

describe("idle loop (FR-024)", () => {
  async function playing(stubOptions) {
    const frames = makeFrames();
    vi.stubGlobal("requestAnimationFrame", frames.raf);
    vi.stubGlobal("cancelAnimationFrame", frames.caf);
    const stub = makeStub(stubOptions);
    const m = await mount(stub);
    act(() => frames.advance(3));
    return { frames, stub, ...m };
  }

  test("when isIdle() is true the loop stops asking for frames, and the Pause button still shows 'playing'", async () => {
    const { frames, stub } = await playing();
    expect(stub.calls.steps).toBeGreaterThanOrEqual(2);
    stub.state.idle = true;
    act(() => frames.advance(1));
    expect(frames.pending()).toBe(0);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a loop that is driving a sweep never idles, because the sweep needs the frames to start its next run", async () => {
    const { frames, stub } = await playing({ module: { sweep: { periodMs: 1000, targets: [{ key: "n", mode: "wave", min: 2, max: 8 }] } } });
    stub.state.idle = true; // the module says it is finished
    // Switching the sweep on while idle: the loop must wake and stay awake.
    const sweepBox = screen.getByLabelText("Animated sweep");
    act(() => sweepBox.click());
    act(() => frames.advance(3));
    expect(frames.pending()).toBe(1);
    // Switching it off lets it idle again.
    act(() => sweepBox.click());
    act(() => frames.advance(2));
    expect(frames.pending()).toBe(0);
  });

  test("a pointer event wakes it", async () => {
    const { frames, stub, canvas } = await playing();
    stub.state.idle = true;
    act(() => frames.advance(1));
    expect(frames.pending()).toBe(0);
    stub.state.idle = false;
    fireEvent.pointerMove(canvas(), { pointerId: 1, clientX: 5, clientY: 5 });
    expect(frames.pending()).toBe(1);
  });

  test("an action wakes it", async () => {
    const { frames, stub, user } = await playing({ actions: true, module: { actions: ACTIONS } });
    stub.state.idle = true;
    act(() => frames.advance(1));
    expect(frames.pending()).toBe(0);
    stub.state.idle = false;
    await user.click(screen.getByRole("button", { name: "Burst" }));
    expect(frames.pending()).toBe(1);
  });

  test("Restart wakes it", async () => {
    const { frames, stub, user } = await playing();
    stub.state.idle = true;
    act(() => frames.advance(1));
    stub.state.idle = false;
    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(stub.calls.resets).toBe(1);
    expect(frames.pending()).toBe(1);
  });

  test("a setting change wakes it once the update has been applied", async () => {
    const { frames, stub, user } = await playing();
    stub.state.idle = true;
    act(() => frames.advance(1));
    expect(frames.pending()).toBe(0);
    stub.state.idle = false;
    const box = screen.getByLabelText("N value");
    await user.clear(box);
    await user.type(box, "8{Enter}");
    act(() => frames.advance(1)); // the batched update runs on the next frame request
    await waitFor(() => expect(stub.calls.updates.some(([c]) => c.values.n === 8)).toBe(true));
    expect(frames.pending()).toBe(1);
  });
});

describe("quality", () => {
  const QUALITY = { scale: { low: 0.5, medium: 1, high: 1 }, levers: { low: { k: 1 }, medium: { k: 2 }, high: { k: 3 } } };
  const sizeOf = (canvas) => [canvas.width, canvas.height];

  test("an animated module offers Auto, Low, Medium and High, starting on Auto", async () => {
    const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
    await mount(stub);
    const select = screen.getByLabelText("Quality");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Auto", "Low", "Medium", "High"]);
    expect(select).toHaveValue("auto");
  });

  test("a static module offers Low, Medium and High, starting on Medium", async () => {
    const stub = makeStub({ module: { animated: false, interactive: false, quality: QUALITY } });
    await mount(stub);
    const select = screen.getByLabelText("Quality");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Low", "Medium", "High"]);
    expect(select).toHaveValue("medium");
  });

  test("a module that declared no quality has no Quality choice", async () => {
    const stub = makeStub();
    await mount(stub);
    expect(screen.queryByLabelText("Quality")).toBeNull();
  });

  test("choosing Low scales the drawing resolution (not the page size) and tells the module", async () => {
    const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
    const { canvas, user } = await mount(stub);
    const [w, h] = sizeOf(canvas());
    const cssWidth = canvas().style.width;
    await user.selectOptions(screen.getByLabelText("Quality"), "low");
    await waitFor(() => expect(stub.calls.qualities.at(-1)).toEqual(["low", { automatic: false }]));
    expect(sizeOf(canvas())).toEqual([Math.round(w * 0.5), Math.round(h * 0.5)]);
    expect(canvas().style.width).toBe(cssWidth);
    expect(stub.calls.resizes.at(-1)).toEqual(sizeOf(canvas()));
    await user.selectOptions(screen.getByLabelText("Quality"), "medium");
    await waitFor(() => expect(stub.calls.qualities.at(-1)).toEqual(["medium", { automatic: false }]));
    expect(sizeOf(canvas())).toEqual([w, h]);
  });

  test("a module without setQuality is told through update(config, ['quality'])", async () => {
    const stub = makeStub({ module: { animated: false, interactive: false, quality: QUALITY } });
    const { user } = await mount(stub);
    await user.selectOptions(screen.getByLabelText("Quality"), "low");
    await waitFor(() => expect(stub.calls.updates.some(([c, keys]) => keys.includes("quality") && c.values.quality === "low")).toBe(true));
  });

  test("a chosen quality is part of the configuration the module is created with", async () => {
    const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
    await mount(stub, { initialConfig: { vizId: "stub", values: { quality: "low" } } });
    expect(stub.calls.created[0].config.values.quality).toBe("low");
    expect(stub.calls.created[0].canvas.width).toBeLessThan(640);
  });

  test("applying a preset keeps the visitor's quality choice", async () => {
    const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
    const { user } = await mount(stub);
    await user.selectOptions(screen.getByLabelText("Quality"), "low");
    await user.click(screen.getByRole("button", { name: "Preset one" }));
    await waitFor(() => expect(stub.calls.created.length).toBeGreaterThan(1));
    expect(stub.calls.created.at(-1).config.values.n).toBe(7);
    expect(stub.calls.created.at(-1).config.values.quality).toBe("low");
    expect(screen.getByLabelText("Quality")).toHaveValue("low");
  });

  test("'Reset to defaults' does reset it", async () => {
    const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
    const { user } = await mount(stub);
    await user.selectOptions(screen.getByLabelText("Quality"), "low");
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await waitFor(() => expect(screen.getByLabelText("Quality")).toHaveValue("auto"));
  });

  describe("Auto (animated modules)", () => {
    async function auto() {
      const frames = makeFrames();
      vi.stubGlobal("requestAnimationFrame", frames.raf);
      vi.stubGlobal("cancelAnimationFrame", frames.caf);
      const stub = makeStub({ setQuality: true, module: { quality: QUALITY } });
      const m = await mount(stub);
      return { frames, stub, ...m };
    }

    test("steady frames change nothing", async () => {
      const { frames, stub } = await auto();
      act(() => frames.advance(600, 16.7));
      expect(stub.calls.qualities).toEqual([]);
      expect(screen.queryByText(/Lowered quality/)).toBeNull();
    });

    test("slow frames lower the quality within 3 s, shrink the canvas and say so, without touching the setting", async () => {
      const { frames, stub, canvas } = await auto();
      const [w] = sizeOf(canvas());
      act(() => frames.advance(60, 50)); // 3 s at 20 fps
      expect(stub.calls.qualities).toEqual([["low", { automatic: true }]]);
      expect(sizeOf(canvas())[0]).toBe(Math.round(w * 0.5));
      expect(await screen.findByText("Lowered quality to keep this smooth.")).toBeInTheDocument();
      expect(screen.getByLabelText("Quality")).toHaveValue("auto"); // the saved setting is untouched (FR-023)
    });

    test("a fixed choice stops the adapting", async () => {
      const { frames, stub, user } = await auto();
      await user.selectOptions(screen.getByLabelText("Quality"), "medium");
      const before = stub.calls.qualities.length;
      act(() => frames.advance(200, 50));
      expect(stub.calls.qualities).toHaveLength(before);
      expect(screen.queryByText(/Lowered quality/)).toBeNull();
    });

    test("choosing Auto again starts from Medium", async () => {
      const { frames, stub, user, canvas } = await auto();
      const [w] = sizeOf(canvas());
      act(() => frames.advance(60, 50));
      expect(sizeOf(canvas())[0]).toBe(Math.round(w * 0.5));
      await user.selectOptions(screen.getByLabelText("Quality"), "high");
      await user.selectOptions(screen.getByLabelText("Quality"), "auto");
      await waitFor(() => expect(sizeOf(canvas())[0]).toBe(w));
      expect(stub.calls.qualities.at(-1)).toEqual(["medium", { automatic: true }]);
    });
  });

  test("a static module never adapts, however slow the page is", async () => {
    const frames = makeFrames();
    vi.stubGlobal("requestAnimationFrame", frames.raf);
    vi.stubGlobal("cancelAnimationFrame", frames.caf);
    const stub = makeStub({ module: { animated: false, interactive: false, quality: QUALITY } });
    await mount(stub);
    act(() => frames.advance(200, 80));
    expect(stub.calls.updates.filter(([, keys]) => keys.includes("quality"))).toEqual([]);
    expect(screen.queryByText(/Lowered quality/)).toBeNull();
  });
});
