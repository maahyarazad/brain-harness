# Implementation Plan: Brain Harness — Prompt & Voice Test UI

**Branch**: `001-brain-harness-test-ui` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-brain-harness-test-ui/spec.md`

## Summary

Turn the user's Fastify MCP boilerplate into the **Brain Harness** server and add a minimal **Vite + React** playground in `web-client/` for testing prompts and voice.

The server keeps its existing `/mcp` and `/health` endpoints and gains a small `/api` surface for the page:
- **Chat**: Claude answers free-form prompts in a manual tool-use loop. Its tools come from the server's own MCP registry through an in-memory MCP client, so every tool added later (Slack, Telegram, …) is usable from chat automatically.
- **Capabilities**: lists tools and prompt templates and runs them directly.

The browser holds the append-only conversation history, and voice uses the browser's built-in Web Speech API. A step-by-step `docs/adding-a-tool.md` guide is the template for future service integrations.

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js 20+ (server); JavaScript + JSX (web client)

**Primary Dependencies**:
- Server: `fastify` 5, `@modelcontextprotocol/sdk` (McpServer, StreamableHTTPServerTransport, Client, InMemoryTransport), `@anthropic-ai/sdk`, `zod`
- Web client: `vite`, `react` 18, `react-dom`, `@vitejs/plugin-react`

**Storage**: None. Session state lives in the browser only; config via `server/.env` (loaded with Node's `--env-file`).

**Testing**: `node:test` + Fastify `inject()` (server, with a stubbed Anthropic client); Vitest + React Testing Library + jsdom (web client); manual scenarios in [quickstart.md](./quickstart.md).

**Target Platform**: Local development machine (macOS/Linux/Windows). Chromium browsers for full voice support.

**Project Type**: Web application (Node API server + SPA client)

**Model**: `ANTHROPIC_MODEL`, default `claude-sonnet-5-5` (from the boilerplate). Adaptive thinking, effort `medium`, server-side refusal fallback (research R3/R4).

**Performance Goals**: Page interactive under 1 s locally. Non-LLM endpoints (`/health`, `/api/capabilities`, direct tool runs) respond under 200 ms. Chat latency is bounded by the model (SC-001: first answer within 30 s of opening the page).

**Constraints**: API key server-side only (FR-012); 60 s client timeout; ≤ 10 tool calls per prompt; ≤ 20 exchanges per conversation, append-only history; no CORS (Vite proxy).

**Scale/Scope**: One local tester. 4 tools, 1 prompt template and 1 resource today; one screen with a collapsible "Tools & prompts" panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template: no principles have been ratified, so there are no gates to evaluate. **Status: PASS (no constraints defined).**

The design still follows the spirit of a minimal playground: no database, no auth, no UI framework beyond React, plain JavaScript to match the boilerplate, and tests that never call the real API. Consider running `/speckit-constitution` before the Slack/Telegram features, when security and secrets handling will matter more.

**Post-design re-check (after Phase 1)**: PASS. No new projects, layers or dependencies were introduced beyond those listed above.

## Project Structure

### Documentation (this feature)

```text
specs/001-brain-harness-test-ui/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: browser state, exchanges, tool calls
├── quickstart.md        # Phase 1: setup + validation scenarios V1–V17
├── contracts/
│   └── http-api.md      # Phase 1: /health, /mcp, /api/* contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
server/
├── package.json             # "type": "module"; scripts: dev (node --watch --env-file=.env), start, test
├── .env.example             # ANTHROPIC_API_KEY=, ANTHROPIC_MODEL=claude-sonnet-5-5, PORT=3000, HOST=127.0.0.1
├── src/
│   ├── index.js             # Fastify app: registers routes, starts listening (from boilerplate)
│   ├── config.js            # Reads env (PORT, HOST, MODEL); never logs the key
│   ├── anthropic.js         # Shared Anthropic client (or null), callClaude() helper, error → envelope mapping
│   ├── mcp/
│   │   ├── createMcpServer.js   # Builds McpServer "brain-harness"; registers everything below
│   │   ├── localClient.js       # withMcpClient(fn): in-memory Client ↔ fresh server pair (R1)
│   │   ├── tools/
│   │   │   ├── index.js         # Array of tool modules; adding a tool = one file + one line here
│   │   │   ├── add.js
│   │   │   ├── getTime.js
│   │   │   ├── summarizeText.js
│   │   │   └── askClaude.js
│   │   ├── resources/serverInfo.js
│   │   └── prompts/summarize.js
│   ├── chat/
│   │   └── runChat.js       # Manual tool-use loop: MCP tools → Claude → callTool, 10-call cap, refusal handling (R2–R5)
│   └── routes/
│       ├── mcp.js           # POST /mcp (unchanged logic), GET/DELETE 405
│       ├── health.js
│       └── api.js           # /api/capabilities, /api/chat, /api/tools/:name, /api/prompts/:name
└── test/
    ├── capabilities.test.js
    ├── tools.test.js
    ├── chat.test.js         # stubbed Anthropic: tool_use → end_turn, cap, refusal, missing key
    └── helpers/fakeAnthropic.js

