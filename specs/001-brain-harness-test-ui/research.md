# Research: Brain Harness — Prompt & Voice Test UI

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-29

Each entry: Decision / Rationale / Alternatives considered.

---

## R1. How Claude reaches the MCP server's tools (FR-003)

**Decision**: Inside the Fastify server, connect an MCP **Client** to a fresh `createMcpServer()` instance over the SDK's **in-memory transport** (`InMemoryTransport.createLinkedPair()`), call `listTools()` to build the Anthropic `tools` array, and execute each `tool_use` block with `client.callTool()`.

**Rationale**:
- The chat endpoint uses exactly the same tool registry and code path as external MCP clients hitting `/mcp`. A tool added to `createMcpServer()` (e.g. `slack_post_message`) shows up in chat with no further wiring, which is the core of FR-003 and the Slack/Telegram learning goal.
- MCP tool definitions already carry a JSON Schema (`inputSchema`) that maps 1:1 to Anthropic's `input_schema`, so the conversion is a three-field map: `{ name, description, input_schema: tool.inputSchema }`.
- No network hop and no extra process; fits the stateless, one-server-per-request style of the boilerplate.

**Alternatives considered**:
- *Anthropic MCP connector* (`mcp_servers` + `mcp_toolset`, beta): Anthropic connects to the MCP server from its own infrastructure, so it needs a publicly reachable URL. Rejected for a localhost playground. Worth revisiting once the server is deployed.
- *Calling the tool handler functions directly*: bypasses MCP, so validation, `isError` handling and future tools would diverge from what real MCP clients see. Rejected.
- *Python SDK MCP helpers*: the server is Node.js; the TypeScript/JS SDK has no equivalent helper, and the hand-written mapping is a few lines.

## R2. Agentic loop: SDK tool runner vs manual loop

**Decision**: A **manual loop** (`messages.create` → run `tool_use` blocks → append `tool_result` → repeat), capped at **10 tool calls** per prompt.

**Rationale**: The tools are executed through an MCP client, not as in-process `run()` functions, and the UI needs a structured record of every call (name, input, result, error flag) plus a hard cap with a specific message (FR-003a/b). A ~40-line explicit loop is also the clearest thing to learn from. All `tool_result` blocks from one assistant turn go back in a **single** user message, and failed tools return `is_error: true` instead of being dropped.

**Alternatives considered**: `client.beta.messages.toolRunner` with `betaTool()` wrappers that call MCP. It works, but it hides the loop the user wants to learn and makes per-call recording and the cap less direct.

## R3. Model, thinking and effort

**Decision**: Model from `ANTHROPIC_MODEL`, defaulting to **`claude-sonnet-5-5`**, the default in the user's boilerplate. Omit `thinking` (Sonnet 5.5 runs adaptive thinking). Set `output_config.effort: "medium"` for the chat loop, the recommended starting point for multi-step tool use. `max_tokens: 16000` (non-streaming). `tool_choice` stays `auto`: forced `any`/`tool` returns a 400 on this model.

**Rationale**: Respects the model the user chose in their snippet while following current API rules. `max_tokens` covers thinking plus answer, so the snippet's `1000` would truncate; the existing `callClaude` helper is raised to the same value.

**Alternatives considered**: `claude-opus-5-5` gives higher quality at 2× the price. It can be switched with the env var, with no code change.

## R4. Refusals and fallback

