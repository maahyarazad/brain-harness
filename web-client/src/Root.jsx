import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import App from "./App.jsx";

const StudioPage = lazy(() => import("./studio/StudioPage.jsx"));

export const NavContext = createContext({ path: "/", search: "", navigate: () => {} });
export const useNav = () => useContext(NavContext);

const readLocation = () => ({ path: window.location.pathname, search: window.location.search });
const isStudioPath = (p) => p === "/studio" || p.startsWith("/studio/");

/**
 * Top-level shell: a small nav bar and two sections. The playground (App) is always
 * mounted so a conversation survives a visit to the studio; the studio is loaded the
 * first time it's opened and then kept mounted too.
 */
export default function Root() {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    const next = url.pathname + url.search;
    if (next !== window.location.pathname + window.location.search) {
      window.history[replace ? "replaceState" : "pushState"](null, "", next);
    }
    setLoc({ path: url.pathname, search: url.search });
  }, []);

  const isStudio = isStudioPath(loc.path);
  const [studioVisited, setStudioVisited] = useState(isStudio);
  useEffect(() => {
    if (isStudio) setStudioVisited(true);
  }, [isStudio]);

  useEffect(() => {
    document.title = isStudio ? "Visualization Studio · Brain Harness" : "Brain Harness";
  }, [isStudio]);

  const nav = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);

  function onLink(e, to) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  }

  return (
    <NavContext.Provider value={nav}>
      <nav className="topnav" aria-label="Sections">
        <a href="/" aria-current={!isStudio ? "page" : undefined} onClick={(e) => onLink(e, "/")}>
          Playground
        </a>
        <a href="/studio" aria-current={isStudio ? "page" : undefined} onClick={(e) => onLink(e, "/studio")}>
          Visualization Studio
        </a>
      </nav>
      <div hidden={isStudio}>
        <App />
      </div>
      {studioVisited && (
        <div hidden={!isStudio}>
          <Suspense fallback={<p className="studio-loading">Loading the studio…</p>}>
            <StudioPage active={isStudio} />
          </Suspense>
        </div>
      )}
    </NavContext.Provider>
  );
}
