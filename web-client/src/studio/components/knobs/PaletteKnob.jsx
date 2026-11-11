import { PALETTE_OPTIONS, paletteColor } from "../../core/palettes.js";
import { knobId } from "./format.js";

function gradient(name) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => paletteColor(name, t));
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export default function PaletteKnob({ knob, value, onChange }) {
  const id = knobId(knob.key);
  return (
    <div className="knob">
      <label htmlFor={id}>{knob.label}</label>
      <div className="palette-row">
        <span className="palette-swatch" style={{ background: gradient(value) }} aria-hidden="true" />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {PALETTE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
