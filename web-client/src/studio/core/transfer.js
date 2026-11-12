/** ArrayBuffers of typed arrays at the top level of an object (for postMessage transfer). */
export function collectTransfer(obj) {
  const out = new Set();
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) {
      if (ArrayBuffer.isView(v)) out.add(v.buffer);
      else if (v instanceof ArrayBuffer) out.add(v);
    }
  }
  return [...out];
}
