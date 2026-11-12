/** Point i at angle i·α and radius spacing·√i. Returns Float32Array [x0, y0, …]. */
export function phyllotaxisPoints(count, angleDeg, spacing) {
  const out = new Float32Array(count * 2);
  const a = (angleDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const r = spacing * Math.sqrt(i);
    const t = i * a;
    out[i * 2] = r * Math.cos(t);
    out[i * 2 + 1] = r * Math.sin(t);
  }
  return out;
}
