import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNav } from "../Root.jsx";
import { findEntry, CATEGORIES } from "./catalog.js";
import { getSaved } from "./core/storage.js";
import { loadPrefs, savePrefs } from "./core/prefs.js";
import CatalogGrid from "./components/CatalogGrid.jsx";
import MyVisualizations from "./components/MyVisualizations.jsx";
import Viewer from "./components/Viewer.jsx";
import { APP_NAME, AUTHOR, LOGO_PATH, pageTitle } from "../site.js";
import "./studio.css";

function parse(path) {
  const sub = path.replace(/^\/studio\/?/, "").replace(/\/$/, "");
  if (!sub) return { kind: "catalog" };
  if (sub.startsWith("saved/")) return { kind: "saved", id: decodeURIComponent(sub.slice(6)) };
  return { kind: "viz", id: decodeURIComponent(sub) };
}

/** The title bar. Memoized: it changes only with the motion preference. */
const StudioHeader = memo(function StudioHeader({ reducedMotion, onMotionChange, navigate }) {
  return (
    <div className="studio-header">
      <h1>
        <a
          href="/studio"
          onClick={(e) => {
            e.preventDefault();
            navigate("/studio");
          }}
        >
          <img className="app-logo" src={LOGO_PATH} alt="" width={32} height={32} />
          {APP_NAME}
        </a>
      </h1>
      <span className="app-byline">by {AUTHOR}</span>
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
        <select value={reducedMotion} onChange={(e) => onMotionChange(e.target.value)}>
          <option value="system">System</option>
          <option value="on">Reduce (start paused)</option>
          <option value="off">Full</option>
        </select>
      </label>
    </div>
  );
});

export default function StudioPage({ active }) {
  const { path, search, navigate } = useNav();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const route = useMemo(() => parse(path), [path]);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [handoff, setHandoff] = useState(null); // { vizId, config, nonce } from openVisualization
  const [savedVersion, setSavedVersion] = useState(0);

  useEffect(() => savePrefs(prefs), [prefs]);

  const query = params.get("q") ?? "";
  const category = CATEGORIES.some((c) => c.id === params.get("category")) ? params.get("category") : null;
  const view = params.get("view");

  // Tab title: the visualization (or saved version) open, else the app's name.
  const titleName =
    route.kind === "viz" ? findEntry(route.id)?.name : route.kind === "saved" ? getSaved(route.id)?.name : null;
  useEffect(() => {
    document.title = pageTitle(titleName);
  }, [titleName]);

  // Handlers handed to memoized children keep their identity, so a redraw of this page does not redraw them.
  const setFilter = useCallback(
    (q, cat) => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (cat) p.set("category", cat);
      navigate(`/studio${p.toString() ? `?${p}` : ""}`, { replace: true });
    },
    [navigate]
  );
  const onQuery = useCallback((q) => setFilter(q, category), [setFilter, category]);
  const onCategory = useCallback((c) => setFilter(query, c), [setFilter, query]);

  const openViz = useCallback(
    (vizId, partial) => {
      if (partial) setHandoff({ vizId, config: partial, nonce: Date.now() });
      navigate(`/studio/${vizId}`);
    },
    [navigate]
  );
  const openSaved = useCallback((id) => navigate(`/studio/saved/${id}`), [navigate]);
  const goCatalog = useCallback(() => navigate("/studio"), [navigate]);
  const onMotionChange = useCallback((reducedMotion) => setPrefs((p) => ({ ...p, reducedMotion })), []);
  // After saving a freshly opened visualization, go to its saved copy.
  const onSavedFromViz = useCallback((r) => navigate(`/studio/saved/${r.id}`), [navigate]);
  const onSavedFromSaved = useCallback(
    (r) => {
      if (r.id !== route.id) navigate(`/studio/saved/${r.id}`);
      else setSavedVersion((v) => v + 1);
    },
    [navigate, route.id]
  );

  let body;
  if (route.kind === "saved") {
    const record = getSaved(route.id);
    const entry = record && findEntry(record.config.vizId);
    body = !entry ? (
      <div className="studio-notice-block" role="alert">
        <p>That saved visualization isn't in this browser. Saved visualizations stay in the browser they were saved in.</p>
        <a
          href="/studio"
          onClick={(e) => {
            e.preventDefault();
            goCatalog();
          }}
        >
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
        onBack={goCatalog}
        onOpenViz={openViz}
        onSaved={onSavedFromSaved}
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
        onBack={goCatalog}
        onOpenViz={openViz}
        onSaved={onSavedFromViz}
      />
    );
  } else {
    body =
      view === "mine" ? (
        <>
          <div className="viewer-toolbar">
            <a
              className="btn"
              href="/studio"
              aria-label="Back to catalog"
              onClick={(e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                goCatalog();
              }}
            >
              ← Catalog
            </a>
          </div>
          <MyVisualizations onOpen={openSaved} showEmpty />
        </>
      ) : (
        <CatalogGrid
          query={query}
          category={category}
          onQuery={onQuery}
          onCategory={onCategory}
          onOpen={openViz}
          notice={route.kind === "viz" ? "That visualization doesn't exist. Pick one from the catalog." : null}
        >
          <MyVisualizations onOpen={openSaved} />
        </CatalogGrid>
      );
  }

  return (
    <div className="studio">
      <StudioHeader reducedMotion={prefs.reducedMotion} onMotionChange={onMotionChange} navigate={navigate} />
      <main>{body}</main>
    </div>
  );
}
