import { z } from "zod";
import { callClaude } from "../../anthropic.js";

// Tool module: see add.js for the shape every tool follows.
// This one is LLM-powered: it calls the Anthropic API from the server.

export const name = "summarize_text";

export const config = {
  title: "Summarize text",
  description:
    "Summarize a piece of text using Claude. Useful for long documents or articles.",
  inputSchema: {
    text: z.string().min(1).describe("The text to summarize"),
    style: z
      .enum(["bullets", "paragraph", "one-line"])
      .default("bullets")
      .describe("Output format of the summary"),
  },
};

export async function handler({ text, style }) {
  try {
    const summary = await callClaude({
      system:
        "You are a precise summarizer. Return only the summary, with no preamble.",
      prompt: `Summarize the following text as ${style}:\n\n${text}`,
    });
    return { content: [{ type: "text", text: summary }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Summarization failed: ${err.message}` }],
    };
  }
}
