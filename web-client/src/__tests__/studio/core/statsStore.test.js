import { vi } from "vitest";
import { createStatsStore } from "../../../studio/core/statsStore.js";

describe("createStatsStore", () => {
  test("starts empty, then holds the latest stats", () => {
    const s = createStatsStore();
    expect(s.get()).toBeNull();
    s.set({ generation: 1 });
    expect(s.get()).toEqual({ generation: 1 });
  });

  test("notifies subscribers on a change and stops after unsubscribe", () => {
    const s = createStatsStore();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ steps: 1 });
    s.set({ steps: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    s.set({ steps: 3 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("an unchanged report does not notify and keeps the same snapshot object", () => {
    const s = createStatsStore();
    s.set({ steps: 5, time: "1.0" });
    const first = s.get();
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ steps: 5, time: "1.0" }); // a new object with equal values, as modules report every frame
    expect(fn).not.toHaveBeenCalled();
    expect(s.get()).toBe(first); // useSyncExternalStore needs a stable snapshot until something changes
  });

  test("a changed key, an added key or a removed key all notify", () => {
    const s = createStatsStore();
    const fn = vi.fn();
    s.set({ a: 1 });
    s.subscribe(fn);
    s.set({ a: 2 });
    s.set({ a: 2, b: 1 });
    s.set({ b: 1 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("clear() empties it and notifies once; clearing an empty store does nothing", () => {
    const s = createStatsStore();
    const fn = vi.fn();
    s.subscribe(fn);
    s.clear();
    expect(fn).not.toHaveBeenCalled();
    s.set({ a: 1 });
    s.clear();
    expect(s.get()).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a subscriber that unsubscribes while being notified does not break the others", () => {
    const s = createStatsStore();
    const calls = [];
    const off = s.subscribe(() => {
      calls.push("a");
      off();
    });
    s.subscribe(() => calls.push("b"));
    s.set({ x: 1 });
    expect(calls).toEqual(["a", "b"]);
  });
});
