const QUERY = "(prefers-reduced-motion: reduce)";

export function systemPrefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

/** pref: "system" | "on" | "off" */
export function prefersReducedMotion(pref = "system") {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return systemPrefersReducedMotion();
}

export function subscribe(callback) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  const handler = () => callback(mql.matches);
  mql.addEventListener?.("change", handler);
  return () => mql.removeEventListener?.("change", handler);
}
