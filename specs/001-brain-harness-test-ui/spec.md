# Feature Specification: Brain Harness — Prompt & Voice Test UI

**Feature Branch**: `001-brain-harness-test-ui`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "MCP server boilerplate with Fastify (snippet provided: tools `add`, `get_time`, `summarize_text`, `ask_claude`; resource `info://server`; prompt template `summarize`; `/health` and stateless `/mcp` endpoints). Create a minimal UI design just for the user to test the prompts and voice, using Vite + React, in the `web-client` folder. The Anthropic key will be provided later. Name the application Brain Harness."

## Overview

Brain Harness is a small developer-facing application made of two parts: the existing MCP server (from the provided boilerplate) and a minimal web page that lets a person exercise that server by hand. The page exists so the person can quickly check that prompts produce sensible answers and that speaking a prompt works as well as typing it. It is a testing harness, not an end-user product: clarity and speed of feedback matter more than visual polish.

Longer term, Brain Harness is meant to grow into a versatile MCP server that connects to outside services such as Slack and Telegram. This feature delivers the playground those integrations will be developed and tested in: any tool added to the server later must become usable from the page without changing the page.

## Clarifications

### Session 2026-10-29

- Q: When the tester sends a free-form prompt, should Claude be able to call the server's tools by itself to answer it, or only answer from its own knowledge? → A: Claude calls tools itself (Option B). Brain Harness is a playground for a versatile MCP server that will later integrate services like Slack and Telegram, so free-form prompts must exercise whatever tools the server exposes, and each tool call must be visible.
- Q: Should speech-to-text use the browser's built-in speech recognition or a server-side speech service? → A: Browser built-in for both voice input and read-aloud (Option A). Server-side transcription (e.g. for Telegram/Slack voice messages) is deferred to those integration features.
- Q: Should Claude remember earlier messages so the tester can ask follow-ups, or answer each prompt fresh? → A: Session memory (Option B). Claude sees the earlier exchanges from the current page session, mirroring how future Slack threads / Telegram chats behave; "Clear" starts a new conversation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Type a prompt and read Claude's answer (Priority: P1)

The tester opens Brain Harness, types a free-form prompt into a text box, sends it, and sees Claude's answer appear on the page. While answering, Claude may call any tool the server exposes (e.g. `get_time`, `add`); each tool call is shown inline with the tool's name, the inputs Claude chose, and the result. Each exchange stays visible in a running list so the tester can compare answers across several prompts.

**Why this priority**: This is the core loop of the harness. Without it nothing else (voice, templates) has anything to deliver to. On its own it already proves the server, the key and the model are wired correctly.

**Independent Test**: With the server running and a valid key configured, open the page, type "What is the capital of France?", send it, and confirm an answer naming Paris appears beneath the prompt.

**Acceptance Scenarios**:

1. **Given** the server is running with a valid key, **When** the tester types a prompt and presses Send (or Enter), **Then** the prompt appears in the conversation list immediately and Claude's answer appears beneath it once received.
2. **Given** a prompt has been sent, **When** the answer has not arrived yet, **Then** the page shows a visible "thinking" indicator and the Send control is disabled to prevent duplicate submissions.
3. **Given** the text box is empty or whitespace only, **When** the tester tries to send, **Then** nothing is sent.
4. **Given** the server has no key configured, **When** the tester sends a prompt, **Then** the page shows a clear error explaining the server is missing its API key, instead of a blank or generic failure.
5. **Given** the tester asks "What time is it in Dubai right now?", **When** the answer arrives, **Then** the exchange shows a `get_time` tool call with timezone `Asia/Dubai` and its result, followed by Claude's answer using that real time.
6. **Given** a prompt needs no tools (e.g. "Write a haiku about rain"), **When** the answer arrives, **Then** no tool calls are shown.
7. **Given** the tester has just asked for the time in Dubai, **When** they follow up with "now convert that to Tokyo time", **Then** Claude understands "that" from the previous exchange and answers with the Tokyo time.
8. **Given** a conversation is in progress, **When** the tester clicks "Clear", **Then** the list empties and the next prompt starts a new conversation with no memory of earlier exchanges.

---

### User Story 2 - Speak a prompt and hear the answer (Priority: P2)

The tester clicks a microphone button, speaks a prompt, and sees the spoken words transcribed into the text box. They can review or edit the transcript and send it like a typed prompt. Optionally, the tester can turn on "read answers aloud" so Claude's reply is spoken back.

