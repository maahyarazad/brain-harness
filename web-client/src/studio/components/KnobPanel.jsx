import { Fragment } from "react";
import RangeKnob from "./knobs/RangeKnob.jsx";
import ChoiceKnob from "./knobs/ChoiceKnob.jsx";
import ToggleKnob from "./knobs/ToggleKnob.jsx";
import TextKnob from "./knobs/TextKnob.jsx";
import PaletteKnob from "./knobs/PaletteKnob.jsx";

const COMPONENTS = { range: RangeKnob, choice: ChoiceKnob, toggle: ToggleKnob, text: TextKnob, palette: PaletteKnob };

/**
 * `sweepable`: keys the sweep can move (empty while the sweep is off); `sweeping`: the ones it is
 * moving right now; `onToggleSweep(key, on)` switches one in or out of the sweep.
 */
export default function KnobPanel({
  module,
  values,
  onChange,
  onReset,
  sweeping = new Set(),
  sweepable = new Set(),
  onToggleSweep,
  children,
}) {
  const visible = module.knobs.filter((k) => !k.hidden && (!k.when || k.when(values)));
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
            if (!C) return null;
            const canSweep = sweepable.has(k.key) && onToggleSweep;
            const moving = sweeping.has(k.key);
            const knob = (
              <C knob={k} value={values[k.key]} onChange={(v) => onChange(k.key, v)} describedBy={moving ? `sweep-badge-${k.key}` : undefined} />
            );
            if (!canSweep) return <Fragment key={k.key}>{knob}</Fragment>;
            // The sweep can move this setting: say whether it does (FR-013), and let the user decide.
            return (
              <div key={k.key} className={moving ? "sweeping" : "sweepable"}>
                <label className="sweep-toggle">
                  <input type="checkbox" aria-label={`Sweep ${k.label}`} checked={moving} onChange={(e) => onToggleSweep(k.key, e.target.checked)} />
                  {moving ? (
                    <span className="sweep-badge" id={`sweep-badge-${k.key}`}>
                      ⟳ sweeping
                    </span>
                  ) : (
                    <span className="sweep-badge sweep-badge-off">Sweep this setting</span>
                  )}
                </label>
                {knob}
              </div>
            );
          })}
        </fieldset>
      ))}
      {sweepable.size > 0 && sweeping.size === 0 && (
        <p className="knob-help" role="status">
          Tick at least one setting to sweep.
        </p>
      )}
      {children}
    </section>
  );
}
