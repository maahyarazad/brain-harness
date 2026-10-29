import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

// The Anthropic client reads ANTHROPIC_API_KEY from the environment.
// Created once and shared across requests (it is safe to reuse).
// The 50 s timeout keeps us under the browser's 60 s limit.
let anthropic = config.hasApiKey
  ? new Anthropic({ timeout: 50_000, maxRetries: 1 })
  : null;

/** Tests swap in a fake client here; pass null to simulate a missing key. */
export function setAnthropicClient(client) {
  anthropic = client;
}

/** Return the client, or a clear 503 error if no API key is configured. */
export function requireAnthropic() {
  if (!anthropic) {
    throw new ApiError(503, "missing_api_key", "ANTHROPIC_API_KEY is not set on the server.");
  }
  return anthropic;
}

/**
 * Create one message with Brain Harness defaults:
 * - max_tokens covers thinking + answer, so it is generous
 * - effort "medium" is a good starting point for multi-step tool use
 * - server-side fallback retries requests a safety classifier declines
 */
export function createMessage(params) {
  return requireAnthropic().beta.messages.create({
    model: config.model,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  });
}

/** Join the text blocks of a message (thinking and tool blocks are skipped). */
export function textOf(message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Small helper: send a prompt to Claude and return the text of the reply.
 * Used by the LLM-powered MCP tools (summarize_text, ask_claude).
 */
export async function callClaude({ prompt, system }) {
  const message = await createMessage({
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unspecified";
    throw new ApiError(422, "refusal", `Claude declined this request (${category}).`);
  }
  return textOf(message);
}
