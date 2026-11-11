import { vi } from "vitest";
import { listSaved, createSaved, getSaved, renameSaved, duplicateSaved, deleteSaved, updateSaved } from "../../../studio/core/storage.js";

const cfg = { vizId: "phyllotaxis", values: { angle: 137.5 }, seed: 0, view: null, input: null, presetId: null };
beforeEach(() => localStorage.clear());

test("create, read, rename, duplicate, delete", () => {
  const a = createSaved({ name: "  Sunflower  ", config: cfg });
  expect(a.ok).toBe(true);
  expect(getSaved(a.record.id).name).toBe("Sunflower");
  expect(renameSaved(a.record.id, "Sun").ok).toBe(true);
  const d = duplicateSaved(a.record.id);
  expect(d.record.name).toBe("Sun copy");
  expect(listSaved().items).toHaveLength(2);
  deleteSaved(a.record.id);
  expect(listSaved().items.map((r) => r.name)).toEqual(["Sun copy"]);
});

test("updates keep createdAt and change updatedAt", async () => {
  const a = createSaved({ name: "x", config: cfg }).record;
  await new Promise((r) => setTimeout(r, 5));
  const u = updateSaved(a.id, { config: { ...cfg, values: { angle: 90 } } }).record;
  expect(u.createdAt).toBe(a.createdAt);
  expect(u.updatedAt > a.updatedAt).toBe(true);
});

test("names are required and capped at 80 characters", () => {
  expect(createSaved({ name: "   ", config: cfg }).ok).toBe(false);
  expect(createSaved({ name: "x".repeat(100), config: cfg }).record.name).toHaveLength(80);
});

test("invalid stored records are skipped and counted", () => {
  localStorage.setItem("vizstudio.v1.saved", JSON.stringify([{ nope: 1 }, { id: "a", name: "ok", config: cfg, createdAt: "2026-01-01" }]));
  const r = listSaved();
  expect(r.items).toHaveLength(1);
  expect(r.skipped).toBe(1);
  localStorage.setItem("vizstudio.v1.saved", "{not json");
  expect(listSaved()).toMatchObject({ items: [], skipped: 1 });
});

test("a full storage quota is reported, not thrown", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    const e = new Error("full");
    e.name = "QuotaExceededError";
    throw e;
  });
  const r = createSaved({ name: "x", config: cfg });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/full/);
  spy.mockRestore();
});
