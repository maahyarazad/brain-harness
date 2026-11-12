// Share links: /studio/<vizId>?c=1.<base64url(deflate-raw(JSON diff))> (contracts/persistence-formats.md §1).
import { validateConfig, defaultValues } from "./knobs.js";

const VERSION = "1";
export const CAPS = { outline: 512, points: 500, cells: 4000, toggled: 1000 };

function toBase64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Response(bytes).body.pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

function roundTo(knob, v) {
  if (knob.type !== "range" || typeof v !== "number") return v;
  const s = String(knob.step ?? 1);
  const d = s.includes("e-") ? Number(s.split("e-")[1]) : s.includes(".") ? s.split(".")[1].length : 0;
  return Number(v.toFixed(Math.min(12, d + 2)));
}

/** → { ok: true, payload } | { ok: false, reason } */
export async function encodeConfig(module, config) {
  const defaults = defaultValues(module);
  const diff = {};
  const v = {};
  for (const knob of module.knobs) {
    const val = config.values[knob.key];
    if (val !== defaults[knob.key]) v[knob.key] = roundTo(knob, val);
  }
  if (Object.keys(v).length) diff.v = v;
  if (module.random && config.seed !== 1) diff.s = config.seed;
  if (config.view) diff.w = config.view;
  if (config.input) {
    const inp = config.input;
    for (const [k, cap] of Object.entries(CAPS)) {
      if (Array.isArray(inp[k]) && inp[k].length > cap) {
        return { ok: false, reason: "Too much drawing for a link. Export a file instead." };
      }
    }
    diff.i = inp;
  }
  if (config.presetId) diff.p = config.presetId;
  const json = new TextEncoder().encode(JSON.stringify(diff));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  return { ok: true, payload: `${VERSION}.${toBase64Url(packed)}` };
}

/** → { config, replaced, error? } — always returns a usable config. */
export async function decodeConfig(module, payload) {
  const fallback = (error) => ({ ...validateConfig(module, {}), error });
  if (typeof payload !== "string" || !payload.startsWith(`${VERSION}.`)) {
    return fallback("This link's settings are in a format this version doesn't understand, so defaults are shown.");
  }
  try {
    const bytes = await pipe(fromBase64Url(payload.slice(VERSION.length + 1)), new DecompressionStream("deflate-raw"));
    const diff = JSON.parse(new TextDecoder().decode(bytes));
    if (!diff || typeof diff !== "object") throw new Error("not an object");
    return validateConfig(module, {
      values: { ...defaultValues(module), ...(diff.v ?? {}) },
      seed: diff.s ?? (module.random ? 1 : 0),
      view: diff.w ?? null,
      input: diff.i ?? null,
      presetId: diff.p ?? null,
    });
  } catch {
    return fallback("This link's settings are damaged, so defaults are shown.");
  }
}

export function buildShareUrl(vizId, payload, origin = window.location.origin) {
  return `${origin}/studio/${vizId}?c=${payload}`;
}
