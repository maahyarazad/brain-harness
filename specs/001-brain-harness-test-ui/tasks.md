---

description: "Task list for Brain Harness — Prompt & Voice Test UI"
---

# Tasks: Brain Harness — Prompt & Voice Test UI

**Input**: Design documents from `/specs/001-brain-harness-test-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Included, because plan.md (Technical Context → Testing) and research R10 define them: server `node:test` with a **stubbed** Anthropic client (never the real API) and web-client Vitest + React Testing Library. Write each story's tests alongside or before its implementation.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: User story the task belongs to (US1, US2, US3)
- Paths are relative to the repository root (`server/`, `web-client/`, `docs/`)

## Reference shortcuts used below

- **Contract** = `specs/001-brain-harness-test-ui/contracts/http-api.md`
- **Data model** = `specs/001-brain-harness-test-ui/data-model.md`
- **Rn** = decision Rn in `specs/001-brain-harness-test-ui/research.md`
- **Boilerplate** = the Fastify MCP server code the user pasted in the `/speckit-specify` request (tools `add`, `get_time`, `summarize_text`, `ask_claude`; resource `server-info`; prompt `summarize`; `/health`, `POST /mcp`, `GET`/`DELETE /mcp` → 405)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create both projects and repo-level files

- [X] T001 Create repo-level `.gitignore` with `node_modules/`, `dist/`, `.env`, `.env.*` (but keep `!.env.example`), `.DS_Store`, `coverage/` in `.gitignore`
- [X] T002 Create `server/package.json`: `"name": "brain-harness-server"`, `"type": "module"`, `"engines": {"node": ">=20"}`; scripts `dev` = `node --watch --env-file-if-exists=.env src/index.js`, `start` = `node --env-file-if-exists=.env src/index.js`, `test` = `node --test test/`; dependencies `fastify@^5`, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `zod`; then run `npm install` in `server/` (installs latest compatible versions and writes the lockfile)
- [X] T003 [P] Create `server/.env.example` with commented lines: `ANTHROPIC_API_KEY=` (put your key here, never commit `.env`), `ANTHROPIC_MODEL=claude-sonnet-5-5`, `PORT=3000`, `HOST=127.0.0.1`
- [X] T004 [P] Scaffold `web-client/` as a Vite React project in JavaScript: `web-client/package.json` (`"name": "brain-harness-web"`, `"type": "module"`; scripts `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview`, `test` = `vitest run`; deps `react@^18`, `react-dom@^18`; devDeps `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`), `web-client/index.html` with `<title>Brain Harness</title>`, a `#root` div and `<script type="module" src="/src/main.jsx">`; then run `npm install` in `web-client/`
- [X] T005 [P] Create `web-client/vite.config.js`: `@vitejs/plugin-react`; `server.proxy` forwarding `/api` and `/health` to `http://127.0.0.1:3000` (R6); `test: { environment: "jsdom", setupFiles: "./src/__tests__/setup.js", globals: true }`; and create `web-client/src/__tests__/setup.js` importing `@testing-library/jest-dom/vitest`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Move the boilerplate into the planned module layout and build the shared pieces every story needs: config, Anthropic client, MCP registry, in-memory MCP client, Fastify app factory, web-client shell.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Server

- [X] T006 [P] Create `server/src/config.js` exporting `config = { port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? "127.0.0.1", model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5", hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) }`; never export or log the key itself (FR-012)
- [X] T007 [P] Create `server/src/errors.js` exporting `class ApiError extends Error { constructor(statusCode, code, message) }` and `toErrorEnvelope(err)`. It maps `ApiError` as-is; `Anthropic.RateLimitError` → 429 `rate_limited`; `Anthropic.APIConnectionTimeoutError` → 504 `upstream_timeout`; other `Anthropic.APIError` → 502 `upstream_error` (pass its message through); anything else → 500 `internal_error`. Return `{ statusCode, body: { error: { code, message } } }` per the Contract error table. Check the most specific classes first.
- [X] T008 Create `server/src/anthropic.js`, ported from the Boilerplate's `callClaude`:
  - Export `anthropic`: `new Anthropic({ timeout: 50_000, maxRetries: 1 })` when `config.hasApiKey`, else `null` (R11).
  - Export `requireAnthropic()`: throws `new ApiError(503, "missing_api_key", "ANTHROPIC_API_KEY is not set on the server.")` when null.
  - Export `createMessage(params)`: calls `anthropic.beta.messages.create({ model: config.model, max_tokens: 16000, output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", ...params })` (R3/R4).
  - Export `textOf(message)`: joins `text` blocks with `\n`.
  - Export `callClaude({ prompt, system })`: uses `createMessage`; if `stop_reason === "refusal"`, throws `ApiError(422, "refusal", \`Claude declined this request (${message.stop_details?.category ?? "unspecified"}).\`)`; else returns `textOf`.
  - Raise the Boilerplate's 1000-token default to 16000 (thinking counts toward `max_tokens`).
  - Add the 422 `refusal` row to the Contract error table in `specs/001-brain-harness-test-ui/contracts/http-api.md`.
