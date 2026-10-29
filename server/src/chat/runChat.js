import { createMessage, requireAnthropic, textOf } from "../anthropic.js";
import { ApiError } from "../errors.js";
import { withMcpClient, resultText } from "../mcp/localClient.js";

export const MAX_TOOL_CALLS = 10;
export const MAX_PROMPT_TURNS = 20;

const SYSTEM_PROMPT =
  "You are Brain Harness, a helpful assistant in a developer playground for an MCP server. " +
  "Use the available tools whenever they give a more accurate or up-to-date answer than your " +
  "own knowledge (for example the current time or arithmetic). Answer concisely in plain text.";

/**
 * Answer a free-form prompt. Claude can call any tool the MCP server exposes.
 *
 * `history` is the conversation so far, exactly as earlier calls returned it
 * in `newMessages`. It is append-only: never edit or trim it, because Claude's
 * thinking blocks are tied to the exact conversation they were produced in.
 */
export async function runChat({ prompt, history = [] }) {
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new ApiError(400, "invalid_request", "Prompt must be a non-empty string.");
  }
  if (!Array.isArray(history)) {
    throw new ApiError(400, "invalid_request", "History must be an array.");
  }
  if (countPromptTurns(history) >= MAX_PROMPT_TURNS) {
    throw new ApiError(
      400,
      "conversation_full",
      `This conversation has reached ${MAX_PROMPT_TURNS} exchanges. Clear to start a new one.`
    );
  }
  requireAnthropic();

  const messages = [...history, { role: "user", content: prompt.trim() }];
  const result = await runToolLoop({ messages });
  return { ...result, newMessages: result.stopReason === "refusal" ? [] : messages.slice(history.length) };
}

/**
 * The agentic loop: ask Claude, run the tools it asks for through MCP, send
 * the results back, repeat until Claude gives a final answer.
 * Appends to `messages` in place; returns the reply and a record of tool calls.
 */
export async function runToolLoop({ messages }) {
  return withMcpClient(async (client) => {
    // 1. Turn the MCP tool list into Anthropic tool definitions. MCP already
    //    describes inputs with JSON Schema, so this is a direct mapping.
    const { tools: mcpTools } = await client.listTools();
    const tools = mcpTools.map((tool) => {
      const { $schema, ...inputSchema } = tool.inputSchema; // drop the JSON Schema dialect marker
      return { name: tool.name, description: tool.description ?? "", input_schema: inputSchema };
    });

    const toolCalls = [];
    let response;

    while (true) {
      // 2. Ask Claude.
      response = await createMessage({ system: SYSTEM_PROMPT, tools, messages });

      // A declined request: report it and keep it out of the history.
      if (response.stop_reason === "refusal") {
        const category = response.stop_details?.category ?? "unspecified";
        return {
          reply: `Claude declined this request (${category}).`,
          toolCalls,
          stopReason: "refusal",
        };
      }

      // 3. Keep Claude's turn exactly as returned (including thinking blocks).
      messages.push({ role: "assistant", content: response.content });

      // A long server-side turn was paused: send it back so it continues.
      if (response.stop_reason === "pause_turn") continue;

      if (response.stop_reason !== "tool_use") break; // end_turn, max_tokens, ...

      // 4. Run every tool Claude asked for, up to the per-prompt cap.
      const toolResults = [];
      let hitLimit = false;
      for (const block of response.content.filter((b) => b.type === "tool_use")) {
        if (toolCalls.length >= MAX_TOOL_CALLS) {
          hitLimit = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool-call limit reached (${MAX_TOOL_CALLS} per prompt).`,
            is_error: true,
          });
          continue;
        }
        const call = await callMcpTool(client, block);
        toolCalls.push(call);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: call.output,
          ...(call.isError ? { is_error: true } : {}),
        });
      }

      // 5. All results go back together in one user message.
      messages.push({ role: "user", content: toolResults });

      // Out of tool calls: ask for a final answer with tools switched off.
      if (hitLimit) {
        response = await createMessage({
          system: SYSTEM_PROMPT,
          tools,
          messages,
          tool_choice: { type: "none" },
        });
        messages.push({ role: "assistant", content: response.content });
        return { reply: textOf(response), toolCalls, stopReason: "tool_limit" };
      }
    }

    return { reply: textOf(response), toolCalls, stopReason: response.stop_reason };
  });
}

/** Run one tool_use block through MCP and record the outcome. */
async function callMcpTool(client, block) {
  try {
    const result = await client.callTool({ name: block.name, arguments: block.input });
    return {
      id: block.id,
      name: block.name,
      input: block.input,
      output: resultText(result),
      isError: Boolean(result.isError),
    };
  } catch (err) {
    // Unknown tool or invalid arguments: report it to Claude so it can recover
    return { id: block.id, name: block.name, input: block.input, output: err.message, isError: true };
  }
}

/** Prompt turns are user messages that are not only tool results. */
function countPromptTurns(history) {
  return history.filter(
    (m) =>
      m?.role === "user" &&
      (typeof m.content === "string" ||
        (Array.isArray(m.content) && m.content.some((b) => b.type !== "tool_result")))
  ).length;
}
