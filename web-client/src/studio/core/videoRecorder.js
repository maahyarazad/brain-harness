// Records a canvas to a video file with MediaRecorder (contracts/persistence-formats.md §5).
import { fileStamp } from "./exportFile.js";

/** MIME types to try, best first: MP4 plays everywhere, WebM is the fallback. */
export const MIME_PREFERENCE = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function recorderClass() {
  return typeof globalThis.MediaRecorder === "function" ? globalThis.MediaRecorder : null;
}

/** The first MIME type this browser can record, or null. */
export function pickMimeType() {
  const MR = recorderClass();
  if (!MR || typeof MR.isTypeSupported !== "function") return null;
  return MIME_PREFERENCE.find((t) => MR.isTypeSupported(t)) ?? null;
}

export function canRecordVideo(canvas) {
  return Boolean(canvas && typeof canvas.captureStream === "function" && pickMimeType());
}

export function videoFilename(vizId, ext, date) {
  return `${vizId}-${fileStamp(date)}.${ext}`;
}

/**
 * Starts recording `canvas`. Returns { stop, cancel }:
 * - stop() → Promise<{ blob, ext, mimeType }>, or null if the recording already ended;
 * - cancel() → Promise<null>, discarding what was recorded.
 * onTick(seconds) is called once a second. At maxSeconds the recording stops by
 * itself and onLimit(result) receives the finished clip.
 */
export function startRecording(canvas, { fps = 30, maxSeconds = 60, bitsPerSecond = 8_000_000, onTick, onLimit } = {}) {
  const MR = recorderClass();
  const mimeType = pickMimeType();
  if (!MR || !mimeType || typeof canvas?.captureStream !== "function") {
    throw new Error("Video recording is not supported in this browser.");
  }
  const baseType = mimeType.split(";")[0];
  const ext = baseType === "video/mp4" ? "mp4" : "webm";

  const stream = canvas.captureStream(fps);
  const recorder = new MR(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  const chunks = [];
  let seconds = 0;
  let ended = false;
  let discard = false;
  let finish;
  const finished = new Promise((resolve) => (finish = resolve));

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    finish(discard ? null : { blob: new Blob(chunks, { type: baseType }), ext, mimeType: baseType });
  };

  const timer = setInterval(() => {
    seconds += 1;
    onTick?.(seconds);
    if (seconds >= maxSeconds) {
      end(false).then((r) => r && onLimit?.(r));
    }
  }, 1000);

  function end(drop) {
    if (ended) return Promise.resolve(null);
    ended = true;
    discard = drop;
    clearInterval(timer);
    if (recorder.state === "inactive") {
      stream.getTracks().forEach((t) => t.stop());
      return Promise.resolve(null);
    }
    recorder.stop();
    return finished;
  }

  recorder.start(1000);

  return {
    stop: () => end(false),
    cancel: () => end(true).then(() => null),
  };
}
