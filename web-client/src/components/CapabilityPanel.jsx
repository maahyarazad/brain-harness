import { useState } from "react";
import { getCapabilities } from "../api.js";
import SchemaForm from "./SchemaForm.jsx";

function CapabilityList({ items, selected, onSelect }) {
  return (
    <ul className="capability-list">
      {items.map((item) => {
        const isSelected = selected?.kind === item.kind && selected?.name === item.name;
        return (
          <li key={`${item.kind}:${item.name}`}>
            <button type="button" aria-pressed={isSelected} onClick={() => onSelect(item)}>
              {item.title} <code>{item.name}</code>
              <span className="desc">{item.description}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "Tools & prompts": run any tool or prompt template the server advertises. */
export default function CapabilityPanel({ onRun, disabled }) {
  const [capabilities, setCapabilities] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoadError(null);
    try {
      setCapabilities(await getCapabilities());
    } catch (err) {
      setLoadError(err.message);
    }
  }

  function handleToggle(event) {
    if (event.currentTarget.open && !capabilities) load();
  }

  return (
    <details className="capabilities" onToggle={handleToggle}>
      <summary>Tools &amp; prompts</summary>
      <div className="capabilities-body">
        {loadError && (
          <p className="notice">
            {loadError}{" "}
            <button type="button" className="btn" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {!capabilities && !loadError && <p className="help">Loading…</p>}
        {capabilities && (
          <>
            <h3>Tools</h3>
            <CapabilityList items={capabilities.tools} selected={selected} onSelect={setSelected} />
            <h3>Prompt templates</h3>
            <CapabilityList items={capabilities.prompts} selected={selected} onSelect={setSelected} />
            {selected && (
              <SchemaForm
                key={`${selected.kind}:${selected.name}`}
                schema={selected.inputSchema}
                disabled={disabled}
                submitLabel={`Run ${selected.name}`}
                onSubmit={(args) => onRun(selected.kind, selected.name, args)}
              />
            )}
          </>
        )}
      </div>
    </details>
  );
}