**Why this priority**: Voice is the second explicit goal of the request. It builds on Story 1 (the same send-and-answer loop) but adds the speech input and output paths that need separate verification.

**Independent Test**: In a supported browser, grant microphone permission, click the mic, say "What time is it in Dubai?", confirm the transcript appears in the text box, send it, and (with read-aloud on) hear the answer spoken.

**Acceptance Scenarios**:

1. **Given** the browser supports speech recognition, **When** the tester clicks the mic button, **Then** the button shows an active "listening" state and the transcribed text appears in the text box as the tester speaks.
2. **Given** listening is active, **When** the tester clicks the mic button again or stops speaking, **Then** listening ends and the final transcript remains in the text box, editable, and is not sent automatically.
3. **Given** "read answers aloud" is on, **When** an answer arrives, **Then** the answer is spoken aloud, and a Stop control can interrupt it.
4. **Given** the browser does not support speech recognition or the tester denies microphone permission, **When** the page loads or the mic is clicked, **Then** the mic control is disabled or shows a short explanation, and typing still works normally.

---

### User Story 3 - Try the server's built-in tools and prompt templates (Priority: P3)

The tester picks one of the capabilities the server advertises (the `summarize_text` tool, the `summarize` prompt template, the `add` or `get_time` tools), fills in its inputs in a simple form, runs it, and sees the result. This lets the tester check each server capability directly rather than only through free-form questions.

**Why this priority**: Useful for verifying the server's individual capabilities, but not required to test "prompts and voice" at the most basic level.

**Independent Test**: Choose "Summarize text", paste a paragraph, select "one-line", run it, and confirm a one-sentence summary appears.

**Acceptance Scenarios**:

1. **Given** the server is reachable, **When** the page loads, **Then** it lists the tools and prompt templates the server currently advertises, with their titles and descriptions.
2. **Given** the tester selects a capability, **When** they fill in its inputs and run it, **Then** the result is shown in the conversation list, labelled with the capability name.
3. **Given** a capability returns an error (e.g. invalid timezone), **When** the result is shown, **Then** it is visibly marked as an error with the server's message.

---

### Edge Cases

- **Server not running / unreachable**: a status indicator shows "Server offline" and sending shows a clear connection error; the page does not hang.
- **Missing or invalid API key**: the server's error message ("API key is not set" or an authentication failure) is surfaced verbatim to the tester.
- **Slow or long answers**: the thinking indicator stays visible until the answer arrives; requests that exceed 60 seconds end with a timeout message and re-enable sending.
- **Very long prompt or answer**: long text wraps and scrolls inside the conversation list without breaking the layout.
- **Speech recognition hears nothing**: listening ends with an empty or unchanged text box and a short "Didn't catch that" hint.
- **Tester starts speaking while an answer is being read aloud**: read-aloud stops when the mic is activated.
- **Rate limits or upstream errors from the model provider**: shown as an error entry, and the tester can retry.
- **A tool fails during a free-form prompt** (e.g. invalid timezone): the failed tool call is shown marked as an error, and Claude still produces a final answer (it may explain the failure or retry).
- **Very long conversation**: a conversation holds at most 20 exchanges. At the limit, sending is disabled and the page asks the tester to Clear to start a new conversation (earlier turns are never silently dropped; see research R5).
- **Claude keeps calling tools without finishing**: tool use per prompt is capped at 10 tool calls; when the cap is reached the exchange ends with a clear "tool-call limit reached" message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST be named "Brain Harness", and that name MUST appear as the page title and in the page header.
- **FR-002**: The page MUST provide a text input and a Send action for submitting a free-form prompt; Enter sends and Shift+Enter inserts a new line.
- **FR-003**: Free-form prompts MUST be answered by Claude with access to every tool the server currently exposes. Claude decides whether and which tools to call, and the server runs those calls through its own MCP tools, so any tool added later (e.g. a Slack or Telegram integration) is usable from prompts automatically.
- **FR-003a**: Each tool call made while answering MUST be shown in the exchange with the tool name, the inputs Claude chose, the result, and whether it failed.
- **FR-003b**: A single prompt MUST make at most 10 tool calls; reaching the limit ends the exchange with an explanatory message.
- **FR-015**: The project MUST include a short step-by-step guide showing how to add a new tool to the server and see it appear in the playground, written for someone learning MCP and intended as the template for future service integrations (Slack, Telegram, etc.).
- **FR-004**: The page MUST show each prompt and its answer (or error) as an entry in a chronological conversation list, with the newest entry visible after it arrives.
- **FR-005**: The page MUST show a pending indicator while a request is in flight and MUST prevent duplicate submission of the same request.
- **FR-006**: The page MUST provide a microphone control that converts spoken words into text in the prompt box, leaving the text editable and unsent until the tester sends it.
- **FR-007**: The page MUST provide a "read answers aloud" toggle (off by default) and a way to stop speech that is playing.
- **FR-008**: When voice input or output is unavailable in the tester's browser, or microphone permission is denied, the page MUST say so and keep text-based testing fully functional.
- **FR-009**: The page MUST list the tools and prompt templates advertised by the server and let the tester run any of them with inputs entered in a generated form.
- **FR-010**: The page MUST show the server's reachability status (online/offline) based on the server's health check.
- **FR-011**: Errors (server unreachable, missing key, tool errors, timeouts) MUST be shown as distinct, readable error entries rather than silent failures.
- **FR-012**: The Anthropic API key MUST be held only by the server; it MUST never be entered in, sent to, stored in, or displayed by the web page.
- **FR-013**: The page MUST provide a "Clear" action that empties the conversation list and starts a new conversation (Claude forgets prior exchanges).
- **FR-014**: The conversation is session-only; it is not required to persist across page reloads, and a reload starts a new conversation.
- **FR-016**: Free-form prompts MUST be answered with the earlier exchanges of the current conversation as context (including the tool calls and their results), never altering or dropping earlier turns. A conversation is limited to 20 exchanges, after which the tester must Clear. Capability runs from Story 3 are not part of this context.

