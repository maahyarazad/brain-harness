// Saved visualizations in localStorage (contracts/persistence-formats.md §2).
const KEY = "vizstudio.v1.saved";
export const FORMAT_VERSION = 1;

function isRecord(r) {
  return (
    r && typeof r === "object" && typeof r.id === "string" && typeof r.name === "string" &&
    r.config && typeof r.config.vizId === "string" && typeof r.createdAt === "string"
  );
}

function read() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { items: [], skipped: 0, unavailable: true };
  }
  if (!raw) return { items: [], skipped: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { items: [], skipped: 1 };
    const items = parsed.filter(isRecord);
    return { items, skipped: parsed.length - items.length };
  } catch {
    return { items: [], skipped: 1 };
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    notify();
    return { ok: true };
  } catch (err) {
    const quota = err?.name === "QuotaExceededError" || err?.code === 22;
    return {
      ok: false,
      reason: quota
        ? "Your browser's storage for this site is full. Delete some saved visualizations or export this one to a file."
        : "This browser doesn't allow saving here (private browsing or blocked storage). Export to a file instead.",
    };
  }
}

const listeners = new Set();
function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function listSaved() {
  return read();
}

export function getSaved(id) {
  return read().items.find((r) => r.id === id) ?? null;
}

function cleanName(name) {
  return String(name ?? "").trim().slice(0, 80);
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createSaved({ name, config, thumbnail }) {
  const n = cleanName(name);
  if (!n) return { ok: false, reason: "Give it a name first." };
  const now = new Date().toISOString();
  const record = { id: newId(), name: n, config, thumbnail: thumbnail ?? null, createdAt: now, updatedAt: now, formatVersion: FORMAT_VERSION };
  const { items } = read();
  const r = write([record, ...items]);
  return r.ok ? { ok: true, record } : r;
}

export function updateSaved(id, patch) {
  const { items } = read();
  const i = items.findIndex((r) => r.id === id);
  if (i < 0) return { ok: false, reason: "That saved visualization no longer exists." };
  const record = { ...items[i], ...patch, updatedAt: new Date().toISOString() };
  if ("name" in patch) {
    record.name = cleanName(patch.name);
    if (!record.name) return { ok: false, reason: "The name can't be empty." };
  }
  items[i] = record;
  const r = write(items);
  return r.ok ? { ok: true, record } : r;
}

export function renameSaved(id, name) {
  return updateSaved(id, { name });
}

export function duplicateSaved(id) {
  const orig = getSaved(id);
  if (!orig) return { ok: false, reason: "That saved visualization no longer exists." };
  return createSaved({ name: `${orig.name} copy`.slice(0, 80), config: orig.config, thumbnail: orig.thumbnail });
}

export function deleteSaved(id) {
  const { items } = read();
  return write(items.filter((r) => r.id !== id));
}

/** Adds already-validated records (used by import). */
export function addMany(records) {
  const { items } = read();
  const now = new Date().toISOString();
  const fresh = records.map((r) => ({ ...r, id: newId(), createdAt: now, updatedAt: now, formatVersion: FORMAT_VERSION }));
  return write([...fresh, ...items]);
}
