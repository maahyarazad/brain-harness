export default function Header({ online, canClear, onClear }) {
  const label = online === null ? "Checking…" : online ? "Online" : "Offline";
  const dotClass = online === null ? "" : online ? "online" : "offline";

  return (
    <header className="header">
      <h1>Brain Harness</h1>
      <span className="status" title="MCP server status">
        <span className={`status-dot ${dotClass}`} />
        {label}
      </span>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClear} disabled={!canClear}>
        Clear
      </button>
    </header>
  );
}
