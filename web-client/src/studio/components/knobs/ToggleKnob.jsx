import { knobId } from "./format.js";

export default function ToggleKnob({ knob, value, onChange }) {
  const id = knobId(knob.key);
  return (
    <div className="knob knob-toggle">
      <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{knob.label}</label>
    </div>
  );
}
