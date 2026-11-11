import { useEffect, useState } from "react";
import { MAX_SEED, isValidSeed } from "../../core/rng.js";

export default function SeedKnob({ seed, onChange, onRandomize }) {
  const [text, setText] = useState(String(seed));
  const [error, setError] = useState(null);
  useEffect(() => setText(String(seed)), [seed]);

  function commit() {
    const n = Number(text);
    if (!isValidSeed(n)) {
      setError(`Use a whole number from 0 to ${MAX_SEED}`);
      setText(String(seed));
      return;
    }
    setError(null);
    if (n !== seed) onChange(n);
  }

  return (
    <div className="knob knob-seed">
      <label htmlFor="knob-seed">Random seed</label>
      <div className="seed-row">
        <input
          id="knob-seed"
          type="text"
          inputMode="numeric"
          value={text}
          aria-describedby={error ? "knob-seed-error" : "knob-seed-help"}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <button type="button" className="btn btn-small" onClick={onRandomize}>
          Randomize
        </button>
      </div>
      {error ? (
        <p className="knob-error" id="knob-seed-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="knob-help" id="knob-seed-help">
          The same seed and settings always draw the same picture.
        </p>
      )}
    </div>
  );
}
