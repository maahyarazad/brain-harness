// Auto quality for animated visualizations (specs/005-.../contracts/quality.md, data-model.md).
//
// Pure: no timers, no DOM. Time comes only from the animation-frame timestamps the shell passes
// to frame(), so tests drive it with a fake clock. It moves between "low" and "medium" only:
// Auto never goes above Medium, so a device that keeps up shows exactly today's picture (FR-021).
//
//   medium --2 slow windows--> low
//   low    --8 s fast and >= 20 s since the last step down--> medium
//   a step up followed by a step down within 10 s locks step-ups for 60 s (no flicker)

export const GOVERNOR = Object.freeze({
  windowMs: 1000, //       length of one measuring window
  slowMs: 36, //           a window slower than this (below about 28 fps) counts as slow
  fastMs: 20, //           a window at or below this (about 50 fps or better) counts as fast
  settleMs: 1000, //       frames right after a change are ignored while the new level settles
  gapMs: 1000, //          a longer gap between frames is a pause or hidden tab, not slowness
  upAfterFastMs: 8000, //  fast for this long before stepping up
  upAfterDownMs: 20000, // and at least this long after the last step down
  flickerMs: 10000, //     a step down this soon after a step up is flicker
  lockMs: 60000, //        and then step-ups are locked for this long
});

export const NOTICES = Object.freeze({
  down: "Lowered quality to keep this smooth.",
  up: "Back to full quality.",
  floor: "This device is too slow to keep this smooth, even at the lowest quality.",
});

export function createQualityGovernor({ onLevel = () => {}, onNotice = () => {}, start = "medium" } = {}) {
  let level = start;
  let lastTs = null;
  let windowStart = 0;
  let windowFrames = 0;
  let windowSum = 0;
  let slowWindows = 0;
  let fastSince = null;
  let lastDownAt = null;
  let lastUpAt = null;
  let upLockedUntil = 0;
  let settleUntil = 0;
  let reportedFloor = false;

  function restartWindow(ts) {
    windowStart = ts;
    windowFrames = 0;
    windowSum = 0;
  }

  function stepDown(ts) {
    if (level === "low") {
      // Nothing lower to go to. Say so once, not every window.
      if (!reportedFloor) {
        reportedFloor = true;
        onNotice(NOTICES.floor);
      }
      return;
    }
    level = "low";
    lastDownAt = ts;
    settleUntil = ts + GOVERNOR.settleMs;
    slowWindows = 0;
    fastSince = null;
    if (lastUpAt !== null && ts - lastUpAt <= GOVERNOR.flickerMs) upLockedUntil = ts + GOVERNOR.lockMs;
    onLevel("low", { reason: "slow" });
    onNotice(NOTICES.down);
  }

  function stepUp(ts) {
    level = "medium";
    lastUpAt = ts;
    settleUntil = ts + GOVERNOR.settleMs;
    slowWindows = 0;
    fastSince = null;
    reportedFloor = false;
    onLevel("medium", { reason: "fast" });
    onNotice(NOTICES.up);
  }

  function judge(ts, meanMs) {
    if (meanMs > GOVERNOR.slowMs) {
      slowWindows += 1;
      fastSince = null;
      if (slowWindows >= 2) stepDown(ts);
      return;
    }
    slowWindows = 0;
    if (meanMs > GOVERNOR.fastMs) {
      fastSince = null; // fine, but not fast enough to trust a higher level
      return;
    }
    if (fastSince === null) fastSince = windowStart;
    const longEnoughFast = ts - fastSince >= GOVERNOR.upAfterFastMs;
    const longEnoughSinceDown = lastDownAt === null || ts - lastDownAt >= GOVERNOR.upAfterDownMs;
    if (level === "low" && longEnoughFast && longEnoughSinceDown && ts >= upLockedUntil) stepUp(ts);
  }

  return {
    /** Call once per animation frame with the frame's timestamp (milliseconds). */
    frame(ts) {
      if (lastTs === null) {
        lastTs = ts;
        restartWindow(ts);
        return;
      }
      const dt = ts - lastTs;
      lastTs = ts;
      if (dt > GOVERNOR.gapMs) {
        // The loop was paused or the tab hidden: that says nothing about speed.
        restartWindow(ts);
        slowWindows = 0;
        fastSince = null;
        return;
      }
      if (ts < settleUntil) {
        restartWindow(ts);
        return;
      }
      windowFrames += 1;
      windowSum += dt;
      if (ts - windowStart >= GOVERNOR.windowMs) {
        const mean = windowSum / windowFrames;
        restartWindow(ts);
        judge(ts, mean);
      }
    },
    level: () => level,
    /** Forget everything, for a new instance or when the visitor goes back to Auto. */
    reset() {
      level = start;
      lastTs = null;
      windowFrames = 0;
      windowSum = 0;
      slowWindows = 0;
      fastSince = null;
      lastDownAt = null;
      lastUpAt = null;
      upLockedUntil = 0;
      settleUntil = 0;
      reportedFloor = false;
    },
  };
}
