import { z } from "zod";

// Tool module: see add.js for the shape every tool follows.

export const name = "get_time";

export const config = {
  title: "Get current time",
  description: "Return the current date and time for an IANA timezone.",
  inputSchema: {
    timezone: z
      .string()
      .default("UTC")
      .describe("IANA timezone, e.g. 'Asia/Dubai' or 'America/New_York'"),
  },
};

export async function handler({ timezone }) {
  try {
    const now = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: timezone,
    }).format(new Date());
    return { content: [{ type: "text", text: now }] };
  } catch {
    // Tool-level errors are reported with isError so the model can recover
    return {
      isError: true,
      content: [{ type: "text", text: `Invalid timezone: ${timezone}` }],
    };
  }
}
