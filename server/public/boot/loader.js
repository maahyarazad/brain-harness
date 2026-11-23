// The loading screen the server's HTML shows before the app runs (index.html, #boot-loader).
// Shows the percentage of the first screen's assets loaded, and leaves once they are all
// loaded and the app has put its first screen in #root.
import { createProgress, formatPercent } from "./progress.js";

export const MAX_WAIT_MS = 15_000;
const FADE_FALLBACK_MS = 400;

const appShown = (root) => Boolean(root) && [...root.children].some((el) => !el.classList.contains("studio-loading"));

export function startLoader({ assets = [] } = {}) {
  const el = document.getElementById("boot-loader");
  if (!el) return { progress: createProgress([]) };
  const percentEl = document.getElementById("boot-percent");
  const root = document.getElementById("root");
  let leaving = false;
  let observer;
  let limit;

  function leave() {
    if (leaving) return;
    leaving = true;
    observer?.disconnect();
    clearTimeout(limit);
    el.classList.add("boot-loader--done");
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.remove();
    };
    el.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, FADE_FALLBACK_MS);
  }

  const progress = createProgress(assets, {
    onProgress: ({ percent }) => {
      if (percentEl) percentEl.textContent = `Loading assets ${formatPercent(percent)}%`;
    },
  });
  const check = () => {
    if (progress.state().done && appShown(root)) leave();
  };

  if (root) {
    observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
  }
  progress.finished.then(check);
  limit = setTimeout(leave, MAX_WAIT_MS); // never block the page for good
  return { progress };
}
