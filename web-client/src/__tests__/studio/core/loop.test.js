import { createLoop } from "../../../studio/core/loop.js";
import { createFrameDriver, setVisibility } from "../browserStubs.js";

function setup(baseSteps = 1) {
  const frames = createFrameDriver();
  const calls = { step: 0, render: 0 };
  const loop = createLoop({
    step: () => calls.step++,
    render: () => calls.render++,
    baseSteps,
    raf: frames.raf,
    caf: frames.caf,
  });
  return { frames, calls, loop };
}

test("plays, pauses and steps", () => {
  const { frames, calls, loop } = setup();
  loop.play();
  frames.advanceFrames(3);
  expect(calls.step).toBe(3);
  loop.pause();
  frames.advanceFrames(3);
  expect(calls.step).toBe(3);
  loop.stepOnce();
  expect(calls.step).toBe(4);
  expect(calls.render).toBe(4);
  loop.destroy();
});

test("speed scales steps per frame, including fractions", () => {
  const { frames, calls, loop } = setup(2);
  loop.setSpeed(4);
  loop.play();
  frames.advanceFrames(2);
  expect(calls.step).toBe(16);
  loop.setSpeed(0.25);
  frames.advanceFrames(2);
  expect(calls.step).toBe(17);
  loop.destroy();
});

test("pauses while the tab is hidden and resumes after", () => {
  const { frames, calls, loop } = setup();
  loop.play();
  setVisibility("hidden");
  expect(loop.isPlaying()).toBe(false);
  frames.advanceFrames(5);
  expect(calls.step).toBe(0);
  setVisibility("visible");
  expect(loop.isPlaying()).toBe(true);
  frames.advanceFrames(1);
  expect(calls.step).toBe(1);
  loop.destroy();
});

test("a paused loop stays paused when the tab comes back", () => {
  const { loop } = setup();
  setVisibility("hidden");
  setVisibility("visible");
  expect(loop.isPlaying()).toBe(false);
  loop.destroy();
});

describe("frame timestamp, idle and wake (specs/005 FR-024)", () => {
  test("onFrame receives the animation-frame timestamp", () => {
    const frames = createFrameDriver();
    const seen = [];
    const loop = createLoop({ step() {}, render() {}, onFrame: (ts) => seen.push(ts), raf: frames.raf, caf: frames.caf });
    loop.play();
    frames.advanceFrames(3);
    expect(seen).toHaveLength(3);
    expect(seen.every((t) => typeof t === "number" && Number.isFinite(t))).toBe(true);
    loop.destroy();
  });

  function idleSetup() {
    const frames = createFrameDriver();
    const calls = { step: 0, render: 0 };
    const state = { idle: false };
    const loop = createLoop({
      step: () => calls.step++,
      render: () => calls.render++,
      isIdle: () => state.idle,
      raf: frames.raf,
      caf: frames.caf,
    });
    return { frames, calls, state, loop };
  }

  test("when isIdle() turns true the loop stops asking for frames but is still playing", () => {
    const { frames, calls, state, loop } = idleSetup();
    loop.play();
    frames.advanceFrames(2);
    expect(frames.pending()).toBe(1);
    state.idle = true;
    frames.advanceFrames(1);
    expect(frames.pending()).toBe(0); // no more requestAnimationFrame: next to no processing power
    expect(loop.isPlaying()).toBe(true);
    const before = calls.step;
    frames.advanceFrames(5);
    expect(calls.step).toBe(before);
    loop.destroy();
  });

  test("wake() starts it again, and it runs until it is idle again", () => {
    const { frames, calls, state, loop } = idleSetup();
    loop.play();
    state.idle = true;
    frames.advanceFrames(1);
    expect(frames.pending()).toBe(0);
    state.idle = false;
    loop.wake();
    expect(frames.pending()).toBe(1);
    const before = calls.step;
    frames.advanceFrames(2);
    expect(calls.step).toBe(before + 2);
    loop.destroy();
  });

  test("wake() does nothing while paused, and never schedules a second frame", () => {
    const { frames, state, loop } = idleSetup();
    loop.wake();
    expect(frames.pending()).toBe(0); // not playing
    loop.play();
    expect(frames.pending()).toBe(1);
    loop.wake();
    loop.wake();
    expect(frames.pending()).toBe(1);
    loop.pause();
    loop.wake();
    expect(frames.pending()).toBe(0);
    expect(state.idle).toBe(false);
    loop.destroy();
  });

  test("a loop that is idle comes back after the tab was hidden and shown again", () => {
    const { frames, state, loop } = idleSetup();
    loop.play();
    state.idle = true;
    frames.advanceFrames(1);
    setVisibility("hidden");
    expect(loop.isPlaying()).toBe(false);
    setVisibility("visible");
    expect(loop.isPlaying()).toBe(true);
    expect(frames.pending()).toBe(1);
    loop.destroy();
  });
});

describe("development-only ?load busy-wait", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  test("without ?load a frame is not delayed", () => {
    const frames = createFrameDriver();
    const loop = createLoop({ step() {}, render() {}, raf: frames.raf, caf: frames.caf });
    loop.play();
    const t = performance.now();
    frames.advanceFrames(1);
    expect(performance.now() - t).toBeLessThan(15);
    loop.destroy();
  });

  test("?load=20 makes each frame take at least 20 ms", () => {
    window.history.replaceState(null, "", "/?load=20");
    const frames = createFrameDriver();
    const loop = createLoop({ step() {}, render() {}, raf: frames.raf, caf: frames.caf });
    loop.play();
    const t = performance.now();
    frames.advanceFrames(1);
    expect(performance.now() - t).toBeGreaterThanOrEqual(19);
    loop.destroy();
  });
});
