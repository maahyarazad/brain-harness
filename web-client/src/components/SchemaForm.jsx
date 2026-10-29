import { useState } from "react";

function initialValues(schema) {
  const values = {};
  for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
    values[key] = prop.default !== undefined ? String(prop.default) : "";
  }
  return values;
}

function isLongText(key, prop) {
  return key === "text" || /\btext\b/i.test(prop.description ?? "");
}

/**
 * A form generated from a JSON Schema (the tool's or prompt's inputs).
 * Supports the types our tools use: string, number/integer and enum.
 */
export default function SchemaForm({ schema, onSubmit, disabled, submitLabel = "Run" }) {
  const [values, setValues] = useState(() => initialValues(schema));
  const properties = Object.entries(schema?.properties ?? {});
  const required = new Set(schema?.required ?? []);

  function handleSubmit(event) {
    event.preventDefault();
    const args = {};
    for (const [key, prop] of properties) {
      const raw = values[key];
      if (raw === "" && !required.has(key)) continue; // leave optional fields to their defaults
      args[key] = prop.type === "number" || prop.type === "integer" ? Number(raw) : raw;
    }
    onSubmit(args);
  }

  return (
    <form className="schema-form" onSubmit={handleSubmit}>
      {properties.map(([key, prop]) => {
        const common = {
          id: `field-${key}`,
          name: key,
          value: values[key],
          required: required.has(key),
          onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
        };
        let field;
        if (prop.enum) {
          field = (
            <select {...common}>
              {prop.enum.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          );
        } else if (prop.type === "number" || prop.type === "integer") {
          field = <input type="number" step="any" {...common} />;
        } else if (isLongText(key, prop)) {
          field = <textarea {...common} />;
        } else {
          field = <input type="text" {...common} />;
        }
        return (
          <label key={key} htmlFor={`field-${key}`}>
            {key}
            {prop.description && <span className="help">{prop.description}</span>}
            {field}
          </label>
        );
      })}
      {properties.length === 0 && <p className="help">This one takes no inputs.</p>}
      <button type="submit" className="btn btn-primary" disabled={disabled}>
        {submitLabel}
      </button>
    </form>
  );
}
