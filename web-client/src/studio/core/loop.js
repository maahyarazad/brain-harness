// Animation loop with a speed multiplier and a fixed-step accumulator.
// Pauses while the tab is hidden and resumes if it was playing.
//
// onFrame(ts) gets the animation-frame timestamp, which the quality governor uses.
// isIdle(): when it returns true after a frame, nothing will change until the next input
// (a finished sort or maze), so the loop stops asking for frames and uses next to no processing
// power (FR-024). The shell calls wake() on update, pointer, action, reset and resize.

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

/**
 * Development only: `?load=<ms>` makes every frame busy-wait that long, so the Auto quality
 * level can be exercised on a fast machine. `import.meta.env.DEV` is false in a production
 * build, so this is compiled out there.
 */
function devLoadMs() {
  if (!import.meta.env?.DEV || typeof location === "undefined") return 0;
  const n = Number(new URLSearchParams(location.search).get("load"));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 0;
}

export function createLoop({
  step,
  render,
  onFrame = () => {},
  isIdle = () => false,
  baseSteps = 1,
  onStateChange = () => {},
  raf = (cb) => globalThis.requestAnimationFrame(cb),
  caf = (id) => globalThis.cancelAnimationFrame(id),
  doc = globalThis.document,
}) {
  let playing = false;
  let hiddenPause = false;
  let speed = 1;
  let acc = 0;
  let frame = null;
  let destroyed = false;
  const load = devLoadMs();

  function tick(ts) {
    frame = null;
    if (!playing || destroyed) return;
    if (load) {
      const end = performance.now() + load;
      while (performance.now() < end) {
        /* busy-wait: simulates a slow device */
      }
    }
    acc += baseSteps * speed;
    let n = 0;
    while (acc >= 1 && n < 100000) {
      step();
      acc -= 1;
      n++;
    }
    onFrame(ts);
    render();
    if (isIdle()) return; // stay "playing", but ask for no more frames until wake()
    frame = raf(tick);
  }

  /** Starts asking for frames again after the loop went idle. Does nothing while paused or already running. */
  function wake() {
    if (!playing || destroyed || frame !== null) return;
    frame = raf(tick);
  }

  function play() {
    if (destroyed || playing) return;
    playing = true;
    onStateChange(true);
    if (frame === null) frame = raf(tick);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    if (frame !== null) caf(frame);
    frame = null;
    onStateChange(false);
  }

  function onVisibility() {
    if (doc.visibilityState === "hidden") {
      if (playing) {
        hiddenPause = true;
        pause();
      }
    } else if (hiddenPause) {
      hiddenPause = false;
      play();
    }
  }
  doc?.addEventListener("visibilitychange", onVisibility);

  return {
    play,
    pause,
    wake,
    stepOnce() {
      if (playing || destroyed) return;
      step();
      render();
    },
    setBaseSteps(n) {
      baseSteps = n;
    },
    setSpeed(s) {
      speed = s;
    },
    getSpeed: () => speed,
    isPlaying: () => playing,
    destroy() {
      pause();
      destroyed = true;
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
