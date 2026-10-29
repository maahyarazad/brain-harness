import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../mcp/createMcpServer.js";

export default async function mcpRoutes(app) {
  // MCP endpoint: Streamable HTTP transport, stateless mode
  app.post("/mcp", async (request, reply) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // undefined = stateless
    });

    // Clean up when the client disconnects or the response finishes
    reply.raw.on("close", () => {
      transport.close();
      server.close();
    });

    // The MCP SDK writes directly to the Node response, so tell Fastify
    // not to send its own reply.
    reply.hijack();

    try {
      await server.connect(transport);
      // Pass Fastify's already-parsed JSON body as the third argument
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      request.log.error(err, "MCP request failed");
      if (!reply.raw.headersSent) {
        reply.raw
          .writeHead(500, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            })
          );
      }
    }
  });

  // In stateless mode there are no server-initiated streams or sessions to end
  const methodNotAllowed = async (_request, reply) =>
    reply.code(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);
}
