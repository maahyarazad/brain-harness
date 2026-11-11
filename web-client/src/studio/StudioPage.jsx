import { useCallback, useEffect, useState } from "react";
import { useNav } from "../Root.jsx";
import { findEntry, CATEGORIES } from "./catalog.js";
import { getSaved } from "./core/storage.js";
import { loadPrefs, savePrefs } from "./core/prefs.js";
import CatalogGrid from "./components/CatalogGrid.jsx";
import MyVisualizations from "./components/MyVisualizations.jsx";
import Viewer from "./components/Viewer.jsx";
import "./studio.css";

function parse(path) {
  const sub = path.replace(/^\/studio\/?/, "").replace(/\/$/, "");
  if (!sub) return { kind: "catalog" };
  if (sub.startsWith("saved/")) return { kind: "saved", id: decodeURIComponent(sub.slice(6)) };
  return { kind: "viz", id: decodeURIComponent(sub) };
}

export default function StudioPage({ active }) {
  const { path, search, navigate } = useNav();
  const params = new URLSearchParams(search);
  const route = parse(path);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [handoff, setHandoff] = useState(null); // { vizId, config, nonce } from openVisualization
  const [savedVersion, setSavedVersion] = useState(0);

  useEffect(() => savePrefs(prefs), [prefs]);

  const query = params.get("q") ?? "";
  const category = CATEGORIES.some((c) => c.id === params.get("category")) ? params.get("category") : null;
  const view = params.get("view");

  const setFilter = (q, cat) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("category", cat);
    navigate(`/studio${p.toString() ? `?${p}` : ""}`, { replace: true });
  };

  const openViz = useCallback(
    (vizId, partial) => {
      if (partial) setHandoff({ vizId, config: partial, nonce: Date.now() });
      navigate(`/studio/${vizId}`);
    },
    [navigate]
  );

  const header = (
    <div className="studio-header">
      <h1>
        <a href="/studio" onClick={(e) => { e.preventDefault(); navigate("/studio"); }}>
          Visualization Studio
        </a>
      </h1>
      <span className="spacer" />
      <a
        href="/studio?view=mine"
        className="btn"
        onClick={(e) => {
          e.preventDefault();
          navigate("/studio?view=mine");
        }}
      >
        My visualizations
      </a>
      <label className="motion">
        <span>Motion</span>
        <select value={prefs.reducedMotion} onChange={(e) => setPrefs({ ...prefs, reducedMotion: e.target.value })}>
          <option value="system">System</option>
          <option value="on">Reduce (start paused)</option>
          <option value="off">Full</option>
        </select>
      </label>
    </div>
  );

  let body;
  if (route.kind === "saved") {
    const record = getSaved(route.id);
    const entry = record && findEntry(record.config.vizId);
    body = !entry ? (
      <div className="studio-notice-block" role="alert">
        <p>That saved visualization isn't in this browser. Saved visualizations stay in the browser they were saved in.</p>
        <a href="/studio" onClick={(e) => { e.preventDefault(); navigate("/studio"); }}>
          Go to the catalog
        </a>
      </div>
    ) : (
      <Viewer
        key={`saved:${route.id}:${savedVersion}`}
        entry={entry}
        initialConfig={record.config}
        saved={record}
        active={active}
        motionPref={prefs.reducedMotion}
        onBack={() => navigate("/studio")}
        onOpenViz={openViz}
        onSaved={(r) => {
          if (r.id !== route.id) navigate(`/studio/saved/${r.id}`);
          else setSavedVersion((v) => v + 1);
        }}
      />
    );
  } else if (route.kind === "viz" && findEntry(route.id)) {
    const entry = findEntry(route.id);
    const h = handoff?.vizId === route.id ? handoff : null;
    body = (
      <Viewer
        key={`viz:${route.id}:${search}:${h?.nonce ?? ""}`}
        entry={entry}
        initialConfig={h?.config ?? null}
        sharePayload={params.get("c")}
        active={active}
        motionPref={prefs.reducedMotion}
        onBack={() => navigate("/studio")}
        onOpenViz={openViz}
        onSaved={(r) => navigate(`/studio/saved/${r.id}`)}
      />
    );
  } else {
    body =
      view === "mine" ? (
        <MyVisualizations onOpen={(id) => navigate(`/studio/saved/${id}`)} showEmpty />
      ) : (
        <CatalogGrid
          query={query}
          category={category}
          onQuery={(q) => setFilter(q, category)}
          onCategory={(c) => setFilter(query, c)}
          onOpen={(id) => openViz(id)}
          notice={route.kind === "viz" ? "That visualization doesn't exist. Pick one from the catalog." : null}
        >
          <MyVisualizations onOpen={(id) => navigate(`/studio/saved/${id}`)} />
        </CatalogGrid>
      );
  }

  return (
    <div className="studio">
      {header}
      <main>{body}</main>
    </div>
  );
}
