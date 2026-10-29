import { render, screen, waitFor } from "@testing-library/react";
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

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const answer = (reply, extra = {}) => ({
  reply,
  toolCalls: [],
  stopReason: "end_turn",
  newMessages: [
    { role: "user", content: "q" },
    { role: "assistant", content: [{ type: "text", text: reply }] },
  ],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getHealth.mockResolvedValue({ status: "ok" });
  api.getCapabilities.mockResolvedValue({ tools: [], prompts: [] });
});

const promptBox = () => screen.getByLabelText("Prompt");
const sendButton = () => screen.getByRole("button", { name: "Send" });

test("Shift+Enter adds a new line, Enter sends", async () => {
  api.sendChat.mockResolvedValue(answer("Paris"));
  render(<App />);
  const user = userEvent.setup();

  await user.type(promptBox(), "line one{Shift>}{Enter}{/Shift}line two");
  expect(promptBox()).toHaveValue("line one\nline two");
  expect(api.sendChat).not.toHaveBeenCalled();

  await user.type(promptBox(), "{Enter}");
  expect(api.sendChat).toHaveBeenCalledWith("line one\nline two", []);
});

test("whitespace-only input is not sent", async () => {
  render(<App />);
  const user = userEvent.setup();
  await user.type(promptBox(), "   {Enter}");
  expect(api.sendChat).not.toHaveBeenCalled();
  expect(sendButton()).toBeDisabled();
});

test("shows Thinking… while pending, then the answer and tool calls", async () => {
  const d = deferred();
  api.sendChat.mockReturnValue(d.promise);
  render(<App />);
  const user = userEvent.setup();

  await user.type(promptBox(), "What time is it in Dubai?{Enter}");
  expect(screen.getByText("What time is it in Dubai?")).toBeInTheDocument();
  expect(screen.getByText("Thinking…")).toBeInTheDocument();
  await user.type(promptBox(), "next");
  expect(sendButton()).toBeDisabled();

  d.resolve(
    answer("It's 4 PM in Dubai.", {
      toolCalls: [
        { id: "t1", name: "get_time", input: { timezone: "Asia/Dubai" }, output: "4:00 PM", isError: false },
      ],
    })
  );
  expect(await screen.findByText("It's 4 PM in Dubai.")).toBeInTheDocument();
  expect(screen.getByText("get_time")).toBeInTheDocument();
  expect(screen.getByText(/Asia\/Dubai/)).toBeInTheDocument();
  expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  expect(sendButton()).toBeEnabled();
});

test("the next prompt carries the previous newMessages as history", async () => {
  const first = answer("4 PM.");
  api.sendChat.mockResolvedValueOnce(first).mockResolvedValueOnce(answer("9 PM."));
  render(<App />);
  const user = userEvent.setup();

  await user.type(promptBox(), "Dubai time?{Enter}");
  await screen.findByText("4 PM.");
  await user.type(promptBox(), "now Tokyo{Enter}");
  await screen.findByText("9 PM.");
  expect(api.sendChat).toHaveBeenLastCalledWith("now Tokyo", first.newMessages);
});

test("errors render as an error card and sending is re-enabled", async () => {
  const err = Object.assign(new Error("ANTHROPIC_API_KEY is not set on the server."), {
    code: "missing_api_key",
  });
  api.sendChat.mockRejectedValue(err);
  render(<App />);
  const user = userEvent.setup();

  await user.type(promptBox(), "hello{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("ANTHROPIC_API_KEY is not set");
  await user.type(promptBox(), "again");
  expect(sendButton()).toBeEnabled();
});

test("Clear empties the list and starts a fresh history", async () => {
  api.sendChat.mockResolvedValue(answer("Hi!"));
  render(<App />);
  const user = userEvent.setup();

  await user.type(promptBox(), "hello{Enter}");
  await screen.findByText("Hi!");
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.queryByText("Hi!")).not.toBeInTheDocument();

  await user.type(promptBox(), "what did I ask?{Enter}");
  await waitFor(() => expect(api.sendChat).toHaveBeenLastCalledWith("what did I ask?", []));
});

test("after 20 exchanges sending is disabled until Clear", async () => {
  api.sendChat.mockResolvedValue(answer("ok"));
  render(<App />);
  const user = userEvent.setup();

  for (let i = 0; i < 20; i++) {
    await user.type(promptBox(), `q${i}{Enter}`);
    await waitFor(() => expect(screen.getAllByText("ok")).toHaveLength(i + 1));
  }
  expect(screen.getByText(/Conversation full/)).toBeInTheDocument();
  await user.type(promptBox(), "one more");
  expect(sendButton()).toBeDisabled();
}, 20_000);
