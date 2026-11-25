// T5 and T6: typing a message does not redraw the conversation, and a new message redraws only itself (Story 6 scenarios 4 and 5).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import App from "../../../App.jsx";
import Header from "../../../components/Header.jsx";
import CapabilityPanel from "../../../components/CapabilityPanel.jsx";
import ExchangeList, { Exchange } from "../../../components/ExchangeList.jsx";
import ToolCallCard from "../../../components/ToolCallCard.jsx";
import { sendChat } from "../../../api.js";
import { instrument } from "../../helpers/renderProbe.jsx";

vi.mock("../../../api.js", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  getCapabilities: vi.fn().mockResolvedValue({ tools: [], prompts: [] }),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

let probes = [];
beforeEach(() => {
  sendChat.mockReset();
  let n = 0;
  sendChat.mockImplementation(async (prompt) => ({
    reply: `answer ${++n} to ${prompt}`,
    newMessages: [],
    stopReason: "end_turn",
    toolCalls: [{ id: `t${n}`, name: "tool", input: { q: prompt }, output: "ok", isError: false }],
  }));
});
afterEach(() => probes.forEach((p) => p.restore()));

async function setup() {
  const header = instrument(Header);
  const caps = instrument(CapabilityPanel);
  const list = instrument(ExchangeList);
  const exchange = instrument(Exchange, { keyOf: (p) => p.exchange.input });
  const card = instrument(ToolCallCard, { keyOf: (p) => p.call.id });
  probes = [header, caps, list, exchange, card];
  render(<App />);
  const user = userEvent.setup();
  const box = screen.getByLabelText("Prompt");
  for (const q of ["first", "second"]) {
    await user.type(box, q);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(new RegExp(`to ${q}`));
  }
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()); // empty box
  probes.forEach((p) => p.reset());
  return { user, box, header, caps, list, exchange, card };
}

test("typing in the message box does not redraw the header, the tools panel, the list, any message or any tool card", async () => {
  const t = await setup();
  await t.user.type(t.box, "hello");
  expect(t.box).toHaveValue("hello");
  expect(t.header.count()).toBe(0);
  expect(t.caps.count()).toBe(0);
  expect(t.list.count()).toBe(0);
  expect(t.exchange.count()).toBe(0);
  expect(t.card.count()).toBe(0);
});

test("a new message redraws only itself: earlier messages and their tool cards are untouched", async () => {
  const t = await setup();
  await t.user.type(t.box, "third");
  [t.header, t.caps, t.list, t.exchange, t.card].forEach((p) => p.reset());
  await t.user.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/to third/);
  expect(t.exchange.count("first")).toBe(0);
  expect(t.exchange.count("second")).toBe(0);
  expect(t.exchange.count("third")).toBeGreaterThan(0);
  expect(t.card.count("t1")).toBe(0);
  expect(t.card.count("t2")).toBe(0);
  expect(t.card.count("t3")).toBeGreaterThan(0);
});
