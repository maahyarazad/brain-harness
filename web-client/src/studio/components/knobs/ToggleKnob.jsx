import { memo } from "react";
import { knobId } from "./format.js";

function ToggleKnob({ knob, value, onChange }) {
  const id = knobId(knob.key);
  return (
    <div className="knob knob-toggle">
      <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(knob.key, e.target.checked)} />
      <label htmlFor={id}>{knob.label}</label>
    </div>
  );
}

export default memo(ToggleKnob);
