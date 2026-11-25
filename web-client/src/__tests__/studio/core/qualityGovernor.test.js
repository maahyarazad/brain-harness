import { vi } from "vitest";
import { createQualityGovernor, GOVERNOR } from "../../../studio/core/qualityGovernor.js";

// Feeds frames at a constant interval and returns the timestamp of the last one.
function feed(g, from, seconds, dt) {
  let t = from;
  const end = from + seconds * 1000;
  while (t < end) {
    g.frame(t);
    t += dt;
  }
  return t;
}

function make(opts = {}) {
  const onLevel = vi.fn();
  const onNotice = vi.fn();
  const g = createQualityGovernor({ onLevel, onNotice, ...opts });
  return { g, onLevel, onNotice };
}

const notices = (fn) => fn.mock.calls.map((c) => c[0]);

describe("quality governor (Auto)", () => {
  test("starts at medium and stays there while frames are steady", () => {
    const { g, onLevel, onNotice } = make();
    expect(g.level()).toBe("medium");
    feed(g, 0, 40, 16.7);
    expect(g.level()).toBe("medium");
    expect(onLevel).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  test("two slow windows in a row step down to low, with a notice", () => {
    const { g, onLevel, onNotice } = make();
    feed(g, 0, 3, 50); // 20 fps
    expect(g.level()).toBe("low");
    expect(onLevel).toHaveBeenCalledTimes(1);
    expect(onLevel).toHaveBeenCalledWith("low", expect.objectContaining({ reason: "slow" }));
    expect(notices(onNotice)).toEqual(["Lowered quality to keep this smooth."]);
  });

  test("it reacts within 3 seconds of the slowness starting (SC-010)", () => {
    const { g } = make();
    let t = 0;
    let at = null;
    while (t < 5000) {
      g.frame(t);
      if (at === null && g.level() === "low") at = t;
      t += 50;
    }
    expect(at).not.toBeNull();
    expect(at).toBeLessThanOrEqual(3000);
  });

  test("one slow window (a hiccup) does not step down", () => {
    const { g } = make();
    let t = feed(g, 0, 1.1, 60); // one slow window
    t = feed(g, t, 20, 16.7);
    expect(g.level()).toBe("medium");
  });

  test("frames between 20 and 36 ms are neither slow nor fast: nothing changes", () => {
    const { g, onLevel } = make();
    feed(g, 0, 60, 28);
    expect(onLevel).not.toHaveBeenCalled();
  });

  test("a gap in timestamps (hidden tab, pause) is not counted as slowness", () => {
    const { g, onLevel } = make();
    let t = feed(g, 0, 3, 16.7);
    t += 30000; // the tab was hidden
    t = feed(g, t, 3, 16.7);
    expect(onLevel).not.toHaveBeenCalled();
    expect(g.level()).toBe("medium");
  });

  test("at low and still slow, it says so once and does not keep repeating", () => {
    const { g, onNotice } = make();
    feed(g, 0, 20, 60);
    expect(g.level()).toBe("low");
    const text = notices(onNotice);
    expect(text.filter((n) => n.includes("too slow")).length).toBe(1);
    expect(text.filter((n) => n.startsWith("Lowered")).length).toBe(1);
  });

  test("steps back up to medium only after 8 s of fast frames AND 20 s since the step down", () => {
    const { g, onLevel, onNotice } = make();
    let t = feed(g, 0, 3, 50); // down at about 2 s
    expect(g.level()).toBe("low");
    t = feed(g, t, 12, 10); // fast, but only ~15 s after the step down
    expect(g.level()).toBe("low");
    t = feed(g, t, 12, 10); // now past 20 s since the step down
    expect(g.level()).toBe("medium");
    expect(onLevel).toHaveBeenLastCalledWith("medium", expect.objectContaining({ reason: "fast" }));
    expect(notices(onNotice).at(-1)).toBe("Back to full quality.");
  });

  test("never goes above medium, however fast the frames are (FR-021)", () => {
    const { g, onLevel } = make();
    let t = feed(g, 0, 3, 50);
    t = feed(g, t, 60, 8);
    expect(g.level()).toBe("medium");
    const levels = onLevel.mock.calls.map((c) => c[0]);
    expect(levels).toEqual(["low", "medium"]);
    expect(levels).not.toContain("high");
  });

  test("anti-flicker: a step up followed by a step down within 10 s locks step-ups for 60 s", () => {
    const { g, onLevel } = make();
    let t = feed(g, 0, 3, 50); // down
    t = feed(g, t, 25, 10); // up (after ≥ 20 s since the step down)
    expect(g.level()).toBe("medium");
    t = feed(g, t, 3 + 1, 50); // slow again right away: down within 10 s of the up
    expect(g.level()).toBe("low");
    const downAt = t;
    // 40 s of fast frames: the lock (60 s) is still on, so no step up.
    t = feed(g, t, 40, 10);
    expect(g.level()).toBe("low");
    // Past the lock and the 20 s rule: it can go up again.
    t = feed(g, t, 40, 10);
    expect(g.level()).toBe("medium");
    expect(onLevel.mock.calls.map((c) => c[0])).toEqual(["low", "medium", "low", "medium"]);
    expect(t - downAt).toBeGreaterThan(60000);
  });

  test("reset() goes back to the start level and forgets its history", () => {
    const { g, onLevel } = make();
    feed(g, 0, 3, 50);
    expect(g.level()).toBe("low");
    g.reset();
    expect(g.level()).toBe("medium");
    onLevel.mockClear();
    feed(g, 100000, 3, 16.7);
    expect(onLevel).not.toHaveBeenCalled();
  });

  test("can start at low", () => {
    const { g } = make({ start: "low" });
    expect(g.level()).toBe("low");
  });

  test("exposes its parameters, matching the documented policy", () => {
    expect(GOVERNOR).toMatchObject({ windowMs: 1000, slowMs: 36, fastMs: 20, settleMs: 1000, upAfterFastMs: 8000, upAfterDownMs: 20000, flickerMs: 10000, lockMs: 60000 });
  });
});
