import { useEffect, useState } from "react";
import { getHealth } from "../api.js";

const POLL_MS = 10_000;

/** Polls /health so the header can show Online / Offline. `checkedAt` is when the status last changed. */
export function useServerStatus() {
  const [status, setStatus] = useState({ online: null, checkedAt: null });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      let online = false;
      try {
        online = (await getHealth())?.status === "ok";
      } catch {
        online = false;
      }
      // Same answer as last time: keep the state object, so the page does not redraw every poll for nothing.
      if (!cancelled) setStatus((prev) => (prev.online === online ? prev : { online, checkedAt: new Date().toISOString() }));
    }
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}
