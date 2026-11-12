import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import Root from "../../Root.jsx";
import * as api from "../../api.js";
import { installCanvasStub } from "./canvasStub.js";

vi.mock("../../api.js", () => ({
  getHealth: vi.fn(),
  getCapabilities: vi.fn(),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

installCanvasStub();

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  api.getHealth.mockResolvedValue({ status: "ok" });
  api.getCapabilities.mockResolvedValue({ tools: [], prompts: [] });
});

const sectionLink = (name) => within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name });

test("a conversation survives a trip to the studio and back", async () => {
  api.sendChat.mockResolvedValue({
    reply: "Paris",
    toolCalls: [],
    stopReason: "end_turn",
    newMessages: [
      { role: "user", content: "q" },
      { role: "assistant", content: [{ type: "text", text: "Paris" }] },
    ],
  });
  render(<Root />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Prompt"), "Capital of France?{Enter}");
  expect(await screen.findByText("Paris")).toBeInTheDocument();

  await user.click(sectionLink("Visualization Studio"));
  expect(window.location.pathname).toBe("/studio");
  expect(await screen.findByRole("heading", { name: "Number patterns" })).toBeInTheDocument();
  expect(sectionLink("Visualization Studio")).toHaveAttribute("aria-current", "page");

  await user.click(sectionLink("Playground"));
  expect(window.location.pathname).toBe("/");
  expect(screen.getByText("Paris")).toBeVisible();
  expect(sectionLink("Playground")).toHaveAttribute("aria-current", "page");
});

test("browser back and forward switch sections", async () => {
  render(<Root />);
  const user = userEvent.setup();
  await user.click(sectionLink("Visualization Studio"));
  await screen.findByRole("heading", { name: "Fractals" });
  act(() => {
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(sectionLink("Playground")).toHaveAttribute("aria-current", "page"));
});

test("opening /studio/times-table directly shows that visualization", async () => {
  window.history.replaceState(null, "", "/studio/times-table");
  render(<Root />);
  expect(await screen.findByRole("heading", { name: "Times-table circle" })).toBeInTheDocument();
  expect(await screen.findByLabelText("Multiplier m")).toBeInTheDocument();
});

test("an unknown visualization shows the catalog with a message", async () => {
  window.history.replaceState(null, "", "/studio/not-a-thing");
  render(<Root />);
  expect(await screen.findByText(/doesn't exist/)).toBeInTheDocument();
});