### Key Entities

- **Exchange**: one entry in the conversation list: the input (typed or spoken prompt, or a capability with its inputs), how it was entered (text/voice/capability), any tool calls made while answering, the result text, whether it was an error, and timestamps for sent/received.
- **Tool Call**: one tool use inside an Exchange: tool name, inputs, result text, and an error flag.
- **Server Capability**: a tool or prompt template advertised by the server — name, title, description and the list of inputs it accepts (name, type, description, default, allowed values).
- **Server Status**: whether the server is currently reachable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tester can go from opening the page to reading Claude's answer to a typed prompt in under 30 seconds, with no instructions beyond the page itself.
- **SC-002**: A tester can complete a full voice round trip (speak → review transcript → send → hear answer) in under 1 minute in a supported browser.
- **SC-003**: 100% of failure cases listed under Edge Cases produce a visible, human-readable message; none leave the page frozen or blank.
- **SC-004**: Every tool and prompt template the server advertises can be run from the page without the tester writing any request by hand.
- **SC-005**: The API key appears nowhere in the page, its network traffic from the browser, or browser storage (verifiable by inspection).
- **SC-006**: The interface fits on a single screen with no more than three primary controls visible at once (prompt box, mic, send), keeping it "minimal" as requested.

## Assumptions

- **Users**: a single developer or small team testing locally; no sign-in, accounts or multi-user features are needed.
- **Environment**: the server and page run on the tester's own machine (the server defaults to local host, port 3000). Public deployment is out of scope.
- **API key handling**: the user will supply the Anthropic key later; it will be set as a server environment setting (e.g. a local, git-ignored env file), not hard-coded and not committed.
- **"Test the prompts"** is interpreted as both free-form prompts to Claude (primary) and the server's registered prompt template and tools (secondary).
- **"Voice"** is interpreted as speech-to-text for input plus optional text-to-speech for answers, using only capabilities built into the tester's browser; no speech service or extra key is used. Chromium-based browsers are the primary target, since built-in speech recognition support varies by browser. Server-side transcription is out of scope and will arrive with the Telegram/Slack integrations.
- **Conversation context**: one conversation per page session with memory of recent exchanges (FR-016). Multiple saved conversations and long-term memory are out of scope.
- **Future integrations**: Slack, Telegram and other service connections are separate future features. This feature only ensures the playground picks up new tools automatically and documents how to add one.
- **Streaming**: answers are shown once complete; token-by-token streaming is out of scope.
- **Server changes**: the provided boilerplate is adopted as the server for Brain Harness (with its name updated to Brain Harness). Additions: a chat step that lets Claude call the server's tools (FR-003), and what the page needs to reach the server from the browser during local development (e.g. cross-origin access for the local page).
- **User-mandated constraints**: the web client is built with Vite + React and lives in the `web-client` folder of this repository.
