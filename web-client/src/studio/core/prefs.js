// Per-browser studio preferences. Storage failures fall back to defaults.
const KEY = "vizstudio.v1.prefs";
const DEFAULTS = { reducedMotion: "system", lastCategory: null };

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* preferences are a convenience; ignore storage errors */
  }
}
