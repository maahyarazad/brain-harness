import { memo, useSyncExternalStore } from "react";

/**
 * The live counters a visualization reports ("generation", "comparisons"…). It subscribes to the store
 * on its own, so a running animation redraws just this readout, not the viewer around it (research R8).
 */
function StatsReadout({ store }) {
  const stats = useSyncExternalStore(store.subscribe, store.get);
  if (!stats) return null;
  return (
    <dl className="stats">
      {Object.entries(stats).map(([k, v]) => (
        <div key={k}>
          <dt>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
          <dd>{typeof v === "number" ? v.toLocaleString() : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default memo(StatsReadout);
