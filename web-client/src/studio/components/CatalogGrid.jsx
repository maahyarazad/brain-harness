import { CATALOG, CATEGORIES } from "../catalog.js";

export default function CatalogGrid({ query, category, onQuery, onCategory, onOpen, notice, children }) {
  const q = query.trim().toLowerCase();
  const matches = CATALOG.filter(
    (e) => (!category || e.category === category) && (!q || e.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
  );

  return (
    <div className="catalog">
      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}
      {children}
      <div className="catalog-filters">
        <label className="search">
          <span className="sr-only">Search visualizations</span>
          <input type="search" placeholder="Search visualizations" value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Category">
          <button type="button" className={`chip${!category ? " active" : ""}`} aria-pressed={!category} onClick={() => onCategory(null)}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip${category === c.id ? " active" : ""}`} aria-pressed={category === c.id} onClick={() => onCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {!matches.length && <p className="muted">No visualizations match.</p>}
      {CATEGORIES.map((c) => {
        const items = matches.filter((e) => e.category === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} aria-labelledby={`cat-${c.id}`} className="catalog-section">
            <h2 id={`cat-${c.id}`}>{c.name}</h2>
            <ul className="cards">
              {items.map((e) => (
                <li key={e.id}>
                  <a
                    className={`card cat-${e.category}`}
                    href={`/studio/${e.id}`}
                    onClick={(ev) => {
                      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
                      ev.preventDefault();
                      onOpen(e.id);
                    }}
                  >
                    <span className="card-thumb" aria-hidden="true">
                      <span className="card-glyph">{e.glyph}</span>
                      {/* A sample picture made by the visualization itself
                          (public/studio/thumbs). Until it loads, or if it
                          fails, the symbol on the gradient shows instead. */}
                      <img
                        src={`/studio/thumbs/${e.id}.webp`}
                        alt=""
                        width={320}
                        height={240}
                        loading="lazy"
                        decoding="async"
                        onError={(ev) => {
                          ev.currentTarget.hidden = true;
                        }}
                      />
                    </span>
                    <span className="card-name">{e.name}</span>
                    <span className="card-summary">{e.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
