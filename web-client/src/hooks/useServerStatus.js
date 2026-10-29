import { useEffect, useState } from "react";
import { getHealth } from "../api.js";

const POLL_MS = 10_000;

/** Polls /health so the header can show Online / Offline. */
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
      if (!cancelled) setStatus({ online, checkedAt: new Date().toISOString() });
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
