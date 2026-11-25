import { memo } from "react";
// Extra buttons a module declares (`actions`), such as "Burst" and "Clear" on the fluid simulation.
// Real buttons, so they work by mouse, touch and keyboard (specs/005 contracts/module-additions.md).
function ActionBar({ actions, onAction }) {
  return (
    <div className="actions" role="group" aria-label="Actions">
      {actions.map((a) => (
        <button key={a.id} type="button" className="btn" title={a.title} onClick={() => onAction(a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

export default memo(ActionBar);
