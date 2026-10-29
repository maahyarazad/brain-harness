import { z } from "zod";

// Every tool module exports the same three things:
//   name    - unique tool name Claude and MCP clients call it by
//   config  - title, description (Claude reads this to decide when to use
//             the tool) and a Zod inputSchema describing the arguments
//   handler - async function that receives the validated arguments and
//             returns { content: [{ type: "text", text }] }
// createMcpServer.js registers every module listed in ./index.js.

export const name = "add";

export const config = {
  title: "Add numbers",
  description: "Add two numbers together and return the sum.",
  inputSchema: {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
};

export async function handler({ a, b }) {
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
}
