import { ApiError } from "./errors.js";
import { requireAnthropic } from "./anthropic.js";
import { withMcpClient, resultText } from "./mcp/localClient.js";
import { runToolLoop } from "./chat/runChat.js";

/** Everything the MCP server advertises, shaped for the playground's forms. */
export async function listCapabilities() {
  return withMcpClient(async (client) => {
    const [{ tools }, { prompts }] = await Promise.all([client.listTools(), client.listPrompts()]);
    return {
      server: client.getServerVersion(),
      tools: tools.map((tool) => ({
        kind: "tool",
        name: tool.name,
        title: tool.title ?? tool.annotations?.title ?? tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
      })),
      prompts: prompts.map((prompt) => ({
        kind: "prompt",
        name: prompt.name,
        title: prompt.title ?? prompt.name,
        description: prompt.description ?? "",
        // MCP prompt arguments are always strings; describe them as a JSON Schema
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            (prompt.arguments ?? []).map((arg) => [
              arg.name,
              { type: "string", description: arg.description ?? "" },
            ])
          ),
          required: (prompt.arguments ?? []).filter((arg) => arg.required).map((arg) => arg.name),
        },
      })),
    };
  });
}

/** Run one MCP tool directly (no Claude involved unless the tool calls it). */
export async function runTool(name, args) {
  return withMcpClient(async (client) => {
    const { tools } = await client.listTools();
    if (!tools.some((tool) => tool.name === name)) {
      throw new ApiError(404, "unknown_capability", `No tool named "${name}".`);
    }
    try {
      const result = await client.callTool({ name, arguments: args });
      return { output: resultText(result), isError: Boolean(result.isError) };
    } catch (err) {
      // e.g. arguments that fail the tool's input schema
      return { output: err.message, isError: true };
    }
  });
}

/** Fill in an MCP prompt template, then send the result to Claude. */
export async function runPrompt(name, args) {
  const rendered = await withMcpClient(async (client) => {
    const { prompts } = await client.listPrompts();
    if (!prompts.some((prompt) => prompt.name === name)) {
      throw new ApiError(404, "unknown_capability", `No prompt template named "${name}".`);
    }
    requireAnthropic();
    try {
      return await client.getPrompt({ name, arguments: args });
    } catch (err) {
      throw new ApiError(400, "invalid_request", err.message);
    }
  });

  const messages = rendered.messages.map((m) => ({
    role: m.role,
    content: m.content.type === "text" ? m.content.text : JSON.stringify(m.content),
  }));
  const renderedPrompt = messages.map((m) => m.content).join("\n\n");

  const { reply, toolCalls, stopReason } = await runToolLoop({ messages });
  return { renderedPrompt, reply, toolCalls, stopReason };
}
