// Thumbnails, file downloads (PNG, video), and .vizstudio.json export/import
// (contracts/persistence-formats.md §3–5).
import { findEntry } from "../catalog.js";
import { validateConfig } from "./knobs.js";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function makeThumbnail(canvas, w = 160, h = 120) {
  try {
    const t = document.createElement("canvas");
    t.width = w;
    t.height = h;
    const g = t.getContext("2d");
    g.fillStyle = "#0f0f12";
    g.fillRect(0, 0, w, h);
    const s = Math.min(w / canvas.width, h / canvas.height);
    const dw = canvas.width * s, dh = canvas.height * s;
    g.drawImage(canvas, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return t.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled; Safari needs a little time.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyymmdd-hhmmss in local time, used in downloaded file names. */
export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function pngFilename(vizId, date) {
  return `${vizId}-${fileStamp(date)}.png`;
}

export function downloadPng(canvas, vizId) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, pngFilename(vizId));
      resolve(Boolean(blob));
    }, "image/png");
  });
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "visualizations";
}

export function buildExport(items) {
  return {
    format: "vizstudio",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    items: items.map((r) => ({ name: r.name, config: r.config })),
  };
}

export function exportSaved(items, filename) {
  const data = buildExport(items);
  const name = filename ?? (items.length === 1 ? slugify(items[0].name) : "my-visualizations");
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${name}.vizstudio.json`);
}

/**
 * Validates an export file's text. loadModule(vizId) → Promise<module>.
 * → { ok: false, reason } | { ok: true, items: [{ name, config }], skipped, replaced }
 */
export async function parseImport(text, loadModule) {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: "That file is larger than 2 MB." };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't valid JSON." };
  }
  if (data?.format !== "vizstudio") return { ok: false, reason: "That isn't a Visualization Playground file." };
  if (data.formatVersion !== 1) return { ok: false, reason: "That file was made by a newer version of the Visualization Playground." };
  if (!Array.isArray(data.items)) return { ok: false, reason: "That file has no visualizations in it." };
  const items = [];
  const replaced = [];
  let skipped = 0;
  for (const item of data.items) {
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 80) : "";
    const vizId = item?.config?.vizId;
    if (!name || !findEntry(vizId)) {
      skipped++;
      continue;
    }
    const module = await loadModule(vizId);
    const r = validateConfig(module, item.config);
    items.push({ name, config: r.config });
    replaced.push(...r.replaced.map((x) => ({ ...x, item: name })));
  }
  return { ok: true, items, skipped, replaced };
}

export function readFileText(file) {
  if (file.size > MAX_IMPORT_BYTES) return Promise.reject(new Error("That file is larger than 2 MB."));
  return file.text();
}
