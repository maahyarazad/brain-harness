import { test } from "node:test";
import assert from "node:assert/strict";
import { withMcpClient, resultText } from "../src/mcp/localClient.js";
import { buildApp } from "../src/app.js";

test("MCP server advertises the boilerplate tools with JSON Schemas", async () => {
  const { tools } = await withMcpClient((client) => client.listTools());
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["add", "ask_claude", "get_time", "summarize_text"]
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
  }
});

test("add tool returns the sum", async () => {
  const result = await withMcpClient((client) =>
    client.callTool({ name: "add", arguments: { a: 2, b: 3 } })
  );
  assert.equal(resultText(result), "5");
});

test("get_time reports an invalid timezone as a tool error", async () => {
  const result = await withMcpClient((client) =>
    client.callTool({ name: "get_time", arguments: { timezone: "Mars/Base" } })
  );
  assert.equal(result.isError, true);
  assert.match(resultText(result), /Invalid timezone/);
});

test("GET /health and GET /mcp behave as before", async () => {
  const app = buildApp({ logger: false });
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });

  const mcp = await app.inject({ method: "GET", url: "/mcp" });
  assert.equal(mcp.statusCode, 405);
  await app.close();
});
