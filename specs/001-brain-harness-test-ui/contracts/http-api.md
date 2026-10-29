# HTTP Contract: Brain Harness server

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

Base URL in development: `http://127.0.0.1:3000`. The web client reaches it through the Vite proxy using relative paths (research R6). All bodies are JSON.

## Error envelope (all `/api/*` routes)

```json
{ "error": { "code": "missing_api_key", "message": "ANTHROPIC_API_KEY is not set on the server." } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Body missing or malformed (e.g. empty prompt, `history` not an array). |
| 400 | `conversation_full` | `history` already holds 20 prompt turns. |
| 404 | `unknown_capability` | Tool or prompt name not advertised by the server. |
| 422 | `refusal` | Claude declined a request made by an LLM-powered helper (`callClaude`); chat itself reports refusals as `stopReason: "refusal"`. |
| 429 | `rate_limited` | Upstream Anthropic rate limit. |
| 502 | `upstream_error` | Other Anthropic API failure (message passed through). |
| 503 | `missing_api_key` | No `ANTHROPIC_API_KEY` configured (chat, prompt runs, and LLM-backed tools). |
| 504 | `upstream_timeout` | Anthropic call exceeded the server timeout. |

The API key is never included in any response or log line (FR-012).

---

## `GET /health` *(existing)*

`200 { "status": "ok" }`. Polled by the page for the online indicator (FR-010).

## `POST /mcp` *(existing, unchanged)*

Stateless MCP Streamable HTTP endpoint for external MCP clients. `GET`/`DELETE /mcp` → 405 (unchanged).

---

## `GET /api/capabilities`

Lists what the MCP server advertises (FR-009). Built by an in-memory MCP client calling `tools/list` and `prompts/list`.

**200**
```json
{
  "server": { "name": "brain-harness", "version": "1.0.0" },
  "tools": [
    {
      "kind": "tool",
      "name": "get_time",
      "title": "Get current time",
      "description": "Return the current date and time for an IANA timezone.",
      "inputSchema": { "type": "object", "properties": { "timezone": { "type": "string", "default": "UTC", "description": "IANA timezone, e.g. 'Asia/Dubai' or 'America/New_York'" } } }
    }
  ],
  "prompts": [
    {
      "kind": "prompt",
      "name": "summarize",
      "title": "Summarize text",
      "description": "Ask the model to summarize a piece of text",
      "inputSchema": { "type": "object", "properties": { "text": { "type": "string", "description": "Text to summarize" } }, "required": ["text"] }
    }
  ]
}
```

## `POST /api/chat`

Free-form prompt answered by Claude with access to every MCP tool (FR-003, FR-003a/b, FR-016).

**Request**
```json
{
  "prompt": "What time is it in Dubai right now?",
  "history": []
}
```
- `prompt`: non-empty string (trimmed).
- `history`: the `messages` array accumulated from earlier responses' `newMessages`, sent back **unchanged** (append-only, R5). `[]` for a new conversation.

**200**
```json
{
  "reply": "It's 4:12 PM on Thursday, October 29, 2026 in Dubai (GST).",
  "toolCalls": [
    {
      "id": "toolu_01...",
      "name": "get_time",
      "input": { "timezone": "Asia/Dubai" },
      "output": "Thursday, October 29, 2026 at 4:12:03 PM GMT+4",
      "isError": false
    }
  ],
  "stopReason": "end_turn",
  "newMessages": [
    { "role": "user", "content": "What time is it in Dubai right now?" },
    { "role": "assistant", "content": [ "...raw blocks incl. thinking + tool_use..." ] },
    { "role": "user", "content": [ { "type": "tool_result", "tool_use_id": "toolu_01...", "content": "..." } ] },
    { "role": "assistant", "content": [ "...final blocks..." ] }
  ]
}
```
- `stopReason`: `"end_turn"` normally; `"tool_limit"` when the 10-call cap ended the loop (with `reply` set to an explanatory message); `"max_tokens"` if the answer was cut off; `"refusal"` if declined (see below).
- The client appends `newMessages` to `history` verbatim.
- On `"tool_limit"`, `newMessages` still forms a valid history ending in an assistant turn. Pending `tool_use` blocks beyond the cap are answered with `tool_result` blocks marked `is_error: true` ("tool-call limit reached"). One final request is then made with `tool_choice: { "type": "none" }`, so Claude writes a closing answer, which becomes `reply`.

**Refusal**: `200` with `stopReason: "refusal"`, `reply` set to a short notice including the category, and `newMessages: []`, so the refused turn is not added to history.

**Errors**: envelope above. No partial `newMessages` on error.

## `POST /api/tools/:name`

Runs one MCP tool directly with the given arguments (Story 3). Does not involve Claude unless the tool itself does (e.g. `summarize_text`).

**Request**: `{ "arguments": { "text": "...", "style": "one-line" } }`

**200**: `{ "output": "One-sentence summary...", "isError": false }`
- Tool-level failures (MCP `isError: true`, e.g. invalid timezone) are **200** with `isError: true` and the tool's message in `output`.

**Errors**: `404 unknown_capability`; `400 invalid_request` if `arguments` is not an object.

## `POST /api/prompts/:name`

Renders an MCP prompt template and sends the result to Claude, single-turn with no history and tools enabled (Story 3).

**Request**: `{ "arguments": { "text": "..." } }`

**200**
```json
{
  "renderedPrompt": "Please summarize the following text in 3 bullet points:\n\n...",
  "reply": "- ...\n- ...\n- ...",
  "toolCalls": [],
  "stopReason": "end_turn"
}
```

**Errors**: envelope above (`404 unknown_capability`, `503 missing_api_key`, …).
