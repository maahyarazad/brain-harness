import { useState } from "react";
import { encodeConfig, buildShareUrl } from "../core/shareLink.js";
import { downloadPng, exportSaved } from "../core/exportFile.js";

export default function ShareMenu({ module, config, canvasRef, vizId, name }) {
  const [message, setMessage] = useState(null);
  const [fallbackUrl, setFallbackUrl] = useState(null);

  async function copyLink() {
    setFallbackUrl(null);
    const r = await encodeConfig(module, config);
    if (!r.ok) {
      setMessage(r.reason);
      return;
    }
    const url = buildShareUrl(vizId, r.payload);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setFallbackUrl(url);
      setMessage("Copy the link below.");
    }
  }

  return (
    <div className="share" role="group" aria-label="Share and export">
      <button type="button" className="btn" onClick={copyLink}>
        Copy link
      </button>
      <button type="button" className="btn" onClick={() => canvasRef.current && downloadPng(canvasRef.current, vizId)}>
        Download image
      </button>
      <button type="button" className="btn" onClick={() => exportSaved([{ name, config }])}>
        Export settings
      </button>
      {message && (
        <span className="share-msg" role="status">
          {message}
        </span>
      )}
      {fallbackUrl && (
        <input className="share-url" readOnly value={fallbackUrl} aria-label="Share link" onFocus={(e) => e.target.select()} />
      )}
    </div>
  );
}
