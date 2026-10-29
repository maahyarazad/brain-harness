# Quickstart & Validation: Brain Harness

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/http-api.md](./contracts/http-api.md)

This guide is for running Brain Harness locally and checking that each user story works end to end.

## Prerequisites

- Node.js 22.9 or newer (`node -v`)
- Chrome or Edge (for voice input)
- An Anthropic API key

## Setup

```bash
# 1. Server
cd server
npm install
cp .env.example .env          # then open .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run dev                   # http://127.0.0.1:3000  (MCP endpoint: /mcp)

# 2. Web client (second terminal)
cd web-client
npm install
npm run dev                   # http://localhost:5173  (proxies /api and /health to :3000)
```

`.env` is git-ignored. Never put the key in `web-client/`.

## Automated checks

```bash
cd server && npm test          # node:test: capabilities, tool runs, chat loop (stubbed Claude), errors
cd web-client && npm test      # Vitest: composer, message list, capability forms, voice fallback
```

## Manual validation scenarios

| # | Story | Steps | Expected |
|---|---|---|---|
| V1 | 1 | Open the page. | Header says **Brain Harness**; status dot shows **Online**. |
| V2 | 1 | Type "What is the capital of France?" → Enter. | Prompt appears at once, a thinking indicator shows, Send is disabled, then the answer names Paris. No tool calls shown. |
| V3 | 1 | Ask "What time is it in Dubai right now?" | A `get_time` call with `{ "timezone": "Asia/Dubai" }` and its result appear, then an answer using that time. |
| V4 | 1 | Follow up: "now convert that to Tokyo time". | Claude uses the previous answer; typically another `get_time` call with `Asia/Tokyo`. |
| V5 | 1 | Ask "What is 1234.5 + 98.7? Use your tools." | An `add` call with the two numbers; the answer is 1333.2. |
| V6 | 1 | Click **Clear**, then ask "What did I just ask you?" | The list empties; Claude has no memory of earlier prompts. |
| V7 | 1 | Stop the server and send a prompt. | Status shows **Offline**; the entry shows a connection error and Send re-enables. |
| V8 | 1 | Remove the key from `.env`, restart the server, and send a prompt. | Error entry: "ANTHROPIC_API_KEY is not set on the server." |
| V9 | 2 | Click 🎤, allow the microphone, and say "What time is it in Tokyo?" | Mic shows a listening state; words appear in the box and are **not** sent automatically. |
| V10 | 2 | Turn on **Read answers aloud** and send. | The answer is spoken; **Stop** interrupts it. Clicking 🎤 while speaking also stops it. |
| V11 | 2 | Open the page in Firefox. | Mic is disabled with a short "voice input not supported in this browser" note; typing works. |
| V12 | 3 | Open **Tools & prompts**. | Lists `add`, `get_time`, `summarize_text`, `ask_claude` and the prompt template `summarize`, each with a description. |
| V13 | 3 | Run `summarize_text` with a paragraph and style `one-line`. | One-sentence result, labelled `summarize_text`. |
| V14 | 3 | Run `get_time` with timezone `Mars/Base`. | Result shown and marked as an error: "Invalid timezone: Mars/Base". |
| V15 | 3 | Run the `summarize` prompt template with a paragraph. | Shows the rendered template text, then a 3-bullet answer. |
| V16 | Security | DevTools → Network and Application tabs. | No request, response or storage entry contains the API key (SC-005). |
| V17 | FR-015 | Follow `docs/adding-a-tool.md` to add the example `echo` tool, then restart the server. | `echo` appears in **Tools & prompts** and Claude can call it from chat with no web-client change. |

## Curl smoke test (server only)

```bash
curl -s 127.0.0.1:3000/health
curl -s 127.0.0.1:3000/api/capabilities | head -c 400
curl -s -X POST 127.0.0.1:3000/api/tools/add -H 'content-type: application/json' -d '{"arguments":{"a":2,"b":3}}'
curl -s -X POST 127.0.0.1:3000/api/chat -H 'content-type: application/json' -d '{"prompt":"What time is it in Dubai?","history":[]}'
```

## Validation notes

**2026-10-29: implementation run, without an API key**

- Automated: `server` 19/19 tests pass, `web-client` 17/17 pass, and `npm run build` succeeds.
- Live smoke test against the running server and the Vite proxy:
  - `/health` works directly and through the proxy.
  - `/api/capabilities` lists 4 tools and 1 prompt template; `server.name` is `brain-harness`.
  - `POST /api/tools/add` returns `5`.
  - `POST /api/chat` with no key returns `503 missing_api_key` (V8 behaviour).
  - `POST /mcp` `tools/list` and `tools/call` (`get_time`, `Asia/Dubai`) work for external MCP clients.
  - The page title is "Brain Harness".
- **Pending** (needs a real key in `server/.env` and a browser): V2–V6, V9–V10, V13, V15, V16 (DevTools check), V17.
