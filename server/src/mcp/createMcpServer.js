import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools } from "./tools/index.js";
import * as serverInfo from "./resources/serverInfo.js";
import * as summarize from "./prompts/summarize.js";

/**
 * Build a fresh MCP server instance with all tools, resources and prompts.
 * In stateless mode we create one per request, so no state leaks between clients.
 */
export function createMcpServer() {
  const server = new McpServer({
    name: "brain-harness",
    version: "1.0.0",
  });

  // ---- Tools: actions the model can call ----------------------------------
  for (const tool of tools) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  // ---- Resources: data the client can read --------------------------------
  server.registerResource(serverInfo.name, serverInfo.uri, serverInfo.config, serverInfo.handler);

  // ---- Prompts: reusable prompt templates ---------------------------------
  server.registerPrompt(summarize.name, summarize.config, summarize.handler);

  return server;
}
