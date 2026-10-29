import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import App from "../App.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  getHealth: vi.fn(),
  getCapabilities: vi.fn(),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

const capabilities = {
  server: { name: "brain-harness", version: "1.0.0" },
  tools: [
    {
      kind: "tool",
      name: "add",
      title: "Add numbers",
      description: "Add two numbers together and return the sum.",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number", description: "First number" }, b: { type: "number", description: "Second number" } },
        required: ["a", "b"],
      },
    },
    {
      kind: "tool",
      name: "summarize_text",
      title: "Summarize text",
      description: "Summarize a piece of text using Claude.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to summarize" },
          style: { type: "string", enum: ["bullets", "paragraph", "one-line"], default: "bullets" },
        },
        required: ["text"],
      },
    },
  ],
  prompts: [
    {
      kind: "prompt",
      name: "summarize",
      title: "Summarize text",
      description: "Ask the model to summarize a piece of text",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getHealth.mockResolvedValue({ status: "ok" });
  api.getCapabilities.mockResolvedValue(capabilities);
});

async function openPanel(user) {
  await user.click(screen.getByText("Tools & prompts"));
  await screen.findByText("Prompt templates");
}

test("lists tools and prompt templates", async () => {
  render(<App />);
  const user = userEvent.setup();
  await openPanel(user);
  expect(screen.getByText("add")).toBeInTheDocument();
  expect(screen.getByText("summarize_text")).toBeInTheDocument();
  expect(screen.getByText("summarize")).toBeInTheDocument();
});

test("builds a form from the schema: textarea and a select with its default", async () => {
  render(<App />);
  const user = userEvent.setup();
  await openPanel(user);
  await user.click(screen.getByText("summarize_text"));

  expect(screen.getByLabelText(/^text/).tagName).toBe("TEXTAREA");
  const style = screen.getByLabelText(/^style/);
  expect(style.tagName).toBe("SELECT");
  expect(style).toHaveValue("bullets");
});

test("runs a tool with typed numbers and shows a labelled result", async () => {
  api.runTool.mockResolvedValue({ output: "5", isError: false });
  render(<App />);
  const user = userEvent.setup();
  await openPanel(user);
  await user.click(screen.getByText("add"));

  await user.type(screen.getByLabelText(/^a/), "2");
  await user.type(screen.getByLabelText(/^b/), "3");
  await user.click(screen.getByRole("button", { name: "Run add" }));

  expect(api.runTool).toHaveBeenCalledWith("add", { a: 2, b: 3 });
  expect(await screen.findByText("5")).toBeInTheDocument();
  expect(screen.getByText(/▶ tool/)).toBeInTheDocument();
});

test("a tool error is shown as an error card", async () => {
  api.runTool.mockResolvedValue({ output: "Invalid timezone: Mars/Base", isError: true });
  render(<App />);
  const user = userEvent.setup();
  await openPanel(user);
  await user.click(screen.getByText("add"));
  await user.type(screen.getByLabelText(/^a/), "1");
  await user.type(screen.getByLabelText(/^b/), "1");
  await user.click(screen.getByRole("button", { name: "Run add" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid timezone: Mars/Base");
});

test("a prompt template run shows the rendered prompt and Claude's answer", async () => {
  api.runPrompt.mockResolvedValue({
    renderedPrompt: "Please summarize the following text in 3 bullet points:\n\nHello",
    reply: "- a\n- b\n- c",
    toolCalls: [],
    stopReason: "end_turn",
  });
  render(<App />);
  const user = userEvent.setup();
  await openPanel(user);
  await user.click(screen.getByText("summarize"));
  await user.type(screen.getByLabelText(/^text/), "Hello");
  await user.click(screen.getByRole("button", { name: "Run summarize" }));

  expect(api.runPrompt).toHaveBeenCalledWith("summarize", { text: "Hello" });
  expect(await screen.findByText("Rendered prompt")).toBeInTheDocument();
  expect(screen.getByText(/- a/)).toBeInTheDocument();
});