web-client/
├── package.json
├── vite.config.js           # React plugin; dev proxy /api + /health → http://127.0.0.1:3000; Vitest config
├── index.html               # <title>Brain Harness</title>
└── src/
    ├── main.jsx
    ├── App.jsx              # Layout: header + status, conversation, composer, tools panel
    ├── styles.css           # Tokens, light/dark, single-column layout
    ├── api.js               # fetch wrappers with 60 s AbortController + error envelope parsing
    ├── hooks/
    │   ├── useConversation.js   # history/exchanges/chatTurnCount, send, clear, 20-exchange cap
    │   ├── useServerStatus.js   # polls /health every 10 s
    │   ├── useSpeechInput.js    # Web Speech recognition, feature detection, errors
    │   └── useSpeechOutput.js   # speechSynthesis read-aloud + stop
    ├── components/
    │   ├── Header.jsx           # "Brain Harness" + Online/Offline dot + Clear
    │   ├── ExchangeList.jsx     # Prompts, answers, errors, auto-scroll
    │   ├── ToolCallCard.jsx     # name / input / output / error badge (collapsible)
    │   ├── Composer.jsx         # textarea, 🎤, Send, read-aloud toggle, Stop
    │   └── CapabilityPanel.jsx  # list + form generated from inputSchema (string/number/enum/default)
    └── __tests__/               # Vitest + RTL

docs/
└── adding-a-tool.md         # FR-015: step-by-step "add an echo tool", the template for Slack/Telegram

README.md                    # What Brain Harness is, run instructions (links quickstart), where to put the key
.gitignore                   # node_modules, dist, .env
```

**Structure Decision**: Two sibling projects, `server/` (the boilerplate, modularised) and `web-client/` (location mandated by the user), plus a top-level `docs/`. One file per MCP tool under `server/src/mcp/tools/` keeps "add a tool / integration" a one-file change that both `/mcp` and the playground pick up automatically.

## Design Notes

### Chat loop (`server/src/chat/runChat.js`)

1. Validate `prompt` and `history`; reject the 21st prompt turn (`conversation_full`).
2. `withMcpClient`: `listTools()` → `[{ name, description, input_schema }]`.
3. `messages = [...history, { role: "user", content: prompt }]`. Remember `startIndex = history.length`.
4. Loop: `anthropic.beta.messages.create({ model, max_tokens: 16000, output_config: { effort: "medium" }, system, tools, messages, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })`.
   - `refusal` → return a refusal reply with `newMessages: []`.
   - `pause_turn` → append the assistant content and continue.
   - `tool_use` → append the assistant `response.content` verbatim. For each `tool_use` block: if under the cap, `callTool()` and record a ToolCall; otherwise reply with an `is_error` "limit reached" result. Append **all** `tool_result` blocks in one user message. If the cap was hit, make one last call with `tool_choice: { type: "none" }`.
   - `end_turn` / `max_tokens` → append the assistant content and stop.
5. Return `{ reply (joined text blocks of the final turn), toolCalls, stopReason, newMessages: messages.slice(startIndex) }`.

The system prompt is short and fixed (cache-friendly). It says the assistant is "Brain Harness", should use tools when they give a more accurate answer, and should answer concisely in plain text.

### Boilerplate changes

- Server name `fastify-mcp-server` → `brain-harness` (MCP server info and `server-info` resource).
- `callClaude` `maxTokens` default 1000 → 16000 (thinking counts toward the limit); it uses the same fallback and refusal handling.
- `/mcp` behaviour is unchanged; the code moves into `routes/mcp.js`.

### Web client layout (minimal)

A single centred column, max 760 px wide:
- **Header**: name, status dot, Clear.
- **Scrollable exchange list**: prompt bubble, then collapsible tool-call cards, then the answer or a red error card.
- **Sticky composer**: textarea, 🎤 button, Send button, "Read answers aloud" switch.
- **"Tools & prompts"**: a collapsible drawer below the header.

Three primary controls are visible at once (SC-006). The layout works at phone width.

## Complexity Tracking

No constitution violations to justify.
