// Full screen for the canvas (specs/004-studio-home-sweep/spec.md, User Story 6).
// Uses the standard Fullscreen API, and the WebKit-prefixed names where that is all
// a browser has. None of these functions throws or rejects. No module-level side effects.

export const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"];

const requestOf = (el) => el?.requestFullscreen ?? el?.webkitRequestFullscreen;

/** Whether this browser can show `el` full screen. iPhone Safari cannot (only video), so it says no there. */
export function fullscreenSupported(el) {
  if (typeof document === "undefined" || !el) return false;
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false;
  return Boolean(enabled && requestOf(el));
}

/** The element that is full screen right now, if any. */
function currentElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

export function isFullscreen(el) {
  if (typeof document === "undefined" || !el) return false;
  return currentElement() === el;
}

/** Asks for full screen. → { ok: true } or { ok: false } (refused, blocked, or not supported). */
export async function enterFullscreen(el) {
  const request = requestOf(el);
  if (!request) return { ok: false };
  try {
    await request.call(el); // the prefixed call may return nothing
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Leaves full screen. Does nothing when nothing is full screen. */
export async function exitFullscreen() {
  if (typeof document === "undefined" || !currentElement()) return;
  const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
  try {
    await exit?.call(document);
  } catch {
    /* already left, or the browser refused: nothing to do */
  }
}
