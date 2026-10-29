import { useEffect, useRef } from "react";

/**
 * Prompt box + Send. Enter sends, Shift+Enter adds a new line.
 * `leftSlot` / `meta` let the voice controls plug in without restructuring.
 */
export default function Composer({ value, onChange, onSend, pending, isFull, leftSlot, meta }) {
  const textareaRef = useRef(null);
  const canSend = value.trim() !== "" && !pending && !isFull;

  // Grow with the content (up to the CSS max-height)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <footer className="composer">
      <div className="composer-row">
        {leftSlot}
        <textarea
          ref={textareaRef}
          aria-label="Prompt"
          placeholder="Type a prompt…"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="btn btn-primary" onClick={onSend} disabled={!canSend}>
          Send
        </button>
      </div>
      {(isFull || meta) && (
        <div className="composer-meta">
          {isFull && <span className="notice">Conversation full. Clear to start over.</span>}
          {meta}
        </div>
      )}
    </footer>
  );
}
