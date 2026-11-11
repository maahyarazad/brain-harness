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
