// The fluid in the studio without graphics acceleration (jsdom has no WebGL): FR-016, Story 3 scenario 4.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../../Root.jsx";
import { installCanvasStub } from "../canvasStub.js";
import { stubReducedMotion } from "../browserStubs.js";
import { UNSUPPORTED_TEXT } from "../../../studio/visualizations/fluid/index.js";

vi.mock("../../../api.js", () => ({
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

async function open(path) {
  window.history.replaceState(null, "", path);
  render(<Root />);
  await screen.findByRole("heading", { name: "Fluid simulation", level: 2 });
  return userEvent.setup();
}

for (const path of ["/studio/fluid-simulation", "/studio/fluid-simulation?gpu=off"]) {
  describe(`opening ${path}`, () => {
    test("shows a plain message, and no controls that could not work", async () => {
      await open(path);
      const message = await screen.findByText(UNSUPPORTED_TEXT);
      expect(message.closest("[role='status']")).not.toBeNull();
      expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Playback" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Actions" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.getByText(/velocity dissipation slows the motion over time/i)).toBeInTheDocument(); // the explanation stays
    });

    test("the back control still works, and the other visualizations open and run", async () => {
      const user = await open(path);
      await screen.findByText(UNSUPPORTED_TEXT);
      await user.click(screen.getByRole("button", { name: /Catalog/ }));
      await screen.findByRole("heading", { name: "Simulation and emergence" });
      const life = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/studio/game-of-life");
      await user.click(life);
      await screen.findByRole("heading", { name: "Game of Life", level: 2 });
      expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
      expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
    });
  });
}

test("the message goes away when the visitor leaves the fluid", async () => {
  const user = await open("/studio/fluid-simulation");
  await screen.findByText(UNSUPPORTED_TEXT);
  await user.click(screen.getByRole("button", { name: /Catalog/ }));
  await screen.findByRole("heading", { name: "Simulation and emergence" });
  expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
});
