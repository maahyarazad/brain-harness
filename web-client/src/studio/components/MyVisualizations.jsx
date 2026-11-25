import { memo, useCallback, useEffect, useRef, useState } from "react";
import { listSaved, subscribe, renameSaved, duplicateSaved, deleteSaved, addMany } from "../core/storage.js";
import { exportSaved, parseImport, readFileText } from "../core/exportFile.js";
import { findEntry } from "../catalog.js";

function useSaved() {
  const [state, setState] = useState(listSaved);
  useEffect(() => subscribe(() => setState(listSaved())), []);
  return state;
}

export default function MyVisualizations({ onOpen, showEmpty = false }) {
  const { items, skipped, unavailable } = useSaved();
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileText(file);
      const r = await parseImport(text, async (id) => (await findEntry(id).load()).default);
      if (!r.ok) {
        setMessage(r.reason);
        return;
      }
      const w = addMany(r.items.map((i) => ({ name: i.name, config: i.config, thumbnail: null })));
      if (!w.ok) {
        setMessage(w.reason);
        return;
      }
      const parts = [`Imported ${r.items.length}`];
      if (r.skipped) parts.push(`skipped ${r.skipped} that couldn't be read`);
      if (r.replaced.length) parts.push(`${r.replaced.length} invalid settings were reset to defaults`);
      setMessage(`${parts.join(", ")}.`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  // Handlers handed to the rows keep their identity, so typing a new name redraws only the row being renamed.
  const editNameRef = useRef("");
  editNameRef.current = editName;
  const startRename = useCallback((r) => {
    setEditing(r.id);
    setEditName(r.name);
  }, []);
  const commitRename = useCallback((id) => {
    const r = renameSaved(id, editNameRef.current);
    if (!r.ok) setMessage(r.reason);
    setEditing(null);
  }, []);
  const cancelRename = useCallback(() => setEditing(null), []);
  const duplicate = useCallback((id) => {
    const x = duplicateSaved(id);
    if (!x.ok) setMessage(x.reason);
  }, []);
  const exportOne = useCallback((r) => exportSaved([r]), []);

  if (!items.length && !showEmpty && !message) {
    return (
      <section className="mine mine-empty" aria-labelledby="mine-heading">
        <h2 id="mine-heading">My visualizations</h2>
        <p className="muted">
          Nothing saved yet. Open a visualization, tune it, and press Save.{" "}
          <button type="button" className="linklike" onClick={() => fileRef.current?.click()}>
            Import a file
          </button>
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
      </section>
    );
  }

  return (
    <section className="mine" aria-labelledby="mine-heading">
      <div className="section-head">
        <h2 id="mine-heading">My visualizations</h2>
        <span className="spacer" />
        <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        {items.length > 0 && (
          <button type="button" className="btn btn-small" onClick={() => exportSaved(items)}>
            Export all
          </button>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} aria-label="Import a .vizstudio.json file" />
      </div>
      {unavailable && <p className="studio-notice">This browser doesn't allow saving here, so nothing can be listed.</p>}
      {skipped > 0 && <p className="studio-notice">{skipped} saved item(s) were damaged and are hidden.</p>}
      {message && (
        <p className="studio-notice" role="status">
          {message}
        </p>
      )}
      {!items.length && <p className="muted">Nothing saved yet.</p>}
      <ul className="mine-list">
        {items.map((r) => (
          <SavedRow
            key={r.id}
            record={r}
            entry={findEntry(r.config.vizId)}
            editing={editing === r.id}
            editName={editing === r.id ? editName : null}
            onOpen={onOpen}
            onEditName={setEditName}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onDuplicate={duplicate}
            onExport={exportOne}
            onAskDelete={setConfirmDelete}
          />
        ))}
      </ul>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const r = deleteSaved(confirmDelete.id);
            if (!r.ok) setMessage(r.reason);
            setConfirmDelete(null);
          }}
        />
      )}
    </section>
  );
}

/** One saved visualization. Memoized: it redraws only when its own record, its own edit state or a handler changes. */
const SavedRow = memo(function SavedRow({ record: r, entry, editing, editName, onOpen, onEditName, onStartRename, onCommitRename, onCancelRename, onDuplicate, onExport, onAskDelete }) {
  return (
    <li className="mine-item">
      <button type="button" className="mine-open" onClick={() => onOpen(r.id)} aria-label={`Open ${r.name}`}>
        {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span className="thumb-glyph" aria-hidden="true">{entry?.glyph ?? "?"}</span>}
      </button>
      <div className="mine-meta">
        {editing ? (
          <input
            aria-label="New name"
            value={editName}
            maxLength={80}
            autoFocus
            onChange={(e) => onEditName(e.target.value)}
            onBlur={() => onCommitRename(r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename(r.id);
              if (e.key === "Escape") onCancelRename();
            }}
          />
        ) : (
          <button type="button" className="linklike mine-name" onClick={() => onOpen(r.id)}>
            {r.name}
          </button>
        )}
        <span className="muted">
          {entry?.name ?? r.config.vizId} · {new Date(r.updatedAt).toLocaleDateString()}
        </span>
        <div className="mine-actions">
          <button type="button" className="btn btn-small" onClick={() => onStartRename(r)}>
            Rename
          </button>
          <button type="button" className="btn btn-small" onClick={() => onDuplicate(r.id)}>
            Duplicate
          </button>
          <button type="button" className="btn btn-small" onClick={() => onExport(r)}>
            Export
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={() => onAskDelete(r)}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
});

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    try {
      d.showModal();
    } catch {
      d.setAttribute("open", "");
    }
  }, []);
  return (
    <dialog ref={ref} className="dialog" role="alertdialog" aria-labelledby="confirm-title" onCancel={onCancel}>
      <h3 id="confirm-title">{title}</h3>
      <p>{body}</p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
