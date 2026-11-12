import { useEffect, useState } from "react";
import { textError } from "../../core/knobs.js";
import { knobId } from "./format.js";

export default function TextKnob({ knob, value, onChange, describedBy }) {
  const id = knobId(knob.key);
  const [text, setText] = useState(value);
  const [error, setError] = useState(null);

  useEffect(() => {
    setText(value);
    setError(null);
  }, [value]);

  function commit() {
    const err = textError(knob, text);
    setError(err);
    if (!err && text !== value) onChange(text);
  }

  const common = {
    id,
    value: text,
    spellCheck: false,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [error && `${id}-error`, describedBy].filter(Boolean).join(" ") || undefined,
    onChange: (e) => {
      setText(e.target.value);
      setError(textError(knob, e.target.value));
    },
    onBlur: commit,
  };

  return (
    <div className="knob knob-text">
      <label htmlFor={id}>{knob.label}</label>
      {knob.multiline ? (
        <>
          <textarea
            {...common}
            rows={Math.min(6, Math.max(2, String(text).split("\n").length))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
          />
          <button type="button" className="btn btn-small" onClick={commit} disabled={Boolean(error) || text === value}>
            Apply rules
          </button>
        </>
      ) : (
        <input
          {...common}
          type="text"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      )}
      {error && (
        <p className="knob-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
