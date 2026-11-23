// Animation loop with a speed multiplier and a fixed-step accumulator.
// Pauses while the tab is hidden and resumes if it was playing.

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

export function createLoop({
  step,
  render,
  onFrame = () => {},
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

  function tick() {
    frame = null;
    if (!playing || destroyed) return;
    acc += baseSteps * speed;
    let n = 0;
    while (acc >= 1 && n < 100000) {
      step();
      acc -= 1;
      n++;
    }
    onFrame();
    render();
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
