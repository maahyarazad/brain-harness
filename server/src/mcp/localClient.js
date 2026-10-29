import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./createMcpServer.js";

/**
 * Run `fn(client)` with an MCP client connected to a fresh Brain Harness MCP
 * server over an in-memory transport. The playground goes through real MCP
 * calls (tools/list, tools/call, ...) exactly like an external client would,
 * just without the network hop.
 */
export async function withMcpClient(fn) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: "brain-harness-playground", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

/** Join the text items of an MCP tools/call result. */
export function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}
