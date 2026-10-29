import * as add from "./add.js";
import * as getTime from "./getTime.js";
import * as summarizeText from "./summarizeText.js";
import * as askClaude from "./askClaude.js";

// To add a tool: create a file in this folder and add it to this array.
// It then shows up for MCP clients on /mcp, in the playground's
// "Tools & prompts" panel, and as a tool Claude can call from chat.
export const tools = [add, getTime, summarizeText, askClaude];
