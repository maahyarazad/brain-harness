// Counts bytes of the first-screen assets as they download (specs/004-studio-home-sweep, User Story 7).
// No DOM access: src/boot/loader.js shows the result.

/** An integer string "0"…"100". */
export function formatPercent(p) {
  if (!Number.isFinite(p)) return "0";
  return String(Math.round(Math.min(100, Math.max(0, p))));
}

/**
 * Fetches every asset (so it is in the browser's cache when the app asks for it) and
 * reports bytes received ÷ the listed sizes. A failed asset counts as fully loaded, so
 * a missing file can never leave the percentage stuck.
 *
 * → { finished: Promise, state(): { percent, done } }
 */
export function createProgress(assets = [], { fetchFn = (...a) => fetch(...a), onProgress = () => {} } = {}) {
  const list = (assets ?? []).filter((a) => a && a.url);
  const total = list.reduce((sum, a) => sum + Math.max(0, a.size || 0), 0);
  const received = new Map(list.map((a) => [a.url, 0]));
  let finishedCount = 0;
  let done = list.length === 0;

  const state = () => {
    if (list.length === 0) return { percent: 0, done: true };
    if (done) return { percent: 100, done: true };
    let got = 0;
    for (const n of received.values()) got += n;
    return { percent: total > 0 ? Math.min(99, (got / total) * 100) : 0, done: false };
  };
  const emit = () => onProgress(state());

  async function load(asset) {
    const size = Math.max(0, asset.size || 0);
    try {
      const res = await fetchFn(asset.url);
      if (!res || !res.ok) throw new Error("bad response");
      const reader = res.body?.getReader?.();
      if (reader) {
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          received.set(asset.url, Math.min(size, received.get(asset.url) + value.length));
          emit();
        }
      }
    } catch {
      /* counted as loaded below */
    }
    received.set(asset.url, size);
    finishedCount++;
    if (finishedCount === list.length) done = true;
    emit();
  }

  emit();
  const finished = Promise.all(list.map(load)).then(() => undefined);
  return { finished, state };
}
