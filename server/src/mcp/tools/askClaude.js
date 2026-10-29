import { z } from "zod";
import { callClaude } from "../../anthropic.js";

// Tool module: see add.js for the shape every tool follows.
// This one is LLM-powered: it calls the Anthropic API from the server.

export const name = "ask_claude";

export const config = {
  title: "Ask Claude",
  description:
    "Send a free-form question or task to Claude and return its answer.",
  inputSchema: {
    question: z.string().min(1).describe("The question or task for Claude"),
  },
};

export async function handler({ question }) {
  try {
    const answer = await callClaude({ prompt: question });
    return { content: [{ type: "text", text: answer }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Request failed: ${err.message}` }],
    };
  }
}
