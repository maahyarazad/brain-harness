import { z } from "zod";

// Prompt module: a reusable prompt template an MCP client can fill in.

export const name = "summarize";

export const config = {
  title: "Summarize text",
  description: "Ask the model to summarize a piece of text",
  argsSchema: { text: z.string().describe("Text to summarize") },
};

export function handler({ text }) {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please summarize the following text in 3 bullet points:\n\n${text}`,
        },
      },
    ],
  };
}
