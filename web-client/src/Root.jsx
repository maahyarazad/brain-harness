import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Both sections are loaded on demand: studio pages never load the Playground
// (and so never contact the MCP server), and /playground never loads the studio.
const App = lazy(() => import("./App.jsx"));
const StudioPage = lazy(() => import("./studio/StudioPage.jsx"));

export const NavContext = createContext({ path: "/", search: "", navigate: () => {} });
export const useNav = () => useContext(NavContext);

export const PLAYGROUND_PATH = "/playground";
const isStudioPath = (p) => p === "/studio" || p.startsWith("/studio/");

/**
 * Where a location really goes. The studio is the home page: "/" and any
 * unknown path become /studio (keeping the query). The Playground is kept but
 * unlinked; it only opens at /playground.
 */
function resolve(path, search) {
  if (path === PLAYGROUND_PATH || isStudioPath(path)) return { path, search };
  return { path: "/studio", search };
}

function readLocation() {
  const { pathname, search } = window.location;
  const loc = resolve(pathname, search);
  if (loc.path !== pathname) window.history.replaceState(window.history.state, "", loc.path + loc.search);
  return loc;
}

/** Top-level shell: the Visualization Studio, or the Playground at /playground. */
export default function Root() {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    const { path, search } = resolve(url.pathname, url.search);
    const next = path + search;
    if (next !== window.location.pathname + window.location.search) {
      window.history[replace ? "replaceState" : "pushState"](null, "", next);
    }
    setLoc({ path, search });
  }, []);

  const isPlayground = loc.path === PLAYGROUND_PATH;

  useEffect(() => {
    document.title = isPlayground ? "Brain Harness" : "Visualization Studio · Brain Harness";
  }, [isPlayground]);

  const nav = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);

  return (
    <NavContext.Provider value={nav}>
      {isPlayground ? (
        <Suspense fallback={<p className="studio-loading">Loading…</p>}>
          <App />
        </Suspense>
      ) : (
        <Suspense fallback={<p className="studio-loading">Loading the studio…</p>}>
          <StudioPage active />
        </Suspense>
      )}
    </NavContext.Provider>
  );
}
