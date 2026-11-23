// Full screen for the canvas (User Story 6). jsdom has no Fullscreen API and no layout,
// so both are faked here: the API stub mirrors what a browser does (sets
// document.fullscreenElement, then fires "fullscreenchange"), and the container's size is set by hand.
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../Root.jsx";
import { installCanvasStub } from "./canvasStub.js";
import { stubReducedMotion } from "./browserStubs.js";

vi.mock("../../api.js", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  getCapabilities: vi.fn().mockResolvedValue({ tools: [], prompts: [] }),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

installCanvasStub();

const realRO = globalThis.ResizeObserver;
const realDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
let api;

class FakeResizeObserver {
  static live = new Set();
  constructor(cb) {
    this.cb = cb;
  }
  observe() {
    FakeResizeObserver.live.add(this);
  }
  disconnect() {
    FakeResizeObserver.live.delete(this);
  }
}
const fireResize = () => act(() => [...FakeResizeObserver.live].forEach((o) => o.cb([])));

function setFullscreenElement(el) {
  document.fullscreenElement = el;
  document.dispatchEvent(new Event("fullscreenchange"));
}

function installFullscreen({ reject = false } = {}) {
  const request = vi.fn();
  const exit = vi.fn();
  Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true, writable: true });
  Element.prototype.requestFullscreen = function () {
    request(this);
    if (reject) return Promise.reject(new Error("blocked"));
    act(() => setFullscreenElement(this));
    return Promise.resolve();
  };
  document.exitFullscreen = () => {
    exit();
    act(() => setFullscreenElement(null));
    return Promise.resolve();
  };
  return { request, exit };
}

beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
  FakeResizeObserver.live.clear();
  globalThis.ResizeObserver = FakeResizeObserver;
  Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
  api = installFullscreen();
});
afterEach(() => {
  globalThis.ResizeObserver = realRO;
  if (realDpr) Object.defineProperty(window, "devicePixelRatio", realDpr);
  else delete window.devicePixelRatio;
  delete document.fullscreenEnabled;
  delete document.fullscreenElement;
  delete document.exitFullscreen;
  delete Element.prototype.requestFullscreen;
});

async function openViz(id, heading) {
  window.history.replaceState(null, "", `/studio/${id}`);
  render(<Root />);
  await screen.findByRole("heading", { name: heading, level: 2 });
  await screen.findByRole("heading", { name: "Settings" });
  const canvas = document.querySelector("canvas.viz-canvas");
  const wrap = canvas.closest(".canvas-wrap");
  Object.defineProperty(wrap, "clientWidth", { value: 1920, configurable: true });
  Object.defineProperty(wrap, "clientHeight", { value: 1080, configurable: true });
  fireResize(); // the observer's first call: the starting size
  return { user: userEvent.setup(), canvas, wrap };
}

test("the button asks for full screen on the element that holds the canvas", async () => {
  const { user, wrap } = await openViz("phyllotaxis", "Phyllotaxis");
  const button = screen.getByRole("button", { name: "Full screen" });
  expect(wrap).toContainElement(button);
  expect(button).toHaveAttribute("aria-pressed", "false");
  await user.click(button);
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(api.request).toHaveBeenCalledWith(wrap);
});

test("it shows the state, and the button or Esc leaves", async () => {
  const { user } = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  const exit = await screen.findByRole("button", { name: "Exit full screen" });
  expect(exit).toHaveAttribute("aria-pressed", "true");

  await user.click(exit);
  expect(api.exit).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "false");

  // Esc: the browser leaves full screen by itself and only fires the event.
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  await screen.findByRole("button", { name: "Exit full screen" });
  act(() => setFullscreenElement(null));
  expect(await screen.findByRole("button", { name: "Full screen" })).toBeInTheDocument();
});

test("the zoom buttons and the sweep control go full screen with the canvas", async () => {
  const { user, wrap } = await openViz("mandelbrot", "Mandelbrot set");
  await user.click(screen.getByRole("button", { name: "Animated sweep" }));
  expect(wrap).toContainElement(screen.getByRole("group", { name: "Zoom" }));
  expect(wrap).toContainElement(screen.getByRole("button", { name: "Sweep zoom" }));
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  expect(api.request).toHaveBeenCalledWith(wrap);
});

test("the canvas is redrawn to fill the screen, within 4 million pixels, and goes back afterwards", async () => {
  const { user, canvas } = await openViz("phyllotaxis", "Phyllotaxis");

  await user.click(screen.getByRole("button", { name: "Full screen" }));
  await screen.findByRole("button", { name: "Exit full screen" });
  fireResize();
  expect(canvas.style.width).toBe("1920px");
  expect(canvas.style.height).toBe("1080px");
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4_000_000);
  expect(canvas.width * canvas.height).toBeGreaterThan(3_500_000); // lowered only as far as needed
  expect(canvas.width / canvas.height).toBeCloseTo(16 / 9, 1);

  await user.click(screen.getByRole("button", { name: "Exit full screen" }));
  fireResize();
  expect(parseInt(canvas.style.height, 10)).toBeLessThan(1080); // the normal limits (72% of the window's height) are back
});

test("without browser support there is no button", async () => {
  Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
  await openViz("phyllotaxis", "Phyllotaxis");
  expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
});

test("a refusal shows a notice and leaves the button as it was", async () => {
  api = installFullscreen({ reject: true });
  const { user } = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  expect(await screen.findByText("Full screen isn't available here, or the browser blocked it.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "false");
});

test("going back to the catalog while in full screen leaves it", async () => {
  const { user } = await openViz("phyllotaxis", "Phyllotaxis");
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  await screen.findByRole("button", { name: "Exit full screen" });
  await user.click(screen.getByRole("button", { name: "← Catalog" }));
  expect(api.exit).toHaveBeenCalled();
});

test("Space still plays and pauses an animation in full screen", async () => {
  const { user, canvas } = await openViz("boids", "Boids");
  await user.click(screen.getByRole("button", { name: "Full screen" }));
  await screen.findByRole("button", { name: "Exit full screen" });
  expect(document.activeElement).toBe(canvas); // the canvas keeps the keyboard
  const pause = screen.getByRole("button", { name: "Pause" });
  await user.keyboard(" ");
  expect(pause).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
});
