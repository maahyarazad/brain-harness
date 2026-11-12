import { useEffect, useRef, useState } from "react";
import { validateValue } from "../../core/knobs.js";
import { formatValue, knobId } from "./format.js";

const RES = 1000;

function isLog(knob) {
  return knob.scale === "log" && knob.min > 0;
}

function toPos(knob, v) {
  if (isLog(knob)) return Math.round((Math.log(v / knob.min) / Math.log(knob.max / knob.min)) * RES);
  return v;
}

function fromPos(knob, p) {
  if (isLog(knob)) return validateValue(knob, knob.min * Math.pow(knob.max / knob.min, p / RES)).value;
  return validateValue(knob, p).value;
}

export default function RangeKnob({ knob, value, onChange }) {
  const id = knobId(knob.key);
  const live = knob.live !== false;
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(formatValue(knob, value));
  const [note, setNote] = useState(null);
  const dirty = useRef(false);
  const noteTimer = useRef(null);

  useEffect(() => {
    setDraft(value);
    setText(formatValue(knob, value));
  }, [value, knob]);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  function showNote(n) {
    setNote(n);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3000);
  }

  function commit(v) {
    dirty.current = false;
    if (v !== value) onChange(v);
  }

  function onSlider(e) {
    const v = fromPos(knob, Number(e.target.value));
    setDraft(v);
    setText(formatValue(knob, v));
    if (live) commit(v);
    else dirty.current = true;
  }

  function onSliderRelease() {
    if (dirty.current) commit(draft);
  }

  function onSliderKey(e) {
    if (e.shiftKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : -1;
      const v = isLog(knob)
        ? fromPos(knob, Math.max(0, Math.min(RES, toPos(knob, draft) + dir * 50)))
        : validateValue(knob, draft + dir * (knob.step ?? 1) * 10).value;
      setDraft(v);
      setText(formatValue(knob, v));
      commit(v);
    }
  }

  function commitText() {
    const r = validateValue(knob, text);
    if (r.note) showNote(r.note);
    else if (r.replaced) showNote(`Enter a number from ${knob.min} to ${knob.max}`);
    setDraft(r.value);
    setText(formatValue(knob, r.value));
    commit(r.value);
  }

  return (
    <div className="knob knob-range">
      <div className="knob-head">
        <label htmlFor={id}>{knob.label}</label>
        <input
          className="knob-number"
          type="text"
          inputMode="decimal"
          aria-label={`${knob.label} value`}
          aria-describedby={note ? `${id}-note` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            }
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={isLog(knob) ? 0 : knob.min}
        max={isLog(knob) ? RES : knob.max}
        step={isLog(knob) ? 1 : knob.step ?? 1}
        value={toPos(knob, draft)}
        aria-valuetext={formatValue(knob, draft)}
        aria-describedby={knob.help ? `${id}-help` : undefined}
        onChange={onSlider}
        onPointerUp={onSliderRelease}
        onKeyUp={onSliderRelease}
        onBlur={onSliderRelease}
        onKeyDown={onSliderKey}
      />
      {note && (
        <p className="knob-note" id={`${id}-note`} role="status">
          {note}
        </p>
      )}
      {knob.help && (
        <p className="knob-help" id={`${id}-help`}>
          {knob.help}
        </p>
      )}
    </div>
  );
}
