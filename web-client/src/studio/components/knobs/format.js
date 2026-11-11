export function formatValue(knob, v) {
  if (typeof v !== "number") return String(v);
  if (v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) >= 1e7)) return v.toExponential(2);
  const s = String(knob.step ?? 1);
  const d = s.includes("e-") ? Number(s.split("e-")[1]) : s.includes(".") ? s.split(".")[1].length : 0;
  return Number(v.toFixed(Math.min(d, 6))).toString();
}

export const knobId = (key) => `knob-${key}`;
