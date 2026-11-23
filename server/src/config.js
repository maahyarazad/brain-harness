import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Runtime configuration, read once from the environment (server/.env).
// The API key itself is never exported: the Anthropic SDK reads
// ANTHROPIC_API_KEY directly, and we only need to know whether it is set.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  // The built web client (web-client/dist locally; the deploy workflow sets WEB_ROOT on the server).
  webRoot: path.resolve(process.env.WEB_ROOT || path.join(here, "../../web-client/dist")),
  // Files the server owns: the loading screen's animation, player and scripts.
  publicDir: path.join(here, "../public"),
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  // Comma-separated browser origins allowed to call the API cross-origin.
  // Browsers send origins without a trailing slash, so strip any.
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
};
