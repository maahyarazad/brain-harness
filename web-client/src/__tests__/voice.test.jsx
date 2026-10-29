import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import App from "../App.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  getHealth: vi.fn(),
  getCapabilities: vi.fn(),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

let lastRecognizer;
class FakeRecognition {
  constructor() {
    lastRecognizer = this;
    this.start = vi.fn();
    this.stop = vi.fn(() => this.onend?.());
    this.abort = vi.fn();
  }
  say(text) {
    this.onresult?.({ results: [[{ transcript: text }]] });
  }
}

const fakeSynth = { speak: vi.fn(), cancel: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  api.getHealth.mockResolvedValue({ status: "ok" });
  window.webkitSpeechRecognition = FakeRecognition;
  window.speechSynthesis = fakeSynth;
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
  };
});

afterEach(() => {
  delete window.webkitSpeechRecognition;
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});

const micButton = () => screen.getByRole("button", { name: /speak a prompt|stop listening/i });

test("speech fills the prompt box without sending", async () => {
  render(<App />);
  const user = userEvent.setup();

  await user.click(micButton());
  expect(micButton()).toHaveAttribute("aria-pressed", "true");
  expect(lastRecognizer.start).toHaveBeenCalled();

  act(() => lastRecognizer.say("What time is it in Tokyo?"));
  expect(screen.getByLabelText("Prompt")).toHaveValue("What time is it in Tokyo?");
  expect(api.sendChat).not.toHaveBeenCalled();

  await user.click(micButton());
  expect(lastRecognizer.stop).toHaveBeenCalled();
  expect(micButton()).toHaveAttribute("aria-pressed", "false");
});

test("permission denied shows a message and typing still works", async () => {
  render(<App />);
  const user = userEvent.setup();
  await user.click(micButton());
  act(() => {
    lastRecognizer.onerror({ error: "not-allowed" });
    lastRecognizer.onend();
  });
  expect(screen.getByText(/Microphone permission denied/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("Prompt"), "typed");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("without speech recognition the mic is disabled with a note", () => {
  delete window.webkitSpeechRecognition;
  render(<App />);
  expect(micButton()).toBeDisabled();
  expect(screen.getByText(/Voice input isn't supported/)).toBeInTheDocument();
});

test("read-aloud speaks answers, Stop and the mic cancel it", async () => {
  api.sendChat.mockResolvedValue({
    reply: "It is 9 PM in Tokyo.",
    toolCalls: [],
    stopReason: "end_turn",
    newMessages: [],
  });
  render(<App />);
  const user = userEvent.setup();

  await user.click(screen.getByLabelText("Read answers aloud"));
  await user.type(screen.getByLabelText("Prompt"), "Tokyo time?{Enter}");
  await screen.findByText("It is 9 PM in Tokyo.");
  expect(fakeSynth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "It is 9 PM in Tokyo." }));

  fakeSynth.cancel.mockClear();
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(fakeSynth.cancel).toHaveBeenCalled();

  fakeSynth.cancel.mockClear();
  await user.click(micButton());
  expect(fakeSynth.cancel).toHaveBeenCalled();
});

test("a spoken prompt is marked as voice in the conversation", async () => {
  api.sendChat.mockResolvedValue({ reply: "ok", toolCalls: [], stopReason: "end_turn", newMessages: [] });
  render(<App />);
  const user = userEvent.setup();
  await user.click(micButton());
  act(() => lastRecognizer.say("hello there"));
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(/spoken/)).toBeInTheDocument();
});
