import { startLoader } from "../../boot/loader.js";

const okFetch = vi.fn(async () => ({
  ok: true,
  body: { getReader: () => { let d = false; return { read: async () => (d ? { done: true } : ((d = true), { done: false, value: new Uint8Array(100) })) }; } },
}));

function page() {
  document.body.innerHTML =
    '<div id="boot-loader" role="status" aria-live="polite"><span id="boot-percent">0%</span></div><div id="root"></div>';
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const loader = () => document.getElementById("boot-loader");

beforeEach(() => {
  page();
  vi.stubGlobal("fetch", okFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("writes the percentage into the page as assets load", async () => {
  const run = startLoader({ assets: [{ url: "/a.js", size: 100 }] });
  await run.progress.finished;
  expect(document.getElementById("boot-percent").textContent).toBe("100%");
});

test("stays while #root is empty or has only the Suspense fallback", async () => {
  const run = startLoader({ assets: [{ url: "/a.js", size: 100 }] });
  await run.progress.finished;
  await tick();
  expect(loader().classList.contains("boot-loader--done")).toBe(false);
  document.getElementById("root").innerHTML = '<p class="studio-loading">Loading…</p>';
  await tick();
  expect(loader().classList.contains("boot-loader--done")).toBe(false);
});

test("leaves once everything is loaded and the app has put something in #root", async () => {
  vi.useFakeTimers();
  const run = startLoader({ assets: [{ url: "/a.js", size: 100 }] });
  await vi.advanceTimersByTimeAsync(0);
  await run.progress.finished;
  document.getElementById("root").innerHTML = '<div class="studio"></div>';
  await vi.advanceTimersByTimeAsync(0);
  expect(loader().classList.contains("boot-loader--done")).toBe(true);
  await vi.advanceTimersByTimeAsync(450); // no transitionend in jsdom: the fallback removes it
  expect(loader()).toBeNull();
});

test("is removed after the time limit even when assets never finish", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  startLoader({ assets: [{ url: "/a.js", size: 100 }] });
  await vi.advanceTimersByTimeAsync(15_000);
  await vi.advanceTimersByTimeAsync(450);
  expect(loader()).toBeNull();
});

test("does nothing without a loader in the page", () => {
  document.body.innerHTML = '<div id="root"></div>';
  expect(() => startLoader({ assets: [] })).not.toThrow();
});
