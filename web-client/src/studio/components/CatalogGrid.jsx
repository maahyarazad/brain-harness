import { memo, useMemo } from "react";
import { CATALOG, CATEGORIES } from "../catalog.js";
import CatalogCard from "./CatalogCard.jsx";

/** The entries that match the search and the category, and those grouped by category (empty groups left out). */
function filterCatalog(query, category) {
  const q = query.trim().toLowerCase();
  const matches = CATALOG.filter(
    (e) => (!category || e.category === category) && (!q || e.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
  );
  const sections = CATEGORIES.map((c) => ({ category: c, items: matches.filter((e) => e.category === c.id) })).filter((s) => s.items.length);
  return { matches, sections };
}

function CatalogGrid({ query, category, onQuery, onCategory, onOpen, notice, children }) {
  // Only recomputed when the search or the category changes, not on every redraw of the page.
  const { matches, sections } = useMemo(() => filterCatalog(query, category), [query, category]);

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
      {sections.map(({ category: c, items }) => (
        <section key={c.id} aria-labelledby={`cat-${c.id}`} className="catalog-section">
          <h2 id={`cat-${c.id}`}>{c.name}</h2>
          <ul className="cards">
            {items.map((e) => (
              <li key={e.id}>
                <CatalogCard entry={e} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default memo(CatalogGrid);
