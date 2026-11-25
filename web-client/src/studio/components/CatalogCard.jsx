import { memo } from "react";

/**
 * One card in the catalog. Memoized: typing in the search box or switching the category redraws only the
 * cards whose visibility changed, as long as `entry` and `onOpen` keep their identity (specs/005 FR-027).
 */
function CatalogCard({ entry: e, onOpen }) {
  return (
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
        {/* A sample picture made by the visualization itself (public/thumbs). Until it loads, or if it
            fails, the symbol on the gradient shows instead. */}
        <img
          src={`/thumbs/${e.id}.webp`}
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
  );
}

export default memo(CatalogCard);