- [X] T009 [P] Create one module per Boilerplate tool, each exporting `{ name, config, handler }` where `config` is the `registerTool` second argument (title, description, Zod `inputSchema`) and `handler` the async callback, copied from the Boilerplate:
  - `server/src/mcp/tools/add.js`
  - `server/src/mcp/tools/getTime.js`
  - `server/src/mcp/tools/summarizeText.js` and `server/src/mcp/tools/askClaude.js`: import `callClaude` from `../../anthropic.js`, and return `isError: true` with the message on any error, as in the Boilerplate
  - Add a short header comment in each file explaining the module shape (it is the learning template for FR-015)
- [X] T010 [P] Create `server/src/mcp/resources/serverInfo.js` (exports `{ name: "server-info", uri: "info://server", config, handler }`, reporting `name: "brain-harness"`, `runtime`, `uptimeSeconds`) and `server/src/mcp/prompts/summarize.js` (exports `{ name: "summarize", config, handler }`), both copied from the Boilerplate
- [X] T011 Create `server/src/mcp/tools/index.js` exporting `tools = [add, getTime, summarizeText, askClaude]`, with a comment: "To add a tool: create a file in this folder and add it to this array." Then create `server/src/mcp/createMcpServer.js`: builds `new McpServer({ name: "brain-harness", version: "1.0.0" })`, loops over `tools` → `registerTool(t.name, t.config, t.handler)`, registers `serverInfo` and `summarize`, and returns the server (depends on T009, T010)
- [X] T012 Create `server/src/mcp/localClient.js` exporting `async function withMcpClient(fn)` (R1). It creates `[clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()` (from `@modelcontextprotocol/sdk/inMemory.js`), a fresh `createMcpServer()`, and `new Client({ name: "brain-harness-playground", version: "1.0.0" })` (from `@modelcontextprotocol/sdk/client/index.js`). It connects the server, then the client, awaits `fn(client)`, and closes both in `finally`. Also export `resultText(callToolResult)`, which joins its `text` content items with `\n` (depends on T011)
- [X] T013 [P] Create `server/src/routes/health.js` (Fastify plugin: `GET /health` → `{ status: "ok" }`) and `server/src/routes/mcp.js` (Fastify plugin with the Boilerplate's `POST /mcp` stateless handler using `createMcpServer()` and `StreamableHTTPServerTransport`, plus `GET`/`DELETE /mcp` → 405), behaviour unchanged (depends on T011)
- [X] T014 Create `server/src/app.js` exporting `buildApp({ logger = true } = {})`:
  - Creates Fastify, registers `routes/health.js`, `routes/mcp.js` and `routes/api.js` (prefix `/api`).
  - Sets an error handler that uses `toErrorEnvelope` for `/api/*` errors and logs `request.log.error` without request bodies.
  - Returns the app without listening.

  Create `server/src/routes/api.js` as an empty Fastify plugin for now. Create `server/src/index.js`, which calls `buildApp()`, listens on `config.port`/`config.host`, logs `Brain Harness ready at http://HOST:PORT (MCP: /mcp)`, and logs a warning (not an error) if `!config.hasApiKey` (depends on T006, T007, T013)
- [X] T015 [P] Create `server/test/helpers/fakeAnthropic.js` exporting `fakeAnthropic(responses)`. It returns an object shaped like the SDK client (`beta.messages.create`) that returns the scripted `responses` in order and records every call's params in `.calls` for assertions. Make `server/src/anthropic.js` allow injection: export `setAnthropicClient(client)` for tests, and have `requireAnthropic`/`createMessage` read the current client (depends on T008)
- [X] T016 [P] Create `server/test/mcp.test.js` (`node:test`):
  - `withMcpClient` → `listTools()` returns exactly `add`, `get_time`, `summarize_text`, `ask_claude` with JSON-Schema `inputSchema`.
  - `callTool("add", {a:2,b:3})` → text `"5"`.
  - `callTool("get_time", {timezone:"Mars/Base"})` → `isError: true`.
  - `buildApp({logger:false}).inject` on `GET /health` → 200 `{status:"ok"}` and `GET /mcp` → 405.

  (depends on T012, T014)

### Web client shell

- [X] T017 [P] Create `web-client/src/styles.css`:
  - CSS tokens on `:root` (bg, surface, text, muted, border, accent, danger, success, radius, spacing) with a dark variant under `@media (prefers-color-scheme: dark)`, and `body` with an explicit background.
  - A single centred column (`max-width: 760px`, 16px side gutters) and a sticky bottom composer.
  - Classes for `.exchange`, `.bubble-user`, `.bubble-answer`, `.error-card`, `.tool-card`, `.status-dot.online/.offline`.
  - System font stack; no horizontal scroll at 360px width.
- [X] T018 [P] Create `web-client/src/api.js`:
  - `async function request(path, { method = "GET", body } = {})` using `fetch` with an `AbortController` that aborts after 60 000 ms.
  - Parses JSON. On non-2xx, throws an `Error` carrying `.code`/`.message` from the Contract envelope. On abort, throws `code: "timeout"` ("No answer after 60 seconds"). On network failure, throws `code: "network"` ("Can't reach the Brain Harness server — is it running?").
  - Exports `getHealth()`, `getCapabilities()`, `sendChat(prompt, history)`, `runTool(name, args)`, `runPrompt(name, args)` per the Contract.
- [X] T019 Create `web-client/src/main.jsx` (renders `<App />` into `#root`, imports `styles.css`) and a placeholder `web-client/src/App.jsx` rendering a header "Brain Harness" so `npm run dev` shows the shell (depends on T017)

**Checkpoint**: `cd server && npm test` passes; `npm run dev` in both folders serves the shell at http://localhost:5173 and `/health` through the proxy.

---

## Phase 3: User Story 1 - Type a prompt and read Claude's answer (Priority: P1) 🎯 MVP

**Goal**: Free-form prompts answered by Claude, which can call any MCP tool. Tool calls are shown inline, memory lasts the session (20-exchange cap, append-only), Clear resets, and errors and offline status are clear.

**Independent Test**: With a key set, type "What time is it in Dubai right now?" and see a `get_time` call (`Asia/Dubai`) plus an answer using that time. Follow up with "now convert that to Tokyo time" and Claude uses the earlier context. Clear empties everything (quickstart V1–V8).

### Tests for User Story 1

- [X] T020 [P] [US1] Create `server/test/chat.test.js` (`node:test`, using `fakeAnthropic` via `setAnthropicClient`, `buildApp({logger:false}).inject`):
  - (a) Scripted `tool_use` for `get_time` → `end_turn`. The response has one ToolCall with real `get_time` output, `stopReason: "end_turn"`, a `reply` equal to the final text, and `newMessages` = [user prompt, assistant tool_use, user tool_result, assistant final]. The second fake call received all tool_results in one user message.
  - (b) Two `tool_use` blocks in one turn produce two ToolCalls and one tool_result message.
  - (c) An unknown tool name gives a ToolCall `isError: true` and the loop continues.
  - (d) 11 scripted tool calls: exactly 10 executed, the 11th answered with `is_error` "tool-call limit reached", the final fake call has `tool_choice: {type:"none"}`, and `stopReason: "tool_limit"`.
  - (e) `stop_reason: "refusal"` → `stopReason: "refusal"`, `newMessages: []`.
  - (f) `setAnthropicClient(null)` → 503 `missing_api_key`.
  - (g) Empty prompt → 400 `invalid_request`; `history` that is not an array → 400.
  - (h) `history` containing 20 prompt turns → 400 `conversation_full`.
  - (i) The `history` passed in appears unchanged as the prefix of the first fake call's `messages`.
- [X] T021 [P] [US1] Create `web-client/src/__tests__/conversation.test.jsx` (Vitest + RTL, mocking `../api.js`):
  - Enter sends and Shift+Enter inserts a newline.
  - Whitespace-only input does not send.
  - While pending, Send is disabled and a "Thinking…" indicator shows.
  - A successful response renders the prompt, a ToolCallCard (name/input/output) and the answer, and the next `sendChat` call receives `history` = previous `newMessages`.
  - An error response renders an error card with the message and re-enables Send.
  - Clear empties the list and resets history to `[]`.
  - After 20 chat exchanges, Send is disabled and the "Conversation full — Clear to start over" notice shows.

### Implementation for User Story 1

- [X] T022 [US1] Implement `server/src/chat/runChat.js` exporting `async function runChat({ prompt, history })`, following plan.md "Design Notes → Chat loop" exactly:
  - **Validation**: `ApiError(400,"invalid_request")` for an empty/non-string prompt or non-array history. Count prompt turns as user messages whose content is a string or contains any non-`tool_result` block; ≥ 20 → `ApiError(400,"conversation_full","This conversation has reached 20 exchanges. Clear to start a new one.")`. Call `requireAnthropic()`.
  - **Tools**: inside `withMcpClient`, map `listTools()` to `{ name, description, input_schema: inputSchema }`.
  - **Messages**: `messages = [...history, { role: "user", content: prompt }]`.
  - **System prompt** (fixed constant): "You are Brain Harness, a helpful assistant in a developer playground for an MCP server. Use the available tools whenever they give a more accurate or up-to-date answer than your own knowledge (for example the current time or arithmetic). Answer concisely in plain text."
  - **Loop**: call `createMessage({ system, tools, messages })`.
    - `refusal` → return `{ reply: \`Claude declined this request (${category}).\`, toolCalls, stopReason: "refusal", newMessages: [] }`.
    - Otherwise push `{ role: "assistant", content: response.content }` unchanged.
    - `pause_turn` → continue.
    - `tool_use` → for each `tool_use` block, if `executed < 10`, run `client.callTool({ name, arguments: input })` (catch thrown errors as `isError`) and record a ToolCall `{ id, name, input, output: resultText(r), isError: !!r.isError }`; otherwise produce an `is_error` result "Tool-call limit reached (10 per prompt)." without running it. Push one user message with all `tool_result` blocks (`is_error` set where applicable). If any call hit the cap, call `createMessage({ system, tools, messages, tool_choice: { type: "none" } })` once, push its assistant content, and finish with `stopReason: "tool_limit"`.
    - `end_turn` / `max_tokens` → stop.
  - **Return**: `{ reply: textOf(lastAssistant), toolCalls, stopReason, newMessages: messages.slice(history.length) }`.
  - Add brief comments explaining each step, since this file is the main learning reference.

  (depends on T008, T012)
- [X] T023 [US1] Add `POST /chat` to `server/src/routes/api.js`: a Fastify JSON schema requiring `prompt` (string) and `history` (array, default `[]`); calls `runChat` and replies 200 with its result; errors flow to the envelope handler from T014 (depends on T022)
- [X] T024 [P] [US1] Create `web-client/src/hooks/useServerStatus.js`: calls `getHealth()` on mount and every 10 s, returns `{ online, checkedAt }`, and treats any error as offline (FR-010)
- [X] T025 [P] [US1] Create `web-client/src/hooks/useConversation.js` implementing the Data model's Conversation/Exchange rules:
  - **State**: `history` (append-only), `exchanges`, `chatTurnCount`, `pending`.
  - **`sendPrompt(text, source)`**: trims, ignores empty input or when pending/full; appends a pending chat Exchange (`crypto.randomUUID()`, `sentAt`); calls `sendChat(text, history)`.
    - On success: sets `output = reply`, `toolCalls`, `status: "done"` (or `"error"` with the reply as message when `stopReason === "refusal"`); appends `newMessages` to `history`; increments `chatTurnCount`.
    - On error: sets `status: "error"`, `error: { code, message }`, and leaves `history` untouched.
  - **`addExchange(exchange)` / `updateExchange(id, patch)`**: for US3 capability runs (never touch history).
  - **`clear()`**: resets all state.
  - **`isFull`**: `chatTurnCount >= 20`.
  - Exposes an `onAnswer` callback option (used by US2 read-aloud).
- [X] T026 [P] [US1] Create `web-client/src/components/ToolCallCard.jsx`: a collapsible `<details>` whose summary shows "🔧 {name}" plus an error badge when `isError`; the body shows the input as pretty JSON in a `<pre>` and the output text in a `<pre>` with wrapping (FR-003a)
- [X] T027 [US1] Create `web-client/src/components/ExchangeList.jsx`:
  - Renders `exchanges` in order: user bubble (input text; a 🎤 marker if `source === "voice"`; a label with the capability name for tool/prompt kinds), then `ToolCallCard`s, then a "Thinking…" indicator while pending, an answer bubble (`white-space: pre-wrap`), or an error card.
  - Auto-scrolls to the newest entry.
  - Shows an empty-state hint ("Ask anything — Claude can use this server's tools") when there are no exchanges.

  (depends on T026)
- [X] T028 [P] [US1] Create `web-client/src/components/Header.jsx`: the app name "Brain Harness", an Online/Offline status dot with text from `useServerStatus`, and a Clear button (disabled when there are no exchanges) (FR-001, FR-010, FR-013)
- [X] T029 [P] [US1] Create `web-client/src/components/Composer.jsx`:
  - Auto-growing `<textarea>` (placeholder "Type a prompt…"); Enter submits, Shift+Enter adds a newline.
  - Send button disabled while pending, empty or full.
  - Shows the "Conversation full — Clear to start over" notice when `isFull`.
  - Accepts optional `leftSlot`/`rightSlot` props so US2 can add mic and read-aloud controls without restructuring.
  - Controlled via `value`/`onChange` props so speech can fill it.
- [X] T030 [US1] Wire `web-client/src/App.jsx`: `Header` + `ExchangeList` + `Composer` using `useConversation` and `useServerStatus`; lift the composer text state into App (needed by US2) (depends on T024, T025, T027, T028, T029)

**Checkpoint**: The MVP is usable: quickstart V1–V8 pass with a real key, and `npm test` passes in both projects.

---

## Phase 4: User Story 2 - Speak a prompt and hear the answer (Priority: P2)

**Goal**: Mic → live transcript in the prompt box (editable, not auto-sent). An optional read-aloud toggle with Stop. A graceful fallback when the browser can't do speech or permission is denied.

**Independent Test**: In Chrome, click 🎤, say "What time is it in Tokyo?", see the transcript in the box, send it, and with read-aloud on, hear the answer. In Firefox the mic is disabled with an explanation and typing still works (quickstart V9–V11).

### Tests for User Story 2

- [X] T031 [P] [US2] Create `web-client/src/__tests__/voice.test.jsx` (Vitest + RTL with a fake `window.webkitSpeechRecognition` class and a fake `window.speechSynthesis`):
  - Clicking the mic sets the listening state; firing `onresult` fills the textarea without sending.
  - A second click stops listening.
  - Firing `onerror` with `not-allowed` shows the permission message.
  - With no recognition constructor, the mic is disabled and the "not supported" note shows.
  - With read-aloud on, a completed answer calls `speechSynthesis.speak`; Stop calls `speechSynthesis.cancel`; starting the mic also calls `cancel`.

### Implementation for User Story 2

- [X] T032 [P] [US2] Create `web-client/src/hooks/useSpeechInput.js` (R7):
  - Feature-detect `window.SpeechRecognition || window.webkitSpeechRecognition`.
  - `start()` creates a recognizer (`lang = navigator.language || "en-US"`, `interimResults = true`, `continuous = false`); `onresult` concatenates all result transcripts and calls `onTranscript(text)`; `onend` sets `listening = false`, and if no speech was heard, sets `error = "Didn't catch that — try again."`.
  - `onerror`: `not-allowed`/`service-not-allowed` → "Microphone permission denied — you can still type."; `no-speech` → "Didn't catch that — try again."; else a generic message.
  - `stop()` calls `recognizer.stop()`.
  - Returns `{ supported, listening, error, start, stop }`.
- [X] T033 [P] [US2] Create `web-client/src/hooks/useSpeechOutput.js`: feature-detects `window.speechSynthesis`; `speak(text)` cancels any current utterance, then speaks a new `SpeechSynthesisUtterance(text)` and tracks `speaking` via `onstart`/`onend`/`onerror`; `stop()` calls `speechSynthesis.cancel()`; returns `{ supported, speaking, speak, stop }`
- [X] T034 [US2] Integrate voice in `web-client/src/App.jsx` and `web-client/src/components/Composer.jsx`:
  - **Mic button** (🎤, `aria-pressed` while listening, pulsing style): disabled with a tooltip/note "Voice input isn't supported in this browser — try Chrome or Edge" when unsupported.
  - Starting the mic calls `speechOutput.stop()` first.
  - Transcripts replace the composer text, and the exchange `source` becomes `"voice"` until the user types.
  - `speechInput.error` shows as a small muted line under the composer.
  - **"Read answers aloud" switch**: off by default, hidden when synthesis is unsupported. A Stop button shows while `speaking`.
  - Pass `onAnswer: (text) => readAloud && speechOutput.speak(text)` to `useConversation`.

  (depends on T030, T032, T033)

**Checkpoint**: US1 and US2 both work; quickstart V9–V11 pass in Chrome and Firefox.

---

## Phase 5: User Story 3 - Try the server's built-in tools and prompt templates (Priority: P3)

**Goal**: List every advertised tool and prompt template and run any of them from a generated form, with results labelled in the conversation list and errors marked.

**Independent Test**: Open "Tools & prompts", run `summarize_text` with style `one-line` and get a one-sentence result. Run `get_time` with `Mars/Base` and the result is marked as an error. Run the `summarize` template and see the rendered prompt plus the answer (quickstart V12–V15).

### Tests for User Story 3

- [X] T035 [P] [US3] Create `server/test/capabilities.test.js` (`node:test`, `inject`, `fakeAnthropic`):
  - `GET /api/capabilities` → `server.name === "brain-harness"`; 4 tools with `kind:"tool"`, `title`, `description`, `inputSchema`; 1 prompt `summarize` whose `inputSchema` has a required string `text`.
  - `POST /api/tools/add` `{arguments:{a:2,b:3}}` → `{output:"5", isError:false}`.
  - `POST /api/tools/get_time` with `Mars/Base` → 200 `isError:true`.
  - `POST /api/tools/nope` → 404 `unknown_capability`.
  - `POST /api/tools/add` with `arguments:"x"` → 400.
  - `POST /api/prompts/summarize` with fake `end_turn` → `renderedPrompt` contains "3 bullet points", plus `reply` and `stopReason`.
  - `POST /api/prompts/summarize` without a key → 503.
- [X] T036 [P] [US3] Create `web-client/src/__tests__/capabilities.test.jsx` (Vitest + RTL, mocking `../api.js`):
  - The panel lists tools and prompts from `getCapabilities`.
  - Selecting `summarize_text` renders a textarea for `text` and a `<select>` for `style` preset to `bullets`.
  - Selecting `add` renders number inputs.
  - Submitting calls `runTool` with typed values (numbers as numbers) and adds a labelled exchange.
  - An `isError: true` result renders as an error card.

### Implementation for User Story 3

- [X] T037 [US3] Create `server/src/capabilities.js` exporting:
  - `listCapabilities()`: inside `withMcpClient`, `listTools()` + `listPrompts()`. Map tools to `{ kind:"tool", name, title: title ?? annotations?.title ?? name, description, inputSchema }`. Map prompts to `{ kind:"prompt", name, title ?? name, description, inputSchema }`, building `inputSchema` from `arguments` as `{ type:"object", properties: { [arg.name]: { type:"string", description } }, required: [names where required] }`. Include `server: client.getServerVersion()`.
  - `runTool(name, args)`: 404 `unknown_capability` if not in `listTools()`, otherwise `callTool` → `{ output: resultText(r), isError: !!r.isError }`.
  - `runPrompt(name, args)`: 404 if unknown; `requireAnthropic()`; `getPrompt({ name, arguments: args })`; `renderedPrompt` = the joined text of its messages; then send those messages (converted to Anthropic `{role, content: text}`) through the same tool loop as chat. Refactor `runChat` so its loop is a shared `runToolLoop({ messages })` function in `server/src/chat/runChat.js`. Return `{ renderedPrompt, reply, toolCalls, stopReason }`.

  (depends on T012, T022)
- [X] T038 [US3] Add `GET /capabilities`, `POST /tools/:name` and `POST /prompts/:name` to `server/src/routes/api.js` with Fastify schemas requiring `arguments` to be an object (default `{}`), calling `listCapabilities`/`runTool`/`runPrompt` (depends on T037)
- [X] T039 [P] [US3] Create `web-client/src/components/SchemaForm.jsx`: given a JSON Schema `{properties, required}`, renders a field per property:
  - `enum` → `<select>`; `number`/`integer` → `<input type="number">`; `string` → `<textarea>` if the name is `text` or the description mentions text, else `<input>`.
  - Uses `default` as the initial value, `description` as help text, and `required` → `required` attribute.
  - `onSubmit(values)` casts numbers with `Number()` and omits empty optional fields.
- [X] T040 [US3] Create `web-client/src/components/CapabilityPanel.jsx`:
  - A collapsible "Tools & prompts" `<details>` under the header that loads `getCapabilities()` when first opened.
  - Lists tools, then prompt templates (title, name in `<code>`, description). Selecting one shows a `SchemaForm` and a Run button.
  - Run calls `addExchange` with a pending exchange (`kind`, `source:"form"`, `input:{name, arguments}`), then `runTool`/`runPrompt`, then `updateExchange` with `output`, `toolCalls`, `renderedPrompt`, and `status` `"error"` when `isError` or on a thrown error.
  - Disabled while another request is pending (FR-005).

  (depends on T039, T025)
- [X] T041 [US3] Mount `CapabilityPanel` in `web-client/src/App.jsx`, and extend `web-client/src/components/ExchangeList.jsx` to show, for `kind: "tool"|"prompt"`, a label "▶ {name}" with the arguments as compact JSON, plus a collapsible "Rendered prompt" `<pre>` when `renderedPrompt` is set (depends on T040, T027)

**Checkpoint**: All three stories work independently; quickstart V12–V15 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The FR-015 learning guide, README, security check and full validation

- [X] T042 [P] Create `server/src/mcp/tools/echo.js.example`: a complete, heavily commented `echo` tool (input `message: z.string()`, returns the same text) that `docs/adding-a-tool.md` tells the reader to rename to `echo.js` and register
- [X] T043 [P] Write `docs/adding-a-tool.md` (FR-015), aimed at someone learning MCP:
  1. What a tool is: a name, a description Claude reads, a Zod input schema, and a handler returning `{ content: [{type:"text", text}] }` or `isError`.
  2. Step-by-step: copy `echo.js.example` to `echo.js`, add it to `server/src/mcp/tools/index.js`, restart `npm run dev`.
  3. Verify it in the playground ("Tools & prompts" list; ask Claude "echo hello") and over `/mcp` with a curl `tools/list` JSON-RPC call.
  4. Writing good descriptions, because Claude chooses tools from them.
  5. Returning errors with `isError`.
  6. Keeping secrets in `server/.env` and reading them via `process.env`, never in tool output.
  7. "Next: integrations": how a `slack_post_message` or `telegram_send_message` tool would follow the same shape (env token + HTTP call in the handler), without implementing it.
- [X] T044 [P] Write the repo-root `README.md`:
  - What Brain Harness is: an MCP server plus a playground, with the Slack/Telegram goal.
  - The folder map (`server/`, `web-client/`, `docs/`, `specs/`).
  - Setup and run commands from quickstart.md, and where to put the API key (`server/.env`, from `.env.example`, git-ignored).
  - Endpoints (`/mcp` for external MCP clients, `/api/*` for the playground).
  - Links to `docs/adding-a-tool.md` and `specs/001-brain-harness-test-ui/quickstart.md`.
- [X] T045 Security pass on `server/src/` and `web-client/src/`:
  - Grep both trees to confirm nothing reads, returns or logs `ANTHROPIC_API_KEY` beyond `config.hasApiKey` and the SDK's implicit env read.
  - Confirm Fastify's logger doesn't log request bodies or headers containing secrets.
  - Confirm `web-client/` has no env-based key usage (no `import.meta.env` key variables) (FR-012, SC-005).
- [X] T046 Run `npm test` in `server/` and `web-client/` and `npm run build` in `web-client/`; fix any failures
- [ ] T047 Run the quickstart.md validation scenarios V1–V17 with a real key (after the user adds it to `server/.env`); record any deviations in `specs/001-brain-harness-test-ui/quickstart.md` under a "Validation notes" heading

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none; start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on Foundational, plus the US1 composer/App wiring (T029, T030), because voice fills the same prompt box. Its hooks (T032, T033) can be built in parallel with US1.
- **US3 (Phase 5)**: server tasks depend on Foundational and on the US1 chat loop (T022), which `runPrompt` reuses. UI tasks depend on `useConversation` (T025) and `ExchangeList` (T027).
- **Polish (Phase 6)**: after the stories you intend to ship. T042–T044 can start any time after Phase 2.

### Within Each Story

Tests (written first or alongside) → server logic → route → hooks → components → App wiring.

### Parallel Opportunities

- **Setup**: T003, T004, T005 in parallel after T002 (T005 needs T004's folder).
- **Foundational**: T006, T007, T009, T010 in parallel, then T011 → T012 → T013 → T014. The web shell (T017, T018) runs in parallel with all server work.
- **US1**: T020 and T021 (tests), T024, T025, T026, T028 and T029 in parallel. T022 → T023 on the server, while the client builds in parallel.
- **US2**: T031, T032 and T033 in parallel.
- **US3**: T035, T036 and T039 in parallel. Server T037 → T038 runs alongside client T039 → T040 → T041.
- **Polish**: T042, T043 and T044 in parallel.

## Parallel Example: User Story 1

```bash
# Server and client tracks can proceed at the same time:
Task: "T020 [US1] chat.test.js with fakeAnthropic in server/test/chat.test.js"
Task: "T022 [US1] runChat tool loop in server/src/chat/runChat.js"
Task: "T024 [US1] useServerStatus in web-client/src/hooks/useServerStatus.js"
Task: "T025 [US1] useConversation in web-client/src/hooks/useConversation.js"
Task: "T026 [US1] ToolCallCard in web-client/src/components/ToolCallCard.jsx"
Task: "T028 [US1] Header in web-client/src/components/Header.jsx"
Task: "T029 [US1] Composer in web-client/src/components/Composer.jsx"
```

## Parallel Example: User Story 2

```bash
Task: "T031 [US2] voice.test.jsx in web-client/src/__tests__/voice.test.jsx"
Task: "T032 [US2] useSpeechInput in web-client/src/hooks/useSpeechInput.js"
Task: "T033 [US2] useSpeechOutput in web-client/src/hooks/useSpeechOutput.js"
```

## Parallel Example: User Story 3

```bash
Task: "T035 [US3] capabilities.test.js in server/test/capabilities.test.js"
Task: "T036 [US3] capabilities.test.jsx in web-client/src/__tests__/capabilities.test.jsx"
Task: "T039 [US3] SchemaForm in web-client/src/components/SchemaForm.jsx"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (checkpoint: server tests green, shell loads).
2. Phase 3 (US1) → **stop and validate** with quickstart V1–V8. This is the moment to add the real API key to `server/.env`.
3. That's a working playground: typed prompts, Claude using MCP tools, session memory.

### Incremental delivery

1. + US2 (voice) → validate V9–V11.
2. + US3 (tools & prompt templates panel) → validate V12–V15.
3. + Polish (adding-a-tool guide, README, security pass) → validate V16–V17. Ready to start the Slack/Telegram integration features using `docs/adding-a-tool.md` as the template.

### Notes

- Tests never call the real Anthropic API: use `fakeAnthropic` / mocked `api.js`.
- Keep conversation history append-only everywhere (R5); never trim or edit `history`.
- Commit after each task or logical group.
