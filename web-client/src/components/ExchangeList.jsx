import { useEffect, useRef } from "react";
import ToolCallCard from "./ToolCallCard.jsx";

function InputBubble({ exchange }) {
  if (exchange.kind === "chat") {
    return (
      <div className="bubble-user">
        {exchange.source === "voice" && <span className="label">🎤 spoken</span>}
        {exchange.input}
      </div>
    );
  }
  // Direct tool or prompt-template run from the "Tools & prompts" panel
  const { name, arguments: args } = exchange.input;
  return (
    <div className="bubble-user">
      <span className="label">▶ {exchange.kind === "prompt" ? "prompt template" : "tool"}</span>
      <code>{name}</code> {JSON.stringify(args)}
    </div>
  );
}

function Exchange({ exchange }) {
  return (
    <div className="exchange">
      <InputBubble exchange={exchange} />
      {exchange.renderedPrompt && (
        <details className="rendered-prompt">
          <summary>Rendered prompt</summary>
          <pre>{exchange.renderedPrompt}</pre>
        </details>
      )}
      {exchange.toolCalls.map((call) => (
        <ToolCallCard key={call.id} call={call} />
      ))}
      {exchange.status === "pending" && <div className="thinking">Thinking…</div>}
      {exchange.status === "done" && <div className="bubble-answer">{exchange.output}</div>}
      {exchange.status === "error" && (
        <div className="error-card" role="alert">
          {exchange.error?.message ?? exchange.output}
        </div>
      )}
    </div>
  );
}

export default function ExchangeList({ exchanges }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  return (
    <main className="exchanges" aria-live="polite">
      {exchanges.length === 0 && (
        <p className="empty">Ask anything. Claude can use this server's tools.</p>
      )}
      {exchanges.map((exchange) => (
        <Exchange key={exchange.id} exchange={exchange} />
      ))}
      <div ref={endRef} />
    </main>
  );
}
