import { useCallback, useRef, useState } from "react";
import { runPrompt, runTool, sendChat } from "../api.js";

export const MAX_EXCHANGES = 20;

/**
 * Conversation state for one page session.
 *
 * - `history` is the raw message list the server returns. It is append-only:
 *   we never edit or trim it (Claude's thinking blocks depend on that).
 * - `exchanges` is what the page renders (chat prompts and capability runs).
 */
export function useConversation({ onAnswer } = {}) {
  const [exchanges, setExchanges] = useState([]);
  const [chatTurnCount, setChatTurnCount] = useState(0);
  const [pending, setPending] = useState(false);
  const historyRef = useRef([]);
  // Bumped by clear() so answers to requests sent before Clear are ignored
  const generationRef = useRef(0);

  const isFull = chatTurnCount >= MAX_EXCHANGES;

  const addExchange = useCallback((exchange) => {
    const full = {
      id: crypto.randomUUID(),
      toolCalls: [],
      output: null,
      renderedPrompt: null,
      status: "pending",
      error: null,
      sentAt: new Date().toISOString(),
      receivedAt: null,
      ...exchange,
    };
    setExchanges((list) => [...list, full]);
    return full.id;
  }, []);

  const updateExchange = useCallback((id, patch) => {
    setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const sendPrompt = useCallback(
    async (text, source = "text") => {
      const prompt = text.trim();
      if (!prompt || pending || isFull) return false;

      const generation = generationRef.current;
      setPending(true);
      const id = addExchange({ kind: "chat", source, input: prompt });
      try {
        const res = await sendChat(prompt, historyRef.current);
        if (generation !== generationRef.current) return true;
        historyRef.current = [...historyRef.current, ...res.newMessages];
        const refused = res.stopReason === "refusal";
        updateExchange(id, {
          output: refused ? null : res.reply,
          toolCalls: res.toolCalls ?? [],
          status: refused ? "error" : "done",
          error: refused ? { code: "refusal", message: res.reply } : null,
          receivedAt: new Date().toISOString(),
        });
        if (!refused) {
          setChatTurnCount((n) => n + 1);
          onAnswer?.(res.reply);
        }
      } catch (err) {
        if (generation !== generationRef.current) return true;
        updateExchange(id, {
          status: "error",
          error: { code: err.code ?? "error", message: err.message },
          receivedAt: new Date().toISOString(),
        });
      } finally {
        if (generation === generationRef.current) setPending(false);
      }
      return true;
    },
    [pending, isFull, addExchange, updateExchange, onAnswer]
  );

  // Run a tool or prompt template directly. These runs are shown in the list
  // but never become part of Claude's conversation history.
  const runCapability = useCallback(
    async (kind, name, args) => {
      if (pending) return;
      const generation = generationRef.current;
      setPending(true);
      const id = addExchange({ kind, source: "form", input: { name, arguments: args } });
      try {
        const res = kind === "prompt" ? await runPrompt(name, args) : await runTool(name, args);
        if (generation !== generationRef.current) return;
        const output = kind === "prompt" ? res.reply : res.output;
        const failed = kind === "prompt" ? res.stopReason === "refusal" : res.isError;
        updateExchange(id, {
          output,
          toolCalls: res.toolCalls ?? [],
          renderedPrompt: res.renderedPrompt ?? null,
          status: failed ? "error" : "done",
          error: failed ? { code: "tool_error", message: output } : null,
          receivedAt: new Date().toISOString(),
        });
        if (!failed) onAnswer?.(output);
      } catch (err) {
        if (generation !== generationRef.current) return;
        updateExchange(id, {
          status: "error",
          error: { code: err.code ?? "error", message: err.message },
          receivedAt: new Date().toISOString(),
        });
      } finally {
        if (generation === generationRef.current) setPending(false);
      }
    },
    [pending, addExchange, updateExchange, onAnswer]
  );

  const clear = useCallback(() => {
    generationRef.current += 1;
    historyRef.current = [];
    setExchanges([]);
    setChatTurnCount(0);
    setPending(false);
  }, []);

  return {
    exchanges,
    pending,
    isFull,
    chatTurnCount,
    sendPrompt,
    runCapability,
    clear,
  };
}
