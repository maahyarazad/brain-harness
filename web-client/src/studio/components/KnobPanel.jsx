import RangeKnob from "./knobs/RangeKnob.jsx";
import ChoiceKnob from "./knobs/ChoiceKnob.jsx";
import ToggleKnob from "./knobs/ToggleKnob.jsx";
import TextKnob from "./knobs/TextKnob.jsx";
import PaletteKnob from "./knobs/PaletteKnob.jsx";

const COMPONENTS = { range: RangeKnob, choice: ChoiceKnob, toggle: ToggleKnob, text: TextKnob, palette: PaletteKnob };

export default function KnobPanel({ module, values, onChange, onReset, children }) {
  const visible = module.knobs.filter((k) => !k.when || k.when(values));
  const groups = [];
  for (const k of visible) {
    const name = k.group ?? "";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, knobs: [] }));
    g.knobs.push(k);
  }
  return (
    <section className="panel knob-panel" aria-labelledby="knobs-heading">
      <div className="panel-head">
        <h3 id="knobs-heading">Settings</h3>
        <button type="button" className="btn btn-small" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
      {groups.map((g) => (
        <fieldset key={g.name || "main"} className="knob-group">
          {g.name && <legend>{g.name}</legend>}
          {g.knobs.map((k) => {
            const C = COMPONENTS[k.type];
            return C ? <C key={k.key} knob={k} value={values[k.key]} onChange={(v) => onChange(k.key, v)} /> : null;
          })}
        </fieldset>
      ))}
      {children}
    </section>
  );
}
