# Adding a tool to Brain Harness

This guide walks you through adding a new tool to the Brain Harness MCP server and seeing it in the playground. Every future integration (Slack, Telegram, …) follows the same steps, so this is the pattern to learn.

## 1. What a tool is

A **tool** is an action that an AI model (or any MCP client) can call. In Brain Harness each tool is one file in `server/src/mcp/tools/` and exports three things:

| Export | What it is | Who uses it |
|---|---|---|
| `name` | Unique name, e.g. `get_time` | Claude and MCP clients call the tool by this name |
| `config.title` | Human-friendly label | The playground's "Tools & prompts" list |
| `config.description` | What the tool does and when to use it | **Claude reads this to decide whether to call the tool** |
| `config.inputSchema` | The arguments, as Zod fields | The MCP SDK validates arguments and publishes a JSON Schema; the playground builds its form from it |
| `handler` | `async (args) => result` | Runs when the tool is called |

A handler returns text content:

```js
return { content: [{ type: "text", text: "the result" }] };
```

If something goes wrong, return an error result instead of throwing, so the model can see what happened and recover:

```js
return { isError: true, content: [{ type: "text", text: "Invalid timezone: Mars/Base" }] };
```

Look at `server/src/mcp/tools/add.js` (simplest) and `getTime.js` (with error handling) for real examples.

## 2. Add the example `echo` tool

1. Copy the example file:

   ```bash
   cp server/src/mcp/tools/echo.js.example server/src/mcp/tools/echo.js
   ```

2. Register it in `server/src/mcp/tools/index.js`:

   ```js
   import * as echo from "./echo.js";

   export const tools = [add, getTime, summarizeText, askClaude, echo];
   ```

3. If `npm run dev` is running in `server/`, it restarts by itself (`--watch`). Otherwise start it with `npm run dev`.

That's it. There's no route to add and nothing to change in the web client.

## 3. See it working

**In the playground** (http://localhost:5173):

- Open **Tools & prompts**: `echo` is listed. Select it, type a message, and click **Run echo**. The message comes back.
- In the chat box, type: `Use the echo tool to repeat "hello from Brain Harness"`. A 🔧 `echo` card appears with the input Claude chose and the result.

**Over MCP** (the way Claude Desktop, Cursor or any other MCP client sees it):

```bash
curl -s http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`echo` appears in the `tools` list. Call it with:

```bash
curl -s http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hi"}}}'
```

## 4. Write descriptions for Claude

Claude only knows what your tool does from its `description` and the `.describe()` text on each argument. Good descriptions:

- Say what the tool does **and when it's useful** ("Use this to post a message to a Slack channel when the user asks to notify the team.")
- Name the format of each argument ("IANA timezone, e.g. 'Asia/Dubai'", "Slack channel ID like C0123456789").
- Mention limits or side effects ("Sends a real message: confirm with the user first").

If Claude isn't using your tool when you expect it to, improve the description before anything else.

## 5. Keep secrets on the server

Integrations need tokens (a Slack bot token, a Telegram bot token, …):

- Put them in `server/.env` (git-ignored), e.g. `SLACK_BOT_TOKEN=xoxb-...`, and add an empty line for each to `server/.env.example`, so others know which variables to set.
- Read them inside the handler with `process.env.SLACK_BOT_TOKEN`.
- Never accept tokens as tool arguments, and never include them in the text a tool returns. Tool results are shown in the playground and sent to Claude.

## 6. Next: integrations

A real integration is the same three exports. The handler just calls an external API. For example, a Slack tool would look roughly like this (not implemented yet; this is the shape to follow):

```js
export const name = "slack_post_message";

export const config = {
  title: "Post to Slack",
  description: "Post a message to a Slack channel. Use when the user asks to send or share something in Slack.",
  inputSchema: {
    channel: z.string().describe("Slack channel ID, e.g. C0123456789"),
    text: z.string().min(1).describe("Message text"),
  },
};

export async function handler({ channel, text }) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json();
  if (!data.ok) {
    return { isError: true, content: [{ type: "text", text: `Slack error: ${data.error}` }] };
  }
  return { content: [{ type: "text", text: `Posted to ${channel}.` }] };
}
```

A Telegram `telegram_send_message` tool follows the same pattern with `https://api.telegram.org/bot<TOKEN>/sendMessage`. Receiving messages from Slack or Telegram (webhooks, bots replying in a chat) is a separate step: it needs a public URL and a new route, and it will be its own feature.
