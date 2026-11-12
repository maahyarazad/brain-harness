// Development-only page (/studio/__thumbnails, `npm run dev`): renders every
// visualization's catalog picture from its `thumbnail` recipe and saves it to
// web-client/public/studio/thumbs/<id>.webp through the dev server.
import { useState } from "react";
import { CATALOG } from "../catalog.js";
import { renderThumbnail, thumbnailBlob, thumbnailQuality, THUMB_W, THUMB_H } from "../core/thumbnail.js";
import "../studio.css";

async function render(entry) {
  const module = (await entry.load()).default;
  const blob = await thumbnailBlob(await renderThumbnail(module), thumbnailQuality(module));
  return { blob, url: URL.createObjectURL(blob) };
}

async function save(id, blob) {
  const res = await fetch(`/__thumbs/${id}.webp`, { method: "PUT", body: blob });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

export default function ThumbnailStudio() {
  const [items, setItems] = useState({}); // id → { blob, url, status }
  const [busy, setBusy] = useState(null); // progress text

  const set = (id, patch) => setItems((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  async function renderOne(entry) {
    set(entry.id, { status: "rendering…" });
    try {
      const r = await render(entry);
      set(entry.id, { ...r, status: "rendered" });
      return r;
    } catch (err) {
      set(entry.id, { status: `failed: ${err.message}` });
      return null;
    }
  }

  async function saveOne(entry, r = items[entry.id]) {
    if (!r?.blob) return;
    try {
      await save(entry.id, r.blob);
      set(entry.id, { status: "saved" });
    } catch (err) {
      set(entry.id, { status: `save failed: ${err.message}` });
    }
  }

  async function all(andSave) {
    for (let i = 0; i < CATALOG.length; i++) {
      setBusy(`${i + 1} / ${CATALOG.length}`);
      const r = await renderOne(CATALOG[i]);
      if (andSave && r) await saveOne(CATALOG[i], r);
    }
    setBusy(null);
  }

  const total = Object.values(items).reduce((n, x) => n + (x.blob?.size ?? 0), 0);

  return (
    <div className="studio">
      <div className="studio-header">
        <h1>Catalog pictures</h1>
        <span className="spacer" />
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => all(false)}>
          Render all
        </button>
        <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => all(true)}>
          Save all
        </button>
      </div>
      <main>
        <p className="muted">
          Development tool. Renders each visualization from its <code>thumbnail</code> recipe and saves it to{" "}
          <code>web-client/public/studio/thumbs/&lt;id&gt;.webp</code>. Commit the files afterwards.
          {busy && ` Working: ${busy}.`} {total > 0 && `Total: ${kb(total)}.`}
        </p>
        <ul className="cards">
          {CATALOG.map((e) => {
            const it = items[e.id] ?? {};
            return (
              <li key={e.id} className="card" data-thumb-id={e.id}>
                <span className="card-thumb">
                  {it.url ? <img src={it.url} alt={e.name} width={THUMB_W} height={THUMB_H} /> : <span className="card-glyph">{e.glyph}</span>}
                </span>
                <span className="card-name">{e.name}</span>
                <span className="card-summary" data-status>
                  {it.status ?? "not rendered"}
                  {it.blob ? ` · ${kb(it.blob.size)}` : ""}
                </span>
                <span>
                  <button type="button" className="btn btn-small" disabled={Boolean(busy)} onClick={() => renderOne(e)}>
                    Render
                  </button>{" "}
                  <button type="button" className="btn btn-small" disabled={Boolean(busy) || !it.blob} onClick={() => saveOne(e)}>
                    Save
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
