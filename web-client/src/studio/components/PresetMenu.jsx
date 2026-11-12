export default function PresetMenu({ presets, activeId, onApply }) {
  if (!presets?.length) return null;
  return (
    <section className="panel" aria-labelledby="presets-heading">
      <h3 id="presets-heading">Presets</h3>
      <div className="preset-list" role="group" aria-labelledby="presets-heading">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${p.id === activeId ? " active" : ""}`}
            aria-pressed={p.id === activeId}
            onClick={() => onApply(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </section>
  );
}
