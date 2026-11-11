// L-systems: parse rules, expand a string, and turn it into line segments.

/** Rules text: one rule per line, "F=F+F-F" (also accepts -> or →). */
export function parseRules(text) {
  const rules = {};
  const lines = String(text).split(/\n|;/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z])\s*(?:=|->|→)\s*([A-Za-z+\-[\]|]*)$/);
    if (!m) return { ok: false, error: `Line ${i + 1}: write rules like F=F+F-F`, line: i + 1 };
    let depth = 0;
    for (const ch of m[2]) {
      if (ch === "[") depth++;
      if (ch === "]" && --depth < 0) break;
    }
    if (depth !== 0) return { ok: false, error: `Line ${i + 1}: brackets [ ] don't match`, line: i + 1 };
    rules[m[1]] = m[2];
  }
  if (!Object.keys(rules).length) return { ok: false, error: "Add at least one rule, like F=F+F-F", line: 1 };
  return { ok: true, rules };
}

/** Expands the axiom `depth` times, stopping before the string passes `limit` symbols. */
export function expandLSystem(axiom, rules, depth, limit = 2_000_000) {
  let s = axiom;
  let reached = 0;
  for (let d = 0; d < depth; d++) {
    let len = 0;
    for (const ch of s) len += rules[ch] ? rules[ch].length : 1;
    if (len > limit) return { string: s, depthReached: reached, capped: true };
    let next = "";
    const parts = [];
    for (const ch of s) parts.push(rules[ch] ?? ch);
    next = parts.join("");
    s = next;
    reached = d + 1;
  }
  return { string: s, depthReached: reached, capped: false };
}

/**
 * Turtle interpretation: F and G draw forward, f moves without drawing,
 * + and - turn, [ and ] push and pop, | turns around. Other letters do nothing.
 * Returns Float32Array of segments [x1, y1, x2, y2, …].
 */
export function turtleSegments(string, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  let x = 0, y = 0, h = -Math.PI / 2;
  const stack = [];
  const segs = [];
  for (const ch of string) {
    switch (ch) {
      case "F":
      case "G": {
        const nx = x + Math.cos(h), ny = y + Math.sin(h);
        segs.push(x, y, nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case "f":
        x += Math.cos(h);
        y += Math.sin(h);
        break;
      case "+": h += a; break;
      case "-": h -= a; break;
      case "|": h += Math.PI; break;
      case "[": stack.push([x, y, h]); break;
      case "]": {
        const s = stack.pop();
        if (s) [x, y, h] = s;
        break;
      }
      default:
    }
  }
  return new Float32Array(segs);
}
