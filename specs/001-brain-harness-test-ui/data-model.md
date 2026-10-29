# Data Model: Brain Harness — Prompt & Voice Test UI

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

There is no database. All state lives in the browser for the length of a page session. The server is stateless: each request carries everything it needs.

## Browser state

### Conversation

| Field | Type | Notes |
|---|---|---|
| `history` | `MessageParam[]` (Anthropic shape, opaque to the UI) | Raw messages sent to/returned by the chat endpoint, including `thinking`, `tool_use` and `tool_result` blocks. **Append-only**: never edited, reordered or trimmed (R5). |
| `exchanges` | `Exchange[]` | What the page renders, in chronological order. |
| `chatTurnCount` | number | Count of free-form exchanges in this conversation. |

**Rules**
- At most **20** free-form exchanges (`chatTurnCount ≤ 20`). At 20, Send is disabled and a "Conversation full — Clear to start over" notice is shown.
- **Clear** resets `history = []`, `exchanges = []` and `chatTurnCount = 0`. Reloading the page does the same.
- Capability runs (Story 3) add to `exchanges` only and never touch `history` (FR-016).
- A failed chat request appends nothing to `history`, so the tester can retry with the same history.

### Exchange

| Field | Type | Notes |
|---|---|---|
| `id` | string | Client-generated unique id (`crypto.randomUUID()`). |
| `kind` | `"chat"` \| `"tool"` \| `"prompt"` | Free-form prompt, direct tool run, or prompt-template run. |
| `source` | `"text"` \| `"voice"` \| `"form"` | How the input was entered. `voice` = the prompt box was last filled by speech. |
| `input` | string \| object | Prompt text (chat) or `{ name, arguments }` (tool/prompt). |
| `toolCalls` | `ToolCall[]` | Calls Claude made while answering (chat only; empty otherwise). |
| `renderedPrompt` | string \| null | For `kind: "prompt"`: the template text the server produced. |
| `output` | string \| null | Final answer or tool result text; `null` while pending. |
| `status` | `"pending"` \| `"done"` \| `"error"` | See state transitions. |
| `error` | `{ code, message }` \| null | Set when `status = "error"`. |
| `sentAt` / `receivedAt` | ISO timestamp | `receivedAt` is null while pending. |

**State transitions**

```text
pending ──(200 response)──────────────► done
   │
   ├──(error response / network fail)─► error
   └──(60 s client timeout)───────────► error  (code: "timeout")
```

Only one exchange may be `pending` at a time (FR-005).

### ToolCall

| Field | Type | Notes |
|---|---|---|
| `id` | string | Anthropic `tool_use.id`. |
| `name` | string | MCP tool name, e.g. `get_time`. |
| `input` | object | Arguments Claude chose. |
| `output` | string | Joined text content of the MCP result (or an error message). |
| `isError` | boolean | MCP `isError`, or the tool threw / the name was unknown. |

### Capability (from `GET /api/capabilities`)

| Field | Type | Notes |
|---|---|---|
| `kind` | `"tool"` \| `"prompt"` | |
| `name` | string | Unique within its kind. |
| `title` | string | Falls back to `name`. |
| `description` | string | |
| `inputSchema` | JSON Schema object | Tools: from MCP `inputSchema`. Prompts: built from MCP prompt `arguments` (all `type: "string"`, `required` as declared). Drives the generated form. |

### Voice settings (component state, not persisted)

| Field | Type | Notes |
|---|---|---|
| `recognitionSupported` | boolean | Feature-detected on load. |
| `listening` | boolean | Mic active. |
| `readAloud` | boolean | Default `false` (FR-007). |
| `speaking` | boolean | Read-aloud in progress; enables Stop. |
| `micError` | string \| null | e.g. permission denied, "Didn't catch that". |

### ServerStatus

| Field | Type | Notes |
|---|---|---|
| `online` | boolean | From polling `GET /health` every 10 s (and on load). |
| `checkedAt` | ISO timestamp | |

## Validation rules (enforced in both places where noted)

- Prompt text: trimmed, non-empty (client blocks send; server returns `400 invalid_request`).
- `history`: must be an array (server); its contents are passed through to the API unchanged.
- History length: the server counts prompt turns in `history` (user messages that are not only `tool_result` blocks) and rejects a request that would be the 21st with `400 conversation_full`, as a backstop for the client cap.
- Tool/prompt arguments: validated by the MCP server's own Zod schemas; failures come back as tool errors.