**Decision**: Send requests through `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. Always check `stop_reason` before reading content: on `"refusal"`, end the exchange with an error entry naming `stop_details.category`.

**Rationale**: Current guidance for Sonnet 5.5 on the Claude API. Requests a safety classifier would otherwise decline get routed to a fallback model instead of failing the playground.

## R5. Conversation memory and preserved thinking (FR-016)

**Decision**: The **browser** keeps the raw Anthropic `messages` array (including assistant `thinking` and `tool_use` blocks, unchanged) and sends it back with each prompt. The server is stateless and returns only the new messages to append. History is strictly **append-only**. Instead of trimming the oldest exchanges, a conversation is capped at **20 exchanges**: at the cap the page disables Send and asks the tester to **Clear** to start a new conversation.

**Rationale**: On Claude Sonnet 5.5, thinking blocks are bound to the conversation. Removing or editing earlier turns (a sliding window) invalidates them, and for accounts created on or after 2026-08-31 it returns a 400. Append-only plus a cap keeps every request valid, keeps the server stateless (matching the boilerplate), and still bounds cost.

**Spec impact**: The spec's "Very long conversation" edge case originally said older exchanges would be silently forgotten. It has been updated to the cap-and-clear behaviour. FR-016's 20-exchange limit is unchanged.

**Alternatives considered**: Server-side sessions (adds state and cleanup for no playground benefit). Server-side compaction (beta; overkill at 20 exchanges). Sliding window (invalid with preserved thinking).

## R6. Browser ↔ server connection (no CORS)

**Decision**: In development, the Vite dev server (port 5173) **proxies** `/api` and `/health` to Fastify on `127.0.0.1:3000`. The page only ever calls relative URLs.

**Rationale**: Same origin from the browser's point of view, so no CORS plugin is needed and the API key never leaves the server (FR-012). For a production build, Fastify can serve `web-client/dist` with `@fastify/static`; this is optional and out of scope.

**Alternatives considered**: `@fastify/cors` with an allow-list. Works, but it's an extra dependency and setting to explain.

## R7. Voice (FR-006/007/008)

**Decision**: Browser **Web Speech API**. `SpeechRecognition`/`webkitSpeechRecognition` with `interimResults: true` and `continuous: false` for input, and `speechSynthesis` + `SpeechSynthesisUtterance` for read-aloud. Feature-detect both; activating the mic calls `speechSynthesis.cancel()`.

**Rationale**: Chosen in clarification (Option A): no key, no cost, nothing on the server. Chromium is the primary target. Safari has partial support; Firefox has no recognition, so the mic is disabled with an explanation there.

## R8. Server code layout and language

**Decision**: Keep the boilerplate's **plain JavaScript (ESM), Node.js 20+**. Split it into small modules under `server/src/`, one file per tool under `server/src/mcp/tools/`, so "add a tool" means "add one file and register it".

**Rationale**: The snippet is untyped ESM, and matching it keeps the learning path short. The per-file tool layout is the template the Slack/Telegram integrations will copy (FR-015).

**Alternatives considered**: TypeScript (adds a build step and type noise for a learner); a single `index.js` (fine today, but crowded once integrations arrive).

## R9. Web client stack details

**Decision**: Vite + React (JavaScript, JSX), user-mandated. No UI library and no router. Plain CSS with tokens and a light/dark theme via `prefers-color-scheme`. Answers render as plain text with preserved line breaks (no markdown renderer, to stay minimal). Forms for Story 3 are generated from each capability's JSON Schema, covering `string`, `number`, `enum` and `default`, which is all current tools use.

## R10. Testing

**Decision**:
- **Server**: `node:test` with Fastify's `app.inject()`. Covers capability listing, direct tool runs, error mapping, and the chat loop with a **stubbed Anthropic client** (scripted `tool_use` → `end_turn` responses), including the 10-call cap and the refusal path. No real API calls in tests.
- **Web client**: Vitest + React Testing Library for the message list, the composer (Enter vs Shift+Enter, disabled while pending), the capability form generator and the voice-unsupported fallback.
- **Manual/E2E**: [quickstart.md](./quickstart.md) scenarios with a real key.

## R11. Request timeout (60 s edge case)

**Decision**: The browser aborts requests after **60 s** (`AbortController`) and shows a timeout entry. On the server, the Anthropic client gets `timeout: 50_000` ms and `maxRetries: 1`, so the server usually answers with a clear error before the browser gives up.
