import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { setAnthropicClient } from "../src/anthropic.js";
import { fakeAnthropic, message, text, toolUse } from "./helpers/fakeAnthropic.js";

afterEach(() => setAnthropicClient(null));

async function chat(body) {
  const app = buildApp({ logger: false });
  const res = await app.inject({ method: "POST", url: "/api/chat", payload: body });
  await app.close();
  return res;
}

test("Claude calls get_time through MCP, then answers", async () => {
  const call = toolUse("get_time", { timezone: "Asia/Dubai" });
  const fake = fakeAnthropic([
    message([call], "tool_use"),
    message([text("It is late afternoon in Dubai.")]),
  ]);
  setAnthropicClient(fake);

  const res = await chat({ prompt: "What time is it in Dubai?", history: [] });
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.stopReason, "end_turn");
  assert.equal(body.reply, "It is late afternoon in Dubai.");
  assert.equal(body.toolCalls.length, 1);
  assert.equal(body.toolCalls[0].name, "get_time");
  assert.equal(body.toolCalls[0].isError, false);
  assert.match(body.toolCalls[0].output, /2\d{3}/); // a real formatted date

  assert.deepEqual(
    body.newMessages.map((m) => m.role),
    ["user", "assistant", "user", "assistant"]
  );
  // MCP tools were offered to Claude
  assert.ok(fake.calls[0].tools.some((t) => t.name === "get_time" && t.input_schema));
  assert.ok(fake.calls[0].tools.every((t) => !("$schema" in t.input_schema)));
  // The tool result went back in a single user message
  const resultMsg = fake.calls[1].messages.at(-1);
  assert.equal(resultMsg.role, "user");
  assert.equal(resultMsg.content[0].type, "tool_result");
  assert.equal(resultMsg.content[0].tool_use_id, call.id);
});

test("parallel tool calls produce one tool_result message", async () => {
  const fake = fakeAnthropic([
    message([toolUse("add", { a: 1, b: 2 }), toolUse("add", { a: 3, b: 4 })], "tool_use"),
    message([text("3 and 7")]),
  ]);
  setAnthropicClient(fake);

  const body = (await chat({ prompt: "two sums", history: [] })).json();
  assert.deepEqual(body.toolCalls.map((c) => c.output), ["3", "7"]);
  const resultMsg = fake.calls[1].messages.at(-1);
  assert.equal(resultMsg.content.length, 2);
});

test("an unknown tool is reported as an error and the loop continues", async () => {
  setAnthropicClient(
    fakeAnthropic([message([toolUse("nope", {})], "tool_use"), message([text("Sorry.")])])
  );
  const body = (await chat({ prompt: "x", history: [] })).json();
  assert.equal(body.toolCalls[0].isError, true);
  assert.equal(body.reply, "Sorry.");
});

test("tool calls are capped at 10 per prompt", async () => {
  const scripted = [];
  for (let i = 0; i < 5; i++) {
    scripted.push(message([toolUse("add", { a: i, b: 1 }), toolUse("add", { a: i, b: 2 })], "tool_use"));
  }
  scripted.push(message([toolUse("add", { a: 9, b: 9 })], "tool_use")); // the 11th call
  scripted.push(message([text("I stopped after 10 tool calls.")]));
  const fake = fakeAnthropic(scripted);
  setAnthropicClient(fake);

  const body = (await chat({ prompt: "keep adding", history: [] })).json();
  assert.equal(body.toolCalls.length, 10);
  assert.equal(body.stopReason, "tool_limit");
  assert.equal(body.reply, "I stopped after 10 tool calls.");
  const last = fake.calls.at(-1);
  assert.deepEqual(last.tool_choice, { type: "none" });
  const limited = last.messages.at(-1).content[0];
  assert.equal(limited.is_error, true);
  assert.equal(body.newMessages.at(-1).role, "assistant");
});

test("a refusal is reported and not added to history", async () => {
  setAnthropicClient(
    fakeAnthropic([message([], "refusal", { stop_details: { type: "refusal", category: "cyber" } })])
  );
  const body = (await chat({ prompt: "x", history: [] })).json();
  assert.equal(body.stopReason, "refusal");
  assert.match(body.reply, /cyber/);
  assert.deepEqual(body.newMessages, []);
});

test("missing API key returns 503 missing_api_key", async () => {
  setAnthropicClient(null);
  const res = await chat({ prompt: "hi", history: [] });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error.code, "missing_api_key");
});

test("invalid requests return 400 invalid_request", async () => {
  setAnthropicClient(fakeAnthropic([]));
  const empty = await chat({ prompt: "   ", history: [] });
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.json().error.code, "invalid_request");

  const badHistory = await chat({ prompt: "hi", history: "nope" });
  assert.equal(badHistory.statusCode, 400);
  assert.equal(badHistory.json().error.code, "invalid_request");
});

test("the 21st prompt is rejected with conversation_full", async () => {
  setAnthropicClient(fakeAnthropic([]));
  const history = [];
  for (let i = 0; i < 20; i++) {
    history.push({ role: "user", content: `q${i}` }, { role: "assistant", content: [text(`a${i}`)] });
  }
  const res = await chat({ prompt: "one more", history });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "conversation_full");
});

test("history is sent to Claude unchanged, followed by the new prompt", async () => {
  const fake = fakeAnthropic([message([text("Tokyo is 5 hours ahead.")])]);
  setAnthropicClient(fake);
  const history = [
    { role: "user", content: "What time is it in Dubai?" },
    { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig" }, text("4 PM.")] },
  ];
  await chat({ prompt: "now convert that to Tokyo time", history });

  const sent = fake.calls[0].messages;
  assert.deepEqual(sent.slice(0, 2), history);
  assert.deepEqual(sent[2], { role: "user", content: "now convert that to Tokyo time" });
});
