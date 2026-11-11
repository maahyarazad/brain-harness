import { useEffect, useRef, useState } from "react";
import { createSaved, updateSaved } from "../core/storage.js";
import { makeThumbnail, exportSaved } from "../core/exportFile.js";

export default function SaveDialog({ defaultName, saved, config, canvas, onClose, onSaved }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState(null);
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

  function save(mode) {
    const thumbnail = canvas ? makeThumbnail(canvas) : null;
    const r =
      mode === "update" && saved
        ? updateSaved(saved.id, { name, config, thumbnail })
        : createSaved({ name, config, thumbnail });
    if (r.ok) onSaved(r.record);
    else setError(r.reason);
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="save-title" onCancel={onClose} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save(saved ? "update" : "new");
        }}
      >
        <h3 id="save-title">{saved ? "Save changes" : "Save visualization"}</h3>
        <label htmlFor="save-name">Name</label>
        <input id="save-name" type="text" maxLength={80} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <p className="knob-help">Saved in this browser only. Use Export to move it to another device.</p>
        {error && (
          <div className="knob-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-small" onClick={() => exportSaved([{ name: name || defaultName, config }])}>
              Export file instead
            </button>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {saved && (
            <button type="button" className="btn" onClick={() => save("new")} disabled={!name.trim()}>
              Save as new
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            {saved ? `Update "${saved.name}"` : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
