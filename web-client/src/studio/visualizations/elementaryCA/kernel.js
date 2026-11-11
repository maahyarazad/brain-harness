/** Rule number 0–255 → lookup table indexed by (left << 2 | center << 1 | right). */
export function ruleTable(n) {
  const t = new Uint8Array(8);
  for (let i = 0; i < 8; i++) t[i] = (n >> i) & 1;
  return t;
}

export function elementaryStep(row, next, table, wrap = true) {
  const w = row.length;
  for (let x = 0; x < w; x++) {
    const l = x > 0 ? row[x - 1] : wrap ? row[w - 1] : 0;
    const r = x < w - 1 ? row[x + 1] : wrap ? row[0] : 0;
    next[x] = table[(l << 2) | (row[x] << 1) | r];
  }
}
