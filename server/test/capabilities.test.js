import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { setAnthropicClient } from "../src/anthropic.js";
import { fakeAnthropic, message, text } from "./helpers/fakeAnthropic.js";

afterEach(() => setAnthropicClient(null));

async function inject(options) {
  const app = buildApp({ logger: false });
  const res = await app.inject(options);
  await app.close();
  return res;
}

test("GET /api/capabilities lists tools and prompt templates", async () => {
  const res = await inject({ method: "GET", url: "/api/capabilities" });
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.server.name, "brain-harness");
  assert.equal(body.tools.length, 4);
  for (const tool of body.tools) {
    assert.equal(tool.kind, "tool");
    assert.ok(tool.title && tool.description && tool.inputSchema);
  }
  const summarize = body.prompts.find((p) => p.name === "summarize");
  assert.equal(summarize.kind, "prompt");
  assert.equal(summarize.inputSchema.properties.text.type, "string");
  assert.deepEqual(summarize.inputSchema.required, ["text"]);
});

test("POST /api/tools/add runs the tool", async () => {
  const res = await inject({ method: "POST", url: "/api/tools/add", payload: { arguments: { a: 2, b: 3 } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { output: "5", isError: false });
});

test("tool-level errors come back as 200 with isError", async () => {
  const res = await inject({
    method: "POST",
    url: "/api/tools/get_time",
    payload: { arguments: { timezone: "Mars/Base" } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().isError, true);
  assert.match(res.json().output, /Invalid timezone: Mars\/Base/);
});

test("unknown tools return 404 and bad arguments return 400", async () => {
  const missing = await inject({ method: "POST", url: "/api/tools/nope", payload: { arguments: {} } });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "unknown_capability");

  const bad = await inject({ method: "POST", url: "/api/tools/add", payload: { arguments: "x" } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error.code, "invalid_request");
});

test("POST /api/prompts/summarize renders the template and asks Claude", async () => {
  const fake = fakeAnthropic([message([text("- one\n- two\n- three")])]);
  setAnthropicClient(fake);
  const res = await inject({
    method: "POST",
    url: "/api/prompts/summarize",
    payload: { arguments: { text: "A long article." } },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.match(body.renderedPrompt, /3 bullet points/);
  assert.match(body.renderedPrompt, /A long article\./);
  assert.equal(body.reply, "- one\n- two\n- three");
  assert.equal(body.stopReason, "end_turn");
  assert.deepEqual(body.toolCalls, []);
  assert.equal(fake.calls[0].messages[0].role, "user");
});

test("prompt runs without a key return 503", async () => {
  setAnthropicClient(null);
  const res = await inject({
    method: "POST",
    url: "/api/prompts/summarize",
    payload: { arguments: { text: "x" } },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error.code, "missing_api_key");
});
