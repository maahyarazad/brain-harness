/**
 * A stand-in for the Anthropic client that returns scripted responses in
 * order, so tests never call the real API. Every request's params are kept
 * in `.calls` for assertions.
 */
export function fakeAnthropic(responses) {
  const queue = [...responses];
  const fake = {
    calls: [],
    beta: {
      messages: {
        create: async (params) => {
          // Deep-copy so later mutation of the messages array doesn't change history
          fake.calls.push(structuredClone(params));
          if (queue.length === 0) throw new Error("fakeAnthropic: no scripted response left");
          return queue.shift();
        },
      },
    },
  };
  return fake;
}

/** Build a scripted assistant message. */
export function message(content, stop_reason = "end_turn", extra = {}) {
  return { id: "msg_fake", type: "message", role: "assistant", content, stop_reason, ...extra };
}

export const text = (t) => ({ type: "text", text: t });

let toolUseId = 0;
export const toolUse = (name, input) => ({
  type: "tool_use",
  id: `toolu_${++toolUseId}`,
  name,
  input,
});
