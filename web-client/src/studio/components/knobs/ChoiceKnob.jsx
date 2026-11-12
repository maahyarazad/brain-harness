import { knobId } from "./format.js";

export default function ChoiceKnob({ knob, value, onChange, describedBy }) {
  const id = knobId(knob.key);
  return (
    <div className="knob">
      <label htmlFor={id}>{knob.label}</label>
      <select id={id} value={value} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        {knob.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
