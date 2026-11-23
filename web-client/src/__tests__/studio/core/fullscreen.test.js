import { vi, afterEach } from "vitest";
import {
  fullscreenSupported,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  FULLSCREEN_EVENTS,
} from "../../../studio/core/fullscreen.js";

// jsdom has no Fullscreen API, so each test builds the bits it needs and removes them afterwards.
const DOC_PROPS = ["fullscreenEnabled", "webkitFullscreenEnabled", "fullscreenElement", "webkitFullscreenElement", "exitFullscreen", "webkitExitFullscreen"];
const EL_PROPS = ["requestFullscreen", "webkitRequestFullscreen"];

function define(target, props) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(target, k, { value: v, configurable: true, writable: true });
}

afterEach(() => {
  for (const k of DOC_PROPS) delete document[k];
  for (const k of EL_PROPS) delete Element.prototype[k];
});

test("fullscreenSupported follows the standard API", () => {
  const el = document.createElement("div");
  expect(fullscreenSupported(el)).toBe(false);
  define(document, { fullscreenEnabled: true });
  expect(fullscreenSupported(el)).toBe(false); // no requestFullscreen yet
  define(Element.prototype, { requestFullscreen: () => Promise.resolve() });
  expect(fullscreenSupported(el)).toBe(true);
  define(document, { fullscreenEnabled: false });
  expect(fullscreenSupported(el)).toBe(false);
  expect(fullscreenSupported(null)).toBe(false);
});

test("fullscreenSupported falls back to the webkit names", () => {
  const el = document.createElement("div");
  define(document, { webkitFullscreenEnabled: true });
  define(Element.prototype, { webkitRequestFullscreen: () => {} });
  expect(fullscreenSupported(el)).toBe(true);
});

test("enterFullscreen requests it on the element and resolves ok", async () => {
  const request = vi.fn(() => Promise.resolve());
  define(Element.prototype, { requestFullscreen: request });
  const el = document.createElement("div");
  expect(await enterFullscreen(el)).toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.contexts[0]).toBe(el);
});

test("enterFullscreen uses the webkit call when that is all there is (it may return nothing)", async () => {
  const request = vi.fn();
  define(Element.prototype, { webkitRequestFullscreen: request });
  expect(await enterFullscreen(document.createElement("div"))).toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(1);
});

test("enterFullscreen never rejects: a refusal or a throw is { ok: false }", async () => {
  define(Element.prototype, { requestFullscreen: () => Promise.reject(new Error("blocked")) });
  expect(await enterFullscreen(document.createElement("div"))).toEqual({ ok: false });
  define(Element.prototype, {
    requestFullscreen: () => {
      throw new Error("nope");
    },
  });
  expect(await enterFullscreen(document.createElement("div"))).toEqual({ ok: false });
  delete Element.prototype.requestFullscreen;
  expect(await enterFullscreen(document.createElement("div"))).toEqual({ ok: false });
  expect(await enterFullscreen(null)).toEqual({ ok: false });
});

test("exitFullscreen leaves it only when something is full screen, and never rejects", async () => {
  const exit = vi.fn(() => Promise.resolve());
  define(document, { exitFullscreen: exit, fullscreenElement: null });
  await exitFullscreen();
  expect(exit).not.toHaveBeenCalled();

  define(document, { fullscreenElement: document.createElement("div") });
  await exitFullscreen();
  expect(exit).toHaveBeenCalledTimes(1);

  define(document, { exitFullscreen: () => Promise.reject(new Error("x")) });
  await expect(exitFullscreen()).resolves.toBeUndefined();

  delete document.exitFullscreen;
  define(document, { webkitExitFullscreen: exit });
  await exitFullscreen();
  expect(exit).toHaveBeenCalledTimes(2);
});

test("isFullscreen compares the full-screen element with the one given", () => {
  const a = document.createElement("div");
  const b = document.createElement("div");
  expect(isFullscreen(a)).toBe(false);
  define(document, { fullscreenElement: a });
  expect(isFullscreen(a)).toBe(true);
  expect(isFullscreen(b)).toBe(false);
  expect(isFullscreen(null)).toBe(false);
  define(document, { fullscreenElement: null, webkitFullscreenElement: b });
  expect(isFullscreen(b)).toBe(true);
});

test("both change events are listed", () => {
  expect(FULLSCREEN_EVENTS).toEqual(["fullscreenchange", "webkitfullscreenchange"]);
});
