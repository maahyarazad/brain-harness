import { useEffect, useRef, useState } from "react";
import { encodeConfig, buildShareUrl } from "../core/shareLink.js";
import { downloadPng, exportSaved, downloadBlob } from "../core/exportFile.js";
import { canRecordVideo, startRecording, videoFilename } from "../core/videoRecorder.js";

const MAX_SECONDS = 60;

function formatElapsed(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * recordable: the visualization changes over time (animated or interactive).
 * onRecordStart: called when recording starts (the viewer starts playback).
 * active: false while the studio is hidden; an active recording is then cancelled.
 */
export default function ShareMenu({ module, config, canvasRef, vizId, name, recordable = false, onRecordStart, active = true }) {
  const [message, setMessage] = useState(null);
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const [elapsed, setElapsed] = useState(null); // null when not recording
  const [canRecord, setCanRecord] = useState(false);
  const recording = useRef(null);

  // The canvas exists after the first render, so check support then.
  useEffect(() => {
    setCanRecord(recordable && canRecordVideo(canvasRef.current));
  }, [recordable, canvasRef]);

  function cancelRecording(why) {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    setElapsed(null);
    rec.cancel();
    if (why) setMessage(why);
  }

  // Leaving the visualization (unmount), hiding the studio, or hiding the tab
  // cancels a recording without a download.
  useEffect(() => () => cancelRecording(), []);
  useEffect(() => {
    if (!active) cancelRecording("Recording cancelled.");
  }, [active]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancelRecording("Recording cancelled: the tab was hidden.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function save(result) {
    if (result) downloadBlob(result.blob, videoFilename(vizId, result.ext));
  }

  async function toggleRecording() {
    if (recording.current) {
      const rec = recording.current;
      recording.current = null;
      setElapsed(null);
      save(await rec.stop());
      setMessage("Video saved.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      recording.current = startRecording(canvas, {
        maxSeconds: MAX_SECONDS,
        onTick: (s) => setElapsed(s),
        onLimit: (result) => {
          recording.current = null;
          setElapsed(null);
          save(result);
          setMessage(`Recording stopped at the ${MAX_SECONDS}-second limit.`);
        },
      });
    } catch (err) {
      setMessage(err.message);
      return;
    }
    setElapsed(0);
    setMessage(null);
    onRecordStart?.();
  }

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
      {canRecord && (
        <button type="button" className="btn" aria-pressed={elapsed !== null} onClick={toggleRecording}>
          {elapsed === null ? (
            "Record video"
          ) : (
            <>
              <span className="rec-dot" aria-hidden="true" />
              Stop recording · {formatElapsed(elapsed)}
            </>
          )}
        </button>
      )}
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
