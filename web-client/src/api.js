// Thin fetch wrappers for the Brain Harness server
// (specs/001-brain-harness-test-ui/contracts/http-api.md).
// By default paths are relative: Vite (dev) or nginx (production) proxies
// them to the server. Set VITE_API_BASE_URL at build time to call the
// server on another origin instead (the server must allow it via CORS_ORIGIN).

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const TIMEOUT_MS = 60_000;

function apiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function request(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw apiError("timeout", "No answer after 60 seconds. Try again.");
    }
    throw apiError("network", "Can't reach the Brain Harness server. Is it running?");
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body: usually the dev proxy reporting the server is down
  }

  if (!res.ok) {
    if (data?.error) throw apiError(data.error.code, data.error.message);
    if (res.status === 502 || res.status === 504) {
      throw apiError("network", "Can't reach the Brain Harness server. Is it running?");
    }
    throw apiError("http_error", `Server responded with ${res.status}.`);
  }
  return data;
}

export const getHealth = () => request("/health");

export const getCapabilities = () => request("/api/capabilities");

export const sendChat = (prompt, history) =>
  request("/api/chat", { method: "POST", body: { prompt, history } });

export const runTool = (name, args) =>
  request(`/api/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    body: { arguments: args },
  });

export const runPrompt = (name, args) =>
  request(`/api/prompts/${encodeURIComponent(name)}`, {
    method: "POST",
    body: { arguments: args },
  });
